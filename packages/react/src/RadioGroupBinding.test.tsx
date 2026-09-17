import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { autorun, isAction, isComputedProp, makeObservable, observable, runInAction } from "mobx";
import { Form, FormField } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { RadioGroupBinding, renderRadioGroup } from "./RadioGroupBinding";

enum SampleEnum {
  ALPHA = "ALPHA",
  BRAVO = "BRAVO",
  ZULU = "ZULU",
}

class SampleModel {
  @observable enum: SampleEnum = SampleEnum.ALPHA;
  @observable enumOpt: SampleEnum | null = null;
  @observable rating: number = 3;
  @observable agreed: boolean | null = null;
  @observable code: number | string = 1;

  constructor() {
    makeObservable(this);
  }
}

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = Form.get(model);

  const bindEnum = form.bindRadioGroup("enum", {
    getter: () => model.enum,
    setter: (v) => (model.enum = v),
  });
  const bindEnumOpt = form.bindRadioGroup("enumOpt", {
    getter: () => model.enumOpt,
    setter: (v) => (model.enumOpt = v),
  });

  return (
    <>
      {Object.values(SampleEnum).map((value) => (
        <input key={value} aria-label={`enum-${value}`} {...bindEnum(value)} />
      ))}

      {Object.values(SampleEnum).map((value) => (
        <input key={value} aria-label={`enumOpt-${value}`} {...bindEnumOpt(value)} />
      ))}
    </>
  );
});

function setupEnv(inputLabelPrefix: string) {
  const model = new SampleModel();

  render(<SampleComponent model={model} />);
  const alpha = screen.getByLabelText(`${inputLabelPrefix}-${SampleEnum.ALPHA}`) as HTMLInputElement;
  const bravo = screen.getByLabelText(`${inputLabelPrefix}-${SampleEnum.BRAVO}`) as HTMLInputElement;
  const zulu = screen.getByLabelText(`${inputLabelPrefix}-${SampleEnum.ZULU}`) as HTMLInputElement;

  return {
    model,
    alpha,
    bravo,
    zulu,
    async clickAlpha() {
      await userEvent.click(alpha);
    },
    async clickBravo() {
      await userEvent.click(bravo);
    },
    async clickZulu() {
      await userEvent.click(zulu);
    },
  };
}

/** Create a change event of a radio button, whose `value` attribute the binding should not need */
const radioEventOf = (value = "", checked = true) => {
  const element = document.createElement("input");
  element.type = "radio";
  element.value = value;
  element.checked = checked;
  return { currentTarget: element } as unknown as React.ChangeEvent<HTMLInputElement> &
    React.FocusEvent<HTMLInputElement>;
};

