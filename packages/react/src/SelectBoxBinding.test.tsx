import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { autorun, isAction, isComputedProp, makeObservable, observable, runInAction } from "mobx";
import { Form, FormField } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { SelectBoxBinding } from "./SelectBoxBinding";

type SampleOption = {
  name: string;
  code: string;
};

const SAMPLE_OPTIONS: SampleOption[] = [
  { name: "Alpha", code: "A" },
  { name: "Bravo", code: "B" },
  { name: "Zulu", code: "Z" },
];

function findSampleOption(code: string) {
  return SAMPLE_OPTIONS.find((c) => c.code === code) ?? null;
}

class SampleModel {
  @observable single: SampleOption = SAMPLE_OPTIONS[0];
  @observable singleOpt: SampleOption | null = null;
  @observable multiple: SampleOption[] = [];

  constructor() {
    makeObservable(this);
  }
}

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = Form.get(model);

  const options = SAMPLE_OPTIONS.map((country) => (
    <option key={country.code} value={country.code}>
      {country.name}
    </option>
  ));

  return (
    <>
      <select
        aria-label="single"
        {...form.bindSelectBox("single", {
          getter: () => model.single.code,
          setter: (v) => (model.single = findSampleOption(v) ?? SAMPLE_OPTIONS[2]),
        })}
      >
        {options}
      </select>

      <select
        aria-label="singleOpt"
        {...form.bindSelectBox("singleOpt", {
          getter: () => model.singleOpt?.code ?? SAMPLE_OPTIONS[0].code,
          setter: (v) => (model.singleOpt = findSampleOption(v) ?? null),
        })}
      >
        {options}
      </select>

      <select
        aria-label="multiple"
        {...form.bindSelectBox("multiple", {
          multiple: true,
          getter: () => model.multiple.map((c) => c.code),
          setter: (v) => (model.multiple = v.map((code) => findSampleOption(code)).flatMap((v) => (v ? [v] : []))),
        })}
      >
        {options}
      </select>
    </>
  );
});

