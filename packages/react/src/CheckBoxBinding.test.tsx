import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { autorun, isAction, isComputedProp, makeObservable, observable, runInAction } from "mobx";
import { Form, FormField } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { CheckBoxBinding } from "./CheckBoxBinding";

class SampleModel {
  @observable boolean: boolean = false;
  @observable booleanOpt: boolean | null = null;

  constructor() {
    makeObservable(this);
  }
}

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <>
      <input
        aria-label="boolean"
        {...form.bindCheckBox("boolean", {
          getter: () => model.boolean,
          setter: (v) => (model.boolean = v),
        })}
      />
      <input
        aria-label="booleanOpt"
        {...form.bindCheckBox("booleanOpt", {
          getter: () => model.booleanOpt ?? false,
          setter: (v) => (model.booleanOpt = v),
        })}
      />
    </>
  );
});

describe("CheckBoxBinding", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = new FormField({
      fieldName: "boolean",
      validator: form.validator,
      getFinalizationDelayMs: () => form.config.autoFinalizationDelayMs,
    });
    const binding = new CheckBoxBinding(field, {
      getter: () => false,
      setter: () => {},
    });
    const element = document.createElement("input");
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
  const setupModelEnv = (config?: Partial<CheckBoxBinding.Config>) => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = form.getField("boolean");
    const binding = new CheckBoxBinding(field, {
      getter: () => model.boolean,
      setter: (v) => (model.boolean = v),
      ...config,
    });
    const element = document.createElement("input");
    element.type = "checkbox";
    const fakeEvent = (checked: boolean) => {
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
      const env = setupModelEnv({ id: "" });
      // PINNED(quirk): an empty-string id is passed through (`??` only falls back on null/undefined), producing an empty id attribute, whereas RadioGroupBinding treats `id: ""` as no id. Decide: should an empty id fall back to the field id?
      expect(env.binding.props.id).toBe("");
    });
  });

  describe("props", () => {
    it("returns the full set of attributes", () => {
      const env = setupModelEnv();
      expect(env.binding.props).toStrictEqual({
        type: "checkbox",
        id: env.field.id,
        checked: false,
        onChange: env.binding.onChange,
        onFocus: env.binding.onFocus,
        "aria-invalid": undefined,
        "aria-errormessage": undefined,
      });
    });

    it("returns a fresh object with stable handlers on every read", () => {
      const env = setupModelEnv();
      const props1 = env.binding.props;
      const props2 = env.binding.props;
      expect(props1).not.toBe(props2);
      expect(props1.onChange).toBe(props2.onChange);
      expect(props1.onFocus).toBe(props2.onFocus);
    });

    it("exposes errorMessages as a computed value while checked and props are plain getters", () => {
      const env = setupModelEnv();
      expect(isComputedProp(env.binding, "checked")).toBe(false);
      expect(isComputedProp(env.binding, "errorMessages")).toBe(true);
      expect(isComputedProp(env.binding, "props")).toBe(false);
    });

    it("reflects the getter in checked", () => {
      const env = setupModelEnv();
      expect(env.binding.props.checked).toBe(false);
      runInAction(() => (env.model.boolean = true));
      expect(env.binding.props.checked).toBe(true);
      runInAction(() => (env.model.boolean = false));
      expect(env.binding.props.checked).toBe(false);
    });

    it("transitions aria-invalid from undefined to false to true", () => {
      const env = setupModelEnv();
      expect(env.binding.props["aria-invalid"]).toBeUndefined();
      env.field.reportError();
      expect(env.binding.props["aria-invalid"]).toBe(false);
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("boolean", "invalid");
      });
      expect(env.binding.props["aria-invalid"]).toBe(true);
      expect(env.binding.props["aria-errormessage"]).toBe("invalid");
    });
  });

  describe("#checked", () => {
    it("is tracked through the getter", () => {
      const env = setupModelEnv();
      const seen: boolean[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.checked);
      });
      runInAction(() => (env.model.booleanOpt = true)); // Unrelated property
      expect(seen).toEqual([false]);
      runInAction(() => (env.model.boolean = true));
      expect(seen).toEqual([false, true]);
      dispose();
    });

    it("re-evaluates a replaced getter when not observed", () => {
      const env = setupModelEnv();
      const other = observable.box(true);
      env.binding.config = { getter: () => other.get(), setter: () => {} };
      expect(env.binding.checked).toBe(true);
    });

    it("reads a replaced getter immediately, even while observed", () => {
      const env = setupModelEnv();
      const other = observable.box(true);
      const seen: boolean[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.checked);
      });
      env.binding.config = { getter: () => other.get(), setter: () => {} };
      expect(env.binding.checked).toBe(true);
      // Nothing is notified: `config` is not observable, and Form#bind reads the props right after replacing it
      expect(seen).toEqual([false]);

      // The observer tracks what the old getter read until it runs again
      runInAction(() => (env.model.boolean = true));
      expect(seen).toEqual([false, true]);
      runInAction(() => other.set(false)); // Now tracked through the new getter
      expect(env.binding.checked).toBe(false);
      expect(seen).toEqual([false, true, false]);
      runInAction(() => (env.model.boolean = false)); // No longer tracked
      expect(seen).toEqual([false, true, false]);
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

    it("passes the checked state of the event target to the setter", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ setter });
      env.binding.onChange(env.fakeEvent(true));
      env.binding.onChange(env.fakeEvent(false));
      expect(setter.mock.calls).toEqual([[true], [false]]);
    });

    it("updates the model", () => {
      const env = setupModelEnv();
      env.binding.onChange(env.fakeEvent(true));
      expect(env.model.boolean).toBe(true);
      expect(env.binding.props.checked).toBe(true);
    });

    it("marks the field as changed with the final change type", () => {
      vi.useFakeTimers();
      const env = setupModelEnv();
      env.binding.onChange(env.fakeEvent(true));
      expect(env.field.isChanged).toBe(true);
      expect(env.field.isIntermediate).toBe(false);
      expect(vi.getTimerCount()).toBe(0); // No auto-finalization is scheduled
      expect(env.field.isTouched).toBe(false);
    });

    it("reports errors immediately", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("boolean", "invalid");
      });
      expect(env.field.isErrorReported).toBeUndefined();
      env.binding.onChange(env.fakeEvent(true));
      expect(env.field.isErrorReported).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBe(true);
      expect(env.binding.props["aria-errormessage"]).toBe("invalid");
    });

    it("reports the field as valid when there are no errors", () => {
      const env = setupModelEnv();
      env.binding.onChange(env.fakeEvent(true));
      expect(env.field.isErrorReported).toBe(false);
      expect(env.binding.props["aria-invalid"]).toBe(false);
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
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
          log.push(["callback", e.currentTarget.checked, env.field.isChanged, env.field.isErrorReported]);
        },
      };
      env.binding.onChange(env.fakeEvent(true));
      expect(log[0]).toEqual(["setter", true, false]);
      // PINNED(quirk): the callback runs inside the onChange action batch, so the delayed error report has not settled yet: isErrorReported is still undefined in the callback and becomes false right after. Decide: should the callback run after the action completes so that it observes the settled field state?
      expect(log[1]).toEqual(["callback", true, true, undefined]);
      expect(log).toHaveLength(2);
      expect(env.field.isErrorReported).toBe(false);
    });

    it("works when detached from the binding", () => {
      const setter = vi.fn();
      const env = setupModelEnv({ setter });
      const { onChange } = env.binding.props;
      onChange(env.fakeEvent(true));
      expect(setter).toBeCalledWith(true);
      expect(env.field.isChanged).toBe(true);
    });

    it("uses the config at the time of the event", () => {
      const env = setupModelEnv();
      const { onChange } = env.binding.props;
      const setter = vi.fn();
      const callback = vi.fn();
      env.binding.config = { getter: () => false, setter, onChange: callback };
      onChange(env.fakeEvent(true));
      expect(setter).toBeCalledWith(true);
      expect(callback).toBeCalledTimes(1);
      expect(env.model.boolean).toBe(false);
    });

    it("neither marks the field as changed nor calls the callback when the setter throws", () => {
      const callback = vi.fn();
      const env = setupModelEnv({
        setter: () => {
          throw new Error("setter failed");
        },
        onChange: callback,
      });
      expect(() => env.binding.onChange(env.fakeEvent(true))).toThrow("setter failed");
      expect(env.field.isChanged).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
      expect(callback).not.toBeCalled();
    });

    it("reports the change again after the form is reset", () => {
      const env = setupModelEnv();
      env.binding.onChange(env.fakeEvent(true));
      expect(env.binding.props).toMatchObject({ checked: true, "aria-invalid": false });

      env.form.reset();
      expect(env.field.isChanged).toBe(false);
      expect(env.binding.props).toMatchObject({ checked: true, "aria-invalid": undefined }); // The model is kept

      env.binding.onChange(env.fakeEvent(false));
      expect(env.field.isChanged).toBe(true);
      expect(env.binding.props).toMatchObject({ checked: false, "aria-invalid": false });
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
      env.binding.onFocus(env.fakeEvent(false));
      expect(env.field.isTouched).toBe(true);
      expect(env.field.isChanged).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
      expect(setter).not.toBeCalled();
    });

    it("marks the field as touched before calling the callback", () => {
      const env = setupModelEnv();
      const log: boolean[] = [];
      env.binding.config.onFocus = () => log.push(env.field.isTouched);
      env.binding.onFocus(env.fakeEvent(false));
      expect(log).toEqual([true]);
    });

    it("uses the config at the time of the event", () => {
      const env = setupModelEnv({ onFocus: vi.fn() });
      const oldCallback = env.binding.config.onFocus;
      const { onFocus } = env.binding.props;
      const callback = vi.fn();
      env.binding.config = { ...env.binding.config, onFocus: callback };
      onFocus(env.fakeEvent(false));
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
        builder.invalidate("boolean", "invalid1");
        builder.invalidate("boolean", "invalid2");
      });
      expect(env.binding.errorMessages).toBeNull();
      env.field.reportError();
      expect(env.binding.errorMessages).toEqual("invalid1, invalid2");
    });

    it("returns a single message without a separator", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("boolean", "invalid");
      });
      env.field.reportError();
      expect(env.binding.errorMessages).toBe("invalid");
    });

    it("returns null again once the reported errors are cleared", () => {
      const env = setupModelEnv();
      const key = Symbol();
      env.form.validator.updateErrors(key, (builder) => {
        builder.invalidate("boolean", "invalid");
      });
      env.field.reportError();
      expect(env.binding.errorMessages).toBe("invalid");
      env.form.validator.updateErrors(key, () => {});
      expect(env.binding.errorMessages).toBeNull();
      expect(env.binding.props["aria-invalid"]).toBe(false);
    });

    it("ignores errors of other fields", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("booleanOpt", "invalid");
      });
      env.field.reportError();
      expect(env.binding.errorMessages).toBeNull();
      expect(env.binding.props["aria-invalid"]).toBe(false);
    });

    it("returns null when the only error message is empty", () => {
      const env = setupModelEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("boolean", "");
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
      expectTypeOf(env.binding.props.type).toEqualTypeOf<"checkbox">();
      expectTypeOf(env.binding.props.id).toEqualTypeOf<string>();
      expectTypeOf(env.binding.props.checked).toEqualTypeOf<boolean>();
      expectTypeOf(env.binding.props["aria-invalid"]).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(env.binding.props["aria-errormessage"]).toEqualTypeOf<string | undefined>();
      expectTypeOf(env.binding.props.onChange).toEqualTypeOf<React.ChangeEventHandler<HTMLInputElement>>();
      expectTypeOf(env.binding.props.onFocus).toEqualTypeOf<React.FocusEventHandler<HTMLInputElement>>();
      expectTypeOf(env.binding.props).toExtend<CheckBoxBinding.Attrs>();
      expectTypeOf(env.binding.errorMessages).toEqualTypeOf<string | null>();
    });

    it("types the config", () => {
      expectTypeOf<CheckBoxBinding.Config["getter"]>().toEqualTypeOf<() => boolean>();
      expectTypeOf<CheckBoxBinding.Config["setter"]>().toEqualTypeOf<(value: boolean) => void>();
      expectTypeOf<CheckBoxBinding.Config["id"]>().toEqualTypeOf<string | undefined>();
    });

    it("types the extended handlers", () => {
      expectTypeOf<CheckBoxBinding.Config["onChange"]>().toEqualTypeOf<
        React.ChangeEventHandler<HTMLInputElement> | undefined
      >();
      expectTypeOf<CheckBoxBinding.Config["onFocus"]>().toEqualTypeOf<
        React.FocusEventHandler<HTMLInputElement> | undefined
      >();
    });

    it("requires a non-nullable getter at compile time", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const invalidUsages = () => {
        // @ts-expect-error getter must not return null (use `?? false` for an optional field)
        form.bindCheckBox("booleanOpt", { getter: () => model.booleanOpt, setter: (v) => (model.booleanOpt = v) });
      };
      expectTypeOf(invalidUsages).toBeFunction();
    });

    it("returns the binding props from bindCheckBox", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const props = form.bindCheckBox("boolean", {
        getter: () => model.boolean,
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<boolean>();
        },
      });
      expectTypeOf(props).toEqualTypeOf<CheckBoxBinding["props"]>();
      expectTypeOf(form.bindCheckBox).toBeCallableWith("boolean:suffix", {
        getter: () => true,
        setter: () => {},
        cacheKey: "key",
      });
    });

    it("rejects invalid usage at compile time", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const invalidUsages = () => {
        // @ts-expect-error getter must return a boolean
        form.bindCheckBox("boolean", { getter: () => "true", setter: () => {} });
        // @ts-expect-error setter is required
        form.bindCheckBox("boolean", { getter: () => true });
        // @ts-expect-error setter must accept a boolean
        form.bindCheckBox("boolean", { getter: () => true, setter: (_v: string) => {} });
        // @ts-expect-error unknown field name
        form.bindCheckBox("unknown", { getter: () => true, setter: () => {} });
        // @ts-expect-error config is required
        form.bindCheckBox("boolean");
      };
      expectTypeOf(invalidUsages).toBeFunction();
    });
  });
});