describe("RadioGroupBinding", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = new FormField({
      fieldName: "enum",
      validator: form.validator,
      getFinalizationDelayMs: () => form.config.autoFinalizationDelayMs,
    });
    const binding = new RadioGroupBinding<string | null>(field, {
      getter: () => null,
      setter: () => {},
    });
    const element = document.createElement("input");
    element.checked = true;
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

  /** Binding wired to a real (nullable) model property through the form's cached field */
  const setupModelEnv = (config?: Partial<RadioGroupBinding.Config<SampleEnum | null>>) => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = form.getField("enumOpt");
    const binding = new RadioGroupBinding<SampleEnum | null>(field, {
      getter: () => model.enumOpt,
      setter: (v) => (model.enumOpt = v),
      ...config,
    });

    return {
      model,
      form,
      field,
      binding,
    };
  };

  /** Binding on a field of its own, whose options can be of any type */
  const setupBoxEnv = <V extends RadioGroupBinding.Option>(initial: V) => {
    const form = Form.get(new SampleModel());
    const field = new FormField({
      fieldName: "box",
      validator: form.validator,
      getFinalizationDelayMs: () => form.config.autoFinalizationDelayMs,
    });
    const box = observable.box<V>(initial);
    const setter = vi.fn((value: V) => box.set(value));
    const binding = new RadioGroupBinding<V>(field, { getter: () => box.get(), setter });
    return { form, field, box, setter, binding };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("props.id", () => {
    it("is undefined by default", () => {
      const env = setupEnv();
      expect(env.binding.props("value1").id).toBeUndefined();
    });

    it("uses the field id if true", () => {
      const env = setupEnv();
      expect(env.binding.props("value1", { id: true }).id).toBe(env.field.id);
    });

    it("uses the provided id", () => {
      const env = setupEnv();
      expect(env.binding.props("value1", { id: "somethingElse" }).id).toBe("somethingElse");
    });

    it("is undefined if false or an empty string", () => {
      const env = setupEnv();
      expect(env.binding.props("value1", { id: false }).id).toBeUndefined();
      expect(env.binding.props("value1", { id: "" }).id).toBeUndefined();
      expect(env.binding.props("value1", {}).id).toBeUndefined();
    });
  });

  describe("props.name", () => {
    it("uses the field id by default", () => {
      const env = setupEnv();
      expect(env.binding.props("value1").name).toBe(env.field.id);
      expect(env.binding.props("value2", { id: "somethingElse" }).name).toBe(env.field.id);
    });

    it("uses the provided name", () => {
      const env = setupEnv();
      expect(env.binding.props("value1", { name: "group" }).name).toBe("group");
    });

    it("keeps an empty string name as is", () => {
      const env = setupEnv();
      // PINNED(quirk): an empty-string name is passed through (`??`), which ungroups the button, whereas `id: ""` falls back to no id. Decide: should an empty name fall back to the field id?
      expect(env.binding.props("value1", { name: "" }).name).toBe("");
    });
  });

  describe("props", () => {
    it("returns the full set of attributes", () => {
      const env = setupModelEnv();
      const props = env.binding.props(SampleEnum.ALPHA);
      expect(props).toStrictEqual({
        type: "radio",
        id: undefined,
        value: SampleEnum.ALPHA,
        name: env.field.id,
        checked: false,
        onChange: expect.any(Function),
        onFocus: env.binding.onFocus,
        "aria-invalid": undefined,
        "aria-errormessage": undefined,
      });
    });

    it("is a stable function returning a fresh object with stable handlers on every call", () => {
      const env = setupModelEnv();
      const props = env.binding.props;
      expect(env.binding.props).toBe(props);
      expect(isAction(props)).toBe(false);
      const props1 = props(SampleEnum.ALPHA);
      const props2 = props(SampleEnum.ALPHA);
      expect(props1).not.toBe(props2);
      expect(props1.onChange).toBe(props2.onChange);
      expect(props1.onFocus).toBe(props2.onFocus);
    });

    it("gives each option a change handler of its own, and all options the same focus handler", () => {
      const env = setupModelEnv();
      const options = [...Object.values(SampleEnum), null];
      const changeHandlers = new Set(options.map((option) => env.binding.props(option).onChange));
      expect(changeHandlers.size).toBe(options.length);
      expect(new Set(options.map((option) => env.binding.props(option).onFocus))).toEqual(
        new Set([env.binding.onFocus])
      );
    });

    it("keeps the handlers across config replacements", () => {
      const env = setupModelEnv();
      const { onChange } = env.binding.props(SampleEnum.ALPHA);
      env.binding.config = { getter: () => SampleEnum.ALPHA, setter: () => {} };
      expect(env.binding.props(SampleEnum.ALPHA).onChange).toBe(onChange);
    });

    it("exposes errorMessages as a computed value while value is a plain getter", () => {
      const env = setupModelEnv();
      expect(isComputedProp(env.binding, "value")).toBe(false);
      expect(isComputedProp(env.binding, "errorMessages")).toBe(true);
    });

    it("checks only the button whose option strictly equals the getter value", () => {
      const env = setupModelEnv();
      runInAction(() => (env.model.enumOpt = SampleEnum.BRAVO));
      expect(env.binding.props(SampleEnum.ALPHA).checked).toBe(false);
      expect(env.binding.props(SampleEnum.BRAVO).checked).toBe(true);
      expect(env.binding.props(SampleEnum.ZULU).checked).toBe(false);
      expect(env.binding.props("bravo" as SampleEnum).checked).toBe(false);
      expect(env.binding.props(" BRAVO" as SampleEnum).checked).toBe(false);
      expect(env.binding.props(null).checked).toBe(false);
      expect(env.binding.props("" as SampleEnum).checked).toBe(false);
    });

    it("renders a null option as an empty value", () => {
      const env = setupModelEnv();
      expect(env.binding.props(null).value).toBe("");
    });

    it("renders number and boolean options by their string form", () => {
      expect(setupBoxEnv<number>(0).binding.props(0).value).toBe("0");
      expect(setupBoxEnv<number>(0).binding.props(-1.5).value).toBe("-1.5");
      expect(setupBoxEnv<boolean>(false).binding.props(true).value).toBe("true");
      expect(setupBoxEnv<boolean>(false).binding.props(false).value).toBe("false");
    });

    it("checks the null button when the getter returns null", () => {
      const env = setupModelEnv();
      expect(env.model.enumOpt).toBeNull();
      expect(env.binding.props(null).checked).toBe(true);
      expect(env.binding.props(SampleEnum.ALPHA).checked).toBe(false);
    });

    it("tells a null option from an empty string, and a number from its string form", () => {
      const nullable = setupBoxEnv<string | null>(null);
      expect(nullable.binding.props(null).checked).toBe(true);
      expect(nullable.binding.props("").checked).toBe(false);
      runInAction(() => nullable.box.set(""));
      expect(nullable.binding.props(null).checked).toBe(false);
      expect(nullable.binding.props("").checked).toBe(true);

      const mixed = setupBoxEnv<number | string>(1);
      expect(mixed.binding.props(1).checked).toBe(true);
      expect(mixed.binding.props("1").checked).toBe(false);
      expect(mixed.binding.props("1").value).toBe(mixed.binding.props(1).value);
    });

    it("applies the same aria attributes to every button", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("enumOpt", "invalid");
      });
      env.field.reportError();
      for (const value of [...Object.values(SampleEnum), null]) {
        expect(env.binding.props(value)["aria-invalid"]).toBe(true);
        expect(env.binding.props(value)["aria-errormessage"]).toBe("invalid");
      }
    });
  });

  describe("#value", () => {
    it("returns the getter value", () => {
      const env = setupModelEnv();
      runInAction(() => (env.model.enumOpt = SampleEnum.ZULU));
      expect(env.binding.value).toBe(SampleEnum.ZULU);
    });

    it("returns null when the getter returns null", () => {
      const env = setupModelEnv();
      expect(env.binding.value).toBeNull();
    });

    it("is tracked through the getter", () => {
      const env = setupModelEnv();
      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.value);
      });
      runInAction(() => (env.model.enum = SampleEnum.ZULU)); // Unrelated property
      expect(seen).toEqual([null]);
      runInAction(() => (env.model.enumOpt = SampleEnum.BRAVO));
      expect(seen).toEqual([null, SampleEnum.BRAVO]);
      dispose();
    });

    it("reads a replaced getter immediately, even while observed", () => {
      const env = setupModelEnv();
      const other = observable.box<SampleEnum | null>(SampleEnum.ZULU);
      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.value);
      });
      env.binding.config = { getter: () => other.get(), setter: () => {} };
      expect(env.binding.value).toBe(SampleEnum.ZULU);
      expect(env.binding.props(SampleEnum.ZULU).checked).toBe(true);
      // Nothing is notified: `config` is not observable, and Form#bind reads the props right after replacing it
      expect(seen).toEqual([null]);
      dispose();
    });
  });

  describe("change handlers", () => {
    it("work without a callback", () => {
      const env = setupEnv();
      env.binding.props("value1").onChange(env.fakeEvent());
    });

    it("call the callback if provided", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onChange = callback;
      env.binding.props("value1").onChange(env.fakeEvent());
      expect(callback).toBeCalledWith(env.fakeEvent());
    });

    it("are MobX actions", () => {
      const env = setupModelEnv();
      expect(isAction(env.binding.props(SampleEnum.ALPHA).onChange)).toBe(true);
      expect(isAction(env.binding.props(null).onChange)).toBe(true);
    });

    it("pass the option of the button to the setter, whatever the value attribute of the event says", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ setter });
      env.binding.props(SampleEnum.BRAVO).onChange(radioEventOf(SampleEnum.ZULU));
      expect(setter.mock.calls).toEqual([[SampleEnum.BRAVO]]);
    });

    it("pass null when the null button is checked", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ setter });
      env.binding.props(null).onChange(radioEventOf(""));
      expect(setter.mock.calls).toEqual([[null]]);
    });

    it("pass number and boolean options as they are", () => {
      const numbers = setupBoxEnv<number>(1);
      numbers.binding.props(2).onChange(radioEventOf("2"));
      expect(numbers.setter.mock.calls).toEqual([[2]]);
      expect(numbers.binding.props(2).checked).toBe(true);
      expect(numbers.binding.props(1).checked).toBe(false);

      const booleans = setupBoxEnv<boolean | null>(null);
      booleans.binding.props(false).onChange(radioEventOf("false"));
      expect(booleans.setter.mock.calls).toEqual([[false]]);
      expect(booleans.binding.props(false).checked).toBe(true);
      expect(booleans.binding.props(null).checked).toBe(false);
    });

    it("keep options that share a string form apart", () => {
      const env = setupBoxEnv<number | string>(1);
      env.binding.props("1").onChange(radioEventOf("1"));
      expect(env.setter.mock.calls).toEqual([["1"]]);
      expect(env.binding.props("1").checked).toBe(true);
      expect(env.binding.props(1).checked).toBe(false);

      env.binding.props(1).onChange(radioEventOf("1"));
      expect(env.setter.mock.calls).toEqual([["1"], [1]]);
      expect(env.binding.props(1).checked).toBe(true);
    });

    it("update the model", () => {
      const env = setupModelEnv();
      env.binding.props(SampleEnum.BRAVO).onChange(radioEventOf());
      expect(env.model.enumOpt).toBe(SampleEnum.BRAVO);
      expect(env.binding.props(SampleEnum.BRAVO).checked).toBe(true);
    });

    it("mark the field as changed with the final change type", () => {
      vi.useFakeTimers();
      const env = setupModelEnv();
      env.binding.props(SampleEnum.BRAVO).onChange(radioEventOf());
      expect(env.field.isChanged).toBe(true);
      expect(env.field.isIntermediate).toBe(false);
      expect(vi.getTimerCount()).toBe(0); // No auto-finalization is scheduled
      expect(env.field.isTouched).toBe(false);
      expect(env.field.isErrorReported).toBe(false);
    });

    it("report errors immediately", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("enumOpt", "invalid");
      });
      expect(env.field.isErrorReported).toBeUndefined();
      env.binding.props(SampleEnum.BRAVO).onChange(radioEventOf());
      expect(env.field.isErrorReported).toBe(true);
      expect(env.binding.props(SampleEnum.ALPHA)["aria-invalid"]).toBe(true);
      expect(env.binding.props(SampleEnum.ALPHA)["aria-errormessage"]).toBe("invalid");
    });

    it("ignore events from unchecked buttons", () => {
      vi.useFakeTimers();
      const setter = vi.fn();
      const callback = vi.fn();
      const env = setupModelEnv({ setter, onChange: callback });
      env.binding.props(SampleEnum.BRAVO).onChange(radioEventOf(SampleEnum.BRAVO, false));
      expect(setter).not.toBeCalled();
      expect(env.field.isChanged).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
      // PINNED(quirk): the extended onChange callback is skipped as well, not just the setter, although the config documents it as "[Extend] Change handler". Decide: should config.onChange still be called for events from unchecked buttons?
      expect(callback).not.toBeCalled();
    });

    it("call the setter, mark the field as changed, then call the callback", () => {
      const env = setupModelEnv();
      const log: unknown[] = [];
      env.binding.config = {
        ...env.binding.config,
        setter: (v) => {
          log.push(["setter", v, env.field.isChanged]);
        },
        onChange: (e) => {
          log.push(["callback", e.currentTarget.value, env.field.isChanged, env.field.isErrorReported]);
        },
      };
      env.binding.props(SampleEnum.ZULU).onChange(radioEventOf(SampleEnum.ZULU));
      expect(log[0]).toEqual(["setter", SampleEnum.ZULU, false]);
      // PINNED(quirk): the callback runs inside the change handler's action batch, so the delayed error report has not settled yet: isErrorReported is still undefined in the callback and becomes false right after. Decide: should the callback run after the action completes so that it observes the settled field state?
      expect(log[1]).toEqual(["callback", SampleEnum.ZULU, true, undefined]);
      expect(log).toHaveLength(2);
      expect(env.field.isErrorReported).toBe(false);
    });

    it("work when detached from the binding", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ setter });
      const { onChange } = env.binding.props(SampleEnum.ALPHA);
      onChange(radioEventOf());
      expect(setter).toBeCalledWith(SampleEnum.ALPHA);
      expect(env.field.isChanged).toBe(true);
    });

    it("neither mark the field as changed nor call the callback when the setter throws", () => {
      const callback = vi.fn();
      const env = setupModelEnv({
        setter: () => {
          throw new Error("setter failed");
        },
        onChange: callback,
      });
      expect(() => env.binding.props(SampleEnum.ALPHA).onChange(radioEventOf())).toThrow("setter failed");
      expect(env.field.isChanged).toBe(false);
      expect(callback).not.toBeCalled();
    });

    it("use the config at the time of the event", () => {
      const oldSetter = vi.fn();
      const oldCallback = vi.fn();
      const env = setupModelEnv({ setter: oldSetter, onChange: oldCallback });
      const { onChange } = env.binding.props(SampleEnum.ALPHA);
      const setter = vi.fn();
      const callback = vi.fn();
      env.binding.config = { getter: () => null, setter, onChange: callback };
      onChange(radioEventOf());
      expect(oldSetter).not.toBeCalled();
      expect(oldCallback).not.toBeCalled();
      expect(setter).toBeCalledWith(SampleEnum.ALPHA);
      expect(callback).toBeCalledTimes(1);
    });

    it("report the change again after the form is reset", () => {
      const env = setupModelEnv();
      env.binding.props(SampleEnum.BRAVO).onChange(radioEventOf());
      expect(env.binding.props(SampleEnum.BRAVO)).toMatchObject({ checked: true, "aria-invalid": false });

      env.form.reset();
      expect(env.field.isChanged).toBe(false);
      expect(env.binding.props(SampleEnum.BRAVO)).toMatchObject({ checked: true, "aria-invalid": undefined }); // The model is kept

      env.binding.props(SampleEnum.ZULU).onChange(radioEventOf());
      expect(env.field.isChanged).toBe(true);
      expect(env.binding.props(SampleEnum.ZULU)).toMatchObject({ checked: true, "aria-invalid": false });
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
      const env = setupModelEnv({ setter });
      const log: boolean[] = [];
      env.binding.config.onFocus = () => log.push(env.field.isTouched);
      env.binding.onFocus(radioEventOf());
      expect(log).toEqual([true]);
      expect(env.field.isTouched).toBe(true);
      expect(env.field.isChanged).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
      expect(setter).not.toBeCalled();
    });

    it("uses the config at the time of the event", () => {
      const env = setupModelEnv({ onFocus: vi.fn() });
      const oldCallback = env.binding.config.onFocus;
      const { onFocus } = env.binding.props(SampleEnum.ALPHA);
      const callback = vi.fn();
      env.binding.config = { ...env.binding.config, onFocus: callback };
      onFocus(radioEventOf());
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
        builder.invalidate("enum", "invalid1");
        builder.invalidate("enum", "invalid2");
      });
      expect(env.binding.errorMessages).toBeNull();
      env.field.reportError();
      expect(env.binding.errorMessages).toEqual("invalid1, invalid2");
    });

    it("ignores errors of other fields", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("enum", "invalid");
      });
      env.field.reportError();
      expect(env.binding.errorMessages).toBeNull();
      expect(env.binding.props(SampleEnum.ALPHA)["aria-invalid"]).toBe(false);
    });

    it("returns null when the only error message is empty", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("enumOpt", "");
      });
      env.field.reportError();
      expect(env.binding.props(SampleEnum.ALPHA)["aria-invalid"]).toBe(true);
      // PINNED(quirk): an empty message joins to "" and falls back to null, so the buttons are aria-invalid without any aria-errormessage. Decide: should an empty message be rejected by the validator, or rendered as-is?
      expect(env.binding.errorMessages).toBeNull();
      expect(env.binding.props(SampleEnum.ALPHA)["aria-errormessage"]).toBeUndefined();
    });
  });

  describe("types", () => {
    it("exposes a props function typed by the options", () => {
      const env = setupModelEnv();
      expectTypeOf(env.binding.props).parameter(0).toEqualTypeOf<SampleEnum | null>();
      expectTypeOf(env.binding.props).parameter(1).toEqualTypeOf<RadioGroupBinding.ButtonConfig | undefined>();
      expectTypeOf<RadioGroupBinding.ButtonConfig>().toEqualTypeOf<{ id?: string | boolean; name?: string }>();

      const props = env.binding.props(SampleEnum.ALPHA);
      expectTypeOf(props.type).toEqualTypeOf<"radio">();
      expectTypeOf(props.id).toEqualTypeOf<string | undefined>();
      expectTypeOf(props.value).toEqualTypeOf<string>();
      expectTypeOf(props.name).toEqualTypeOf<string>();
      expectTypeOf(props.checked).toEqualTypeOf<boolean>();
      expectTypeOf(props["aria-invalid"]).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(props["aria-errormessage"]).toEqualTypeOf<string | undefined>();
      expectTypeOf(props.onChange).toEqualTypeOf<React.ChangeEventHandler<HTMLInputElement>>();
      expectTypeOf(props.onFocus).toEqualTypeOf<React.FocusEventHandler<HTMLInputElement>>();
      expectTypeOf(props).toExtend<RadioGroupBinding.Attrs>();
      expectTypeOf(env.binding.value).toEqualTypeOf<SampleEnum | null>();
      expectTypeOf(env.binding.errorMessages).toEqualTypeOf<string | null>();
    });

    it("types the config by the options", () => {
      expectTypeOf<RadioGroupBinding.Option>().toEqualTypeOf<string | number | boolean | null>();
      expectTypeOf<RadioGroupBinding.Config<SampleEnum>["getter"]>().toEqualTypeOf<() => SampleEnum>();
      expectTypeOf<RadioGroupBinding.Config<SampleEnum>["setter"]>().toEqualTypeOf<(value: SampleEnum) => void>();
      // Without a type argument, any option
      expectTypeOf<RadioGroupBinding.Config["getter"]>().toEqualTypeOf<() => RadioGroupBinding.Option>();
      expectTypeOf(RadioGroupBinding).constructorParameters.toEqualTypeOf<[FormField, RadioGroupBinding.Config]>();
    });

    it("types the extended handlers", () => {
      expectTypeOf<RadioGroupBinding.Config["onChange"]>().toEqualTypeOf<
        React.ChangeEventHandler<HTMLInputElement> | undefined
      >();
      expectTypeOf<RadioGroupBinding.Config["onFocus"]>().toEqualTypeOf<
        React.FocusEventHandler<HTMLInputElement> | undefined
      >();
    });

    it("infers the options of bindRadioGroup from the getter", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const bindEnum = form.bindRadioGroup("enum", {
        getter: () => model.enum,
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<SampleEnum>();
        },
      });
      expectTypeOf(bindEnum).toEqualTypeOf<RadioGroupBinding<SampleEnum>["props"]>();
      expectTypeOf(bindEnum).parameter(0).toEqualTypeOf<SampleEnum>();

      form.bindRadioGroup("enumOpt", {
        getter: () => model.enumOpt,
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<SampleEnum | null>();
        },
      });
      form.bindRadioGroup("rating", {
        getter: () => model.rating,
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<number>();
        },
      });
      form.bindRadioGroup("agreed", {
        getter: () => model.agreed,
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<boolean | null>();
        },
      });
      // A setter taking more than the getter returns fits
      form.bindRadioGroup("enum", { getter: () => model.enum, setter: (_v: string | null) => {} });
      // An explicit type of the options
      form.bindRadioGroup<SampleEnum | null>("enumOpt", {
        getter: () => model.enumOpt,
        setter: (v) => (model.enumOpt = v),
        cacheKey: "explicit",
      });
    });

    it("widens the options to RadioGroupBinding.Option without the extension", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const bind = form.bind("enum", RadioGroupBinding, {
        getter: () => model.enum,
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<RadioGroupBinding.Option>();
        },
      });
      expectTypeOf(bind).toEqualTypeOf<RadioGroupBinding["props"]>();
    });

    it("rejects invalid usage at compile time", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const bind = form.bindRadioGroup("enum", { getter: () => model.enum, setter: () => {} });
      const invalidUsages = () => {
        // @ts-expect-error the getter must return an option, not undefined
        form.bindRadioGroup("enumOpt", { getter: () => model.enumOpt ?? undefined, setter: () => {} });
        // @ts-expect-error the getter must return an option, not an object
        form.bindRadioGroup("enum", { getter: () => ({}), setter: () => {} });
        // @ts-expect-error the setter must take every option the getter returns
        form.bindRadioGroup("enumOpt", { getter: () => model.enumOpt, setter: (_v: SampleEnum) => {} });
        // @ts-expect-error an explicit type of the options must include what the getter returns
        form.bindRadioGroup<SampleEnum>("enumOpt", { getter: () => model.enumOpt, setter: () => {} });
        // @ts-expect-error unknown field name
        form.bindRadioGroup("unknown", { getter: () => null, setter: () => {} });
        // @ts-expect-error bindRadioGroup requires a config
        form.bindRadioGroup("enum");
        // @ts-expect-error the option must be one the field can hold
        bind("ALPHA");
        // @ts-expect-error null is not an option of a field that cannot be null
        bind(null);
        // @ts-expect-error the option must be one the field can hold
        bind(1);
        // @ts-expect-error the option is required
        bind();
        // @ts-expect-error id must be a string or a boolean
        bind(SampleEnum.ALPHA, { id: 1 });
      };
      expectTypeOf(invalidUsages).toBeFunction();
    });

    it("types renderRadioGroup by the options", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      // Compile-time only: the closure is never invoked
      const typeOnly = () => (
        <>
          {renderRadioGroup({
            binding: form.bindRadioGroup("enum", { getter: () => model.enum, setter: (v) => (model.enum = v) }),
            options: Object.values(SampleEnum),
            renderOption: (option, bind, index) => {
              expectTypeOf(option).toEqualTypeOf<SampleEnum>();
              expectTypeOf(index).toEqualTypeOf<number>();
              expectTypeOf(bind).parameters.toEqualTypeOf<[config?: RadioGroupBinding.ButtonConfig]>();
              expectTypeOf(bind()).toEqualTypeOf<ReturnType<RadioGroupBinding<SampleEnum>["props"]>>();
              return <input {...bind({ id: index === 0 })} />;
            },
          })}
          {renderRadioGroup({
            binding: form.bindRadioGroup("enumOpt", {
              getter: () => model.enumOpt,
              setter: (v) => (model.enumOpt = v),
            }),
            options: [null, ...Object.values(SampleEnum)],
            renderOption: (option, bind) => <input {...bind()} aria-label={option ?? "none"} />,
          })}
          {renderRadioGroup({
            // A subset of the options, and a nullable field without a null option
            binding: form.bindRadioGroup("enumOpt", {
              getter: () => model.enumOpt,
              setter: (v) => (model.enumOpt = v),
            }),
            options: [SampleEnum.ALPHA, SampleEnum.BRAVO],
            renderOption: (option, bind) => {
              expectTypeOf(option).toEqualTypeOf<SampleEnum.ALPHA | SampleEnum.BRAVO>();
              return <input {...bind()} />;
            },
          })}
          {renderRadioGroup({
            binding: form.bindRadioGroup("agreed", { getter: () => model.agreed, setter: (v) => (model.agreed = v) }),
            options: [true, false],
            renderOption: (option, bind) => <input {...bind()} aria-label={option ? "Yes" : "No"} />,
          })}
          {renderRadioGroup({
            // @ts-expect-error the options must be ones the field can hold
            binding: form.bindRadioGroup("enum", { getter: () => model.enum, setter: (v) => (model.enum = v) }),
            options: ["OMEGA"],
            renderOption: (_option, bind) => <input {...bind()} />,
          })}
          {renderRadioGroup({
            // @ts-expect-error null is not an option of a field that cannot be null
            binding: form.bindRadioGroup("enum", { getter: () => model.enum, setter: (v) => (model.enum = v) }),
            options: [null, SampleEnum.ALPHA],
            renderOption: (_option, bind) => <input {...bind()} />,
          })}
          {renderRadioGroup({
            binding: form.bindRadioGroup("enum", { getter: () => model.enum, setter: (v) => (model.enum = v) }),
            options: Object.values(SampleEnum),
            // @ts-expect-error bind takes the overrides of the button, not the option
            renderOption: (option, bind) => <input {...bind(option)} />,
          })}
        </>
      );
      expectTypeOf(typeOnly).toBeFunction();
    });
  });
});

