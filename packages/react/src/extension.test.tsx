import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { Form, FormBindingFunc, FormBindingMethod, FormField } from "@mobx-sentinel/form";
import * as extensionModule from "./extension";
import * as indexModule from "./index";
import { CheckBoxBinding } from "./CheckBoxBinding";
import { InputBinding } from "./InputBinding";
import { LabelBinding } from "./LabelBinding";
import { RadioGroupBinding, renderRadioGroup } from "./RadioGroupBinding";
import { SelectBoxBinding } from "./SelectBoxBinding";
import { SubmitButtonBinding } from "./SubmitButtonBinding";
import { TextAreaBinding } from "./TextAreaBinding";
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
  "bindTextArea",
  "bindSelectBox",
  "bindCheckBox",
  "bindRadioGroup",
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
  test("exports the standard bindings by method name", () => {
    expect(Object.keys(extensionModule)).toEqual(["standardBindings"]);
    expect(extensionModule.standardBindings).toEqual({
      bindInput: InputBinding,
      bindTextArea: TextAreaBinding,
      bindSelectBox: SelectBoxBinding,
      bindCheckBox: CheckBoxBinding,
      bindRadioGroup: RadioGroupBinding,
      bindSubmitButton: SubmitButtonBinding,
      bindLabel: LabelBinding,
    });
    expect(Object.keys(extensionModule.standardBindings)).toEqual([...STANDARD_METHODS]);
  });

  test("adds exactly the standard bind methods, which forms inherit through Form.prototype", () => {
    // Form.prototype itself is left as the class defines it
    expect(Object.getOwnPropertyNames(Form.prototype).filter((name) => name.startsWith("bind"))).toEqual([]);

    const extensions = Object.getPrototypeOf(Form.prototype);
    expect(Object.getOwnPropertyNames(extensions)).toEqual([...STANDARD_METHODS]);
    for (const name of STANDARD_METHODS) {
      // Defined like the methods of a class
      expect(Object.getOwnPropertyDescriptor(extensions, name)).toEqual({
        value: expect.any(Function),
        writable: true,
        enumerable: false,
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

    const { bindInput, bindTextArea, bindSelectBox, bindCheckBox, bindRadioGroup, bindSubmitButton, bindLabel } = form;
    // PINNED(quirk): the extension methods are functions inherited through Form.prototype that call `this.bind`, so detaching them (e.g. `const { bindInput } = Form.get(model)`) throws a TypeError, while the detached Form#bind keeps working. Decide: should the extension methods be bound to the instance like Form#bind?
    expect(() => bindInput("text", { getter: () => model.text, setter: noop })).toThrow(TypeError);
    expect(() => bindTextArea("text", { getter: () => model.text, setter: noop })).toThrow(TypeError);
    expect(() => bindSelectBox("choice", { getter: () => model.choice, setter: noop })).toThrow(TypeError);
    expect(() => bindCheckBox("flag", { getter: () => model.flag, setter: noop })).toThrow(TypeError);
    expect(() => bindRadioGroup("choice", { getter: () => model.choice, setter: noop })).toThrow(TypeError);
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
      "RadioGroupBinding",
      "SelectBoxBinding",
      "SubmitButtonBinding",
      "TextAreaBinding",
      "renderRadioGroup",
      "useFormAutoReset",
      "useFormHandler",
      "useFormSSR",
    ]);
    expect(indexModule.CheckBoxBinding).toBe(CheckBoxBinding);
    expect(indexModule.InputBinding).toBe(InputBinding);
    expect(indexModule.LabelBinding).toBe(LabelBinding);
    expect(indexModule.RadioGroupBinding).toBe(RadioGroupBinding);
    expect(indexModule.renderRadioGroup).toBe(renderRadioGroup);
    expect(indexModule.SelectBoxBinding).toBe(SelectBoxBinding);
    expect(indexModule.SubmitButtonBinding).toBe(SubmitButtonBinding);
    expect(indexModule.TextAreaBinding).toBe(TextAreaBinding);
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

    // Through a variable, as Vite rewrites `new URL("<literal>", import.meta.url)` into a URL of its dev server
    const docsPath = "../../../apps/site/src/content/docs/docs/";
    const docsDir = new URL(docsPath, import.meta.url);
    const docs = readdirSync(docsDir, { recursive: true, encoding: "utf8" })
      .filter((path) => /\.mdx?$/.test(path))
      .map((path) => readFileSync(new URL(path, docsDir), "utf8"));
    const documented = docs.flatMap((doc) =>
      [...doc.matchAll(/import "@mobx-sentinel\/react(\/[^"]*)"/g)].map((m) => `.${m[1]}`)
    );
    // Guard against a vacuous pass if the import line is reworded
    expect(documented.length).toBeGreaterThan(0);
    expect(documented.filter((subpath) => !exportedSubpaths.includes(subpath))).toEqual([]);
  });
});