describe("bindCheckBox", () => {
  const setupEnv = (inputLabel: string) => {
    const model = new SampleModel();

    render(<SampleComponent model={model} />);
    const input = screen.getByLabelText(inputLabel) as HTMLInputElement;

    return {
      model,
      input,
      async clickInput() {
        await userEvent.click(input);
      },
    };
  };

  test("works with a required field", async () => {
    const env = setupEnv("boolean");

    expect(env.model.boolean).toBe(false);
    expect(env.input).not.toBeChecked();
    await env.clickInput();
    expect(env.model.boolean).toBe(true);
    expect(env.input).toBeChecked();
    await env.clickInput();
    expect(env.model.boolean).toBe(false);
    expect(env.input).not.toBeChecked();
  });

  test("works with an optional field", async () => {
    const env = setupEnv("booleanOpt");

    expect(env.model.booleanOpt).toBe(null);
    expect(env.input).not.toBeChecked();
    await env.clickInput();
    expect(env.model.booleanOpt).toBe(true);
    expect(env.input).toBeChecked();
    await env.clickInput();
    expect(env.model.booleanOpt).toBe(false);
    expect(env.input).not.toBeChecked();
  });

  test("renders the checkbox type and the field id", () => {
    const env = setupEnv("boolean");
    const form = Form.get(env.model);

    expect(env.input).toHaveAttribute("type", "checkbox");
    expect(env.input).toHaveAttribute("id", form.getField("boolean").id);
    expect(screen.getByLabelText("booleanOpt")).toHaveAttribute("id", form.getField("booleanOpt").id);
    expect(form.getField("boolean").id).not.toBe(form.getField("booleanOpt").id);
  });

  test("reflects model changes made outside of the UI", () => {
    const env = setupEnv("boolean");

    act(() => runInAction(() => (env.model.boolean = true)));
    expect(env.input).toBeChecked();
    act(() => runInAction(() => (env.model.boolean = false)));
    expect(env.input).not.toBeChecked();
  });

  test("marks only the clicked field as touched and changed", async () => {
    const env = setupEnv("boolean");
    const form = Form.get(env.model);

    expect(form.getField("boolean").isTouched).toBe(false);
    expect(form.getField("boolean").isChanged).toBe(false);
    await env.clickInput();
    expect(form.getField("boolean").isTouched).toBe(true);
    expect(form.getField("boolean").isChanged).toBe(true);
    expect(form.getField("booleanOpt").isTouched).toBe(false);
    expect(form.getField("booleanOpt").isChanged).toBe(false);
  });

  test("sets the aria attributes once the change is reported", async () => {
    const env = setupEnv("boolean");
    const form = Form.get(env.model);

    expect(env.input).not.toHaveAttribute("aria-invalid");
    expect(env.input).not.toHaveAttribute("aria-errormessage");

    act(() => {
      form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("boolean", "invalid1");
        builder.invalidate("boolean", "invalid2");
      });
    });
    expect(env.input).not.toHaveAttribute("aria-invalid"); // Not reported yet

    await env.clickInput();
    expect(env.input).toHaveAttribute("aria-invalid", "true");
    // PINNED(quirk): aria-errormessage carries the message text itself, while WAI-ARIA defines it as an ID reference to the element that contains the message (the form docs say "with error text"; the react docs say "linking to error text"). Decide: should the binding reference an error element id instead of embedding the text?
    expect(env.input).toHaveAttribute("aria-errormessage", "invalid1, invalid2");

    act(() => form.reset());
    expect(env.input).not.toHaveAttribute("aria-invalid");
    expect(env.input).not.toHaveAttribute("aria-errormessage");
  });

  test("sets aria-invalid=false after a valid change", async () => {
    const env = setupEnv("boolean");

    await env.clickInput();
    expect(env.input).toHaveAttribute("aria-invalid", "false");
    expect(env.input).not.toHaveAttribute("aria-errormessage");
  });

  test("calls the extended handlers with the React events", async () => {
    const model = new SampleModel();
    const log: unknown[] = [];
    const Component = observer(() => {
      const form = Form.get(model);
      return (
        <input
          aria-label="extended"
          {...form.bindCheckBox("boolean", {
            getter: () => model.boolean,
            setter: (v) => (model.boolean = v),
            onChange: (e) => log.push(["change", e.type, e.currentTarget.checked, model.boolean]),
            onFocus: (e) => log.push(["focus", e.type]),
          })}
        />
      );
    });
    render(<Component />);

    await userEvent.click(screen.getByLabelText("extended"));
    expect(log).toEqual([
      ["focus", "focus"],
      ["change", "change", true, true],
    ]);
  });

  test("re-renders only when the bound state changes", async () => {
    const model = new SampleModel();
    let renderCount = 0;
    const Component = observer(() => {
      renderCount++;
      const form = Form.get(model);
      return (
        <input
          aria-label="counted"
          {...form.bindCheckBox("boolean", {
            getter: () => model.boolean,
            setter: (v) => (model.boolean = v),
          })}
        />
      );
    });
    render(<Component />);
    const input = screen.getByLabelText("counted");
    const form = Form.get(model);
    expect(renderCount).toBe(1);

    act(() => runInAction(() => (model.booleanOpt = true))); // Unrelated property
    expect(renderCount).toBe(1);
    act(() => form.getField("boolean").markAsTouched()); // Not part of the props
    expect(renderCount).toBe(1);

    act(() => runInAction(() => (model.boolean = true)));
    expect(renderCount).toBe(2);
    expect(input).toBeChecked();

    await userEvent.click(input);
    expect(renderCount).toBe(3);
    expect(input).not.toBeChecked();
  });

  test("reflects a getter that closes over a changed React prop", () => {
    const model = new SampleModel();
    const Component = observer(({ checked }: { checked: boolean }) => {
      const form = Form.get(model);
      return <input aria-label="prop" {...form.bindCheckBox("boolean", { getter: () => checked, setter: () => {} })} />;
    });
    const { rerender } = render(<Component checked={false} />);
    const input = screen.getByLabelText("prop");
    expect(input).not.toBeChecked();

    rerender(<Component checked={true} />);
    expect(input).toBeChecked();
  });

  test("keeps the checkbox unchecked when the setter ignores the value", async () => {
    const model = new SampleModel();
    const setter = vi.fn();
    const Component = observer(() => {
      const form = Form.get(model);
      return <input aria-label="ignored" {...form.bindCheckBox("boolean", { getter: () => model.boolean, setter })} />;
    });
    render(<Component />);
    const input = screen.getByLabelText("ignored");

    await userEvent.click(input);
    expect(setter).toBeCalledWith(true);
    expect(model.boolean).toBe(false);
    expect(input).not.toBeChecked(); // Controlled by the getter
    expect(Form.get(model).getField("boolean").isChanged).toBe(true);
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  test("sets the aria attributes when the form reports errors without any interaction", () => {
    const env = setupEnv("boolean");
    const form = Form.get(env.model);

    act(() => {
      form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("boolean", "invalid");
      });
    });
    act(() => form.reportError());
    expect(env.input).toHaveAttribute("aria-invalid", "true");
    expect(env.input).toHaveAttribute("aria-errormessage", "invalid");
    expect(screen.getByLabelText("booleanOpt")).toHaveAttribute("aria-invalid", "false");
    expect(form.getField("boolean").isChanged).toBe(false);
  });

  describe("label association", () => {
    test("toggles through a label bound to the same field", async () => {
      const model = new SampleModel();
      const Component = observer(() => {
        const form = Form.get(model);
        return (
          <>
            <label {...form.bindLabel(["boolean"])}>Boolean</label>
            <input
              {...form.bindCheckBox("boolean", {
                getter: () => model.boolean,
                setter: (v) => (model.boolean = v),
              })}
            />
          </>
        );
      });
      render(<Component />);
      const input = screen.getByLabelText("Boolean");

      expect(input).toBe(screen.getByRole("checkbox"));
      await userEvent.click(screen.getByText("Boolean"));
      expect(model.boolean).toBe(true);
      expect(input).toBeChecked();
      expect(Form.get(model).getField("boolean").isChanged).toBe(true);
    });

    test("requires a matching htmlFor on the label when the id is overridden", async () => {
      const model = new SampleModel();
      const Component = observer(({ htmlFor }: { htmlFor?: string }) => {
        const form = Form.get(model);
        return (
          <>
            <label {...form.bindLabel(["boolean"], { htmlFor })}>Boolean</label>
            <input
              {...form.bindCheckBox("boolean", {
                id: "custom-boolean",
                getter: () => model.boolean,
                setter: (v) => (model.boolean = v),
              })}
            />
          </>
        );
      });
      const { rerender } = render(<Component />);
      const input = screen.getByRole("checkbox");

      // The label binding only knows the field id, so an overridden element id ([Override]) must be
      // paired with the label's htmlFor override ("Custom htmlFor" in the react docs).
      expect(input).toHaveAttribute("id", "custom-boolean");
      expect(screen.queryByLabelText("Boolean")).toBeNull();
      await userEvent.click(screen.getByText("Boolean"));
      expect(model.boolean).toBe(false);

      rerender(<Component htmlFor="custom-boolean" />);
      expect(screen.getByLabelText("Boolean")).toBe(input);
      await userEvent.click(screen.getByText("Boolean"));
      expect(model.boolean).toBe(true);
      expect(input).toBeChecked();
    });
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
          if (model.boolean) builder.invalidate("boolean", "must be unchecked");
        },
        { delayMs }
      );
      render(<SampleComponent model={model} />);
      act(() => {
        vi.advanceTimersByTime(delayMs); // Initial validation
      });
      const input = screen.getByLabelText("boolean");
      return { model, form, input };
    };

    test("waits for the pending validation before setting the aria attributes", () => {
      const env = setupValidatedEnv();
      expect(env.form.validator.isValidating).toBe(false);

      fireEvent.click(env.input);
      expect(env.model.boolean).toBe(true);
      expect(env.input).toBeChecked();
      expect(env.form.getField("boolean").isChanged).toBe(true);
      expect(env.form.validator.isValidating).toBe(true);
      expect(env.input).not.toHaveAttribute("aria-invalid");

      act(() => {
        vi.advanceTimersByTime(delayMs - 1);
      });
      expect(env.input).not.toHaveAttribute("aria-invalid");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(env.input).toHaveAttribute("aria-invalid", "true");
      expect(env.input).toHaveAttribute("aria-errormessage", "must be unchecked");
    });

    test("reports the next change again after the form is reset", () => {
      const env = setupValidatedEnv();
      fireEvent.click(env.input);
      act(() => {
        vi.advanceTimersByTime(delayMs);
      });
      expect(env.input).toHaveAttribute("aria-invalid", "true");

      act(() => env.form.reset());
      expect(env.input).toBeChecked(); // The model is kept
      expect(env.input).not.toHaveAttribute("aria-invalid");
      expect(env.input).not.toHaveAttribute("aria-errormessage");

      fireEvent.click(env.input);
      expect(env.input).not.toBeChecked();
      expect(env.input).not.toHaveAttribute("aria-invalid"); // Validation is pending

      act(() => {
        vi.advanceTimersByTime(delayMs);
      });
      expect(env.input).toHaveAttribute("aria-invalid", "false");
      expect(env.input).not.toHaveAttribute("aria-errormessage");
    });
  });

  describe("caching", () => {
    test("reuses one binding per cache key while sharing the field id across cache keys", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const config = {
        getter: () => model.boolean,
        setter: (v: boolean) => (model.boolean = v),
      };

      const props1 = form.bindCheckBox("boolean", config);
      const props2 = form.bindCheckBox("boolean", { ...config });
      expect(props2.onChange).toBe(props1.onChange);
      expect(props2.onFocus).toBe(props1.onFocus);
      expect(props2.id).toBe(props1.id);

      const props3 = form.bindCheckBox("boolean", { ...config, cacheKey: "another" });
      expect(props3.onChange).not.toBe(props1.onChange);
      // PINNED(quirk): distinct bindings of the same field (different cacheKey) share the field id, so rendering both yields duplicate element ids although the docs promise "unique id attributes for form elements". Decide: should each binding instance get its own element id?
      expect(props3.id).toBe(props1.id);
    });

    test("routes events to the latest config when the same field is bound twice without a cache key", async () => {
      const model = new SampleModel();
      const items = [observable({ key: "a", checked: true }), observable({ key: "b", checked: false })];
      const setters = [vi.fn(), vi.fn()];
      const Component = observer(() => {
        const form = Form.get(model);
        return (
          <>
            {items.map((item, i) => (
              <input
                key={item.key}
                aria-label={`item-${i}`}
                {...form.bindCheckBox("boolean", { getter: () => item.checked, setter: setters[i] })}
              />
            ))}
          </>
        );
      });
      render(<Component />);
      const first = screen.getByLabelText("item-0");
      const second = screen.getByLabelText("item-1");

      // Each call reads its own getter as it returns the props
      expect(first).toBeChecked();
      expect(second).not.toBeChecked();

      await userEvent.click(first);
      // PINNED(quirk): both bind calls share one binding, whose onChange uses the latest config, so clicking the first element invokes the second element's setter. Decide: should rebinding the same key with a different config in one render be detected (warn/throw), or is cacheKey the documented remedy?
      expect(setters[0]).not.toBeCalled();
      expect(setters[1]).toBeCalledWith(false);
    });

    test("keeps elements independent with distinct cache keys", async () => {
      const model = new SampleModel();
      const items = [observable({ key: "a", checked: true }), observable({ key: "b", checked: false })];
      const setters = [vi.fn(), vi.fn()];
      const Component = observer(() => {
        const form = Form.get(model);
        return (
          <>
            {items.map((item, i) => (
              <input
                key={item.key}
                aria-label={`item-${i}`}
                {...form.bindCheckBox("boolean", {
                  getter: () => item.checked,
                  setter: setters[i],
                  cacheKey: String(i),
                })}
              />
            ))}
          </>
        );
      });
      render(<Component />);
      const first = screen.getByLabelText("item-0");
      const second = screen.getByLabelText("item-1");

      expect(first).toBeChecked();
      expect(second).not.toBeChecked();

      await userEvent.click(first);
      expect(setters[0]).toBeCalledWith(false);
      expect(setters[1]).not.toBeCalled();
    });
  });
});
