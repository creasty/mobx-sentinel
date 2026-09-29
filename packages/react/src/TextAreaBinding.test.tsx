import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { autorun, isAction, isComputedProp, makeObservable, observable, runInAction } from "mobx";
import { Form, FormField } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { TextAreaBinding } from "./TextAreaBinding";

class SampleModel {
  @observable text: string = "hello";
  @observable textOpt: string | null = null;

  constructor() {
    makeObservable(this);
  }
}

/** Create a binding for the "text" field of a fresh model */
const setupBinding = (makeConfig: (model: SampleModel) => TextAreaBinding.Config) => {
  const model = new SampleModel();
  const form = Form.get(model);
  const field = form.getField("text");
  const binding = new TextAreaBinding(field, makeConfig(model));
  return { model, form, field, binding };
};

/** Create an event whose currentTarget is a real textarea element */
const textAreaEventOf = (value: string) => {
  const element = document.createElement("textarea");
  element.value = value;
  return { currentTarget: element, target: element } as unknown as React.ChangeEvent<HTMLTextAreaElement> &
    React.FocusEvent<HTMLTextAreaElement>;
};

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <>
      <textarea
        aria-label="text"
        {...form.bindTextArea("text", {
          getter: () => model.text,
          setter: (v) => (model.text = v),
        })}
      />
      <textarea
        aria-label="textOpt"
        {...form.bindTextArea("textOpt", {
          getter: () => model.textOpt,
          setter: (v) => (model.textOpt = v || null),
        })}
      />
    </>
  );
});