describe("SelectBoxBinding", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = new FormField({
      fieldName: "single",
      validator: form.validator,
      getFinalizationDelayMs: () => form.config.autoFinalizationDelayMs,
    });
    const binding = new SelectBoxBinding(field, {
      getter: () => "",
      setter: () => {},
    });
    const element = document.createElement("select");
    const fakeEvent = () => {
      return { currentTarget: element } as any;
    };

    return {
      model,
      form,
      field,
      binding,
      fakeEvent,
    };
  };

  /** Binding wired to a real model property through the form's cached field */
  const setupModelEnv = (config?: SelectBoxBinding.Config) => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = form.getField("single");
    const binding = new SelectBoxBinding(
      field,
      config ?? {
        getter: () => model.single.code,
        setter: (v) => (model.single = findSampleOption(v) ?? SAMPLE_OPTIONS[2]),
      }
    );
    const element = document.createElement("select");
    for (const sample of SAMPLE_OPTIONS) {
      const option = document.createElement("option");
      option.value = sample.code;
      option.textContent = sample.name;
      element.append(option);
    }
    const fakeEvent = (selectedCodes: string[], multiple = false) => {
      element.multiple = multiple;
      for (const option of Array.from(element.options)) {
        option.selected = selectedCodes.includes(option.value);
      }
      return { currentTarget: element } as any;
    };

    return {
      model,
      form,
      field,
      binding,
      fakeEvent,
    };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("props.id", () => {
    it("uses the field id by default", () => {
      const env = setupEnv();
      expect(env.binding.props.id).toBe(env.field.id);
    });

    it("uses the provided id", () => {
      const env = setupEnv();
      env.binding.config.id = "somethingElse";
      expect(env.binding.props.id).toBe("somethingElse");
    });

    it("keeps an empty string id as is", () => {
      const env = setupEnv();
      env.binding.config.id = "";
      // PINNED(quirk): an empty-string id is passed through (`??` only falls back on null/undefined), producing an empty id attribute, whereas RadioGroupBinding treats `id: ""` as no id. Decide: should an empty id fall back to the field id?
      expect(env.binding.props.id).toBe("");
    });
  });

  describe("props", () => {
    it("returns the full set of attributes for a single select", () => {
      const env = setupModelEnv();
      expect(env.binding.props).toStrictEqual({
        id: env.field.id,
        multiple: undefined,
        value: SAMPLE_OPTIONS[0].code,
        onChange: env.binding.onChange,
        onFocus: env.binding.onFocus,
        "aria-invalid": undefined,
        "aria-errormessage": undefined,
      });
    });

    it("returns the full set of attributes for a multiple select", () => {
      const values = ["A", "Z"];
      const env = setupModelEnv({ multiple: true, getter: () => values, setter: () => {} });
      expect(env.binding.props).toStrictEqual({
        id: env.field.id,
        multiple: true,
        value: values,
        onChange: env.binding.onChange,
        onFocus: env.binding.onFocus,
        "aria-invalid": undefined,
        "aria-errormessage": undefined,
      });
    });

    it("passes an explicit multiple=false through", () => {
      const env = setupModelEnv({ multiple: false, getter: () => "A", setter: () => {} });
      expect(env.binding.props.multiple).toBe(false);
    });

    it("omits aria-multiselectable, which a native multiple select exposes implicitly", () => {
      const env = setupModelEnv({ multiple: true, getter: () => [], setter: () => {} });
      expect(env.binding.props).not.toHaveProperty("aria-multiselectable");
    });

    it("returns a fresh object with stable handlers on every read", () => {
      const env = setupModelEnv();
      const props1 = env.binding.props;
      const props2 = env.binding.props;
      expect(props1).not.toBe(props2);
      expect(props1.onChange).toBe(props2.onChange);
      expect(props1.onFocus).toBe(props2.onFocus);
    });

    it("exposes errorMessages as a computed value while value and props are plain getters", () => {
      const env = setupModelEnv();
      expect(isComputedProp(env.binding, "value")).toBe(false);
      expect(isComputedProp(env.binding, "errorMessages")).toBe(true);
      expect(isComputedProp(env.binding, "props")).toBe(false);
    });

    it("reads multiple from the current config", () => {
      const env = setupModelEnv();
      expect(env.binding.props.multiple).toBeUndefined();
      env.binding.config = { multiple: true, getter: () => ["B"], setter: () => {} };
      expect(env.binding.props.multiple).toBe(true);
      expect(env.binding.props.value).toEqual(["B"]);
    });
  });

  describe("#value", () => {
    it("returns the getter value for a single select", () => {
      const env = setupModelEnv();
      expect(env.binding.value).toBe("A");
      runInAction(() => (env.model.single = SAMPLE_OPTIONS[1]));
      expect(env.binding.value).toBe("B");
    });

    it("returns the getter array as is for a multiple select", () => {
      const values = ["B", "A"];
      const env = setupModelEnv({ multiple: true, getter: () => values, setter: () => {} });
      expect(env.binding.value).toBe(values);
    });

    it("falls back to an empty string when the getter returns null or undefined", () => {
      // The typed API does not allow these values; the fallback is defensive.
      const env1 = setupModelEnv({ getter: () => null as unknown as string, setter: () => {} });
      expect(env1.binding.value).toBe("");
      const env2 = setupModelEnv({ multiple: true, getter: () => undefined as unknown as string[], setter: () => {} });
      expect(env2.binding.value).toBe("");
    });

    it("is tracked through the getter", () => {
      const env = setupModelEnv();
      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.value);
      });
      runInAction(() => (env.model.multiple = [SAMPLE_OPTIONS[2]])); // Unrelated property
      expect(seen).toEqual(["A"]);
      runInAction(() => (env.model.single = SAMPLE_OPTIONS[2]));
      expect(seen).toEqual(["A", "Z"]);
      dispose();
    });

    it("reads a replaced getter immediately, even while observed", () => {
      const env = setupModelEnv();
      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.value);
      });
      env.binding.config = { multiple: true, getter: () => ["B"], setter: () => {} };
      expect(env.binding.props.value).toEqual(["B"]);
      expect(env.binding.props.multiple).toBe(true);
      // Nothing is notified: `config` is not observable, and Form#bind reads the props right after replacing it
      expect(seen).toEqual(["A"]);
      dispose();
    });
  });

  describe("#onChange", () => {
    it("works without a callback", () => {
      const env = setupEnv();
      env.binding.onChange(env.fakeEvent());
    });

    it("calls the callback if provided", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onChange = callback;
      env.binding.onChange(env.fakeEvent());
      expect(callback).toBeCalledWith(env.fakeEvent());
    });

    it("is a MobX action", () => {
      const env = setupModelEnv();
      expect(isAction(env.binding.onChange)).toBe(true);
    });

    it("passes the selected value to the setter for a single select", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ getter: () => "A", setter });
      env.binding.onChange(env.fakeEvent(["B"]));
      expect(setter.mock.calls).toEqual([["B"]]);
    });

    it("passes an empty string for a single select without options", () => {
      const setter = vi.fn();
      const env = setupEnv();
      env.binding.config = { getter: () => "", setter };
      env.binding.onChange(env.fakeEvent());
      expect(setter.mock.calls).toEqual([[""]]);
    });

    it("passes a string for an explicit multiple=false", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ multiple: false, getter: () => "A", setter });
      env.binding.onChange(env.fakeEvent(["Z"]));
      expect(setter.mock.calls).toEqual([["Z"]]);
    });

    it("passes only the first selected value when a single config handles a multiple element", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ getter: () => "A", setter });
      env.binding.onChange(env.fakeEvent(["B", "Z"], true));
      // The mode is decided by config.multiple (the discriminator that also types the setter as
      // `(value: string) => void`), not by the element, so a single config always receives a string.
      expect(setter.mock.calls).toEqual([["B"]]);
    });

    it("passes the selected values in document order for a multiple select", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ multiple: true, getter: () => [], setter });
      env.binding.onChange(env.fakeEvent(["Z", "A"], true));
      expect(setter.mock.calls).toEqual([[["A", "Z"]]]);
    });

    it("passes an empty array when nothing is selected in a multiple select", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ multiple: true, getter: () => ["A"], setter });
      env.binding.onChange(env.fakeEvent([], true));
      expect(setter.mock.calls).toEqual([[[]]]);
    });

    it("reads multiple from the config at the time of the event", () => {
      const singleSetter = vi.fn();
      const multipleSetter = vi.fn();
      const env = setupModelEnv({ getter: () => "A", setter: singleSetter });
      const { onChange } = env.binding.props;
      env.binding.config = { multiple: true, getter: () => [], setter: multipleSetter };
      onChange(env.fakeEvent(["A", "B"], true));
      expect(singleSetter).not.toBeCalled();
      expect(multipleSetter.mock.calls).toEqual([[["A", "B"]]]);
    });

    it("updates the model", () => {
      const env = setupModelEnv();
      env.binding.onChange(env.fakeEvent(["Z"]));
      expect(env.model.single).toEqual(SAMPLE_OPTIONS[2]);
      expect(env.binding.props.value).toBe("Z");
    });

    it("marks the field as changed with the final change type", () => {
      vi.useFakeTimers();
      const env = setupModelEnv();
      env.binding.onChange(env.fakeEvent(["B"]));
      expect(env.field.isChanged).toBe(true);
      expect(env.field.isIntermediate).toBe(false);
      expect(vi.getTimerCount()).toBe(0); // No auto-finalization is scheduled
      expect(env.field.isTouched).toBe(false);
      expect(env.field.isErrorReported).toBe(false);
    });

    it("reports errors immediately", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("single", "invalid");
      });
      expect(env.field.isErrorReported).toBeUndefined();
      env.binding.onChange(env.fakeEvent(["B"]));
      expect(env.field.isErrorReported).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBe(true);
      expect(env.binding.props["aria-errormessage"]).toBe("invalid");
    });

    it("calls the setter, marks the field as changed, then calls the callback", () => {
      const env = setupModelEnv();
      const log: unknown[] = [];
      env.binding.config = {
        getter: () => "A",
        setter: (v) => {
          log.push(["setter", v, env.field.isChanged]);
        },
        onChange: (e) => {
          log.push(["callback", e.currentTarget.value, env.field.isChanged, env.field.isErrorReported]);
        },
      };
      env.binding.onChange(env.fakeEvent(["Z"]));
      expect(log[0]).toEqual(["setter", "Z", false]);
      // PINNED(quirk): the callback runs inside the onChange action batch, so the delayed error report has not settled yet: isErrorReported is still undefined in the callback and becomes false right after. Decide: should the callback run after the action completes so that it observes the settled field state?
      expect(log[1]).toEqual(["callback", "Z", true, undefined]);
      expect(log).toHaveLength(2);
      expect(env.field.isErrorReported).toBe(false);
    });

    it("neither marks the field as changed nor calls the callback when the setter throws", () => {
      const callback = vi.fn();
      const env = setupModelEnv({
        getter: () => "A",
        setter: () => {
          throw new Error("setter failed");
        },
        onChange: callback,
      });
      expect(() => env.binding.onChange(env.fakeEvent(["B"]))).toThrow("setter failed");
      expect(env.field.isChanged).toBe(false);
      expect(callback).not.toBeCalled();
    });

    it("calls the callback of the config at the time of the event", () => {
      const oldCallback = vi.fn();
      const env = setupModelEnv();
      env.binding.config = { ...env.binding.config, onChange: oldCallback };
      const { onChange } = env.binding.props;
      const callback = vi.fn();
      env.binding.config = { ...env.binding.config, onChange: callback };
      onChange(env.fakeEvent(["B"]));
      expect(oldCallback).not.toBeCalled();
      expect(callback).toBeCalledTimes(1);
      expect(env.model.single).toEqual(SAMPLE_OPTIONS[1]);
    });

    it("reports the change again after the form is reset", () => {
      const env = setupModelEnv();
      env.binding.onChange(env.fakeEvent(["B"]));
      expect(env.binding.props).toMatchObject({ value: "B", "aria-invalid": false });

      env.form.reset();
      expect(env.field.isChanged).toBe(false);
      expect(env.binding.props).toMatchObject({ value: "B", "aria-invalid": undefined }); // The model is kept

      env.binding.onChange(env.fakeEvent(["Z"]));
      expect(env.field.isChanged).toBe(true);
      expect(env.binding.props).toMatchObject({ value: "Z", "aria-invalid": false });
    });
  });

  describe("#onFocus", () => {
    it("works without a callback", () => {
      const env = setupEnv();
      env.binding.onFocus(env.fakeEvent());
    });

    it("calls the callback if provided", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onFocus = callback;
      env.binding.onFocus(env.fakeEvent());
      expect(callback).toBeCalledWith(env.fakeEvent());
    });

    it("is not a MobX action", () => {
      const env = setupModelEnv();
      expect(isAction(env.binding.onFocus)).toBe(false);
    });

    it("marks the field as touched only", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ getter: () => "A", setter });
      const log: boolean[] = [];
      env.binding.config.onFocus = () => log.push(env.field.isTouched);
      env.binding.onFocus(env.fakeEvent(["A"]));
      expect(log).toEqual([true]);
      expect(env.field.isTouched).toBe(true);
      expect(env.field.isChanged).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
      expect(setter).not.toBeCalled();
    });

    it("uses the config at the time of the event", () => {
      const oldCallback = vi.fn();
      const env = setupModelEnv();
      env.binding.config = { ...env.binding.config, onFocus: oldCallback };
      const { onFocus } = env.binding.props;
      const callback = vi.fn();
      env.binding.config = { ...env.binding.config, onFocus: callback };
      onFocus(env.fakeEvent(["A"]));
      expect(oldCallback).not.toBeCalled();
      expect(callback).toBeCalledTimes(1);
    });
  });

  describe("errorMessages", () => {
    it("returns null if no errors", () => {
      const env = setupEnv();
      expect(env.binding.errorMessages).toBeNull();
      env.field.reportError();
      expect(env.binding.errorMessages).toBeNull();
    });

    it("returns the error messages if errors are reported", () => {
      const env = setupEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("single", "invalid1");
        builder.invalidate("single", "invalid2");
      });
      expect(env.binding.errorMessages).toBeNull();
      env.field.reportError();
      expect(env.binding.errorMessages).toEqual("invalid1, invalid2");
    });

    it("ignores errors of other fields", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("singleOpt", "invalid");
      });
      env.field.reportError();
      expect(env.binding.errorMessages).toBeNull();
      expect(env.binding.props["aria-invalid"]).toBe(false);
    });

    it("returns null when the only error message is empty", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("single", "");
      });
      env.field.reportError();
      expect(env.binding.props["aria-invalid"]).toBe(true);
      // PINNED(quirk): an empty message joins to "" and falls back to null, so the element is aria-invalid without any aria-errormessage. Decide: should an empty message be rejected by the validator, or rendered as-is?
      expect(env.binding.errorMessages).toBeNull();
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });
  });

  describe("types", () => {
    it("exposes typed props", () => {
      const env = setupModelEnv();
      expectTypeOf(env.binding.props.id).toEqualTypeOf<string>();
      expectTypeOf(env.binding.props.multiple).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(env.binding.props.value).toEqualTypeOf<string | number | readonly string[]>();
      expectTypeOf(env.binding.props["aria-invalid"]).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(env.binding.props["aria-errormessage"]).toEqualTypeOf<string | undefined>();
      expectTypeOf(env.binding.props.onChange).toEqualTypeOf<React.ChangeEventHandler<HTMLSelectElement>>();
      expectTypeOf(env.binding.props.onFocus).toEqualTypeOf<React.FocusEventHandler<HTMLSelectElement>>();
      expectTypeOf(env.binding.props).toExtend<SelectBoxBinding.Attrs>();
      expectTypeOf(env.binding.errorMessages).toEqualTypeOf<string | null>();
    });

    it("types the config as a union discriminated by multiple", () => {
      type SingleConfig = Exclude<SelectBoxBinding.Config, { multiple: true }>;
      type MultipleConfig = Extract<SelectBoxBinding.Config, { multiple: true }>;
      expectTypeOf<SingleConfig["multiple"]>().toEqualTypeOf<false | undefined>();
      expectTypeOf<SingleConfig["getter"]>().toEqualTypeOf<() => string>();
      expectTypeOf<SingleConfig["setter"]>().toEqualTypeOf<(value: string) => void>();
      expectTypeOf<MultipleConfig["getter"]>().toEqualTypeOf<() => string[]>();
      expectTypeOf<MultipleConfig["setter"]>().toEqualTypeOf<(value: string[]) => void>();
    });

    it("types the id and the extended handlers", () => {
      expectTypeOf<SelectBoxBinding.Config["id"]>().toEqualTypeOf<string | undefined>();
      expectTypeOf<SelectBoxBinding.Config["onChange"]>().toEqualTypeOf<
        React.ChangeEventHandler<HTMLSelectElement> | undefined
      >();
      expectTypeOf<SelectBoxBinding.Config["onFocus"]>().toEqualTypeOf<
        React.FocusEventHandler<HTMLSelectElement> | undefined
      >();
    });

    it("rejects nullable getters and mismatched setters at compile time", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const invalidUsages = () => {
        // @ts-expect-error a single select getter must not return undefined
        form.bindSelectBox("singleOpt", { getter: () => model.singleOpt?.code, setter: () => {} });
        // @ts-expect-error a multiple select getter must not return null
        form.bindSelectBox("multiple", { multiple: true, getter: () => null, setter: () => {} });
        // @ts-expect-error a multiple select must set an array
        form.bindSelectBox("multiple", { multiple: true, getter: () => ["A"], setter: (_v: string) => {} });
      };
      expectTypeOf(invalidUsages).toBeFunction();
    });

    it("infers the setter value from multiple in bindSelectBox", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const singleProps = form.bindSelectBox("single", {
        getter: () => "A",
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<string>();
        },
      });
      const multipleProps = form.bindSelectBox("multiple", {
        multiple: true,
        getter: () => ["A"],
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<string[]>();
        },
      });
      expectTypeOf(singleProps).toEqualTypeOf<SelectBoxBinding["props"]>();
      expectTypeOf(multipleProps).toEqualTypeOf<SelectBoxBinding["props"]>();
    });

    it("rejects invalid usage at compile time", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const invalidUsages = () => {
        // @ts-expect-error a multiple select must get an array
        form.bindSelectBox("multiple", { multiple: true, getter: () => "A", setter: () => {} });
        // @ts-expect-error a single select must get a string
        form.bindSelectBox("single", { getter: () => ["A"], setter: () => {} });
        // @ts-expect-error a single select must set a string
        form.bindSelectBox("single", { multiple: false, getter: () => "A", setter: (_v: string[]) => {} });
        // @ts-expect-error unknown field name
        form.bindSelectBox("unknown", { getter: () => "A", setter: () => {} });
      };
      expectTypeOf(invalidUsages).toBeFunction();
    });
  });
});