describe("bindRadioGroup", () => {
  test("works with a required field", async () => {
    const env = setupEnv("enum");

    expect(env.model.enum).toBe(SampleEnum.ALPHA);
    expect(env.alpha).toBeChecked();
    expect(env.bravo).not.toBeChecked();
    expect(env.zulu).not.toBeChecked();

    await env.clickBravo();
    expect(env.model.enum).toBe(SampleEnum.BRAVO);
    expect(env.alpha).not.toBeChecked();
    expect(env.bravo).toBeChecked();
    expect(env.zulu).not.toBeChecked();

    await env.clickZulu();
    expect(env.model.enum).toBe(SampleEnum.ZULU);
    expect(env.alpha).not.toBeChecked();
    expect(env.bravo).not.toBeChecked();
    expect(env.zulu).toBeChecked();
  });

  test("works with an optional field", async () => {
    const env = setupEnv("enumOpt");

    expect(env.model.enumOpt).toBe(null);
    expect(env.alpha).not.toBeChecked();
    expect(env.bravo).not.toBeChecked();
    expect(env.zulu).not.toBeChecked();

    await env.clickBravo();
    expect(env.model.enumOpt).toBe(SampleEnum.BRAVO);
    expect(env.alpha).not.toBeChecked();
    expect(env.bravo).toBeChecked();
    expect(env.zulu).not.toBeChecked();

    // NOTE: No means to uncheck a radio button
  });

  test("groups the buttons by the field id without element ids", () => {
    const env = setupEnv("enum");
    const form = Form.get(env.model);
    const enumOptAlpha = screen.getByLabelText(`enumOpt-${SampleEnum.ALPHA}`);

    for (const input of [env.alpha, env.bravo, env.zulu]) {
      expect(input).toHaveAttribute("type", "radio");
      expect(input).toHaveAttribute("name", form.getField("enum").id);
      expect(input).not.toHaveAttribute("id");
    }
    expect(env.alpha).toHaveAttribute("value", SampleEnum.ALPHA);
    expect(enumOptAlpha).toHaveAttribute("name", form.getField("enumOpt").id);
    expect(form.getField("enum").id).not.toBe(form.getField("enumOpt").id);
  });

  test("reflects model changes made outside of the UI", () => {
    const env = setupEnv("enum");

    act(() => runInAction(() => (env.model.enum = SampleEnum.ZULU)));
    expect(env.alpha).not.toBeChecked();
    expect(env.zulu).toBeChecked();
  });

  test("reflects a getter that closes over a changed React prop", () => {
    const model = new SampleModel();
    const Component = observer(({ selected }: { selected: SampleEnum }) => {
      const form = Form.get(model);
      const bindRadioGroup = form.bindRadioGroup("enum", { getter: () => selected, setter: () => {} });
      return (
        <>
          {Object.values(SampleEnum).map((value) => (
            <input key={value} aria-label={`prop-${value}`} {...bindRadioGroup(value)} />
          ))}
        </>
      );
    });
    const { rerender } = render(<Component selected={SampleEnum.ALPHA} />);
    expect(screen.getByLabelText(`prop-${SampleEnum.ALPHA}`)).toBeChecked();

    rerender(<Component selected={SampleEnum.BRAVO} />);
    expect(screen.getByLabelText(`prop-${SampleEnum.ALPHA}`)).not.toBeChecked();
    expect(screen.getByLabelText(`prop-${SampleEnum.BRAVO}`)).toBeChecked();
  });

  test("marks only the clicked field as touched and changed", async () => {
    const env = setupEnv("enum");
    const form = Form.get(env.model);

    await env.clickBravo();
    expect(form.getField("enum").isTouched).toBe(true);
    expect(form.getField("enum").isChanged).toBe(true);
    expect(form.getField("enumOpt").isTouched).toBe(false);
    expect(form.getField("enumOpt").isChanged).toBe(false);
  });

  test("does not report a change when clicking the already checked button", async () => {
    const env = setupEnv("enum");
    const form = Form.get(env.model);

    await env.clickAlpha();
    expect(env.model.enum).toBe(SampleEnum.ALPHA);
    expect(env.alpha).toBeChecked();
    expect(form.getField("enum").isTouched).toBe(true);
    expect(form.getField("enum").isChanged).toBe(false);
    expect(env.alpha).not.toHaveAttribute("aria-invalid");
  });

  test("sets the aria attributes on every button once the change is reported", async () => {
    const env = setupEnv("enum");
    const form = Form.get(env.model);

    act(() => {
      form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("enum", "invalid");
      });
    });
    for (const input of [env.alpha, env.bravo, env.zulu]) {
      expect(input).not.toHaveAttribute("aria-invalid");
      expect(input).not.toHaveAttribute("aria-errormessage");
    }

    await env.clickBravo();
    for (const input of [env.alpha, env.bravo, env.zulu]) {
      expect(input).toHaveAttribute("aria-invalid", "true");
      // PINNED(quirk): aria-errormessage carries the message text itself, while WAI-ARIA defines it as an ID reference to the element that contains the message (the form docs say "with error text"; the react docs say "linking to error text"). Decide: should the binding reference an error element id instead of embedding the text?
      expect(input).toHaveAttribute("aria-errormessage", "invalid");
    }

    act(() => form.reset());
    for (const input of [env.alpha, env.bravo, env.zulu]) {
      expect(input).not.toHaveAttribute("aria-invalid");
      expect(input).not.toHaveAttribute("aria-errormessage");
    }
  });

  test("returns the same props function across bind calls", () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const config = { getter: () => model.enum, setter: () => {} };

    const bind1 = form.bindRadioGroup("enum", config);
    const bind2 = form.bindRadioGroup("enum", { ...config });
    expect(bind2).toBe(bind1);
    expect(form.bind("enum", RadioGroupBinding, config)).toBe(bind1);
    expect(form.bindRadioGroup("enum", { ...config, cacheKey: "another" })).not.toBe(bind1);
  });

  test("checks a null button while the model is null", async () => {
    const model = new SampleModel();
    const Component = observer(() => {
      const form = Form.get(model);
      const bind = form.bindRadioGroup("enumOpt", {
        getter: () => model.enumOpt,
        setter: (v) => (model.enumOpt = v),
      });
      return (
        <>
          <input aria-label="none" {...bind(null)} />
          {Object.values(SampleEnum).map((value) => (
            <input key={value} aria-label={value} {...bind(value)} />
          ))}
        </>
      );
    });
    render(<Component />);
    const none = screen.getByLabelText("none");
    const bravo = screen.getByLabelText(SampleEnum.BRAVO);

    expect(model.enumOpt).toBeNull();
    expect(none).toHaveAttribute("value", "");
    expect(none).toBeChecked();

    await userEvent.click(bravo);
    expect(model.enumOpt).toBe(SampleEnum.BRAVO);
    expect(bravo).toBeChecked();
    expect(none).not.toBeChecked();

    await userEvent.click(none);
    expect(model.enumOpt).toBeNull();
    expect(bravo).not.toBeChecked();
    expect(none).toBeChecked();
  });

  test("works with number and boolean options", async () => {
    const model = new SampleModel();
    const Component = observer(() => {
      const form = Form.get(model);
      const bindRating = form.bindRadioGroup("rating", {
        getter: () => model.rating,
        setter: (v) => (model.rating = v),
      });
      const bindAgreed = form.bindRadioGroup("agreed", {
        getter: () => model.agreed,
        setter: (v) => (model.agreed = v),
      });
      return (
        <>
          {[1, 2, 3, 4, 5].map((rating) => (
            <input key={rating} aria-label={`rating-${rating}`} {...bindRating(rating)} />
          ))}
          <input aria-label="Yes" {...bindAgreed(true)} />
          <input aria-label="No" {...bindAgreed(false)} />
        </>
      );
    });
    render(<Component />);

    expect(screen.getByLabelText("rating-3")).toBeChecked();
    expect(screen.getByLabelText("rating-3")).toHaveAttribute("value", "3");
    await userEvent.click(screen.getByLabelText("rating-5"));
    expect(model.rating).toBe(5);
    expect(screen.getByLabelText("rating-5")).toBeChecked();
    expect(screen.getByLabelText("rating-3")).not.toBeChecked();

    expect(screen.getByLabelText("Yes")).not.toBeChecked();
    expect(screen.getByLabelText("No")).not.toBeChecked();
    await userEvent.click(screen.getByLabelText("No"));
    expect(model.agreed).toBe(false);
    expect(screen.getByLabelText("No")).toBeChecked();
    await userEvent.click(screen.getByLabelText("Yes"));
    expect(model.agreed).toBe(true);
    expect(screen.getByLabelText("Yes")).toBeChecked();
    expect(screen.getByLabelText("No")).not.toBeChecked();
  });

  test("keeps the previous button checked when the setter ignores the value", async () => {
    const model = new SampleModel();
    const setter = vi.fn();
    const Component = observer(() => {
      const form = Form.get(model);
      const bind = form.bindRadioGroup("enum", { getter: () => model.enum, setter });
      return (
        <>
          {Object.values(SampleEnum).map((value) => (
            <input key={value} aria-label={value} {...bind(value)} />
          ))}
        </>
      );
    });
    render(<Component />);
    const alpha = screen.getByLabelText(SampleEnum.ALPHA);
    const bravo = screen.getByLabelText(SampleEnum.BRAVO);

    await userEvent.click(bravo);
    expect(setter).toBeCalledWith(SampleEnum.BRAVO);
    expect(model.enum).toBe(SampleEnum.ALPHA);
    expect(alpha).toBeChecked(); // Controlled by the getter
    expect(bravo).not.toBeChecked();
    expect(Form.get(model).getField("enum").isChanged).toBe(true);
  });

  test("checks no button while the model holds a value that is not among the buttons", () => {
    const env = setupEnv("enum");

    act(() => runInAction(() => (env.model.enum = "UNKNOWN" as SampleEnum)));
    expect(env.alpha).not.toBeChecked();
    expect(env.bravo).not.toBeChecked();
    expect(env.zulu).not.toBeChecked();

    act(() => runInAction(() => (env.model.enum = SampleEnum.BRAVO)));
    expect(env.bravo).toBeChecked();
  });

  test("selects the button bound with id: true through a label bound to the same field", async () => {
    const model = new SampleModel();
    const Component = observer(() => {
      const form = Form.get(model);
      const bind = form.bindRadioGroup("enum", {
        getter: () => model.enum,
        setter: (v) => (model.enum = v),
      });
      return (
        <>
          <label {...form.bindLabel(["enum"])}>Enum</label>
          {Object.values(SampleEnum).map((value) => (
            <input key={value} aria-label={value} {...bind(value, { id: value === SampleEnum.BRAVO })} />
          ))}
        </>
      );
    });
    render(<Component />);
    const form = Form.get(model);
    const bravo = screen.getByLabelText(SampleEnum.BRAVO);

    expect(bravo).toHaveAttribute("id", form.getField("enum").id);
    expect(screen.getByLabelText(SampleEnum.ALPHA)).not.toHaveAttribute("id");
    expect(screen.getByLabelText("Enum")).toBe(bravo);

    await userEvent.click(screen.getByText("Enum"));
    expect(model.enum).toBe(SampleEnum.BRAVO);
    expect(bravo).toBeChecked();
    expect(form.getField("enum").isChanged).toBe(true);
  });

  describe("with reactive validation", () => {
    const delayMs = 50;

    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const setupValidatedEnv = () => {
      const model = new SampleModel();
      const form = Form.get(model);
      form.validator.addSyncHandler(
        (builder) => {
          if (model.enum !== SampleEnum.ALPHA) builder.invalidate("enum", "must be alpha");
        },
        { delayMs }
      );
      render(<SampleComponent model={model} />);
      act(() => {
        vi.advanceTimersByTime(delayMs); // Initial validation
      });
      const buttons = Object.values(SampleEnum).map((value) => screen.getByLabelText(`enum-${value}`));
      return { model, form, buttons };
    };

    test("waits for the pending validation before setting the aria attributes on every button", () => {
      const env = setupValidatedEnv();
      const [alpha, bravo] = env.buttons;

      fireEvent.click(bravo);
      expect(env.model.enum).toBe(SampleEnum.BRAVO);
      expect(env.form.validator.isValidating).toBe(true);
      for (const button of env.buttons) {
        expect(button).not.toHaveAttribute("aria-invalid");
      }

      act(() => {
        vi.advanceTimersByTime(delayMs);
      });
      for (const button of env.buttons) {
        expect(button).toHaveAttribute("aria-invalid", "true");
        expect(button).toHaveAttribute("aria-errormessage", "must be alpha");
      }

      act(() => env.form.reset());
      expect(bravo).toBeChecked(); // The model is kept
      for (const button of env.buttons) {
        expect(button).not.toHaveAttribute("aria-invalid");
      }

      fireEvent.click(alpha);
      expect(alpha).toBeChecked();
      for (const button of env.buttons) {
        expect(button).not.toHaveAttribute("aria-invalid"); // Validation is pending
      }

      act(() => {
        vi.advanceTimersByTime(delayMs);
      });
      for (const button of env.buttons) {
        expect(button).toHaveAttribute("aria-invalid", "false");
        expect(button).not.toHaveAttribute("aria-errormessage");
      }
    });
  });
});