describe("TextAreaBinding", () => {
  describe("props", () => {
    test("exposes exactly the textarea attributes, without a type", () => {
      const env = setupBinding(() => ({ getter: () => "value", setter: () => {} }));
      expect(env.binding.props).toEqual({
        value: "value",
        id: env.field.id,
        onChange: env.binding.onChange,
        onFocus: env.binding.onFocus,
        onBlur: env.binding.onBlur,
        "aria-invalid": undefined,
        "aria-errormessage": undefined,
      });
      expect(Object.keys(env.binding.props)).toEqual([
        "value",
        "id",
        "onChange",
        "onFocus",
        "onBlur",
        "aria-invalid",
        "aria-errormessage",
      ]);
    });

    test("returns a fresh object with the same handler functions on every access", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const first = env.binding.props;
      const second = env.binding.props;
      expect(second).not.toBe(first);
      expect(second.onChange).toBe(first.onChange);
      expect(second.onFocus).toBe(first.onFocus);
      expect(second.onBlur).toBe(first.onBlur);
    });

    test("uses the field's stable id by default, and the provided id otherwise", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expect(env.binding.props.id).toBe(env.field.stableId);

      env.binding.config = { id: "custom", getter: () => null, setter: () => {} };
      expect(env.binding.props.id).toBe("custom");

      env.binding.config = { getter: () => null, setter: () => {} };
      expect(env.binding.props.id).toBe(env.field.stableId);
    });

    test("follows the form's stable id once it is assigned", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.stableId = "invoice";
      expect(env.binding.props.id).toBe("invoice:text");
    });

    test("uses an empty id as-is instead of falling back to the field id", () => {
      const env = setupBinding(() => ({ id: "", getter: () => null, setter: () => {} }));
      // PINNED(quirk): `config.id ?? field.stableId` keeps an empty string, so the textarea renders id="" (the same as InputBinding). Decide: should an empty id fall back to the field id?
      expect(env.binding.props.id).toBe("");
    });

    test("keeps aria attributes undefined until errors are reported, even if errors exist", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("text", "invalid");
      });
      expect(env.field.hasErrors).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBeUndefined();
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });

    test("sets aria-invalid to false when reported without errors", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.field.reportError();
      expect(env.binding.props["aria-invalid"]).toBe(false);
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });

    test("sets aria-invalid and aria-errormessage when reported with errors, and clears them on reset", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("text", "invalid1");
        builder.invalidate("text", "invalid2");
      });
      env.field.reportError();
      expect(env.binding.props["aria-invalid"]).toBe(true);
      // Carries the message text, as the other standard bindings do (see the PINNED quirk in InputBinding.test.tsx)
      expect(env.binding.props["aria-errormessage"]).toBe("invalid1, invalid2");

      env.field.reset();
      expect(env.binding.props["aria-invalid"]).toBeUndefined();
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });
  });

  describe("#value", () => {
    test("returns the getter value, keeping line breaks", () => {
      const env = setupBinding(() => ({ getter: () => "line 1\nline 2", setter: () => {} }));
      expect(env.binding.value).toBe("line 1\nline 2");
      expect(env.binding.props.value).toBe("line 1\nline 2");
    });

    test("falls back to an empty string when the getter returns null", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expect(env.binding.value).toBe("");
      expect(env.binding.props.value).toBe("");
    });

    test("is a plain getter, while errorMessages is a computed value", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expect(isComputedProp(env.binding, "value")).toBe(false);
      expect(isComputedProp(env.binding, "errorMessages")).toBe(true);
    });

    test("reads a replaced getter immediately, even while observed", () => {
      const env = setupBinding((model) => ({ getter: () => `${model.text}:A`, setter: () => {} }));

      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.value);
      });
      try {
        env.binding.config = { getter: () => `${env.model.text}:B`, setter: () => {} };
        expect(env.binding.value).toBe("hello:B");
        expect(env.binding.props.value).toBe("hello:B");
        // Nothing is notified: `config` is not observable, and Form#bind reads the props right after replacing it
        expect(seen).toEqual(["hello:A"]);

        // The observer tracks what the old getter read until it runs again
        runInAction(() => {
          env.model.text = "world";
        });
        expect(seen).toEqual(["hello:A", "world:B"]);
      } finally {
        dispose();
      }
    });
  });

  describe("#onChange", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("is a MobX action", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expect(isAction(env.binding.onChange)).toBe(true);
    });

    test("passes the element value to the setter as-is, including line breaks and surrounding spaces", () => {
      const setter = vi.fn<(value: string) => void>();
      const env = setupBinding(() => ({ getter: () => null, setter }));
      env.binding.onChange(textAreaEventOf(" line 1\nline 2 "));
      env.binding.onChange(textAreaEventOf(""));
      expect(setter.mock.calls).toEqual([[" line 1\nline 2 "], [""]]);
    });

    test("reads the value from currentTarget rather than target", () => {
      const setter = vi.fn<(value: string) => void>();
      const env = setupBinding(() => ({ getter: () => null, setter }));
      const currentTarget = document.createElement("textarea");
      currentTarget.value = "current";
      const target = document.createElement("textarea");
      target.value = "target";
      env.binding.onChange({ currentTarget, target } as unknown as React.ChangeEvent<HTMLTextAreaElement>);
      expect(setter).toHaveBeenCalledWith("current");
    });

    test("calls the setter first, then marks the field as intermediate, then calls the callback", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const order: string[] = [];
      env.binding.config = {
        getter: () => env.model.text,
        setter: (v) => {
          order.push(`setter(${v}) changed=${env.field.isChanged}`);
          env.model.text = v;
        },
        onChange: (e) => {
          order.push(
            `onChange(${e.currentTarget.value}) intermediate=${env.field.isIntermediate} model=${env.model.text}`
          );
        },
      };
      env.binding.onChange(textAreaEventOf("world"));
      expect(order).toEqual(["setter(world) changed=false", "onChange(world) intermediate=true model=world"]);
    });

    test("passes the original event object to the callback", () => {
      const callback = vi.fn();
      const env = setupBinding(() => ({ getter: () => null, setter: () => {}, onChange: callback }));
      const event = textAreaEventOf("world");
      env.binding.onChange(event);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toBe(event);
    });

    test("runs the setter and the callback in a single action so reactions fire once afterwards", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const runs: string[] = [];
      env.binding.config = {
        getter: () => env.model.text,
        setter: (v) => {
          env.model.text = v;
          env.model.textOpt = v;
        },
        onChange: () => {
          runs.push(`callback:${env.model.text}`);
        },
      };
      const dispose = autorun(() => {
        runs.push(`reaction:${env.model.text}/${env.model.textOpt}`);
      });
      try {
        env.binding.onChange(textAreaEventOf("world"));
      } finally {
        dispose();
      }
      expect(runs).toEqual(["reaction:hello/null", "callback:world", "reaction:world/world"]);
    });

    test("marks the change as intermediate without touching or reporting the field", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("text", "invalid");
      });
      env.binding.onChange(textAreaEventOf("a complete value"));
      expect(env.field.isChanged).toBe(true);
      expect(env.field.isIntermediate).toBe(true);
      expect(env.field.isTouched).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
      expect(env.binding.props["aria-invalid"]).toBeUndefined();
    });

    test("finalizes after autoFinalizationDelayMs, restarting the delay on every change", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.configure({ autoFinalizationDelayMs: 100 });
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("text", "invalid");
      });

      env.binding.onChange(textAreaEventOf("a"));
      vi.advanceTimersByTime(99);
      expect(env.field.isIntermediate).toBe(true);

      env.binding.onChange(textAreaEventOf("a\n"));
      vi.advanceTimersByTime(99);
      expect(env.field.isIntermediate).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBeUndefined();

      vi.advanceTimersByTime(1);
      expect(env.field.isIntermediate).toBe(false);
      expect(env.field.isChanged).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBe(true);
      expect(env.binding.props["aria-errormessage"]).toBe("invalid");
    });

    test("propagates a setter error without marking the field or calling the callback", () => {
      const callback = vi.fn();
      const env = setupBinding(() => ({
        getter: () => null,
        setter: () => {
          throw new Error("setter failed");
        },
        onChange: callback,
      }));
      expect(() => env.binding.onChange(textAreaEventOf("world"))).toThrow("setter failed");
      expect(env.field.isChanged).toBe(false);
      expect(callback).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    test("uses the setter and the callback of the latest config", () => {
      const oldSetter = vi.fn();
      const oldCallback = vi.fn();
      const newSetter = vi.fn();
      const newCallback = vi.fn();
      const env = setupBinding(() => ({ getter: () => null, setter: oldSetter, onChange: oldCallback }));
      const { onChange } = env.binding.props;
      env.binding.config = { getter: () => null, setter: newSetter, onChange: newCallback };
      onChange(textAreaEventOf("world"));
      expect(oldSetter).not.toHaveBeenCalled();
      expect(oldCallback).not.toHaveBeenCalled();
      expect(newSetter).toHaveBeenCalledWith("world");
      expect(newCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("#onBlur", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("finalizes an intermediate change immediately and cancels the auto-finalization", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("text", "invalid");
      });
      env.binding.onChange(textAreaEventOf("world"));
      expect(vi.getTimerCount()).toBe(1);

      env.binding.onBlur(textAreaEventOf("world"));
      expect(vi.getTimerCount()).toBe(0);
      expect(env.field.isIntermediate).toBe(false);
      expect(env.field.isChanged).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBe(true);
      expect(env.binding.props["aria-errormessage"]).toBe("invalid");
    });

    test("neither reports errors nor marks the field when nothing has been changed", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("text", "invalid");
      });
      env.binding.onFocus(textAreaEventOf(""));
      env.binding.onBlur(textAreaEventOf(""));
      expect(env.field.isChanged).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
    });

    test("calls the callback after finalizing, without marking the field as touched", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const states: boolean[] = [];
      env.binding.config = {
        getter: () => null,
        setter: () => {},
        onBlur: () => states.push(env.field.isIntermediate),
      };
      env.binding.onChange(textAreaEventOf("world"));
      env.binding.onBlur(textAreaEventOf("world"));
      expect(states).toEqual([false]);
      expect(env.field.isTouched).toBe(false);
    });
  });

  describe("#onFocus", () => {
    test("marks the field as touched without changing or reporting it, before calling the callback", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const states: boolean[] = [];
      env.binding.config = { getter: () => null, setter: () => {}, onFocus: () => states.push(env.field.isTouched) };
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("text", "invalid");
      });
      env.binding.onFocus(textAreaEventOf(""));
      expect(states).toEqual([true]);
      expect(env.field.isTouched).toBe(true);
      expect(env.field.isChanged).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
    });

    test.each(["onFocus", "onBlur"] as const)("is not a MobX action (%s)", (handler) => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      // PINNED(quirk): like InputBinding's, onFocus and onBlur are not actions, so a callback mutating observables is not batched. Decide along with InputBinding: should onFocus/onBlur be actions like onChange?
      expect(isAction(env.binding[handler])).toBe(false);
    });
  });

  describe("errorMessages", () => {
    test("is null until the errors are reported, then joins the distinct messages", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expect(env.binding.errorMessages).toBeNull();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("text", "b");
        builder.invalidate("text", "a");
        builder.invalidate("text", "b");
      });
      expect(env.binding.errorMessages).toBeNull();
      env.field.reportError();
      expect(env.binding.errorMessages).toBe("b, a");
    });

    test("ignores the errors of other fields", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("textOpt", "invalid");
      });
      env.field.reportError();
      expect(env.binding.errorMessages).toBeNull();
      expect(env.binding.props["aria-invalid"]).toBe(false);
    });
  });

  describe("types", () => {
    test("handlers are typed for HTMLTextAreaElement", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expectTypeOf(env.binding.config).toEqualTypeOf<TextAreaBinding.Config>();
      expectTypeOf<TextAreaBinding.Config["onChange"]>().toEqualTypeOf<
        React.ChangeEventHandler<HTMLTextAreaElement> | undefined
      >();
      expectTypeOf<TextAreaBinding.Config["onFocus"]>().toEqualTypeOf<
        React.FocusEventHandler<HTMLTextAreaElement> | undefined
      >();
      expectTypeOf<TextAreaBinding.Config["onBlur"]>().toEqualTypeOf<
        React.FocusEventHandler<HTMLTextAreaElement> | undefined
      >();
      expectTypeOf(env.binding.onChange).toEqualTypeOf<React.ChangeEventHandler<HTMLTextAreaElement>>();
      expectTypeOf(env.binding.onFocus).toEqualTypeOf<React.FocusEventHandler<HTMLTextAreaElement>>();
      expectTypeOf(env.binding.onBlur).toEqualTypeOf<React.FocusEventHandler<HTMLTextAreaElement>>();
      expectTypeOf(TextAreaBinding).constructorParameters.toEqualTypeOf<[FormField, TextAreaBinding.Config]>();
    });

    test("props fit a textarea, not an input", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expectTypeOf(env.binding.props).toEqualTypeOf<{
        value: string;
        id: string;
        onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
        onFocus: React.FocusEventHandler<HTMLTextAreaElement>;
        onBlur: React.FocusEventHandler<HTMLTextAreaElement>;
        "aria-invalid": boolean | undefined;
        "aria-errormessage": string | undefined;
      }>();
      expectTypeOf(env.binding.props).toExtend<React.TextareaHTMLAttributes<HTMLTextAreaElement>>();
      expectTypeOf(env.binding.props).not.toExtend<React.InputHTMLAttributes<HTMLInputElement>>();
      expectTypeOf(env.binding.value).toEqualTypeOf<string>();
      expectTypeOf(env.binding.errorMessages).toEqualTypeOf<string | null>();
    });

    test("config", () => {
      expectTypeOf<TextAreaBinding.Config["getter"]>().toEqualTypeOf<() => string | null>();
      expectTypeOf<TextAreaBinding.Config["setter"]>().toEqualTypeOf<(value: string) => void>();
      expectTypeOf<TextAreaBinding.Config["id"]>().toEqualTypeOf<string | undefined>();

      expectTypeOf<{ getter: () => string; setter: (v: string | null) => void }>().toExtend<TextAreaBinding.Config>();
      expectTypeOf<{ getter: () => number; setter: (v: string) => void }>().not.toExtend<TextAreaBinding.Config>();
      expectTypeOf<{ getter: () => string; setter: (v: number) => void }>().not.toExtend<TextAreaBinding.Config>();
      expectTypeOf<{ getter: () => string }>().not.toExtend<TextAreaBinding.Config>();
      // Input-only options are not part of the config
      expectTypeOf<{
        valueAs: "number";
        getter: () => number;
        setter: (v: number | null) => void;
      }>().not.toExtend<TextAreaBinding.Config>();
    });

    test("bindTextArea", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      expectTypeOf(form.bindTextArea).parameter(0).toEqualTypeOf<FormField.Name<SampleModel>>();
      expectTypeOf(
        form.bindTextArea("text", {
          getter: () => model.text,
          setter: (v) => {
            expectTypeOf(v).toEqualTypeOf<string>();
          },
        })
      ).toEqualTypeOf<TextAreaBinding["props"]>();

      // Compile-time only: the closure is never invoked
      const typeOnly = () => {
        form.bindTextArea("text:suffix", { cacheKey: "key", getter: () => model.text, setter: () => {} });
        // @ts-expect-error unknown field name
        form.bindTextArea("unknown", { getter: () => "", setter: () => {} });
        // @ts-expect-error bindTextArea requires a config
        form.bindTextArea("text");
        // @ts-expect-error the getter must return a string or null
        form.bindTextArea("text", { getter: () => 1, setter: () => {} });

        return (
          <>
            <textarea rows={4} {...form.bindTextArea("text", { getter: () => model.text, setter: () => {} })} />
            {/* @ts-expect-error the handlers are typed for <textarea>, not <input> */}
            <input {...form.bindTextArea("text", { getter: () => model.text, setter: () => {} })} />
            {/* @ts-expect-error InputBinding's handlers are typed for <input>, which is why TextAreaBinding exists */}
            <textarea {...form.bindInput("text", { getter: () => model.text, setter: () => {} })} />
          </>
        );
      };
      expectTypeOf(typeOnly).toBeFunction();
    });

    test("bind without the extension", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      expectTypeOf(form.bind("text", TextAreaBinding, { getter: () => model.text, setter: () => {} })).toEqualTypeOf<
        TextAreaBinding["props"]
      >();

      // The config is required by the types, and binding without one crashes at runtime
      expect(() => {
        // @ts-expect-error the config is required
        form.bind("text", TextAreaBinding);
      }).toThrow(TypeError);
    });
  });
});

