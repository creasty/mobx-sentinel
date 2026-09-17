import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { autorun, isAction, isComputedProp, makeObservable, observable, runInAction } from "mobx";
import { Form, FormField } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { RadioButtonBinding } from "./RadioButtonBinding";

enum SampleEnum {
  ALPHA = "ALPHA",
  BRAVO = "BRAVO",
  ZULU = "ZULU",
}

class SampleModel {
  @observable enum: SampleEnum = SampleEnum.ALPHA;
  @observable enumOpt: SampleEnum | null = null;

  constructor() {
    makeObservable(this);
  }
}

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = Form.get(model);

  const bindRadioButton1 = form.bindRadioButton("enum", {
    getter: () => model.enum,
    setter: (v) => (model.enum = v ? (v as SampleEnum) : SampleEnum.ZULU),
  });
  const bindRadioButton2 = form.bindRadioButton("enumOpt", {
    getter: () => model.enumOpt,
    setter: (v) => (model.enumOpt = v ? (v as SampleEnum) : null),
  });

  return (
    <>
      {Object.values(SampleEnum).map((value) => (
        <input key={value} aria-label={`enum-${value}`} {...bindRadioButton1(value)} />
      ))}

      {Object.values(SampleEnum).map((value) => (
        <input key={value} aria-label={`enumOpt-${value}`} {...bindRadioButton2(value)} />
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

describe("RadioButtonBinding", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = new FormField({
      fieldName: "enum",
      validator: form.validator,
      getFinalizationDelayMs: () => form.config.autoFinalizationDelayMs,
    });
    const binding = new RadioButtonBinding(field, {
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
  const setupModelEnv = (config?: Partial<RadioButtonBinding.Config>) => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = form.getField("enumOpt");
    const binding = new RadioButtonBinding(field, {
      getter: () => model.enumOpt,
      setter: (v) => (model.enumOpt = v ? (v as SampleEnum) : null),
      ...config,
    });
    const element = document.createElement("input");
    element.type = "radio";
    const fakeEvent = (value: string, checked = true) => {
      element.value = value;
      element.checked = checked;
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
      expect(env.binding.props(SampleEnum.ALPHA)).toStrictEqual({
        type: "radio",
        id: undefined,
        value: SampleEnum.ALPHA,
        name: env.field.id,
        checked: false,
        onChange: env.binding.onChange,
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

    it("exposes value and errorMessages as computed values", () => {
      const env = setupModelEnv();
      expect(isComputedProp(env.binding, "value")).toBe(true);
      expect(isComputedProp(env.binding, "errorMessages")).toBe(true);
    });

    it("checks only the button whose value strictly equals the getter value", () => {
      const env = setupModelEnv();
      runInAction(() => (env.model.enumOpt = SampleEnum.BRAVO));
      expect(env.binding.props(SampleEnum.ALPHA).checked).toBe(false);
      expect(env.binding.props(SampleEnum.BRAVO).checked).toBe(true);
      expect(env.binding.props(SampleEnum.ZULU).checked).toBe(false);
      expect(env.binding.props("bravo").checked).toBe(false);
      expect(env.binding.props(" BRAVO").checked).toBe(false);
      expect(env.binding.props(null).checked).toBe(false);
      expect(env.binding.props("").checked).toBe(false);
    });

    it("renders a null value as an empty string", () => {
      const env = setupModelEnv();
      expect(env.binding.props(null).value).toBe("");
    });

    it("does not check the null button when the getter returns null", () => {
      const env = setupModelEnv();
      expect(env.model.enumOpt).toBeNull();
      // PINNED(bug): `checked` compares the coerced value ("") with the raw argument (null), so a null button is never checked even though the getter returns null; the props signature accepts `value: string | null` and the class JSDoc says "Supports optional (nullable) values". Expected: props(null).checked is true when the getter returns null. Flip this assertion when fixing.
      expect(env.binding.props(null).checked).toBe(false);
    });

    it("checks the empty-string button when the getter returns null", () => {
      const env = setupModelEnv();
      // PINNED(quirk): null from the getter is coerced to "", so a button whose value is "" is checked while the model holds null (null and "" are indistinguishable). Decide: should a null getter value only match a null button?
      expect(env.binding.props("").checked).toBe(true);
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

    it("returns an empty string when the getter returns null", () => {
      const env = setupModelEnv();
      expect(env.binding.value).toBe("");
    });

    it("is tracked through the getter", () => {
      const env = setupModelEnv();
      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.value);
      });
      runInAction(() => (env.model.enum = SampleEnum.ZULU)); // Unrelated property
      expect(seen).toEqual([""]);
      runInAction(() => (env.model.enumOpt = SampleEnum.BRAVO));
      expect(seen).toEqual(["", SampleEnum.BRAVO]);
      dispose();
    });

    it("keeps the cached value when the config is replaced while observed", () => {
      const env = setupModelEnv();
      const other = observable.box("other");
      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.value);
      });
      env.binding.config = { getter: () => other.get(), setter: () => {} };
      // PINNED(quirk): `config` is not observable, so replacing it (as Form#bind does on every call) does not invalidate the observed computed and the old getter's cached value ("") is returned until a dependency of the old getter changes; the form docs only say "Configuration can be updated on subsequent calls while maintaining the same binding instance" (same root cause as the config quirks in binding.test.ts and InputBinding.test.tsx). Decide: should `config` be observable (e.g. observable.ref) so that the new getter takes effect immediately (flip to "other")?
      expect(env.binding.value).toBe("");
      expect(seen).toEqual([""]);
      dispose();
      expect(env.binding.value).toBe("other");
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

    it("passes the value of the checked button to the setter", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ setter });
      env.binding.onChange(env.fakeEvent(SampleEnum.BRAVO));
      expect(setter.mock.calls).toEqual([[SampleEnum.BRAVO]]);
    });

    it("passes an empty string when the null button is checked", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ setter });
      const props = env.binding.props(null);
      env.binding.onChange(env.fakeEvent(props.value));
      expect(setter.mock.calls).toEqual([[""]]);
    });

    it("updates the model", () => {
      const env = setupModelEnv();
      env.binding.onChange(env.fakeEvent(SampleEnum.BRAVO));
      expect(env.model.enumOpt).toBe(SampleEnum.BRAVO);
      expect(env.binding.props(SampleEnum.BRAVO).checked).toBe(true);
    });

    it("marks the field as changed with the final change type", () => {
      vi.useFakeTimers();
      const env = setupModelEnv();
      env.binding.onChange(env.fakeEvent(SampleEnum.BRAVO));
      expect(env.field.isChanged).toBe(true);
      expect(env.field.isIntermediate).toBe(false);
      expect(vi.getTimerCount()).toBe(0); // No auto-finalization is scheduled
      expect(env.field.isTouched).toBe(false);
      expect(env.field.isErrorReported).toBe(false);
    });

    it("reports errors immediately", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("enumOpt", "invalid");
      });
      expect(env.field.isErrorReported).toBeUndefined();
      env.binding.onChange(env.fakeEvent(SampleEnum.BRAVO));
      expect(env.field.isErrorReported).toBe(true);
      expect(env.binding.props(SampleEnum.ALPHA)["aria-invalid"]).toBe(true);
      expect(env.binding.props(SampleEnum.ALPHA)["aria-errormessage"]).toBe("invalid");
    });

    it("ignores events from unchecked buttons", () => {
      vi.useFakeTimers();
      const setter = vi.fn();
      const callback = vi.fn();
      const env = setupModelEnv({ setter, onChange: callback });
      env.binding.onChange(env.fakeEvent(SampleEnum.BRAVO, false));
      expect(setter).not.toBeCalled();
      expect(env.field.isChanged).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
      // PINNED(quirk): the extended onChange callback is skipped as well, not just the setter, although the config documents it as "[Extend] Change handler". Decide: should config.onChange still be called for events from unchecked buttons?
      expect(callback).not.toBeCalled();
    });

    it("calls the setter, marks the field as changed, then calls the callback", () => {
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
      env.binding.onChange(env.fakeEvent(SampleEnum.ZULU));
      expect(log[0]).toEqual(["setter", SampleEnum.ZULU, false]);
      // PINNED(quirk): the callback runs inside the onChange action batch, so the delayed error report has not settled yet: isErrorReported is still undefined in the callback and becomes false right after. Decide: should the callback run after the action completes so that it observes the settled field state?
      expect(log[1]).toEqual(["callback", SampleEnum.ZULU, true, undefined]);
      expect(log).toHaveLength(2);
      expect(env.field.isErrorReported).toBe(false);
    });

    it("works when detached from the binding", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ setter });
      const { onChange } = env.binding.props(SampleEnum.ALPHA);
      onChange(env.fakeEvent(SampleEnum.ALPHA));
      expect(setter).toBeCalledWith(SampleEnum.ALPHA);
      expect(env.field.isChanged).toBe(true);
    });

    it("neither marks the field as changed nor calls the callback when the setter throws", () => {
      const callback = vi.fn();
      const env = setupModelEnv({
        setter: () => {
          throw new Error("setter failed");
        },
        onChange: callback,
      });
      expect(() => env.binding.onChange(env.fakeEvent(SampleEnum.ALPHA))).toThrow("setter failed");
      expect(env.field.isChanged).toBe(false);
      expect(callback).not.toBeCalled();
    });

    it("uses the config at the time of the event", () => {
      const oldSetter = vi.fn();
      const oldCallback = vi.fn();
      const env = setupModelEnv({ setter: oldSetter, onChange: oldCallback });
      const { onChange } = env.binding.props(SampleEnum.ALPHA);
      const setter = vi.fn();
      const callback = vi.fn();
      env.binding.config = { getter: () => null, setter, onChange: callback };
      onChange(env.fakeEvent(SampleEnum.ZULU));
      expect(oldSetter).not.toBeCalled();
      expect(oldCallback).not.toBeCalled();
      expect(setter).toBeCalledWith(SampleEnum.ZULU);
      expect(callback).toBeCalledTimes(1);
    });

    it("reports the change again after the form is reset", () => {
      const env = setupModelEnv();
      env.binding.onChange(env.fakeEvent(SampleEnum.BRAVO));
      expect(env.binding.props(SampleEnum.BRAVO)).toMatchObject({ checked: true, "aria-invalid": false });

      env.form.reset();
      expect(env.field.isChanged).toBe(false);
      expect(env.binding.props(SampleEnum.BRAVO)).toMatchObject({ checked: true, "aria-invalid": undefined }); // The model is kept

      env.binding.onChange(env.fakeEvent(SampleEnum.ZULU));
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
      env.binding.onFocus(env.fakeEvent(SampleEnum.ALPHA));
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
      onFocus(env.fakeEvent(SampleEnum.ALPHA));
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
    it("exposes a typed props function", () => {
      const env = setupModelEnv();
      expectTypeOf(env.binding.props).parameter(0).toEqualTypeOf<string | null>();
      expectTypeOf(env.binding.props)
        .parameter(1)
        .toEqualTypeOf<{ id?: string | boolean; name?: string } | undefined>();

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
      expectTypeOf(props).toExtend<RadioButtonBinding.Attrs>();
      expectTypeOf(env.binding.errorMessages).toEqualTypeOf<string | null>();
    });

    it("types the config", () => {
      expectTypeOf<RadioButtonBinding.Config["getter"]>().toEqualTypeOf<() => string | null>();
      expectTypeOf<RadioButtonBinding.Config["setter"]>().toEqualTypeOf<(value: string) => void>();
    });

    it("types the extended handlers", () => {
      expectTypeOf<RadioButtonBinding.Config["onChange"]>().toEqualTypeOf<
        React.ChangeEventHandler<HTMLInputElement> | undefined
      >();
      expectTypeOf<RadioButtonBinding.Config["onFocus"]>().toEqualTypeOf<
        React.FocusEventHandler<HTMLInputElement> | undefined
      >();
    });

    it("accepts a nullable getter but rejects undefined at compile time", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expectTypeOf(form.bindRadioButton).toBeCallableWith("enumOpt", {
        getter: () => model.enumOpt,
        setter: () => {},
      });
      const invalidUsages = () => {
        // @ts-expect-error getter must return a string or null, not undefined
        form.bindRadioButton("enumOpt", { getter: () => model.enumOpt ?? undefined, setter: () => {} });
      };
      expectTypeOf(invalidUsages).toBeFunction();
    });

    it("returns the props function from bindRadioButton", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const bind = form.bindRadioButton("enum", {
        getter: () => model.enum,
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<string>();
        },
      });
      expectTypeOf(bind).toEqualTypeOf<RadioButtonBinding["props"]>();
    });

    it("rejects invalid usage at compile time", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const bind = form.bindRadioButton("enum", { getter: () => model.enum, setter: () => {} });
      const invalidUsages = () => {
        // @ts-expect-error getter must return a string or null
        form.bindRadioButton("enum", { getter: () => 1, setter: () => {} });
        // @ts-expect-error setter receives a plain string, not the enum
        form.bindRadioButton("enum", { getter: () => model.enum, setter: (_v: SampleEnum) => {} });
        // @ts-expect-error unknown field name
        form.bindRadioButton("unknown", { getter: () => null, setter: () => {} });
        // @ts-expect-error value must be a string or null
        bind(1);
        // @ts-expect-error value is required
        bind();
        // @ts-expect-error id must be a string or a boolean
        bind("ALPHA", { id: 1 });
      };
      expectTypeOf(invalidUsages).toBeFunction();
    });
  });
});