describe("delegation to Form#bind", () => {
  test("forwards each call to the instance's bind with the binding class and config, returning its result", () => {
    const { model, form } = setupEnv();
    const bindSpy = vi.spyOn(form, "bind");
    const lastResult = () => bindSpy.mock.results.at(-1)?.value;
    // The spy is typed after the last overload of Form#bind, so read the arguments untyped
    const lastCall = () => bindSpy.mock.lastCall as unknown[] | undefined;

    const inputConfig = { valueAs: "number" as const, cacheKey: "k", getter: () => model.number, setter: noop };
    expect(form.bindInput("number", inputConfig)).toBe(lastResult());
    expect(bindSpy.mock.lastCall).toEqual(["number", InputBinding, inputConfig]);
    expect(lastCall()?.[2]).toBe(inputConfig);

    const textAreaConfig = { getter: () => model.text, setter: noop };
    expect(form.bindTextArea("text", textAreaConfig)).toBe(lastResult());
    expect(bindSpy.mock.lastCall).toEqual(["text", TextAreaBinding, textAreaConfig]);
    expect(lastCall()?.[2]).toBe(textAreaConfig);

    const selectConfig = { getter: () => model.choice, setter: noop };
    expect(form.bindSelectBox("choice", selectConfig)).toBe(lastResult());
    expect(bindSpy.mock.lastCall).toEqual(["choice", SelectBoxBinding, selectConfig]);
    expect(lastCall()?.[2]).toBe(selectConfig);

    const checkConfig = { getter: () => model.flag, setter: noop };
    expect(form.bindCheckBox("flag", checkConfig)).toBe(lastResult());
    expect(bindSpy.mock.lastCall).toEqual(["flag", CheckBoxBinding, checkConfig]);
    expect(lastCall()?.[2]).toBe(checkConfig);

    const radioConfig = { getter: () => model.choice, setter: noop };
    expect(form.bindRadioGroup("choice", radioConfig)).toBe(lastResult());
    expect(bindSpy.mock.lastCall).toEqual(["choice", RadioGroupBinding, radioConfig]);
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

    expect(bindSpy).toBeCalledTimes(9);
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

  test("reuses the cached binding for the same field and cacheKey", () => {
    const { model, form } = setupEnv();

    const a = form.bindInput("text", { getter: () => model.text, setter: noop });
    const b = form.bindInput("text", { getter: () => model.text, setter: noop });
    expect(b.onChange).toBe(a.onChange);

    const c = form.bindInput("number", { valueAs: "number", cacheKey: "k", getter: () => model.number, setter: noop });
    const d = form.bindInput("number", { valueAs: "number", cacheKey: "k", getter: () => model.number, setter: noop });
    expect(d.onChange).toBe(c.onChange);
  });

  test("keeps separate bindings per cacheKey only, whatever the valueAs", () => {
    const { form } = setupEnv();

    const plain = form.bindInput("text", { getter: () => "", setter: noop });
    const asString = form.bindInput("text", { valueAs: "string", getter: () => "", setter: noop });
    const asDate = form.bindInput("text", { valueAs: "date", getter: () => null, setter: noop });
    const withKey = form.bindInput("text", { cacheKey: "k", getter: () => "", setter: noop });
    const asDateWithKey = form.bindInput("text", { valueAs: "date", cacheKey: "k", getter: () => null, setter: noop });

    // Like any binding, inputs bound to the same field need distinct cacheKeys to keep their configs apart
    expect(asString.onChange).toBe(plain.onChange);
    expect(asDate.onChange).toBe(plain.onChange);
    expect(asDateWithKey.onChange).toBe(withKey.onChange);
    expect(withKey.onChange).not.toBe(plain.onChange);
    expect(new Set([plain.id, withKey.id])).toEqual(new Set([form.getField("text").id]));
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

  test("shares the cache entry with Form#bind given the same cacheKey", () => {
    const { model, form } = setupEnv();
    const config = { getter: () => model.text, setter: noop };

    const viaExtension = form.bindInput("text", config);
    expect(form.bind("text", InputBinding, config).onChange).toBe(viaExtension.onChange);
    expect(form.bind("text", InputBinding, { cacheKey: "k", ...config }).onChange).not.toBe(viaExtension.onChange);
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

describe("Form#bindTextArea", () => {
  test("returns the props of a TextAreaBinding, sharing the cache entry with Form#bind", () => {
    const { model, form } = setupEnv();
    const config = { getter: () => model.text, setter: noop };

    const props = form.bindTextArea("text", config);
    expect(props).toEqual({
      value: "hello",
      id: form.getField("text").id,
      onChange: expect.any(Function),
      onFocus: expect.any(Function),
      onBlur: expect.any(Function),
      "aria-invalid": undefined,
      "aria-errormessage": undefined,
    });
    expect(form.bindTextArea("text", config).onChange).toBe(props.onChange);
    expect(form.bind("text", TextAreaBinding, config).onChange).toBe(props.onChange);
    expect(form.bindTextArea("text", { cacheKey: "k", ...config }).onChange).not.toBe(props.onChange);
    // A separate binding from the input bound to the same field
    expect(form.bindInput("text", config).onChange).not.toBe(props.onChange);
  });

  test("writes the value through the setter and marks the field as changed and touched", () => {
    const { model, form } = setupEnv();

    const Component: React.FC = observer(() => (
      <textarea
        aria-label="text"
        {...form.bindTextArea("text", {
          getter: () => model.text,
          setter: (v) => (model.text = v),
        })}
      />
    ));
    render(<Component />);
    const textarea = screen.getByLabelText("text") as HTMLTextAreaElement;
    const field = form.getField("text");

    fireEvent.focus(textarea);
    expect(field.isTouched).toBe(true);
    fireEvent.change(textarea, { target: { value: "line 1\nline 2" } });
    expect(model.text).toBe("line 1\nline 2");
    expect(textarea.value).toBe("line 1\nline 2");
    expect(field.isChanged).toBe(true);
    form.reset(); // Cancel the pending auto-finalization
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

describe("Form#bindRadioGroup", () => {
  test("returns the props function of a RadioGroupBinding, sharing the cache entry with Form#bind", () => {
    const { model, form } = setupEnv();
    const config = { getter: () => model.choice, setter: noop };

    const bindRadio = form.bindRadioGroup("choice", config);
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

    expect(form.bindRadioGroup("choice", config)).toBe(bindRadio);
    expect(form.bind("choice", RadioGroupBinding, config)).toBe(bindRadio);
    expect(form.bindRadioGroup("choice", { cacheKey: "k", ...config })).not.toBe(bindRadio);
  });
});

describe("Form#bindSubmitButton", () => {
  test("works without a config, sharing the cache entry with Form#bind given an empty config", () => {
    const { form } = setupEnv();

    const props = form.bindSubmitButton();
    expect(props).toEqual({
      onClick: expect.any(Function),
      onMouseOver: expect.any(Function),
      disabled: false,
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
    expectTypeOf(form.bindTextArea).toEqualTypeOf<Ext["bindTextArea"]>();
    expectTypeOf(form.bindSelectBox).toEqualTypeOf<Ext["bindSelectBox"]>();
    expectTypeOf(form.bindCheckBox).toEqualTypeOf<Ext["bindCheckBox"]>();
    expectTypeOf(form.bindRadioGroup).toEqualTypeOf<Ext["bindRadioGroup"]>();
    expectTypeOf(form.bindSubmitButton).toEqualTypeOf<Ext["bindSubmitButton"]>();
    expectTypeOf(form.bindLabel).toEqualTypeOf<Ext["bindLabel"]>();
    expectTypeOf(form).toExtend<Ext>();

    // Derived from the binding classes
    expectTypeOf<Ext["bindInput"]>().toEqualTypeOf<FormBindingMethod<SampleModel, typeof InputBinding>>();
    expectTypeOf<Ext["bindTextArea"]>().toEqualTypeOf<FormBindingMethod<SampleModel, typeof TextAreaBinding>>();
    expectTypeOf<Ext["bindSelectBox"]>().toEqualTypeOf<FormBindingMethod<SampleModel, typeof SelectBoxBinding>>();
    expectTypeOf<Ext["bindCheckBox"]>().toEqualTypeOf<FormBindingMethod<SampleModel, typeof CheckBoxBinding>>();
    expectTypeOf<Ext["bindSubmitButton"]>().toEqualTypeOf<FormBindingMethod<SampleModel, typeof SubmitButtonBinding>>();
    expectTypeOf<Ext["bindLabel"]>().toEqualTypeOf<FormBindingMethod<SampleModel, typeof LabelBinding>>();
    // Written out, as RadioGroupBinding is generic, so that the options are typed after the getter
    expectTypeOf<Ext["bindRadioGroup"]>().toEqualTypeOf<
      <V extends RadioGroupBinding.Option>(
        fieldName: FormField.Name<SampleModel>,
        config: RadioGroupBinding.Config<V> & FormBindingFunc.Config
      ) => RadioGroupBinding<V>["props"]
    >();
  });

  test("parameters are the subject of the binding and its config, optional when it has no required keys", () => {
    const { form } = setupEnv();

    expectTypeOf(form.bindInput).parameters.toEqualTypeOf<
      [fieldName: FormField.Name<SampleModel>, config: InputBinding.Config & FormBindingFunc.Config]
    >();
    expectTypeOf(form.bindTextArea).parameters.toEqualTypeOf<
      [fieldName: FormField.Name<SampleModel>, config: TextAreaBinding.Config & FormBindingFunc.Config]
    >();
    expectTypeOf(form.bindSelectBox).parameters.toEqualTypeOf<
      [fieldName: FormField.Name<SampleModel>, config: SelectBoxBinding.Config & FormBindingFunc.Config]
    >();
    expectTypeOf(form.bindCheckBox).parameters.toEqualTypeOf<
      [fieldName: FormField.Name<SampleModel>, config: CheckBoxBinding.Config & FormBindingFunc.Config]
    >();
    expectTypeOf(form.bindSubmitButton).parameters.toEqualTypeOf<
      [config?: SubmitButtonBinding.Config & FormBindingFunc.Config]
    >();
    expectTypeOf(form.bindLabel).parameters.toEqualTypeOf<
      [fieldNames: FormField.Name<SampleModel>[], config?: LabelBinding.Config & FormBindingFunc.Config]
    >();
  });

  test("return types are the props of the binding classes", () => {
    const { form } = setupEnv();

    expectTypeOf(form.bindInput).returns.toEqualTypeOf<InputBinding["props"]>();
    expectTypeOf(form.bindTextArea).returns.toEqualTypeOf<TextAreaBinding["props"]>();
    expectTypeOf(form.bindSelectBox).returns.toEqualTypeOf<SelectBoxBinding["props"]>();
    expectTypeOf(form.bindCheckBox).returns.toEqualTypeOf<CheckBoxBinding["props"]>();
    expectTypeOf(form.bindRadioGroup).returns.toEqualTypeOf<RadioGroupBinding["props"]>();
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
      form.bindTextArea("text", { getter: () => model.text, setter: (v) => expectTypeOf(v).toEqualTypeOf<string>() });
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
      // @ts-expect-error bindTextArea requires a config
      form.bindTextArea("text");
      // @ts-expect-error bindTextArea accepts only TextAreaBinding options
      form.bindTextArea("number", { valueAs: "number", getter: () => model.number, setter: noop });
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
      // @ts-expect-error bindRadioGroup requires a config
      form.bindRadioGroup("choice");
      // @ts-expect-error a multiple select box setter receives string[]
      form.bindSelectBox("choice", { multiple: true, getter: () => [model.choice], setter: (v: string) => void v });
      form.bindLabel(["text"], { htmlFor: "custom", cacheKey: "k" });
      // @ts-expect-error bindLabel accepts only LabelBinding options
      form.bindLabel(["text"], { onClick: noop });
      form.bindSubmitButton({ onClick: noop, cacheKey: "k" });
      // @ts-expect-error bindSubmitButton accepts only SubmitButtonBinding options
      form.bindSubmitButton({ htmlFor: "custom" });

      // Detached methods type-check, and fail at runtime (see "methods depend on `this`")
      const { bindInput } = form;
      bindInput("text", { getter: () => model.text, setter: noop });
    };
    expectTypeOf(typeOnly).toBeFunction();
  });
});