describe("bindTextArea", () => {
  const setupEnv = (label: "text" | "textOpt") => {
    const model = new SampleModel();
    render(<SampleComponent model={model} />);
    const textarea = screen.getByLabelText(label) as HTMLTextAreaElement;
    return { model, form: Form.get(model), textarea };
  };

  test("works with a required field, keeping line breaks", async () => {
    const env = setupEnv("text");

    expect(env.textarea).toHaveDisplayValue("hello");
    await userEvent.clear(env.textarea);
    await userEvent.type(env.textarea, "line 1{Enter}line 2");
    expect(env.model.text).toBe("line 1\nline 2");
    expect(env.textarea).toHaveDisplayValue("line 1\nline 2");

    await userEvent.clear(env.textarea);
    expect(env.model.text).toBe("");
    expect(env.textarea).toHaveDisplayValue("");
    env.form.reset(); // Cancel the pending auto-finalization
  });

  test("works with an optional field", async () => {
    const env = setupEnv("textOpt");

    expect(env.model.textOpt).toBeNull();
    expect(env.textarea).toHaveDisplayValue("");
    await userEvent.type(env.textarea, "world");
    expect(env.model.textOpt).toBe("world");
    expect(env.textarea).toHaveDisplayValue("world");

    await userEvent.clear(env.textarea);
    expect(env.model.textOpt).toBeNull();
    expect(env.textarea).toHaveDisplayValue("");
    env.form.reset(); // Cancel the pending auto-finalization
  });

  test("reflects model changes made outside of the UI", () => {
    const env = setupEnv("text");
    act(() => {
      runInAction(() => {
        env.model.text = "line 1\nline 2";
      });
    });
    expect(env.textarea).toHaveDisplayValue("line 1\nline 2");
  });

  test("renders the field id without a type or aria attributes, keeping the element's own attributes", () => {
    const model = new SampleModel();
    const Component = observer(() => {
      const form = Form.get(model);
      return (
        <textarea
          aria-label="text"
          rows={4}
          placeholder="Write something"
          {...form.bindTextArea("text", { getter: () => model.text, setter: (v) => (model.text = v) })}
        />
      );
    });
    render(<Component />);
    const textarea = screen.getByLabelText("text");

    expect(textarea).toHaveAttribute("id", Form.get(model).getField("text").id);
    expect(textarea).toHaveAttribute("rows", "4");
    expect(textarea).toHaveAttribute("placeholder", "Write something");
    expect(textarea).not.toHaveAttribute("type");
    expect(textarea).not.toHaveAttribute("aria-invalid");
    expect(textarea).not.toHaveAttribute("aria-errormessage");
  });

  test("marks the field as touched on focus", () => {
    const env = setupEnv("text");
    const field = env.form.getField("text");
    expect(field.isTouched).toBe(false);
    fireEvent.focus(env.textarea);
    expect(field.isTouched).toBe(true);
  });

  describe("error reporting", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const invalidate = (form: Form<SampleModel>) => {
      act(() => {
        form.validator.updateErrors(Symbol(), (builder) => {
          builder.invalidate("text", "invalid");
        });
      });
    };

    test("does not report errors while typing, but reports them on blur", () => {
      const env = setupEnv("text");
      invalidate(env.form);

      fireEvent.focus(env.textarea);
      fireEvent.change(env.textarea, { target: { value: "line 1\nline 2" } });
      expect(env.model.text).toBe("line 1\nline 2");
      expect(env.textarea).not.toHaveAttribute("aria-invalid");

      fireEvent.blur(env.textarea);
      expect(env.textarea).toHaveAttribute("aria-invalid", "true");
      expect(env.textarea).toHaveAttribute("aria-errormessage", "invalid");
    });

    test("reports errors after the auto-finalization delay without blurring", () => {
      const env = setupEnv("text");
      invalidate(env.form);

      fireEvent.change(env.textarea, { target: { value: "world" } });
      act(() => {
        vi.advanceTimersByTime(env.form.config.autoFinalizationDelayMs - 1);
      });
      expect(env.textarea).not.toHaveAttribute("aria-invalid");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(env.textarea).toHaveAttribute("aria-invalid", "true");
    });

    test("renders aria-invalid=false once a change without errors is finalized, and removes it on reset", () => {
      const env = setupEnv("text");
      fireEvent.change(env.textarea, { target: { value: "world" } });
      fireEvent.blur(env.textarea);
      expect(env.textarea).toHaveAttribute("aria-invalid", "false");
      expect(env.textarea).not.toHaveAttribute("aria-errormessage");

      act(() => {
        env.form.reset();
      });
      expect(env.textarea).not.toHaveAttribute("aria-invalid");
    });
  });

  test("associates a label bound to the same field", () => {
    const model = new SampleModel();
    const Component = observer(() => {
      const form = Form.get(model);
      return (
        <>
          <label {...form.bindLabel(["text"])}>Memo</label>
          <textarea
            data-testid="textarea"
            {...form.bindTextArea("text", { getter: () => model.text, setter: (v) => (model.text = v) })}
          />
        </>
      );
    });
    render(<Component />);
    expect(screen.getByLabelText("Memo")).toBe(screen.getByTestId("textarea"));
  });

  describe("config updates across renders", () => {
    const SuffixComponent: React.FC<{ model: SampleModel; suffix: string }> = observer(({ model, suffix }) => {
      const form = Form.get(model);
      return (
        <textarea
          aria-label="suffix"
          {...form.bindTextArea("text", {
            getter: () => `${model.text}${suffix}`,
            setter: (v) => (model.text = `${v}${suffix}`),
          })}
        />
      );
    });

    test("uses the getter and the setter of the latest render", () => {
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const model = new SampleModel();
      const { rerender } = render(<SuffixComponent model={model} suffix="A" />);
      const textarea = screen.getByLabelText("suffix");
      expect(textarea).toHaveDisplayValue("helloA");

      rerender(<SuffixComponent model={model} suffix="B" />);
      expect(textarea).toHaveDisplayValue("helloB");

      fireEvent.change(textarea, { target: { value: "x" } });
      expect(model.text).toBe("xB");
      expect(textarea).toHaveDisplayValue("xBB");
    });
  });

  describe("bind without the extension", () => {
    test("shares the binding with bindTextArea given the same config", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const config = { getter: () => model.text, setter: () => {} };
      const viaExtension = form.bindTextArea("text", config);
      const viaBind = form.bind("text", TextAreaBinding, config);
      // Unlike bindInput, bindTextArea passes the cacheKey through as is
      expect(viaBind.onChange).toBe(viaExtension.onChange);
      expect(form.bindTextArea("text", { ...config, cacheKey: "other" }).onChange).not.toBe(viaExtension.onChange);
    });
  });
});
