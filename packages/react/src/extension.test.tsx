import { readFileSync } from "node:fs";
import { posix } from "node:path";
import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { Form, FormBindingFuncExtension, FormField } from "@mobx-sentinel/form";
import * as extensionModule from "./extension";
import * as indexModule from "./index";
import { CheckBoxBinding } from "./CheckBoxBinding";
import { InputBinding } from "./InputBinding";
import { LabelBinding } from "./LabelBinding";
import { RadioButtonBinding } from "./RadioButtonBinding";
import { SelectBoxBinding } from "./SelectBoxBinding";
import { SubmitButtonBinding } from "./SubmitButtonBinding";
import { useFormAutoReset, useFormHandler, useFormSSR } from "./hooks";

class SampleModel {
  @observable text = "hello";
  @observable number: number | null = 1;
  @observable flag = false;
  @observable choice = "a";

  constructor() {
    makeObservable(this);
  }
}

const STANDARD_METHODS = [
  "bindInput",
  "bindSelectBox",
  "bindCheckBox",
  "bindRadioButton",
  "bindSubmitButton",
  "bindLabel",
] as const;

const noop = () => {};

const setupEnv = () => {
  const model = new SampleModel();
  const form = Form.get(model);
  return { model, form };
};

describe("extension module", () => {
  test("has no runtime exports", () => {
    expect(Object.keys(extensionModule)).toEqual([]);
  });

  test("installs exactly the standard bind methods on Form.prototype", () => {
    const names = Object.getOwnPropertyNames(Form.prototype).filter((name) => name.startsWith("bind"));
    expect(names).toEqual([...STANDARD_METHODS]);

    for (const name of STANDARD_METHODS) {
      // Installed by plain assignment, hence writable, enumerable and configurable
      expect(Object.getOwnPropertyDescriptor(Form.prototype, name)).toEqual({
        value: expect.any(Function),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  });

  test("shares the methods through the prototype instead of defining own properties", () => {
    const { form } = setupEnv();
    const other = Form.get(new SampleModel());

    for (const name of STANDARD_METHODS) {
      expect(Object.hasOwn(form, name)).toBe(false);
      expect(form[name]).toBe(Form.prototype[name]);
      expect(form[name]).toBe(other[name]);
    }
    // Unlike the extension methods, Form#bind is an own (arrow function) property
    expect(Object.hasOwn(form, "bind")).toBe(true);
  });

  test("is installed only by importing the extension module, not by the package entry point", async () => {
    vi.resetModules();
    const { Form: FreshForm } = await import("@mobx-sentinel/form");
    expect(FreshForm).not.toBe(Form);
    expect("bindInput" in FreshForm.prototype).toBe(false);

    await import("./index");
    for (const name of STANDARD_METHODS) {
      expect(name in FreshForm.prototype).toBe(false);
    }

    await import("./extension");
    for (const name of STANDARD_METHODS) {
      expect(typeof FreshForm.prototype[name]).toBe("function");
    }
  });

  test("methods depend on `this`, unlike Form#bind", () => {
    const { model, form } = setupEnv();

    const { bind } = form;
    expect(bind("text", InputBinding, { getter: () => model.text, setter: noop }).value).toBe("hello");

    const { bindInput, bindSelectBox, bindCheckBox, bindRadioButton, bindSubmitButton, bindLabel } = form;
    // PINNED(quirk): the extension methods are prototype functions that call `this.bind`, so detaching them (e.g. `const { bindInput } = Form.get(model)`) throws a TypeError, while the detached Form#bind keeps working. Decide: should the extension methods be bound to the instance like Form#bind?
    expect(() => bindInput("text", { getter: () => model.text, setter: noop })).toThrow(TypeError);
    expect(() => bindSelectBox("choice", { getter: () => model.choice, setter: noop })).toThrow(TypeError);
    expect(() => bindCheckBox("flag", { getter: () => model.flag, setter: noop })).toThrow(TypeError);
    expect(() => bindRadioButton("choice", { getter: () => model.choice, setter: noop })).toThrow(TypeError);
    expect(() => bindSubmitButton()).toThrow(TypeError);
    expect(() => bindLabel(["text"])).toThrow(TypeError);
  });
});

describe("package entry point", () => {
  test("exports the standard bindings and hooks", () => {
    expect(Object.keys(indexModule).sort()).toEqual([
      "CheckBoxBinding",
      "InputBinding",
      "LabelBinding",
      "RadioButtonBinding",
      "SelectBoxBinding",
      "SubmitButtonBinding",
      "useFormAutoReset",
      "useFormHandler",
      "useFormSSR",
    ]);
    expect(indexModule.CheckBoxBinding).toBe(CheckBoxBinding);
    expect(indexModule.InputBinding).toBe(InputBinding);
    expect(indexModule.LabelBinding).toBe(LabelBinding);
    expect(indexModule.RadioButtonBinding).toBe(RadioButtonBinding);
    expect(indexModule.SelectBoxBinding).toBe(SelectBoxBinding);
    expect(indexModule.SubmitButtonBinding).toBe(SubmitButtonBinding);
    expect(indexModule.useFormAutoReset).toBe(useFormAutoReset);
    expect(indexModule.useFormHandler).toBe(useFormHandler);
    expect(indexModule.useFormSSR).toBe(useFormSSR);
  });
});

describe("package exports", () => {
  const readText = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  test("exposes the extension at the ./extension subpath", () => {
    const pkg = JSON.parse(readText("../package.json"));

    expect(Object.keys(pkg.exports)).toEqual([".", "./extension", "./dist/extension"]);
    expect(pkg.exports["./extension"]).toEqual({
      import: { types: "./dist/extension.d.mts", default: "./dist/extension.mjs" },
      require: { types: "./dist/extension.d.ts", default: "./dist/extension.js" },
    });
  });

  test("also exposes the extension at ./dist/extension, the path the READMEs used to document", () => {
    const pkg = JSON.parse(readText("../package.json"));

    // Resolvers that ignore "exports" (TypeScript's node10, Jest 27, webpack 4) reach dist/extension as a plain file.
    // This entry is for the ones that honor it (Node, Vite, webpack 5, Jest 28+, TypeScript's bundler and node16)
    expect(pkg.exports["./dist/extension"]).toEqual(pkg.exports["./extension"]);
  });

  test("gives each module format the declaration file next to the JavaScript it loads", () => {
    const pkg = JSON.parse(readText("../package.json"));

    for (const conditions of Object.values<Record<string, Record<string, string>>>(pkg.exports)) {
      // A "types" beside "import" and "require" would win for both, and without "type": "module" TypeScript reads a .d.ts as CommonJS.
      // ESM importers under node16/nodenext then type-check a default import that Node rejects, as the .mjs has no default export.
      expect(Object.keys(conditions)).toEqual(["import", "require"]);
      // "types" first, as resolvers take the first condition that matches and "default" always does
      expect(Object.keys(conditions.import)).toEqual(["types", "default"]);
      expect(Object.keys(conditions.require)).toEqual(["types", "default"]);
      expect(conditions.import.default).toMatch(/\.mjs$/);
      expect(conditions.import.types).toBe(conditions.import.default.replace(/\.mjs$/, ".d.mts"));
      expect(conditions.require.default).toMatch(/\.js$/);
      expect(conditions.require.types).toBe(conditions.require.default.replace(/\.js$/, ".d.ts"));
    }
  });

  test("points resolvers that ignore exports at the same files through extension/package.json", () => {
    const pkg = JSON.parse(readText("../package.json"));
    const stub = JSON.parse(readText("../extension/package.json"));
    const fromPackageRoot = (path: string) => `./${posix.join("extension", path)}`;

    // Without this directory, the ./extension subpath exists only in "exports": TypeScript's node10 finds no types
    // for it, and Jest 27 and webpack 4 cannot resolve it
    expect(pkg.files).toContain("extension");
    expect(Object.keys(stub).sort()).toEqual(["main", "module", "types"]);
    // TypeScript's node10 resolves import and require alike, so "types" goes with "main", the CommonJS build
    expect(fromPackageRoot(stub.types)).toBe(pkg.exports["./extension"].require.types);
    expect(fromPackageRoot(stub.module)).toBe(pkg.exports["./extension"].import.default);
    expect(fromPackageRoot(stub.main)).toBe(pkg.exports["./extension"].require.default);
  });

  test("documents only import paths for the extension that the exports map exposes", () => {
    const pkg = JSON.parse(readText("../package.json"));
    const exportedSubpaths = Object.keys(pkg.exports);

    for (const readme of [readText("../README.md"), readText("../../../README.md")]) {
      const documented = [...readme.matchAll(/import "@mobx-sentinel\/react(\/[^"]*)"/g)].map((m) => `.${m[1]}`);
      // Guard against a vacuous pass if the import line is reworded
      expect(documented.length).toBeGreaterThan(0);
      expect(documented.filter((subpath) => !exportedSubpaths.includes(subpath))).toEqual([]);
    }
  });
});

describe("delegation to Form#bind", () => {
  test("forwards each call to the instance's bind with the binding class and config, returning its result", () => {
    const { model, form } = setupEnv();
    const bindSpy = vi.spyOn(form, "bind");
    const lastResult = () => bindSpy.mock.results.at(-1)?.value;
    // The spy is typed after the last overload of Form#bind, so read the arguments untyped
    const lastCall = () => bindSpy.mock.lastCall as unknown[] | undefined;

    const getter = () => model.text;
    const inputConfig = { getter, setter: noop };
    const inputProps = form.bindInput("text", inputConfig);
    expect(bindSpy.mock.lastCall).toEqual([
      "text",
      InputBinding,
      { getter, setter: noop, cacheKey: "undefined:undefined" },
    ]);
    // bindInput passes a copy and leaves the caller's config untouched
    expect(lastCall()?.[2]).not.toBe(inputConfig);
    expect(inputConfig).toEqual({ getter, setter: noop });
    expect(inputProps).toBe(lastResult());
    expect(form.bindInput("text", inputConfig).onChange).toBe(inputProps.onChange);

    const dateGetter = () => null;
    form.bindInput("text", { valueAs: "date", cacheKey: "k", getter: dateGetter, setter: noop });
    // The composite key is `${valueAs}:${cacheKey}`, in that order
    expect(bindSpy.mock.lastCall).toEqual([
      "text",
      InputBinding,
      { valueAs: "date", cacheKey: "date:k", getter: dateGetter, setter: noop },
    ]);

    const selectConfig = { getter: () => model.choice, setter: noop };
    expect(form.bindSelectBox("choice", selectConfig)).toBe(lastResult());
    expect(bindSpy.mock.lastCall).toEqual(["choice", SelectBoxBinding, selectConfig]);
    expect(lastCall()?.[2]).toBe(selectConfig);

    const checkConfig = { getter: () => model.flag, setter: noop };
    expect(form.bindCheckBox("flag", checkConfig)).toBe(lastResult());
    expect(bindSpy.mock.lastCall).toEqual(["flag", CheckBoxBinding, checkConfig]);
    expect(lastCall()?.[2]).toBe(checkConfig);

    const radioConfig = { getter: () => model.choice, setter: noop };
    expect(form.bindRadioButton("choice", radioConfig)).toBe(lastResult());
    expect(bindSpy.mock.lastCall).toEqual(["choice", RadioButtonBinding, radioConfig]);
    expect(lastCall()?.[2]).toBe(radioConfig);

    expect(form.bindSubmitButton()).toBe(lastResult());
    expect(bindSpy.mock.lastCall).toEqual([SubmitButtonBinding, {}]);
    const submitConfig = { onClick: noop };
    form.bindSubmitButton(submitConfig);
    expect(lastCall()?.[1]).toBe(submitConfig);

    const fields: ("text" | "number")[] = ["text", "number"];
    expect(form.bindLabel(fields)).toBe(lastResult());
    expect(bindSpy.mock.lastCall).toEqual([["text", "number"], LabelBinding, {}]);
    expect(lastCall()?.[0]).toBe(fields);
    const labelConfig = { htmlFor: "custom" };
    form.bindLabel(fields, labelConfig);
    expect(lastCall()?.[2]).toBe(labelConfig);

    expect(bindSpy).toBeCalledTimes(10);
  });

  test("uses the bind of the receiver, so the methods can be applied to another form", () => {
    const { model, form } = setupEnv();
    const other = Form.get(new SampleModel());

    const props = Form.prototype.bindInput.call(other, "text", { getter: () => model.text, setter: noop });
    expect(props.id).toBe(other.getField("text").id);
    expect(props.id).not.toBe(form.getField("text").id);
  });
});

describe("Form#bindInput", () => {
  test("returns the props of an InputBinding bound to the field", () => {
    const { model, form } = setupEnv();

    const props = form.bindInput("text", { getter: () => model.text, setter: noop });
    expect(props).toEqual({
      type: "text",
      value: "hello",
      id: form.getField("text").id,
      onChange: expect.any(Function),
      onFocus: expect.any(Function),
      onBlur: expect.any(Function),
      // FormField#isErrorReported is undefined until errors are reported
      "aria-invalid": undefined,
      "aria-errormessage": undefined,
    });
  });

  test("passes valueAs and type through to the binding", () => {
    const { model, form } = setupEnv();

    expect(form.bindInput("number", { valueAs: "number", getter: () => model.number, setter: noop }).type).toBe(
      "number"
    );
    expect(form.bindInput("text", { valueAs: "date", getter: () => null, setter: noop }).type).toBe("date");
    expect(
      form.bindInput("text", { valueAs: "date", type: "month", cacheKey: "month", getter: () => null, setter: noop })
        .type
    ).toBe("month");
  });

  test("reuses the cached binding for the same field, valueAs and cacheKey", () => {
    const { model, form } = setupEnv();

    const a = form.bindInput("text", { getter: () => model.text, setter: noop });
    const b = form.bindInput("text", { getter: () => model.text, setter: noop });
    expect(b.onChange).toBe(a.onChange);

    const c = form.bindInput("number", { valueAs: "number", cacheKey: "k", getter: () => model.number, setter: noop });
    const d = form.bindInput("number", { valueAs: "number", cacheKey: "k", getter: () => model.number, setter: noop });
    expect(d.onChange).toBe(c.onChange);
  });

  test("keeps separate bindings per valueAs and per cacheKey, all on the same field", () => {
    const { form } = setupEnv();

    const plain = form.bindInput("text", { getter: () => "", setter: noop });
    const asDate = form.bindInput("text", { valueAs: "date", getter: () => null, setter: noop });
    const withKey = form.bindInput("text", { cacheKey: "k", getter: () => "", setter: noop });
    const asDateWithKey = form.bindInput("text", { valueAs: "date", cacheKey: "k", getter: () => null, setter: noop });

    const handlers = new Set([plain.onChange, asDate.onChange, withKey.onChange, asDateWithKey.onChange]);
    expect(handlers.size).toBe(4);
    expect(new Set([plain.id, asDate.id, withKey.id, asDateWithKey.id])).toEqual(new Set([form.getField("text").id]));
  });

  test("gives valueAs 'string' and an omitted valueAs separate bindings", () => {
    const { model, form } = setupEnv();

    const omitted = form.bindInput("text", { getter: () => model.text, setter: noop });
    const explicit = form.bindInput("text", { valueAs: "string", getter: () => model.text, setter: noop });
    // PINNED(quirk): the composite cacheKey embeds the raw valueAs ("undefined:undefined" vs "string:undefined"), so two configs that behave identically (valueAs defaults to "string") get two cached bindings. Decide: should an omitted valueAs be normalized to "string" before building the cacheKey?
    expect(explicit.onChange).not.toBe(omitted.onChange);
  });

  test("replaces the config on every call", () => {
    const { form } = setupEnv();
    const onChange1 = vi.fn();
    const onChange2 = vi.fn();
    const setter1 = vi.fn();
    const setter2 = vi.fn();

    const first = form.bindInput("text", { getter: () => "first", setter: setter1, onChange: onChange1 });
    expect(first.value).toBe("first");

    const second = form.bindInput("text", { getter: () => "second", setter: setter2, onChange: onChange2 });
    expect(second.value).toBe("second");
    expect(second.onChange).toBe(first.onChange);

    // The stale props object still delegates to the latest config
    render(<input aria-label="input" {...first} />);
    fireEvent.change(screen.getByLabelText("input"), { target: { value: "typed" } });
    expect(setter1).toBeCalledTimes(0);
    expect(onChange1).toBeCalledTimes(0);
    expect(setter2).toBeCalledTimes(1);
    expect(setter2).toBeCalledWith("typed");
    expect(onChange2).toBeCalledTimes(1);
  });

  test("does not share a binding with Form#bind given the same config", () => {
    const { model, form } = setupEnv();
    const config = { getter: () => model.text, setter: noop };

    const viaExtension = form.bindInput("text", config);
    const viaBind = form.bind("text", InputBinding, config);
    // bindInput rewrites cacheKey to `${valueAs}:${cacheKey}`, so the two land on different cache entries
    expect(viaBind.onChange).not.toBe(viaExtension.onChange);
    expect(viaBind.id).toBe(viaExtension.id);
  });

  test("shares a binding with Form#bind when bind's cacheKey matches bindInput's composite key", () => {
    const { model, form } = setupEnv();

    const viaExtension = form.bindInput("text", { getter: () => model.text, setter: noop });
    const viaBind = form.bind("text", InputBinding, {
      cacheKey: "undefined:undefined",
      getter: () => "overwritten",
      setter: noop,
    });
    // PINNED(quirk): the composite key is not namespaced, so a Form#bind call whose cacheKey happens to equal "undefined:undefined" (or `${valueAs}:${cacheKey}` in general) reuses bindInput's binding and replaces its config. Decide: should bindInput build a cacheKey that cannot collide with user-supplied keys?
    expect(viaBind.onChange).toBe(viaExtension.onChange);
    expect(form.bindInput("text", { getter: () => model.text, setter: noop }).value).toBe("hello");
  });

  test("writes the value through the setter and marks the field as changed and touched", () => {
    const { model, form } = setupEnv();

    const Component: React.FC = observer(() => (
      <input
        aria-label="text"
        {...form.bindInput("text", {
          getter: () => model.text,
          setter: (v) => (model.text = v),
        })}
      />
    ));
    render(<Component />);
    const input = screen.getByLabelText("text") as HTMLInputElement;
    const field = form.getField("text");

    fireEvent.focus(input);
    expect(field.isTouched).toBe(true);
    fireEvent.change(input, { target: { value: "world" } });
    expect(model.text).toBe("world");
    expect(input.value).toBe("world");
    expect(field.isChanged).toBe(true);
  });
});

describe("Form#bindSelectBox", () => {
  test("returns the props of a SelectBoxBinding, sharing the cache entry with Form#bind", () => {
    const { model, form } = setupEnv();
    const config = { getter: () => model.choice, setter: noop };

    const props = form.bindSelectBox("choice", config);
    expect(props).toEqual({
      id: form.getField("choice").id,
      multiple: undefined,
      value: "a",
      onChange: expect.any(Function),
      onFocus: expect.any(Function),
      "aria-invalid": undefined,
      "aria-errormessage": undefined,
    });
    expect(form.bind("choice", SelectBoxBinding, config).onChange).toBe(props.onChange);
  });

  test("keeps separate bindings per cacheKey and replaces the config on every call", () => {
    const { form } = setupEnv();

    const a = form.bindSelectBox("choice", { getter: () => "x", setter: noop });
    const b = form.bindSelectBox("choice", { cacheKey: "k", getter: () => "y", setter: noop });
    expect(b.onChange).not.toBe(a.onChange);

    const c = form.bindSelectBox("choice", { multiple: true, getter: () => ["z"], setter: noop });
    expect(c.onChange).toBe(a.onChange);
    expect(c.multiple).toBe(true);
    expect(c.value).toEqual(["z"]);
  });
});

describe("Form#bindCheckBox", () => {
  test("returns the props of a CheckBoxBinding, sharing the cache entry with Form#bind", () => {
    const { model, form } = setupEnv();
    const config = { getter: () => model.flag, setter: noop };

    const props = form.bindCheckBox("flag", config);
    expect(props).toEqual({
      type: "checkbox",
      id: form.getField("flag").id,
      checked: false,
      onChange: expect.any(Function),
      onFocus: expect.any(Function),
      "aria-invalid": undefined,
      "aria-errormessage": undefined,
    });
    expect(form.bind("flag", CheckBoxBinding, config).onChange).toBe(props.onChange);
    expect(form.bindCheckBox("flag", { cacheKey: "k", ...config }).onChange).not.toBe(props.onChange);
  });
});

describe("Form#bindRadioButton", () => {
  test("returns the props function of a RadioButtonBinding, sharing the cache entry with Form#bind", () => {
    const { model, form } = setupEnv();
    const config = { getter: () => model.choice, setter: noop };

    const bindRadio = form.bindRadioButton("choice", config);
    expect(bindRadio).toBeTypeOf("function");
    expect(bindRadio("a")).toEqual({
      type: "radio",
      id: undefined,
      value: "a",
      name: form.getField("choice").id,
      checked: true,
      onChange: expect.any(Function),
      onFocus: expect.any(Function),
      "aria-invalid": undefined,
      "aria-errormessage": undefined,
    });
    expect(bindRadio("b").checked).toBe(false);

    expect(form.bindRadioButton("choice", config)).toBe(bindRadio);
    expect(form.bind("choice", RadioButtonBinding, config)).toBe(bindRadio);
    expect(form.bindRadioButton("choice", { cacheKey: "k", ...config })).not.toBe(bindRadio);
  });
});

describe("Form#bindSubmitButton", () => {
  test("works without a config, sharing the cache entry with Form#bind given an empty config", () => {
    const { form } = setupEnv();

    const props = form.bindSubmitButton();
    expect(props).toEqual({
      onClick: expect.any(Function),
      onMouseOver: expect.any(Function),
      disabled: true,
      "aria-busy": false,
      "aria-invalid": false,
    });
    expect(form.bindSubmitButton().onClick).toBe(props.onClick);
    expect(form.bindSubmitButton({}).onClick).toBe(props.onClick);
    expect(form.bind(SubmitButtonBinding, {}).onClick).toBe(props.onClick);
    expect(form.bindSubmitButton({ cacheKey: "k" }).onClick).not.toBe(props.onClick);
  });

  test("falls back to an empty config, so the extended handlers are optional", () => {
    const { form } = setupEnv();
    const onClick = vi.fn();
    const onMouseOver = vi.fn();
    const withConfig = form.bindSubmitButton({ onClick, onMouseOver });

    // A later call without a config drops the previously given handlers
    const props = form.bindSubmitButton();
    expect(props.onClick).toBe(withConfig.onClick);
    // Invoke the handlers directly: errors thrown inside React event handlers are reported to
    // window "error" events rather than rethrown from fireEvent, so a render-based check could not fail.
    // Without the `?? {}` fallback, the binding would read `undefined.onClick` and throw here.
    const event = {} as React.MouseEvent<HTMLButtonElement>;
    expect(() => props.onMouseOver(event)).not.toThrow();
    expect(() => props.onClick(event)).not.toThrow();
    expect(onMouseOver).toBeCalledTimes(0);
    expect(onClick).toBeCalledTimes(0);
  });

  test("forwards the extended handlers of the latest config", () => {
    const { form } = setupEnv();
    form.configure({ allowSubmitNonDirty: true });
    const onClick = vi.fn();
    const onMouseOver = vi.fn();

    render(<button {...form.bindSubmitButton({ onClick, onMouseOver })}>Submit</button>);
    const button = screen.getByText("Submit") as HTMLButtonElement;
    expect(button).toBeEnabled();

    fireEvent.mouseOver(button);
    expect(onMouseOver).toBeCalledTimes(1);
    fireEvent.click(button);
    expect(onClick).toBeCalledTimes(1);
  });
});

describe("Form#bindLabel", () => {
  test("points htmlFor at the first field without a config", () => {
    const { form } = setupEnv();

    expect(form.bindLabel(["text"])).toEqual({
      htmlFor: form.getField("text").id,
      "aria-invalid": false,
      "aria-errormessage": undefined,
    });
    expect(form.bindLabel(["text", "number"]).htmlFor).toBe(form.getField("text").id);
    expect(form.bindLabel(["number", "text"]).htmlFor).toBe(form.getField("number").id);
  });

  test("returns no htmlFor for an empty field list", () => {
    const { form } = setupEnv();

    expect(form.bindLabel([])).toEqual({
      htmlFor: undefined,
      "aria-invalid": false,
      "aria-errormessage": undefined,
    });
  });

  test("honors the htmlFor override and caches per field list and cacheKey", () => {
    const { form } = setupEnv();

    expect(form.bindLabel(["text"], { htmlFor: "custom" }).htmlFor).toBe("custom");
    // Same cache entry, config replaced by the call without a config
    expect(form.bindLabel(["text"]).htmlFor).toBe(form.getField("text").id);
    expect(form.bindLabel(["text"], { cacheKey: "k", htmlFor: "custom" }).htmlFor).toBe("custom");
    expect(form.bindLabel(["text"]).htmlFor).toBe(form.getField("text").id);
  });

  test("associates the label with the input bound to the same field", () => {
    const { model, form } = setupEnv();

    const Component: React.FC = observer(() => (
      <>
        <label {...form.bindLabel(["text"])}>Text label</label>
        <input {...form.bindInput("text", { getter: () => model.text, setter: noop })} />
      </>
    ));
    render(<Component />);
    expect(screen.getByLabelText("Text label")).toHaveValue("hello");
  });
});

describe("types", () => {
  test("Form is augmented with StandardExtensions", () => {
    const { form } = setupEnv();

    type Ext = extensionModule.StandardExtensions<SampleModel>;
    expectTypeOf(form.bindInput).toEqualTypeOf<Ext["bindInput"]>();
    expectTypeOf(form.bindSelectBox).toEqualTypeOf<Ext["bindSelectBox"]>();
    expectTypeOf(form.bindCheckBox).toEqualTypeOf<Ext["bindCheckBox"]>();
    expectTypeOf(form.bindRadioButton).toEqualTypeOf<Ext["bindRadioButton"]>();
    expectTypeOf(form.bindSubmitButton).toEqualTypeOf<Ext["bindSubmitButton"]>();
    expectTypeOf(form.bindLabel).toEqualTypeOf<Ext["bindLabel"]>();
    expectTypeOf(form).toExtend<Ext>();

    expectTypeOf<Ext["bindInput"]>().toEqualTypeOf<
      FormBindingFuncExtension.ForField.RequiredConfig<SampleModel, typeof InputBinding>
    >();
    expectTypeOf<Ext["bindSelectBox"]>().toEqualTypeOf<
      FormBindingFuncExtension.ForField.RequiredConfig<SampleModel, typeof SelectBoxBinding>
    >();
    expectTypeOf<Ext["bindCheckBox"]>().toEqualTypeOf<
      FormBindingFuncExtension.ForField.RequiredConfig<SampleModel, typeof CheckBoxBinding>
    >();
    expectTypeOf<Ext["bindRadioButton"]>().toEqualTypeOf<
      FormBindingFuncExtension.ForField.RequiredConfig<SampleModel, typeof RadioButtonBinding>
    >();
    expectTypeOf<Ext["bindSubmitButton"]>().toEqualTypeOf<
      FormBindingFuncExtension.ForForm.OptionalConfig<SampleModel, typeof SubmitButtonBinding>
    >();
    expectTypeOf<Ext["bindLabel"]>().toEqualTypeOf<
      FormBindingFuncExtension.ForMultiField.OptionalConfig<SampleModel, typeof LabelBinding>
    >();
  });

  test("return types are the props of the binding classes", () => {
    const { form } = setupEnv();

    expectTypeOf(form.bindInput).returns.toEqualTypeOf<InputBinding["props"]>();
    expectTypeOf(form.bindSelectBox).returns.toEqualTypeOf<SelectBoxBinding["props"]>();
    expectTypeOf(form.bindCheckBox).returns.toEqualTypeOf<CheckBoxBinding["props"]>();
    expectTypeOf(form.bindRadioButton).returns.toEqualTypeOf<RadioButtonBinding["props"]>();
    expectTypeOf(form.bindSubmitButton).returns.toEqualTypeOf<SubmitButtonBinding["props"]>();
    expectTypeOf(form.bindLabel).returns.toEqualTypeOf<LabelBinding["props"]>();
  });

  test("field names and configs are checked", () => {
    const { model, form } = setupEnv();

    expectTypeOf(form.bindInput).parameter(0).toEqualTypeOf<FormField.Name<SampleModel>>();
    expectTypeOf(form.bindLabel).parameter(0).toEqualTypeOf<FormField.Name<SampleModel>[]>();

    // Compile-time only: the closure is never invoked
    const typeOnly = () => {
      form.bindInput("text", { getter: () => model.text, setter: (v) => expectTypeOf(v).toEqualTypeOf<string>() });
      form.bindInput("number", {
        valueAs: "number",
        getter: () => model.number,
        setter: (v) => expectTypeOf(v).toEqualTypeOf<number | null>(),
      });
      form.bindInput("text", {
        valueAs: "date",
        getter: () => null,
        setter: (v) => expectTypeOf(v).toEqualTypeOf<Date | null>(),
      });
      form.bindInput("text:suffix", { getter: () => model.text, setter: noop });
      form.bindSelectBox("choice", {
        multiple: true,
        getter: () => [model.choice],
        setter: (v) => expectTypeOf(v).toEqualTypeOf<string[]>(),
      });
      form.bindCheckBox("flag", { getter: () => model.flag, setter: (v) => expectTypeOf(v).toEqualTypeOf<boolean>() });
      form.bindSubmitButton();
      form.bindLabel(["text", "number"]);

      // @ts-expect-error unknown field name
      form.bindInput("unknown", { getter: () => model.text, setter: noop });
      // @ts-expect-error bindInput requires a config
      form.bindInput("text");
      // @ts-expect-error bindCheckBox requires a config
      form.bindCheckBox("flag");
      // @ts-expect-error the getter must match valueAs
      form.bindInput("number", { valueAs: "number", getter: () => model.text, setter: noop });
      // @ts-expect-error bindLabel takes a list of field names
      form.bindLabel("text");
      // @ts-expect-error bindSubmitButton takes no field name
      form.bindSubmitButton("text");
      // @ts-expect-error bindSelectBox requires a config
      form.bindSelectBox("choice");
      // @ts-expect-error bindRadioButton requires a config
      form.bindRadioButton("choice");
      // @ts-expect-error a multiple select box setter receives string[]
      form.bindSelectBox("choice", { multiple: true, getter: () => [model.choice], setter: (v: string) => void v });
      form.bindLabel(["text"], { htmlFor: "custom", cacheKey: "k" });
      // @ts-expect-error bindLabel accepts only LabelBinding options
      form.bindLabel(["text"], { onClick: noop });
      form.bindSubmitButton({ onClick: noop, cacheKey: "k" });
      // @ts-expect-error bindSubmitButton accepts only SubmitButtonBinding options
      form.bindSubmitButton({ htmlFor: "custom" });
    };
    expectTypeOf(typeOnly).toBeFunction();
  });
});