describe("renderRadioGroup", () => {
  /** A radio group rendered with renderRadioGroup, over the options given as a prop */
  const GroupComponent: React.FC<{
    model: SampleModel;
    options: readonly (SampleEnum | null)[];
    renderOption?: Parameters<typeof renderRadioGroup<SampleEnum | null>>[0]["renderOption"];
  }> = observer(({ model, options, renderOption }) => {
    const form = Form.get(model);
    return (
      <div>
        {renderRadioGroup({
          binding: form.bindRadioGroup("enumOpt", {
            getter: () => model.enumOpt,
            setter: (v) => (model.enumOpt = v),
          }),
          options,
          renderOption:
            renderOption ??
            ((option, bind) => (
              <label>
                <input {...bind()} /> {option ?? "None"}
              </label>
            )),
        })}
      </div>
    );
  });

  const spyOnConsoleError = () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    onTestFinished(() => {
      consoleError.mockRestore();
    });
    return consoleError;
  };

  test("renders a radio button for each option, in order", async () => {
    const model = new SampleModel();
    render(<GroupComponent model={model} options={[null, ...Object.values(SampleEnum)]} />);

    const buttons = screen.getAllByRole("radio");
    expect(buttons.map((button) => button.getAttribute("value"))).toEqual(["", "ALPHA", "BRAVO", "ZULU"]);
    expect(buttons.map((button) => (button as HTMLInputElement).checked)).toEqual([true, false, false, false]);
    const form = Form.get(model);
    for (const button of buttons) {
      expect(button).toHaveAttribute("name", form.getField("enumOpt").id);
    }

    await userEvent.click(screen.getByLabelText("BRAVO"));
    expect(model.enumOpt).toBe(SampleEnum.BRAVO);
    expect(screen.getByLabelText("BRAVO")).toBeChecked();
    expect(screen.getByLabelText("None")).not.toBeChecked();

    act(() => runInAction(() => (model.enumOpt = null)));
    expect(screen.getByLabelText("None")).toBeChecked();
    expect(screen.getByLabelText("BRAVO")).not.toBeChecked();
  });

  test("passes each option, a function that binds its button, and its index to renderOption", () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const renderOption = vi.fn((_option: SampleEnum | null, _bind: unknown, _index: number) => null);
    render(<GroupComponent model={model} options={Object.values(SampleEnum)} renderOption={renderOption} />);

    expect(renderOption.mock.calls.map(([option, , index]) => [option, index])).toEqual([
      [SampleEnum.ALPHA, 0],
      [SampleEnum.BRAVO, 1],
      [SampleEnum.ZULU, 2],
    ]);

    const binding = form.bindRadioGroup("enumOpt", {
      getter: () => model.enumOpt,
      setter: (v) => (model.enumOpt = v),
    });
    const bindBravo = renderOption.mock.calls[1][1] as (
      config?: RadioGroupBinding.ButtonConfig
    ) => ReturnType<RadioGroupBinding<SampleEnum | null>["props"]>;
    expect(bindBravo()).toStrictEqual(binding(SampleEnum.BRAVO));
    expect(bindBravo({ id: true, name: "group" })).toStrictEqual(
      binding(SampleEnum.BRAVO, { id: true, name: "group" })
    );
    expect(bindBravo({ id: true }).id).toBe(form.getField("enumOpt").id);
  });

  test("keys each option by its value, so renderOption needs no key", () => {
    const consoleError = spyOnConsoleError();
    const model = new SampleModel();

    // The same elements without renderRadioGroup: React warns about the missing keys
    const Unkeyed: React.FC<{ model: SampleModel }> = observer(({ model }) => {
      const bind = Form.get(model).bindRadioGroup("enumOpt", {
        getter: () => model.enumOpt,
        setter: (v) => (model.enumOpt = v),
      });
      return (
        <div>
          {[null, ...Object.values(SampleEnum)].map((option) => (
            // biome-ignore lint/correctness/useJsxKeyInIterable: the missing key is what this control renders
            <input {...bind(option)} />
          ))}
        </div>
      );
    });
    const unkeyed = render(<Unkeyed model={model} />);
    expect(consoleError.mock.calls.some((args) => String(args[0]).includes('unique "key"'))).toBe(true);
    unkeyed.unmount();
    consoleError.mockClear();

    const { rerender } = render(<GroupComponent model={model} options={[null, ...Object.values(SampleEnum)]} />);
    expect(consoleError).not.toHaveBeenCalled();

    // Reordered options keep their elements
    const none = screen.getByLabelText("None");
    const bravo = screen.getByLabelText("BRAVO");
    rerender(<GroupComponent model={model} options={[...Object.values(SampleEnum).reverse(), null]} />);
    expect(screen.getByLabelText("None")).toBe(none);
    expect(screen.getByLabelText("BRAVO")).toBe(bravo);
    expect(screen.getAllByRole("radio").map((button) => button.getAttribute("value"))).toEqual([
      "ZULU",
      "BRAVO",
      "ALPHA",
      "",
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  test("keeps options that share a string form apart", async () => {
    const consoleError = spyOnConsoleError();
    const model = new SampleModel();
    const Component = observer(() => {
      const form = Form.get(model);
      return (
        <div>
          {renderRadioGroup({
            binding: form.bindRadioGroup("code", { getter: () => model.code, setter: (v) => (model.code = v) }),
            options: [1, "1"],
            renderOption: (option, bind) => <input {...bind()} aria-label={typeof option} />,
          })}
        </div>
      );
    });
    render(<Component />);
    expect(consoleError).not.toHaveBeenCalled();

    const [asNumber, asString] = [screen.getByLabelText("number"), screen.getByLabelText("string")];
    expect(asNumber).toHaveAttribute("value", "1");
    expect(asString).toHaveAttribute("value", "1");
    expect(asNumber).toBeChecked();

    await userEvent.click(asString);
    expect(model.code).toBe("1");
    expect(asString).toBeChecked();
    expect(asNumber).not.toBeChecked();
  });
});