describe("bindRadioButton", () => {
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

    const bind1 = form.bindRadioButton("enum", config);
    const bind2 = form.bindRadioButton("enum", { ...config });
    expect(bind2).toBe(bind1);
    expect(form.bindRadioButton("enum", { ...config, cacheKey: "another" })).not.toBe(bind1);
  });

  test("does not check a null button while the model is null", async () => {
    const model = new SampleModel();
    const Component = observer(() => {
      const form = Form.get(model);
      const bind = form.bindRadioButton("enumOpt", {
        getter: () => model.enumOpt,
        setter: (v) => (model.enumOpt = v ? (v as SampleEnum) : null),
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
    // PINNED(bug): the null button stays unchecked while the model is null (see "does not check the null button when the getter returns null"). Expected: checked. Flip this assertion when fixing.
    expect(none).not.toBeChecked();

    await userEvent.click(bravo);
    expect(model.enumOpt).toBe(SampleEnum.BRAVO);
    expect(bravo).toBeChecked();

    await userEvent.click(none);
    expect(model.enumOpt).toBeNull();
    expect(bravo).not.toBeChecked();
    // PINNED(bug): selecting the null button sets the model to null, but the button is rendered unchecked again. Expected: checked. Flip this assertion when fixing.
    expect(none).not.toBeChecked();
  });

  test("keeps the previous button checked when the setter ignores the value", async () => {
    const model = new SampleModel();
    const setter = vi.fn();
    const Component = observer(() => {
      const form = Form.get(model);
      const bind = form.bindRadioButton("enum", { getter: () => model.enum, setter });
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
      const bind = form.bindRadioButton("enum", {
        getter: () => model.enum,
        setter: (v) => (model.enum = v as SampleEnum),
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