describe("bindSelectBox", () => {
  const setupEnv = (inputLabel: string) => {
    const model = new SampleModel();

    render(<SampleComponent model={model} />);
    const select = screen.getByLabelText(inputLabel) as HTMLSelectElement;

    return {
      model,
      select,
      async selectOptions(value: string | string[]) {
        await userEvent.selectOptions(select, value);
      },
      async deselectOptions(value: string | string[]) {
        await userEvent.deselectOptions(select, value);
      },
    };
  };

  describe("multiple=false", () => {
    test("works with a required field", async () => {
      const env = setupEnv("single");

      expect(env.model.single).toEqual(SAMPLE_OPTIONS[0]);
      expect(env.select).toHaveDisplayValue(SAMPLE_OPTIONS[0].name);
      await env.selectOptions(SAMPLE_OPTIONS[1].code);
      expect(env.model.single).toEqual(SAMPLE_OPTIONS[1]);
      expect(env.select).toHaveDisplayValue(SAMPLE_OPTIONS[1].name);
      await env.selectOptions([]); // No effect
      expect(env.model.single).toEqual(SAMPLE_OPTIONS[1]);
      expect(env.select).toHaveDisplayValue(SAMPLE_OPTIONS[1].name);
    });

    test("works with an optional field", async () => {
      const env = setupEnv("singleOpt");

      expect(env.model.singleOpt).toEqual(null);
      expect(env.select).toHaveDisplayValue(SAMPLE_OPTIONS[0].name); // The first option will be always selected
      await env.selectOptions(SAMPLE_OPTIONS[1].code);
      expect(env.model.singleOpt).toEqual(SAMPLE_OPTIONS[1]);
      expect(env.select).toHaveDisplayValue(SAMPLE_OPTIONS[1].name);
      await env.selectOptions([]); // No effect
      expect(env.model.singleOpt).toEqual(SAMPLE_OPTIONS[1]);
      expect(env.select).toHaveDisplayValue(SAMPLE_OPTIONS[1].name);
    });

    test("renders the field id without the multiple attribute", () => {
      const env = setupEnv("single");
      const form = Form.get(env.model);

      expect(env.select).toHaveAttribute("id", form.getField("single").id);
      expect(env.select).not.toHaveAttribute("multiple");
      expect(env.select.multiple).toBe(false);
    });

    test("reflects model changes made outside of the UI", () => {
      const env = setupEnv("single");

      act(() => runInAction(() => (env.model.single = SAMPLE_OPTIONS[2])));
      expect(env.select).toHaveDisplayValue(SAMPLE_OPTIONS[2].name);
    });

    test("reflects a getter that closes over a changed React prop", () => {
      const model = new SampleModel();
      const Component = observer(({ code }: { code: string }) => {
        const form = Form.get(model);
        return (
          <select aria-label="prop" {...form.bindSelectBox("single", { getter: () => code, setter: () => {} })}>
            {SAMPLE_OPTIONS.map((sample) => (
              <option key={sample.code} value={sample.code}>
                {sample.name}
              </option>
            ))}
          </select>
        );
      });
      const { rerender } = render(<Component code={SAMPLE_OPTIONS[0].code} />);
      const select = screen.getByLabelText("prop");
      expect(select).toHaveDisplayValue(SAMPLE_OPTIONS[0].name);

      rerender(<Component code={SAMPLE_OPTIONS[1].code} />);
      expect(select).toHaveDisplayValue(SAMPLE_OPTIONS[1].name);
    });

    test("marks only the changed field as touched and changed", async () => {
      const env = setupEnv("single");
      const form = Form.get(env.model);

      await env.selectOptions(SAMPLE_OPTIONS[2].code);
      expect(form.getField("single").isTouched).toBe(true);
      expect(form.getField("single").isChanged).toBe(true);
      expect(form.getField("singleOpt").isTouched).toBe(false);
      expect(form.getField("singleOpt").isChanged).toBe(false);
    });

    test("sets the aria attributes once the change is reported", async () => {
      const env = setupEnv("single");
      const form = Form.get(env.model);

      act(() => {
        form.validator.updateErrors(Symbol(), (builder) => {
          builder.invalidate("single", "invalid");
        });
      });
      expect(env.select).not.toHaveAttribute("aria-invalid");
      expect(env.select).not.toHaveAttribute("aria-errormessage");

      await env.selectOptions(SAMPLE_OPTIONS[1].code);
      expect(env.select).toHaveAttribute("aria-invalid", "true");
      // PINNED(quirk): aria-errormessage carries the message text itself, while WAI-ARIA defines it as an ID reference to the element that contains the message (the form docs say "with error text"; the react docs say "linking to error text"). Decide: should the binding reference an error element id instead of embedding the text?
      expect(env.select).toHaveAttribute("aria-errormessage", "invalid");

      act(() => form.reset());
      expect(env.select).not.toHaveAttribute("aria-invalid");
      expect(env.select).not.toHaveAttribute("aria-errormessage");
    });

    test("displays the first option when the value is not among the options", () => {
      const model = new SampleModel();
      const setter = vi.fn();
      const Component = observer(() => {
        const form = Form.get(model);
        return (
          <select aria-label="unknown" {...form.bindSelectBox("single", { getter: () => "UNKNOWN", setter })}>
            {SAMPLE_OPTIONS.map((sample) => (
              <option key={sample.code} value={sample.code}>
                {sample.name}
              </option>
            ))}
          </select>
        );
      });
      render(<Component />);
      const select = screen.getByLabelText("unknown") as HTMLSelectElement;

      // Native <select> semantics (also noted in "works with an optional field"): when the value matches
      // no option, the first option is displayed while the model keeps "UNKNOWN" and no change is emitted.
      expect(select).toHaveDisplayValue(SAMPLE_OPTIONS[0].name);
      expect(select.value).toBe(SAMPLE_OPTIONS[0].code);
      expect(setter).not.toBeCalled();
    });

    test("clears an optional value through an empty placeholder option", async () => {
      const model = new SampleModel();
      runInAction(() => (model.singleOpt = SAMPLE_OPTIONS[1]));
      const Component = observer(() => {
        const form = Form.get(model);
        return (
          <select
            aria-label="placeholder"
            {...form.bindSelectBox("singleOpt", {
              getter: () => model.singleOpt?.code ?? "",
              setter: (v) => (model.singleOpt = findSampleOption(v)),
            })}
          >
            <option value="">(none)</option>
            {SAMPLE_OPTIONS.map((sample) => (
              <option key={sample.code} value={sample.code}>
                {sample.name}
              </option>
            ))}
          </select>
        );
      });
      render(<Component />);
      const select = screen.getByLabelText("placeholder");

      expect(select).toHaveDisplayValue(SAMPLE_OPTIONS[1].name);
      await userEvent.selectOptions(select, "");
      expect(model.singleOpt).toBeNull();
      expect(select).toHaveDisplayValue("(none)");
      expect(Form.get(model).getField("singleOpt").isChanged).toBe(true);
    });

    test("keeps displaying the model value when the setter ignores the value", async () => {
      const model = new SampleModel();
      const setter = vi.fn();
      const Component = observer(() => {
        const form = Form.get(model);
        return (
          <select aria-label="ignored" {...form.bindSelectBox("single", { getter: () => model.single.code, setter })}>
            {SAMPLE_OPTIONS.map((sample) => (
              <option key={sample.code} value={sample.code}>
                {sample.name}
              </option>
            ))}
          </select>
        );
      });
      render(<Component />);
      const select = screen.getByLabelText("ignored");

      await userEvent.selectOptions(select, SAMPLE_OPTIONS[1].code);
      expect(setter).toBeCalledWith(SAMPLE_OPTIONS[1].code);
      expect(select).toHaveDisplayValue(SAMPLE_OPTIONS[0].name); // Controlled by the getter
      expect(Form.get(model).getField("single").isChanged).toBe(true);
    });

    test("is associated with a label bound to the same field", () => {
      const model = new SampleModel();
      const Component = observer(() => {
        const form = Form.get(model);
        return (
          <>
            <label {...form.bindLabel(["single"])}>Single</label>
            <select {...form.bindSelectBox("single", { getter: () => model.single.code, setter: () => {} })}>
              {SAMPLE_OPTIONS.map((sample) => (
                <option key={sample.code} value={sample.code}>
                  {sample.name}
                </option>
              ))}
            </select>
          </>
        );
      });
      render(<Component />);

      expect(screen.getByLabelText("Single")).toBe(screen.getByRole("combobox"));
    });

    describe("with reactive validation", () => {
      const delayMs = 50;

      beforeEach(() => {
        vi.useFakeTimers();
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      test("waits for the pending validation before setting the aria attributes", () => {
        const model = new SampleModel();
        const form = Form.get(model);
        form.validator.addSyncHandler(
          (builder) => {
            if (model.single.code !== SAMPLE_OPTIONS[0].code) builder.invalidate("single", "must be alpha");
          },
          { delayMs }
        );
        render(<SampleComponent model={model} />);
        act(() => {
          vi.advanceTimersByTime(delayMs); // Initial validation
        });
        const select = screen.getByLabelText("single");

        fireEvent.change(select, { target: { value: SAMPLE_OPTIONS[1].code } });
        expect(model.single).toEqual(SAMPLE_OPTIONS[1]);
        expect(form.validator.isValidating).toBe(true);
        expect(select).not.toHaveAttribute("aria-invalid");

        act(() => {
          vi.advanceTimersByTime(delayMs);
        });
        expect(select).toHaveAttribute("aria-invalid", "true");
        expect(select).toHaveAttribute("aria-errormessage", "must be alpha");

        act(() => form.reset());
        expect(select).toHaveDisplayValue(SAMPLE_OPTIONS[1].name); // The model is kept
        expect(select).not.toHaveAttribute("aria-invalid");

        fireEvent.change(select, { target: { value: SAMPLE_OPTIONS[0].code } });
        expect(select).not.toHaveAttribute("aria-invalid"); // Validation is pending

        act(() => {
          vi.advanceTimersByTime(delayMs);
        });
        expect(select).toHaveAttribute("aria-invalid", "false");
        expect(select).not.toHaveAttribute("aria-errormessage");
      });
    });
  });

  describe("multiple=true", () => {
    test("works with an array field", async () => {
      const env = setupEnv("multiple");

      expect(env.model.multiple).toEqual([]);
      expect(env.select).toHaveDisplayValue([]);
      await env.selectOptions([SAMPLE_OPTIONS[0].code, SAMPLE_OPTIONS[2].code]);
      expect(env.model.multiple).toEqual([SAMPLE_OPTIONS[0], SAMPLE_OPTIONS[2]]);
      expect(env.select).toHaveDisplayValue([SAMPLE_OPTIONS[0].name, SAMPLE_OPTIONS[2].name]);
      await env.deselectOptions(SAMPLE_OPTIONS[0].code);
      await env.selectOptions([SAMPLE_OPTIONS[1].code]);
      expect(env.model.multiple).toEqual([SAMPLE_OPTIONS[1], SAMPLE_OPTIONS[2]]);
      expect(env.select).toHaveDisplayValue([SAMPLE_OPTIONS[1].name, SAMPLE_OPTIONS[2].name]);
      await env.deselectOptions([SAMPLE_OPTIONS[1].code, SAMPLE_OPTIONS[2].code]);
      expect(env.model.multiple).toEqual([]);
      expect(env.select).toHaveDisplayValue([]);
    });

    test("renders the multiple attribute without aria-multiselectable", () => {
      const env = setupEnv("multiple");
      const form = Form.get(env.model);

      expect(env.select).toHaveAttribute("id", form.getField("multiple").id);
      expect(env.select).toHaveAttribute("multiple");
      expect(env.select.multiple).toBe(true);
      // A native <select multiple> already exposes multi-selectability to assistive technology.
      expect(env.select).not.toHaveAttribute("aria-multiselectable");
    });

    test("reflects model changes made outside of the UI", () => {
      const env = setupEnv("multiple");

      act(() => runInAction(() => (env.model.multiple = [SAMPLE_OPTIONS[1], SAMPLE_OPTIONS[2]])));
      expect(env.select).toHaveDisplayValue([SAMPLE_OPTIONS[1].name, SAMPLE_OPTIONS[2].name]);
      act(() => runInAction(() => (env.model.multiple = [])));
      expect(env.select).toHaveDisplayValue([]);
    });

    test("drops values that are not among the options on the next change", async () => {
      const model = new SampleModel();
      const values = observable.box(["UNKNOWN", SAMPLE_OPTIONS[1].code]);
      const setter = vi.fn((v: string[]) => values.set(v));
      const Component = observer(() => {
        const form = Form.get(model);
        return (
          <select
            aria-label="unknown"
            {...form.bindSelectBox("multiple", { multiple: true, getter: () => values.get(), setter })}
          >
            {SAMPLE_OPTIONS.map((sample) => (
              <option key={sample.code} value={sample.code}>
                {sample.name}
              </option>
            ))}
          </select>
        );
      });
      render(<Component />);
      const select = screen.getByLabelText("unknown") as HTMLSelectElement;

      expect(select).toHaveDisplayValue([SAMPLE_OPTIONS[1].name]);
      expect(setter).not.toBeCalled();

      await userEvent.selectOptions(select, SAMPLE_OPTIONS[0].code);
      // PINNED(quirk): the setter receives only the selected options, so a model value that is not among the options ("UNKNOWN") is silently dropped by an unrelated change. Decide: should values that are not among the options be preserved?
      expect(setter.mock.calls).toEqual([[[SAMPLE_OPTIONS[0].code, SAMPLE_OPTIONS[1].code]]]);
      expect(values.get()).toEqual([SAMPLE_OPTIONS[0].code, SAMPLE_OPTIONS[1].code]);
    });

    test("reorders the values to the document order on the next change", async () => {
      const model = new SampleModel();
      const values = observable.box([SAMPLE_OPTIONS[2].code, SAMPLE_OPTIONS[0].code]);
      const setter = vi.fn((v: string[]) => values.set(v));
      const Component = observer(() => {
        const form = Form.get(model);
        return (
          <select
            aria-label="ordered"
            {...form.bindSelectBox("multiple", { multiple: true, getter: () => values.get(), setter })}
          >
            {SAMPLE_OPTIONS.map((sample) => (
              <option key={sample.code} value={sample.code}>
                {sample.name}
              </option>
            ))}
          </select>
        );
      });
      render(<Component />);
      const select = screen.getByLabelText("ordered");

      expect(select).toHaveDisplayValue([SAMPLE_OPTIONS[0].name, SAMPLE_OPTIONS[2].name]);
      await userEvent.selectOptions(select, SAMPLE_OPTIONS[1].code);
      // PINNED(quirk): the setter receives the selected options in document order, so the model order ["Z", "A"] is rewritten by an unrelated change. Decide: should the binding preserve the existing order of the model values (appending newly selected ones)?
      expect(setter.mock.calls).toEqual([[[SAMPLE_OPTIONS[0].code, SAMPLE_OPTIONS[1].code, SAMPLE_OPTIONS[2].code]]]);
    });

    test("keeps displaying the model values when the setter ignores the value", async () => {
      const model = new SampleModel();
      const setter = vi.fn();
      const Component = observer(() => {
        const form = Form.get(model);
        return (
          <select
            aria-label="ignored"
            {...form.bindSelectBox("multiple", { multiple: true, getter: () => [SAMPLE_OPTIONS[0].code], setter })}
          >
            {SAMPLE_OPTIONS.map((sample) => (
              <option key={sample.code} value={sample.code}>
                {sample.name}
              </option>
            ))}
          </select>
        );
      });
      render(<Component />);
      const select = screen.getByLabelText("ignored");

      await userEvent.selectOptions(select, SAMPLE_OPTIONS[1].code);
      expect(setter.mock.calls).toEqual([[[SAMPLE_OPTIONS[0].code, SAMPLE_OPTIONS[1].code]]]);
      expect(select).toHaveDisplayValue([SAMPLE_OPTIONS[0].name]); // Controlled by the getter
      expect(Form.get(model).getField("multiple").isChanged).toBe(true);
    });
  });
});
