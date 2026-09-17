import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { autorun, makeObservable, observable, runInAction } from "mobx";
import { Form, FormField } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { InputBinding } from "./InputBinding";

class SampleModel {
  @observable string: string = "hello";
  @observable stringOpt: string | null = null;
  @observable number: number = 123;
  @observable numberOpt: number | null = null;
  @observable date: Date = new Date("2024-12-31");
  @observable dateOpt: Date | null = null;

  constructor() {
    makeObservable(this);
  }
}

class ExtraModel {
  @observable time: Date | null = null;
  @observable range: number | null = null;

  constructor() {
    makeObservable(this);
  }
}

/** Create a binding for the "string" field of a fresh model */
const setupBinding = (makeConfig: (model: SampleModel) => InputBinding.Config) => {
  const model = new SampleModel();
  const form = Form.get(model);
  const field = form.getField("string");
  const binding = new InputBinding(field, makeConfig(model));
  return { model, form, field, binding };
};

/** Create an event whose currentTarget is a real input element of the given type */
const inputEventOf = (type: string, value: string) => {
  const element = document.createElement("input");
  element.type = type;
  element.value = value;
  return { currentTarget: element, target: element } as unknown as React.ChangeEvent<HTMLInputElement> &
    React.FocusEvent<HTMLInputElement>;
};

/** Dates created by jsdom belong to another realm (`instanceof Date` is false), so compare them by ISO string */
const isoOf = (value: Date | null | undefined) => (value ? value.toISOString() : value);

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <>
      <input
        aria-label="string"
        {...form.bindInput("string", {
          getter: () => model.string,
          setter: (v) => (model.string = v),
        })}
      />
      <input
        aria-label="stringOpt"
        {...form.bindInput("stringOpt", {
          getter: () => model.stringOpt,
          setter: (v) => (model.stringOpt = v || null),
        })}
      />

      <input
        aria-label="number"
        {...form.bindInput("number", {
          valueAs: "number",
          getter: () => model.number,
          setter: (v) => (model.number = v ?? 0),
        })}
      />
      <input
        aria-label="numberOpt"
        {...form.bindInput("numberOpt", {
          valueAs: "number",
          getter: () => model.numberOpt,
          setter: (v) => (model.numberOpt = v),
        })}
      />

      <input
        aria-label="date"
        {...form.bindInput("date", {
          valueAs: "date",
          getter: () => model.date.toISOString().split("T")[0],
          setter: (v) => (model.date = v ?? new Date(0)),
        })}
      />
      <input
        aria-label="dateOpt"
        {...form.bindInput("dateOpt", {
          valueAs: "date",
          getter: () => model.dateOpt?.toISOString().split("T")[0] ?? null,
          setter: (v) => (model.dateOpt = v),
        })}
      />
    </>
  );
});

describe("InputBinding", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = new FormField({
      fieldName: "string",
      validator: form.validator,
      getFinalizationDelayMs: () => form.config.autoFinalizationDelayMs,
    });
    const binding = new InputBinding(field, {
      getter: () => "",
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
  });

  describe("#type", () => {
    it("uses the type deduced from the valueAs", () => {
      const env = setupEnv();
      expect(env.binding.type).toBe("text");
      env.binding.config.valueAs = "number";
      expect(env.binding.type).toBe("number");
      env.binding.config.valueAs = "date";
      expect(env.binding.type).toBe("date");
    });

    it("uses the provided type", () => {
      const env = setupEnv();
      env.binding.config.type = "password";
      expect(env.binding.type).toBe("password");
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
  });

  describe("#onBlur", () => {
    it("works without a callback", () => {
      const env = setupEnv();
      env.binding.onBlur(env.fakeEvent());
    });

    it("calls the callback if provided", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onBlur = callback;
      env.binding.onBlur(env.fakeEvent());
      expect(callback).toBeCalledWith(env.fakeEvent());
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
        builder.invalidate("string", "invalid1");
        builder.invalidate("string", "invalid2");
      });
      expect(env.binding.errorMessages).toBeNull();
      env.field.reportError();
      expect(env.binding.errorMessages).toEqual("invalid1, invalid2");
    });

    test("deduplicates identical messages and joins the rest in insertion order", () => {
      const env = setupBinding(() => ({ getter: () => "", setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "b");
        builder.invalidate("string", "a");
        builder.invalidate("string", "b");
      });
      env.field.reportError();
      expect(env.binding.errorMessages).toBe("b, a");
    });

    test("treats an empty message as no message while the field is still invalid", () => {
      const env = setupBinding(() => ({ getter: () => "", setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "");
      });
      env.field.reportError();
      expect(env.field.isErrorReported).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBe(true);
      // PINNED(quirk): an empty error message collapses to null, so the input is aria-invalid without any aria-errormessage. Decide: should empty messages be dropped by the validator, or should errorMessages return "" here?
      expect(env.binding.errorMessages).toBeNull();
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });

    test("recomputes when the errors change after reporting", () => {
      const env = setupBinding(() => ({ getter: () => "", setter: () => {} }));
      const key = Symbol();
      env.field.reportError();

      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.errorMessages);
      });
      try {
        env.form.validator.updateErrors(key, (builder) => {
          builder.invalidate("string", "invalid");
        });
        env.form.validator.updateErrors(key, () => {});
      } finally {
        dispose();
      }
      expect(seen).toEqual([null, "invalid", null]);
    });
  });

  describe("#value", () => {
    test("falls back to an empty string when the getter returns null", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expect(env.binding.value).toBe("");
      expect(env.binding.props.value).toBe("");
    });

    test("falls back to an empty string when the getter returns undefined at runtime", () => {
      const env = setupBinding(() => ({ getter: () => undefined as unknown as string, setter: () => {} }));
      expect(env.binding.value).toBe("");
    });

    test("passes numbers through without stringifying them, including 0", () => {
      const env = setupBinding(() => ({ valueAs: "number", getter: () => 0, setter: () => {} }));
      expect(env.binding.value).toBe(0);
      expect(env.binding.props.value).toBe(0);
    });

    test("passes NaN through as-is", () => {
      const env = setupBinding(() => ({ valueAs: "number", getter: () => NaN, setter: () => {} }));
      // PINNED(quirk): NaN from the getter is passed through to `value` (React then warns and renders an empty input). Decide: should `value` map NaN to "" the same way as null?
      expect(env.binding.value).toBeNaN();
    });

    test("rethrows the getter error from both value and props", () => {
      const env = setupBinding(() => ({
        getter: () => {
          throw new Error("getter failed");
        },
        setter: () => {},
      }));
      expect(() => env.binding.value).toThrow("getter failed");
      expect(() => env.binding.props).toThrow("getter failed");
    });

    test("re-evaluates only when an observable read by the getter changes", () => {
      let getterCalls = 0;
      const env = setupBinding((model) => ({
        getter: () => {
          getterCalls++;
          return model.string;
        },
        setter: () => {},
      }));

      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.value);
      });
      try {
        expect(seen).toEqual(["hello"]);
        runInAction(() => {
          env.model.number = 999; // unrelated
        });
        runInAction(() => {
          env.model.string = "hello"; // same value
        });
        expect(seen).toEqual(["hello"]);
        runInAction(() => {
          env.model.string = "world";
        });
        expect(seen).toEqual(["hello", "world"]);
        expect(getterCalls).toBe(2);
      } finally {
        dispose();
      }
    });

    test("reads a replaced getter immediately, even while observed", () => {
      const env = setupBinding((model) => ({ getter: () => `${model.string}:A`, setter: () => {} }));

      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.value);
      });
      try {
        env.binding.config = { getter: () => `${env.model.string}:B`, setter: () => {} };
        expect(env.binding.value).toBe("hello:B");
        expect(env.binding.props.value).toBe("hello:B");
        // Nothing is notified: `config` is not observable, and Form#bind reads the props right after replacing it
        expect(seen).toEqual(["hello:A"]);

        // The observer tracks what the old getter read until it runs again
        runInAction(() => {
          env.model.string = "world";
        });
        expect(seen).toEqual(["hello:A", "world:B"]);
      } finally {
        dispose();
      }
    });
  });

  describe("#type precedence", () => {
    test("prefers the configured type over the one deduced from valueAs", () => {
      const noop = () => {};
      expect(setupBinding(() => ({ type: "email", getter: () => null, setter: noop })).binding.type).toBe("email");
      expect(setupBinding(() => ({ type: "number", getter: () => null, setter: noop })).binding.type).toBe("number");
      expect(
        setupBinding(() => ({ valueAs: "number", type: "range", getter: () => null, setter: noop })).binding.type
      ).toBe("range");
      expect(
        setupBinding(() => ({ valueAs: "date", type: "time", getter: () => null, setter: noop })).binding.type
      ).toBe("time");
    });

    test("deduces text when valueAs is explicitly string", () => {
      const env = setupBinding(() => ({ valueAs: "string", getter: () => null, setter: () => {} }));
      expect(env.binding.type).toBe("text");
    });

    test("reflects a replaced config immediately", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expect(env.binding.props.type).toBe("text");
      env.binding.config = { valueAs: "date", type: "month", getter: () => null, setter: () => {} };
      expect(env.binding.props.type).toBe("month");
    });
  });

  describe("#onChange value conversion", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    describe("valueAs=string", () => {
      test.each([
        { type: "text", input: " a ", expected: " a " },
        { type: "text", input: "", expected: "" },
        { type: "search", input: "query", expected: "query" },
        { type: "email", input: " a@b ", expected: "a@b" },
        { type: "color", input: "#ABCDEF", expected: "#abcdef" },
        { type: "color", input: "invalid", expected: "#000000" },
        { type: "number", input: "abc", expected: "" },
        { type: "date", input: "2024-12-31", expected: "2024-12-31" },
      ])("passes the sanitized element value of type=$type $input as $expected", ({ type, input, expected }) => {
        const setter = vi.fn<(value: string) => void>();
        const env = setupBinding(() => ({ getter: () => null, setter }));
        env.binding.onChange(inputEventOf(type, input));
        expect(setter).toHaveBeenCalledTimes(1);
        expect(setter).toHaveBeenCalledWith(expected);
      });
    });

    describe("valueAs=number", () => {
      test.each([
        { type: "number", input: "42", expected: 42 },
        { type: "number", input: "0", expected: 0 },
        { type: "number", input: "-1.5", expected: -1.5 },
        { type: "number", input: "1e3", expected: 1000 },
        { type: "number", input: ".5", expected: 0.5 },
        { type: "number", input: "", expected: null },
        { type: "number", input: "abc", expected: null },
        { type: "number", input: "1.", expected: null },
        { type: "range", input: "7", expected: 7 },
        { type: "range", input: "", expected: 50 }, // a range input sanitizes an empty value to its midpoint
        { type: "date", input: "2024-12-31", expected: Date.UTC(2024, 11, 31) },
        { type: "datetime-local", input: "2024-12-31T23:59", expected: Date.UTC(2024, 11, 31, 23, 59) },
        { type: "time", input: "23:59", expected: (23 * 60 + 59) * 60 * 1000 },
        { type: "month", input: "2024-12", expected: (2024 - 1970) * 12 + 11 }, // months since epoch
        { type: "week", input: "2024-W52", expected: Date.UTC(2024, 11, 23) },
        { type: "text", input: "12", expected: null }, // valueAsNumber does not apply to text inputs
      ])("converts type=$type $input to $expected", ({ type, input, expected }) => {
        const setter = vi.fn<(value: number | null) => void>();
        const env = setupBinding(() => ({ valueAs: "number", getter: () => null, setter }));
        env.binding.onChange(inputEventOf(type, input));
        expect(setter).toHaveBeenCalledTimes(1);
        expect(setter).toHaveBeenCalledWith(expected);
      });
    });

    describe("valueAs=date", () => {
      test.each([
        { type: "date", input: "2024-12-31", expected: "2024-12-31T00:00:00.000Z" },
        { type: "date", input: "", expected: null },
        { type: "date", input: "2024-13-01", expected: null },
        { type: "month", input: "2024-12", expected: "2024-12-01T00:00:00.000Z" },
        { type: "week", input: "2024-W52", expected: "2024-12-23T00:00:00.000Z" },
        { type: "time", input: "23:59", expected: "1970-01-01T23:59:00.000Z" },
        { type: "time", input: "23:59:30", expected: "1970-01-01T23:59:30.000Z" },
        { type: "text", input: "2024-12-31", expected: null }, // valueAsDate does not apply to text inputs
      ])("converts type=$type $input to $expected (in UTC)", ({ type, input, expected }) => {
        const setter = vi.fn<(value: Date | null) => void>();
        const env = setupBinding(() => ({ valueAs: "date", getter: () => null, setter }));
        env.binding.onChange(inputEventOf(type, input));
        expect(setter).toHaveBeenCalledTimes(1);
        const value = setter.mock.calls[0][0];
        expect(isoOf(value)).toBe(expected);
        if (value !== null) {
          expect(Object.prototype.toString.call(value)).toBe("[object Date]");
        }
      });

      test("yields null for type=datetime-local", () => {
        const setter = vi.fn<(value: Date | null) => void>();
        const env = setupBinding(() => ({ valueAs: "date", type: "datetime-local", getter: () => null, setter }));
        env.binding.onChange(inputEventOf("datetime-local", "2024-12-31T23:59"));
        expect(setter).toHaveBeenCalledTimes(1);
        // PINNED(bug): valueAsDate does not apply to datetime-local inputs (HTML spec), so the setter always receives null although the docs show `type: "datetime-local"` with `valueAs: "date"` and the Config type accepts it. Expected: the setter receives a Date for 2024-12-31T23:59 (the fix must decide between local time and UTC; `valueAsNumber` above reads it as UTC). Flip this assertion when fixing.
        expect(isoOf(setter.mock.calls[0][0])).toBeNull();
      });
    });
  });

  describe("#onChange lifecycle", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("calls the setter first, then marks the field as intermediate, then calls the callback", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const order: string[] = [];
      env.binding.config = {
        getter: () => env.model.string,
        setter: (v) => {
          order.push(`setter(${v}) changed=${env.field.isChanged}`);
          env.model.string = v;
        },
        onChange: (e) => {
          order.push(
            `onChange(${e.currentTarget.value}) intermediate=${env.field.isIntermediate} model=${env.model.string}`
          );
        },
      };
      env.binding.onChange(inputEventOf("text", "world"));
      expect(order).toEqual(["setter(world) changed=false", "onChange(world) intermediate=true model=world"]);
    });

    test("passes the original event object to the callback", () => {
      const callback = vi.fn();
      const env = setupBinding(() => ({ getter: () => null, setter: () => {}, onChange: callback }));
      const event = inputEventOf("text", "world");
      env.binding.onChange(event);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toBe(event);
    });

    test("runs the setter and the callback in a single action so reactions fire once afterwards", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const runs: string[] = [];
      env.binding.config = {
        getter: () => env.model.string,
        setter: (v) => {
          env.model.string = v;
          env.model.stringOpt = v;
        },
        onChange: () => {
          runs.push(`callback:${env.model.string}`);
        },
      };
      const dispose = autorun(() => {
        runs.push(`reaction:${env.model.string}/${env.model.stringOpt}`);
      });
      try {
        env.binding.onChange(inputEventOf("text", "world"));
      } finally {
        dispose();
      }
      expect(runs).toEqual(["reaction:hello/null", "callback:world", "reaction:world/world"]);
    });

    test("marks even a complete value as intermediate without touching or reporting the field", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
      });
      env.binding.onChange(inputEventOf("text", "a complete value"));
      expect(env.field.isChanged).toBe(true);
      expect(env.field.isIntermediate).toBe(true);
      expect(env.field.isTouched).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
      expect(env.binding.props["aria-invalid"]).toBeUndefined();
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });

    test("finalizes after autoFinalizationDelayMs, restarting the delay on every change", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.configure({ autoFinalizationDelayMs: 100 });
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
      });

      env.binding.onChange(inputEventOf("text", "a"));
      vi.advanceTimersByTime(99);
      expect(env.field.isIntermediate).toBe(true);

      env.binding.onChange(inputEventOf("text", "ab"));
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
      expect(() => env.binding.onChange(inputEventOf("text", "world"))).toThrow("setter failed");
      expect(env.field.isChanged).toBe(false);
      expect(callback).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    test("propagates a callback error after the model and the field have been updated", () => {
      const env = setupBinding((model) => ({
        getter: () => model.string,
        setter: (v) => {
          model.string = v;
        },
        onChange: () => {
          throw new Error("callback failed");
        },
      }));
      expect(() => env.binding.onChange(inputEventOf("text", "world"))).toThrow("callback failed");
      expect(env.model.string).toBe("world");
      expect(env.field.isIntermediate).toBe(true);
    });

    test("uses the setter and the callback of the latest config", () => {
      const oldSetter = vi.fn();
      const oldCallback = vi.fn();
      const newSetter = vi.fn();
      const newCallback = vi.fn();
      const env = setupBinding(() => ({ getter: () => null, setter: oldSetter, onChange: oldCallback }));
      env.binding.config = { getter: () => null, setter: newSetter, onChange: newCallback };
      env.binding.onChange(inputEventOf("text", "world"));
      expect(oldSetter).not.toHaveBeenCalled();
      expect(oldCallback).not.toHaveBeenCalled();
      expect(newSetter).toHaveBeenCalledWith("world");
      expect(newCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("#onBlur lifecycle", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("finalizes an intermediate change immediately and cancels the auto-finalization", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
      });
      env.binding.onChange(inputEventOf("text", "world"));
      expect(vi.getTimerCount()).toBe(1);

      env.binding.onBlur(inputEventOf("text", "world"));
      expect(vi.getTimerCount()).toBe(0);
      expect(env.field.isIntermediate).toBe(false);
      expect(env.field.isChanged).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBe(true);
      expect(env.binding.props["aria-errormessage"]).toBe("invalid");
    });

    test("does not report errors or mark the field when nothing has been changed", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
      });
      env.binding.onFocus(inputEventOf("text", ""));
      env.binding.onBlur(inputEventOf("text", ""));
      expect(env.field.isChanged).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
      expect(env.binding.props["aria-invalid"]).toBeUndefined();
    });

    test("does not mark the field as touched", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.binding.onBlur(inputEventOf("text", ""));
      expect(env.field.isTouched).toBe(false);
    });

    test("calls the callback after finalizing", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const states: boolean[] = [];
      env.binding.config = {
        getter: () => null,
        setter: () => {},
        onBlur: () => states.push(env.field.isIntermediate),
      };
      env.binding.onChange(inputEventOf("text", "world"));
      env.binding.onBlur(inputEventOf("text", "world"));
      expect(states).toEqual([false]);
    });
  });

  describe("#onFocus lifecycle", () => {
    test("marks the field as touched without changing or reporting it, before calling the callback", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const states: boolean[] = [];
      env.binding.config = { getter: () => null, setter: () => {}, onFocus: () => states.push(env.field.isTouched) };
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
      });
      env.binding.onFocus(inputEventOf("text", ""));
      expect(states).toEqual([true]);
      expect(env.field.isTouched).toBe(true);
      expect(env.field.isChanged).toBe(false);
      expect(env.field.isErrorReported).toBeUndefined();
    });
  });

  describe("props", () => {
    test("exposes exactly the input attributes", () => {
      const env = setupBinding(() => ({ getter: () => "value", setter: () => {} }));
      expect(env.binding.props).toEqual({
        type: "text",
        value: "value",
        id: env.field.id,
        onChange: env.binding.onChange,
        onFocus: env.binding.onFocus,
        onBlur: env.binding.onBlur,
        "aria-invalid": undefined,
        "aria-errormessage": undefined,
      });
      expect(Object.keys(env.binding.props)).toEqual([
        "type",
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

    test("keeps aria attributes undefined until errors are reported, even if errors exist", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
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

    test("sets aria-invalid to true and aria-errormessage to the message text when reported with errors", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid1");
        builder.invalidate("string", "invalid2");
      });
      env.field.reportError();
      expect(env.binding.props["aria-invalid"]).toBe(true);
      // PINNED(quirk): aria-errormessage receives the message text, but WAI-ARIA defines it as an ID reference to the element containing the message (the form docs say "with error text"; the react docs say "linking to error text"). Decide: should the binding reference an error element id instead of embedding the text (flip to an element id, or no attribute when no such element is known)? The other assertions of the aria-errormessage text in this file (lifecycle and rendered error reporting tests) rely on the same behavior and must be updated along with it.
      expect(env.binding.props["aria-errormessage"]).toBe("invalid1, invalid2");
    });

    test("switches aria attributes back once the errors are resolved", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const key = Symbol();
      env.form.validator.updateErrors(key, (builder) => {
        builder.invalidate("string", "invalid");
      });
      env.field.reportError();
      expect(env.binding.props["aria-invalid"]).toBe(true);

      env.form.validator.updateErrors(key, () => {});
      expect(env.binding.props["aria-invalid"]).toBe(false);
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });

    test("clears the reported state when the field is reset", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
      });
      env.field.reportError();
      expect(env.binding.props["aria-invalid"]).toBe(true);

      env.field.reset();
      expect(env.binding.props["aria-invalid"]).toBeUndefined();
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });
  });

  describe("#onChange event source", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /** Create an event whose currentTarget and target are different input elements */
    const splitEventOf = (type: string, currentValue: string, targetValue: string) => {
      const currentTarget = document.createElement("input");
      currentTarget.type = type;
      currentTarget.value = currentValue;
      const target = document.createElement("input");
      target.type = type;
      target.value = targetValue;
      return { currentTarget, target } as unknown as React.ChangeEvent<HTMLInputElement>;
    };

    test("reads a string value from currentTarget rather than target", () => {
      const setter = vi.fn<(value: string) => void>();
      const env = setupBinding(() => ({ getter: () => null, setter }));
      env.binding.onChange(splitEventOf("text", "current", "target"));
      expect(setter).toHaveBeenCalledWith("current");
    });

    test("reads a number value from currentTarget rather than target", () => {
      const setter = vi.fn<(value: number | null) => void>();
      const env = setupBinding(() => ({ valueAs: "number", getter: () => null, setter }));
      env.binding.onChange(splitEventOf("number", "1", "2"));
      expect(setter).toHaveBeenCalledWith(1);
    });

    test("reads a date value from currentTarget rather than target", () => {
      const setter = vi.fn<(value: Date | null) => void>();
      const env = setupBinding(() => ({ valueAs: "date", getter: () => null, setter }));
      env.binding.onChange(splitEventOf("date", "2024-01-01", "2025-02-02"));
      expect(isoOf(setter.mock.calls[0][0])).toBe("2024-01-01T00:00:00.000Z");
    });

    test("converts according to the valueAs of the latest config", () => {
      const stringSetter = vi.fn<(value: string) => void>();
      const numberSetter = vi.fn<(value: number | null) => void>();
      const dateSetter = vi.fn<(value: Date | null) => void>();
      const env = setupBinding(() => ({ getter: () => null, setter: stringSetter }));

      env.binding.config = { valueAs: "number", getter: () => null, setter: numberSetter };
      env.binding.onChange(inputEventOf("number", "42"));
      expect(numberSetter).toHaveBeenCalledWith(42);

      env.binding.config = { valueAs: "date", getter: () => null, setter: dateSetter };
      env.binding.onChange(inputEventOf("date", "2024-12-31"));
      expect(isoOf(dateSetter.mock.calls[0][0])).toBe("2024-12-31T00:00:00.000Z");

      expect(stringSetter).not.toHaveBeenCalled();
    });

    test("yields null for a number that overflows to Infinity", () => {
      const setter = vi.fn<(value: number | null) => void>();
      const env = setupBinding(() => ({ valueAs: "number", getter: () => null, setter }));
      env.binding.onChange(inputEventOf("number", "1e309"));
      expect(setter).toHaveBeenCalledTimes(1);
      expect(setter).toHaveBeenCalledWith(null);
    });

    test("passes negative zero through as-is", () => {
      const setter = vi.fn<(value: number | null) => void>();
      const env = setupBinding(() => ({ valueAs: "number", getter: () => null, setter }));
      env.binding.onChange(inputEventOf("number", "-0"));
      expect(Object.is(setter.mock.calls[0][0], -0)).toBe(true);
    });
  });

  describe("handler batching", () => {
    let consoleWarn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      vi.useFakeTimers();
      consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      consoleWarn.mockRestore();
      vi.useRealTimers();
    });

    const setupObserved = (handler: "onChange" | "onFocus" | "onBlur") => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const mutate = () => {
        env.model.string = "a";
        env.model.stringOpt = "b";
      };
      env.binding.config = { getter: () => null, setter: () => {}, [handler]: mutate };
      const runs: string[] = [];
      const dispose = autorun(() => {
        runs.push(`${env.model.string}/${env.model.stringOpt}`);
      });
      return { env, runs, dispose };
    };

    test("runs the onChange callback inside an action", () => {
      const { env, runs, dispose } = setupObserved("onChange");
      try {
        env.binding.onChange(inputEventOf("text", "x"));
      } finally {
        dispose();
      }
      expect(runs).toEqual(["hello/null", "a/b"]);
      expect(consoleWarn).not.toHaveBeenCalled();
    });

    test.each(["onFocus", "onBlur"] as const)("runs the %s callback outside of an action", (handler) => {
      const { env, runs, dispose } = setupObserved(handler);
      try {
        env.binding[handler](inputEventOf("text", "x"));
      } finally {
        dispose();
      }
      // PINNED(quirk): unlike onChange, onFocus/onBlur are not wrapped in an action, so observable mutations in the user callback are not batched (the reaction sees the half-updated "a/null") and MobX warns about changing observed observables outside of actions. Decide: should onFocus/onBlur be actions like onChange? (flip to toEqual(["hello/null", "a/b"]) and not.toHaveBeenCalled())
      expect(runs).toEqual(["hello/null", "a/null", "a/b"]);
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining("without using an action is not allowed"));
    });
  });

  describe("handler callback errors", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("propagates an onFocus callback error after the field has been marked as touched", () => {
      const env = setupBinding(() => ({
        getter: () => null,
        setter: () => {},
        onFocus: () => {
          throw new Error("focus failed");
        },
      }));
      expect(() => env.binding.onFocus(inputEventOf("text", ""))).toThrow("focus failed");
      expect(env.field.isTouched).toBe(true);
    });

    test("propagates an onBlur callback error after the change has been finalized", () => {
      const env = setupBinding(() => ({
        getter: () => null,
        setter: () => {},
        onBlur: () => {
          throw new Error("blur failed");
        },
      }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
      });
      env.binding.onChange(inputEventOf("text", "world"));
      expect(() => env.binding.onBlur(inputEventOf("text", "world"))).toThrow("blur failed");
      expect(env.field.isIntermediate).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      expect(env.binding.props["aria-invalid"]).toBe(true);
    });
  });

  describe("errorMessages memoization", () => {
    test("does not notify observers when the reported state changes but the messages stay null", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.errorMessages);
      });
      try {
        env.field.reportError(); // isErrorReported: undefined -> false
        expect(env.field.isErrorReported).toBe(false);
        env.field.reset(); // isErrorReported: false -> undefined
        expect(env.field.isErrorReported).toBeUndefined();
      } finally {
        dispose();
      }
      expect(seen).toEqual([null]);
    });

    test("does not notify observers when another error source adds an identical message", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
      });
      env.field.reportError();
      const seen: unknown[] = [];
      const dispose = autorun(() => {
        seen.push(env.binding.errorMessages);
      });
      try {
        env.form.validator.updateErrors(Symbol(), (builder) => {
          builder.invalidate("string", "invalid");
        });
      } finally {
        dispose();
      }
      expect(seen).toEqual(["invalid"]);
    });
  });

  describe("props.id edge cases", () => {
    test("uses an empty id as-is instead of falling back to the field id", () => {
      const env = setupBinding(() => ({ id: "", getter: () => null, setter: () => {} }));
      // PINNED(quirk): `config.id ?? field.id` keeps an empty string, so the input renders id="" (an invalid id that also breaks label association). Decide: should an empty id fall back to the field id? (flip toBe("") -> toBe(env.field.id))
      expect(env.binding.props.id).toBe("");
    });

    test("falls back to the field id again when the custom id is removed from the config", () => {
      const env = setupBinding(() => ({ id: "custom", getter: () => null, setter: () => {} }));
      expect(env.binding.props.id).toBe("custom");
      env.binding.config = { getter: () => null, setter: () => {} };
      expect(env.binding.props.id).toBe(env.field.id);
    });
  });

  describe("#type edge cases", () => {
    test("deduces the type from valueAs when the configured type is an empty string", () => {
      const noop = () => {};
      expect(setupBinding(() => ({ type: "" as never, getter: () => null, setter: noop })).binding.type).toBe("text");
      expect(
        setupBinding(() => ({ valueAs: "number", type: "" as never, getter: () => null, setter: noop })).binding.type
      ).toBe("number");
    });

    test("falls back to text for an unknown valueAs at runtime", () => {
      const env = setupBinding(() => ({ valueAs: "boolean" as never, getter: () => null, setter: () => {} }));
      expect(env.binding.type).toBe("text");
    });

    test("treats an unknown valueAs as a string when converting at runtime", () => {
      const setter = vi.fn();
      const env = setupBinding(() => ({ valueAs: "boolean" as never, getter: () => null, setter }));
      vi.useFakeTimers();
      try {
        env.binding.onChange(inputEventOf("text", "true"));
      } finally {
        vi.useRealTimers();
      }
      expect(setter).toHaveBeenCalledWith("true");
    });
  });

  describe("error reporting lifecycle", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("shows aria attributes when the whole form reports errors without any interaction", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
      });
      env.form.reportError();
      expect(env.field.isTouched).toBe(false);
      expect(env.field.isChanged).toBe(false);
      expect(env.binding.props["aria-invalid"]).toBe(true);
      expect(env.binding.props["aria-errormessage"]).toBe("invalid");
    });

    test("keeps errors visible and live while typing again after they have been reported", () => {
      const env = setupBinding((model) => ({ getter: () => model.string, setter: (v) => (model.string = v) }));
      const key = Symbol();
      env.form.validator.updateErrors(key, (builder) => {
        builder.invalidate("string", "too short");
      });
      env.binding.onChange(inputEventOf("text", "a"));
      env.binding.onBlur(inputEventOf("text", "a"));
      expect(env.binding.props["aria-errormessage"]).toBe("too short");

      env.binding.onFocus(inputEventOf("text", "a"));
      env.binding.onChange(inputEventOf("text", "ab"));
      expect(env.field.isIntermediate).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBe(true);

      env.form.validator.updateErrors(key, (builder) => {
        builder.invalidate("string", "still too short");
      });
      expect(env.field.isIntermediate).toBe(true);
      expect(env.binding.props["aria-errormessage"]).toBe("still too short");

      env.form.validator.updateErrors(key, () => {});
      expect(env.field.isIntermediate).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBe(false);
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });

    test("starts over after a form reset: the pending finalization is cancelled and errors stay hidden until the next finalized change", () => {
      const env = setupBinding((model) => ({ getter: () => model.string, setter: (v) => (model.string = v) }));
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("string", "invalid");
      });

      env.binding.onFocus(inputEventOf("text", ""));
      env.binding.onChange(inputEventOf("text", "a"));
      expect(vi.getTimerCount()).toBe(1);

      env.form.reset();
      expect(vi.getTimerCount()).toBe(0);
      expect(env.field.isTouched).toBe(false);
      expect(env.field.isChanged).toBe(false);
      expect(env.model.string).toBe("a"); // the model is not rolled back
      expect(env.binding.props.value).toBe("a");

      vi.advanceTimersByTime(env.form.config.autoFinalizationDelayMs);
      expect(env.binding.props["aria-invalid"]).toBeUndefined();

      env.binding.onChange(inputEventOf("text", "ab"));
      expect(env.binding.props["aria-invalid"]).toBeUndefined();
      env.binding.onBlur(inputEventOf("text", "ab"));
      expect(env.binding.props["aria-invalid"]).toBe(true);
      expect(env.binding.props["aria-errormessage"]).toBe("invalid");
    });

    test("defers aria attributes until pending validation settles, then keeps showing stale errors while revalidating", () => {
      const env = setupBinding((model) => ({ getter: () => model.string, setter: (v) => (model.string = v) }));
      const delayMs = 100;
      const dispose = env.form.validator.addSyncHandler(
        (builder) => {
          if (env.model.string === "bad") {
            builder.invalidate("string", "bad value");
          }
        },
        { delayMs }
      );
      try {
        vi.advanceTimersByTime(delayMs);
        expect(env.form.validator.isValidating).toBe(false);

        env.binding.onChange(inputEventOf("text", "bad"));
        expect(env.form.validator.isValidating).toBe(true);
        env.binding.onBlur(inputEventOf("text", "bad"));
        expect(env.field.isChanged).toBe(true);
        expect(env.field.isIntermediate).toBe(false);
        expect(env.binding.props["aria-invalid"]).toBeUndefined();
        expect(env.binding.props["aria-errormessage"]).toBeUndefined();

        vi.advanceTimersByTime(delayMs);
        expect(env.binding.props["aria-invalid"]).toBe(true);
        expect(env.binding.props["aria-errormessage"]).toBe("bad value");

        env.binding.onChange(inputEventOf("text", "good"));
        expect(env.form.validator.isValidating).toBe(true);
        expect(env.binding.props["aria-invalid"]).toBe(true);
        expect(env.binding.props["aria-errormessage"]).toBe("bad value");

        vi.advanceTimersByTime(delayMs);
        expect(env.binding.props["aria-invalid"]).toBe(false);
        expect(env.binding.props["aria-errormessage"]).toBeUndefined();
      } finally {
        dispose();
      }
    });
  });

  describe("types", () => {
    test("handlers", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expectTypeOf(env.binding.config).toEqualTypeOf<InputBinding.Config>();
      expectTypeOf<InputBinding.Config["onFocus"]>().toEqualTypeOf<
        React.FocusEventHandler<HTMLInputElement> | undefined
      >();
      expectTypeOf<InputBinding.Config["onBlur"]>().toEqualTypeOf<
        React.FocusEventHandler<HTMLInputElement> | undefined
      >();
      expectTypeOf(env.binding.onChange).toEqualTypeOf<React.ChangeEventHandler<HTMLInputElement>>();
      expectTypeOf(env.binding.onFocus).toEqualTypeOf<React.FocusEventHandler<HTMLInputElement>>();
      expectTypeOf(env.binding.onBlur).toEqualTypeOf<React.FocusEventHandler<HTMLInputElement>>();
      expectTypeOf(InputBinding).constructorParameters.toEqualTypeOf<[FormField, InputBinding.Config]>();
    });

    test("props", () => {
      const env = setupBinding(() => ({ getter: () => null, setter: () => {} }));
      expectTypeOf(env.binding.props).toEqualTypeOf<{
        type: React.HTMLInputTypeAttribute;
        value: string | number | readonly string[];
        id: string;
        onChange: React.ChangeEventHandler<HTMLInputElement>;
        onFocus: React.FocusEventHandler<HTMLInputElement>;
        onBlur: React.FocusEventHandler<HTMLInputElement>;
        "aria-invalid": boolean | undefined;
        "aria-errormessage": string | undefined;
      }>();
      expectTypeOf(env.binding.value).toEqualTypeOf<string | number | readonly string[]>();
      expectTypeOf(env.binding.type).toEqualTypeOf<React.HTMLInputTypeAttribute>();
      expectTypeOf(env.binding.errorMessages).toEqualTypeOf<string | null>();
    });

    test("config variants", () => {
      type StringConfig = Extract<InputBinding.Config, { valueAs?: "string" }>;
      type NumberConfig = Extract<InputBinding.Config, { valueAs: "number" }>;
      type DateConfig = Extract<InputBinding.Config, { valueAs: "date" }>;
      type DateType = "date" | "datetime-local" | "month" | "time" | "week";

      expectTypeOf<StringConfig["getter"]>().toEqualTypeOf<() => string | null>();
      expectTypeOf<StringConfig["setter"]>().toEqualTypeOf<(value: string) => void>();
      expectTypeOf<NonNullable<StringConfig["type"]>>().toEqualTypeOf<
        "color" | "text" | "tel" | "url" | "email" | "password" | "search" | "number" | "range" | DateType
      >();

      expectTypeOf<NumberConfig["getter"]>().toEqualTypeOf<() => number | null>();
      expectTypeOf<NumberConfig["setter"]>().toEqualTypeOf<(value: number | null) => void>();
      expectTypeOf<NonNullable<NumberConfig["type"]>>().toEqualTypeOf<"number" | "range" | DateType>();

      expectTypeOf<DateConfig["getter"]>().toEqualTypeOf<() => string | null>();
      expectTypeOf<DateConfig["setter"]>().toEqualTypeOf<(value: Date | null) => void>();
      expectTypeOf<NonNullable<DateConfig["type"]>>().toEqualTypeOf<DateType>();

      expectTypeOf<InputBinding.Config["id"]>().toEqualTypeOf<string | undefined>();
      expectTypeOf<InputBinding.Config["onChange"]>().toEqualTypeOf<
        React.ChangeEventHandler<HTMLInputElement> | undefined
      >();
    });

    test("accepted and rejected config shapes", () => {
      expectTypeOf<{ getter: () => string; setter: (v: string | null) => void }>().toExtend<InputBinding.Config>();
      expectTypeOf<{
        valueAs: "string";
        type: "number";
        getter: () => string;
        setter: (v: string) => void;
      }>().toExtend<InputBinding.Config>();
      expectTypeOf<{
        valueAs: "number";
        type: "range";
        getter: () => number;
        setter: (v: number | null) => void;
      }>().toExtend<InputBinding.Config>();
      expectTypeOf<{
        valueAs: "date";
        type: "week";
        getter: () => null;
        setter: (v: Date | null) => void;
      }>().toExtend<InputBinding.Config>();

      // Unsupported element type
      expectTypeOf<{
        type: "checkbox";
        getter: () => string;
        setter: (v: string) => void;
      }>().not.toExtend<InputBinding.Config>();
      // Text-like type for a numeric/date value
      expectTypeOf<{
        valueAs: "number";
        type: "text";
        getter: () => number;
        setter: (v: number | null) => void;
      }>().not.toExtend<InputBinding.Config>();
      expectTypeOf<{
        valueAs: "date";
        type: "number";
        getter: () => string;
        setter: (v: Date | null) => void;
      }>().not.toExtend<InputBinding.Config>();
      // Getter returning the wrong type
      expectTypeOf<{
        valueAs: "number";
        getter: () => string;
        setter: (v: number | null) => void;
      }>().not.toExtend<InputBinding.Config>();
      expectTypeOf<{
        valueAs: "date";
        getter: () => Date;
        setter: (v: Date | null) => void;
      }>().not.toExtend<InputBinding.Config>();
      // Setter that cannot accept null
      expectTypeOf<{
        valueAs: "number";
        getter: () => number;
        setter: (v: number) => void;
      }>().not.toExtend<InputBinding.Config>();
      expectTypeOf<{
        valueAs: "date";
        getter: () => string;
        setter: (v: Date) => void;
      }>().not.toExtend<InputBinding.Config>();
      // Missing setter / unknown valueAs
      expectTypeOf<{ getter: () => string }>().not.toExtend<InputBinding.Config>();
      expectTypeOf<{
        valueAs: "boolean";
        getter: () => boolean;
        setter: (v: boolean) => void;
      }>().not.toExtend<InputBinding.Config>();
    });

    test("bindInput", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      expectTypeOf(form.bindInput).parameter(0).toEqualTypeOf<FormField.Name<SampleModel>>();
      expectTypeOf(
        form.bindInput("string", {
          getter: () => model.string,
          setter: (v) => {
            expectTypeOf(v).toEqualTypeOf<string>();
          },
        })
      ).toEqualTypeOf<InputBinding["props"]>();
      form.bindInput("numberOpt", {
        valueAs: "number",
        getter: () => model.numberOpt,
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<number | null>();
        },
      });
      form.bindInput("dateOpt", {
        valueAs: "date",
        getter: () => null,
        setter: (v) => {
          expectTypeOf(v).toEqualTypeOf<Date | null>();
        },
      });
      form.bindInput("string:suffix", { cacheKey: "key", getter: () => model.string, setter: () => {} });

      // @ts-expect-error unknown field name
      expectTypeOf(form.bindInput).toBeCallableWith("unknown", { getter: () => "", setter: () => {} });
    });

    test("bind without the extension", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      expectTypeOf(form.bind("string", InputBinding, { getter: () => model.string, setter: () => {} })).toEqualTypeOf<
        InputBinding["props"]
      >();

      // The config is required by the types, and binding without one crashes at runtime
      expect(() => {
        // @ts-expect-error the config is required
        form.bind("string", InputBinding);
      }).toThrow(TypeError);
    });
  });
});

describe("bindInput", () => {
  const setupEnv = (inputLabel: string) => {
    const model = new SampleModel();

    render(<SampleComponent model={model} />);
    const input = screen.getByLabelText(inputLabel) as HTMLInputElement;

    return {
      model,
      input,
      async changeInput(value: any, type = true) {
        await userEvent.clear(input);
        if (type && value) {
          await userEvent.type(input, value);
        }
        if (!type) {
          fireEvent.focus(input);
          fireEvent.change(input, { target: { value } });
          fireEvent.blur(input);
        }
      },
    };
  };

  describe("valueAs=string", () => {
    test("works with a required field", async () => {
      const env = setupEnv("string");

      expect(env.model.string).toBe("hello");
      expect(env.input).toHaveDisplayValue("hello");
      await env.changeInput("world");
      expect(env.model.string).toBe("world");
      expect(env.input).toHaveDisplayValue("world");
      await env.changeInput("");
      expect(env.model.string).toBe("");
      expect(env.input).toHaveDisplayValue("");
    });

    test("works with an optional field", async () => {
      const env = setupEnv("stringOpt");

      expect(env.model.stringOpt).toBe(null);
      expect(env.input).toHaveDisplayValue("");
      await env.changeInput("world");
      expect(env.model.stringOpt).toBe("world");
      expect(env.input).toHaveDisplayValue("world");
      await env.changeInput("");
      expect(env.model.stringOpt).toBe(null);
      expect(env.input).toHaveDisplayValue("");
    });
  });

  describe("valueAs=number", () => {
    test("works with a required field", async () => {
      const env = setupEnv("number");

      expect(env.model.number).toBe(123);
      expect(env.input).toHaveDisplayValue("123");
      await env.changeInput("456");
      expect(env.model.number).toBe(456);
      expect(env.input).toHaveDisplayValue("456");
      await env.changeInput("");
      expect(env.model.number).toBe(0);
      expect(env.input).toHaveDisplayValue("0");
    });

    test("works with an optional field", async () => {
      const env = setupEnv("numberOpt");

      expect(env.model.numberOpt).toBe(null);
      expect(env.input).toHaveDisplayValue("");
      await env.changeInput("456");
      expect(env.model.numberOpt).toBe(456);
      expect(env.input).toHaveDisplayValue("456");
      await env.changeInput("");
      expect(env.model.numberOpt).toBe(null);
      expect(env.input).toHaveDisplayValue("");
    });
  });

  describe("valueAs=date", () => {
    const toDisplayValue = (date: Date | null) => date?.toISOString().split("T")[0] ?? null;

    test("works with a required field", async () => {
      const env = setupEnv("date");

      expect(toDisplayValue(env.model.date)).toBe("2024-12-31");
      expect(env.input).toHaveDisplayValue("2024-12-31");
      await env.changeInput("2021-11-22", false); // NOTE: Fails with userEvent, not sure why...
      expect(toDisplayValue(env.model.date)).toBe("2021-11-22");
      expect(env.input).toHaveDisplayValue("2021-11-22");
      await env.changeInput("");
      expect(toDisplayValue(env.model.date)).toBe("1970-01-01");
      expect(env.input).toHaveDisplayValue("1970-01-01");
    });

    test("works with an optional field", async () => {
      const env = setupEnv("dateOpt");

      expect(toDisplayValue(env.model.dateOpt)).toBe(null);
      expect(env.input).toHaveDisplayValue("");
      await env.changeInput("2021-11-22");
      expect(toDisplayValue(env.model.dateOpt)).toBe("2021-11-22");
      expect(env.input).toHaveDisplayValue("2021-11-22");
      await env.changeInput("");
      expect(toDisplayValue(env.model.dateOpt)).toBe(null);
      expect(env.input).toHaveDisplayValue("");
    });

    test("works with type=time as documented", () => {
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const model = new ExtraModel();
      const TimeComponent = observer(() => {
        const form = Form.get(model);
        return (
          <input
            aria-label="time"
            {...form.bindInput("time", {
              type: "time",
              valueAs: "date",
              getter: () => model.time?.toISOString().slice(11, 16) ?? null,
              setter: (v) => (model.time = v),
            })}
          />
        );
      });
      render(<TimeComponent />);
      const input = screen.getByLabelText("time") as HTMLInputElement;

      expect(input.type).toBe("time");
      expect(input).toHaveDisplayValue("");
      fireEvent.change(input, { target: { value: "08:30" } });
      expect(isoOf(model.time)).toBe("1970-01-01T08:30:00.000Z");
      expect(input).toHaveDisplayValue("08:30");
    });

    test("clears the model for type=datetime-local as documented", () => {
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const model = new ExtraModel();
      runInAction(() => {
        model.time = new Date("2024-12-31T23:59:00.000Z");
      });
      const DateTimeComponent = observer(() => {
        const form = Form.get(model);
        return (
          <input
            aria-label="datetime"
            {...form.bindInput("time", {
              type: "datetime-local",
              valueAs: "date",
              getter: () => model.time?.toISOString().slice(0, 16) ?? null,
              setter: (v) => (model.time = v),
            })}
          />
        );
      });
      render(<DateTimeComponent />);
      const input = screen.getByLabelText("datetime") as HTMLInputElement;

      expect(input).toHaveDisplayValue("2024-12-31T23:59");
      fireEvent.change(input, { target: { value: "2025-01-02T03:04" } });
      // PINNED(bug): valueAsDate does not apply to datetime-local inputs, so the documented example writes null to the model and the input is emptied. Expected: the model holds the entered date-time and the input keeps displaying it. Flip these assertions when fixing.
      expect(model.time).toBeNull();
      expect(input).toHaveDisplayValue("");
    });
  });

  describe("rendered attributes", () => {
    test("renders the deduced type and the field id without aria attributes", () => {
      const env = setupEnv("string");
      const form = Form.get(env.model);
      const expectations = [
        { label: "string", type: "text" },
        { label: "number", type: "number" },
        { label: "date", type: "date" },
      ] as const;
      for (const { label, type } of expectations) {
        const input = screen.getByLabelText(label) as HTMLInputElement;
        expect(input.type).toBe(type);
        expect(input.id).toBe(form.getField(label).id);
        expect(input).not.toHaveAttribute("aria-invalid");
        expect(input).not.toHaveAttribute("aria-errormessage");
      }
    });

    test("renders a number value of 0 rather than an empty input", () => {
      const env = setupEnv("number");
      act(() => {
        runInAction(() => {
          env.model.number = 0;
        });
      });
      expect(env.input).toHaveDisplayValue("0");
    });

    test("marks the field as touched on focus", () => {
      const env = setupEnv("string");
      const field = Form.get(env.model).getField("string");
      expect(field.isTouched).toBe(false);
      fireEvent.focus(env.input);
      expect(field.isTouched).toBe(true);
    });
  });

  describe("error reporting", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("does not report errors while typing, but reports them on blur", () => {
      const env = setupEnv("string");
      const form = Form.get(env.model);
      act(() => {
        form.validator.updateErrors(Symbol(), (builder) => {
          builder.invalidate("string", "invalid");
        });
      });

      fireEvent.focus(env.input);
      fireEvent.change(env.input, { target: { value: "world" } });
      expect(env.model.string).toBe("world");
      expect(env.input).not.toHaveAttribute("aria-invalid");
      expect(env.input).not.toHaveAttribute("aria-errormessage");

      fireEvent.blur(env.input);
      expect(env.input).toHaveAttribute("aria-invalid", "true");
      expect(env.input).toHaveAttribute("aria-errormessage", "invalid");
    });

    test("reports errors after the auto-finalization delay without blurring", () => {
      const env = setupEnv("string");
      const form = Form.get(env.model);
      act(() => {
        form.validator.updateErrors(Symbol(), (builder) => {
          builder.invalidate("string", "invalid");
        });
      });

      fireEvent.change(env.input, { target: { value: "world" } });
      act(() => {
        vi.advanceTimersByTime(form.config.autoFinalizationDelayMs - 1);
      });
      expect(env.input).not.toHaveAttribute("aria-invalid");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(env.input).toHaveAttribute("aria-invalid", "true");
      expect(env.input).toHaveAttribute("aria-errormessage", "invalid");
    });

    test("renders aria-invalid=false once a change without errors is finalized", () => {
      const env = setupEnv("string");
      fireEvent.change(env.input, { target: { value: "world" } });
      fireEvent.blur(env.input);
      expect(env.input).toHaveAttribute("aria-invalid", "false");
      expect(env.input).not.toHaveAttribute("aria-errormessage");
    });

    test("removes the aria attributes when the form is reset", () => {
      const env = setupEnv("string");
      const form = Form.get(env.model);
      act(() => {
        form.validator.updateErrors(Symbol(), (builder) => {
          builder.invalidate("string", "invalid");
        });
      });
      fireEvent.change(env.input, { target: { value: "world" } });
      fireEvent.blur(env.input);
      expect(env.input).toHaveAttribute("aria-invalid", "true");

      act(() => {
        form.reset();
      });
      expect(env.input).not.toHaveAttribute("aria-invalid");
      expect(env.input).not.toHaveAttribute("aria-errormessage");
    });
  });

  describe("label association", () => {
    const LabeledComponent: React.FC<{ model: SampleModel; inputId?: string; htmlFor?: string }> = observer(
      ({ model, inputId, htmlFor }) => {
        const form = Form.get(model);
        return (
          <>
            <label {...form.bindLabel(["string"], { htmlFor })}>String label</label>
            <input
              data-testid="input"
              {...form.bindInput("string", {
                id: inputId,
                getter: () => model.string,
                setter: (v) => (model.string = v),
              })}
            />
          </>
        );
      }
    );

    test("associates the label with the input through the field id", () => {
      render(<LabeledComponent model={new SampleModel()} />);
      expect(screen.getByLabelText("String label")).toBe(screen.getByTestId("input"));
    });

    test("associates the label with a custom input id when htmlFor is passed explicitly", () => {
      render(<LabeledComponent model={new SampleModel()} inputId="custom-id" htmlFor="custom-id" />);
      expect(screen.getByLabelText("String label")).toBe(screen.getByTestId("input"));
    });

    test("does not follow a custom input id on its own", () => {
      render(<LabeledComponent model={new SampleModel()} inputId="custom-id" />);
      expect(screen.getByTestId("input").id).toBe("custom-id");
      // PINNED(quirk): bindLabel always points htmlFor at the field id, so overriding the input id via `id` silently breaks the label association unless the same id is also passed as `htmlFor`. Decide: should a custom input id be shared with the field (and thus the label)?
      expect(screen.queryByLabelText("String label")).toBeNull();
    });
  });

  describe("config updates across renders", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const SuffixComponent: React.FC<{
      model: SampleModel;
      suffix: string;
      onRender?: (props: InputBinding["props"]) => void;
    }> = observer(({ model, suffix, onRender }) => {
      const form = Form.get(model);
      const props = form.bindInput("string", {
        getter: () => `${model.string}${suffix}`,
        setter: (v) => (model.string = `${v}${suffix}`),
      });
      onRender?.(props);
      return <input aria-label="suffix" {...props} />;
    });

    test("uses the setter of the latest render", () => {
      const model = new SampleModel();
      const { rerender } = render(<SuffixComponent model={model} suffix="A" />);
      rerender(<SuffixComponent model={model} suffix="B" />);
      fireEvent.change(screen.getByLabelText("suffix"), { target: { value: "x" } });
      expect(model.string).toBe("xB");
    });

    test("keeps the same handler functions across renders", () => {
      const model = new SampleModel();
      const renders: InputBinding["props"][] = [];
      const { rerender } = render(<SuffixComponent model={model} suffix="A" onRender={(p) => renders.push(p)} />);
      rerender(<SuffixComponent model={model} suffix="B" onRender={(p) => renders.push(p)} />);
      expect(renders).toHaveLength(2);
      expect(renders[1].onChange).toBe(renders[0].onChange);
      expect(renders[1].onFocus).toBe(renders[0].onFocus);
      expect(renders[1].onBlur).toBe(renders[0].onBlur);
      expect(renders[1].id).toBe(renders[0].id);
    });

    test("uses the getter of the latest render when only a non-observable input of the getter changes", () => {
      const model = new SampleModel();
      const { rerender } = render(<SuffixComponent model={model} suffix="A" />);
      const input = screen.getByLabelText("suffix");
      expect(input).toHaveDisplayValue("helloA");

      rerender(<SuffixComponent model={model} suffix="B" />);
      expect(input).toHaveDisplayValue("helloB");

      act(() => {
        runInAction(() => {
          model.string = "world";
        });
      });
      expect(input).toHaveDisplayValue("worldB");
    });
  });

  describe("binding cache", () => {
    test("reuses the binding for repeated calls with the same valueAs and cacheKey", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const first = form.bindInput("string", { getter: () => model.string, setter: () => {} });
      const second = form.bindInput("string", { getter: () => model.string, setter: () => {} });
      expect(second).not.toBe(first);
      expect(second.onChange).toBe(first.onChange);
    });

    test("creates separate bindings for an omitted and an explicit valueAs=string", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const implicit = form.bindInput("string", { getter: () => model.string, setter: () => {} });
      const explicit = form.bindInput("string", { valueAs: "string", getter: () => model.string, setter: () => {} });
      // PINNED(quirk): the cache key is `${valueAs}:${cacheKey}`, so an omitted valueAs ("undefined") and the equivalent explicit "string" create two binding instances for the same field. Decide: should valueAs be normalized to "string" before building the cache key?
      expect(explicit.onChange).not.toBe(implicit.onChange);
    });

    test("creates separate bindings per valueAs and cacheKey that share the field id", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const asString = form.bindInput("string", { getter: () => model.string, setter: () => {} });
      const asNumber = form.bindInput("string", { valueAs: "number", getter: () => null, setter: () => {} });
      const keyed = form.bindInput("string", { cacheKey: "other", getter: () => model.string, setter: () => {} });
      expect(asNumber.onChange).not.toBe(asString.onChange);
      expect(keyed.onChange).not.toBe(asString.onChange);
      expect(asNumber.type).toBe("number");
      // PINNED(quirk): every binding of a field gets the same default id, so rendering two inputs for one field (e.g. with distinct cacheKeys) produces duplicate DOM ids. Decide: should bindings with distinct cache keys derive distinct ids?
      expect(keyed.id).toBe(asString.id);
      expect(asNumber.id).toBe(asString.id);
    });
  });

  describe("IME composition", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("calls the setter with the in-progress composition text", () => {
      const model = new SampleModel();
      const setter = vi.fn((v: string) => (model.string = v));
      const ImeComponent = observer(() => {
        const form = Form.get(model);
        return <input aria-label="ime" {...form.bindInput("string", { getter: () => model.string, setter })} />;
      });
      render(<ImeComponent />);
      const input = screen.getByLabelText("ime") as HTMLInputElement;

      fireEvent.compositionStart(input);
      // Browsers dispatch input events (not change events) while composing
      fireEvent.input(input, { target: { value: "hellok" } });
      // PINNED(quirk): the binding ignores composition events, so the setter (and validation) sees the uncommitted IME text mid-composition. Decide: should the setter be deferred until compositionend?
      expect(setter).toHaveBeenCalledTimes(1);
      expect(model.string).toBe("hellok");
      expect(Form.get(model).getField("string").isIntermediate).toBe(true);

      fireEvent.compositionEnd(input);
      expect(setter).toHaveBeenCalledTimes(1);
    });
  });

  describe("number editing", () => {
    test("drops a leading minus sign when the setter coerces null to a default", async () => {
      const env = setupEnv("number");
      await userEvent.clear(env.input);
      expect(env.input).toHaveDisplayValue("0"); // `v ?? 0` never lets the input be empty
      await userEvent.type(env.input, "-5");
      // PINNED(quirk): typing "-" leaves the number input's value "" (not a number yet), so the setter receives null, the documented pattern `v ?? 0` resets the input to "0", and the next keystroke yields 5 instead of -5. Decide: should the binding avoid overwriting the element while a change is intermediate (or expose the raw text) so that negative numbers can be typed?
      expect(env.model.number).toBe(5);
      expect(env.input).toHaveDisplayValue("5");
    });

    test("accepts negative and decimal numbers when the setter keeps null", async () => {
      const env = setupEnv("numberOpt");
      await userEvent.type(env.input, "-5");
      expect(env.model.numberOpt).toBe(-5);
      expect(env.input).toHaveDisplayValue("-5");

      await userEvent.clear(env.input);
      await userEvent.type(env.input, "1.5");
      expect(env.model.numberOpt).toBe(1.5);
      expect(env.input).toHaveDisplayValue("1.5");
    });

    test("renders an empty input and triggers a React warning when the getter returns NaN", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const model = new SampleModel();
        runInAction(() => {
          model.number = NaN;
        });
        render(<SampleComponent model={model} />);
        expect(screen.getByLabelText("number")).toHaveDisplayValue("");
        // PINNED(quirk): NaN is passed through as the `value` prop, which React reports as an error. Decide: should the binding map NaN to "" before rendering?
        expect(consoleError.mock.calls.some(([message]) => String(message).includes("Received NaN"))).toBe(true);
      } finally {
        consoleError.mockRestore();
      }
    });

    test("displays the range midpoint while the model value is still null", () => {
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const model = new ExtraModel();
      const RangeComponent = observer(() => {
        const form = Form.get(model);
        return (
          <input
            aria-label="range"
            {...form.bindInput("range", {
              valueAs: "number",
              type: "range",
              getter: () => model.range,
              setter: (v) => (model.range = v),
            })}
          />
        );
      });
      render(<RangeComponent />);
      const input = screen.getByLabelText("range") as HTMLInputElement;

      // PINNED(quirk): a range input cannot be empty, so a null model value is displayed as the midpoint while the model stays null until the user moves the slider. Decide: should `type: "range"` require a non-nullable getter?
      expect(input.value).toBe("50");
      expect(model.range).toBeNull();

      fireEvent.change(input, { target: { value: "20" } });
      expect(model.range).toBe(20);
      expect(input.value).toBe("20");
    });
  });

  describe("multiple inputs for one field", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const TwinComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
      const form = Form.get(model);
      return (
        <>
          <input
            aria-label="first"
            {...form.bindInput("string", {
              cacheKey: "first",
              getter: () => model.string,
              setter: (v) => (model.string = v),
            })}
          />
          <input
            aria-label="second"
            {...form.bindInput("string", {
              cacheKey: "second",
              getter: () => model.string,
              setter: (v) => (model.string = v),
            })}
          />
        </>
      );
    });

    test("shares the model value and the field state between the inputs", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const field = form.getField("string");
      render(<TwinComponent model={model} />);
      const first = screen.getByLabelText("first");
      const second = screen.getByLabelText("second");
      act(() => {
        form.validator.updateErrors(Symbol(), (builder) => {
          builder.invalidate("string", "invalid");
        });
      });

      fireEvent.focus(first);
      fireEvent.change(first, { target: { value: "world" } });
      expect(second).toHaveDisplayValue("world");
      expect(field.isIntermediate).toBe(true);

      // Blurring the other input finalizes the change made through the first one
      fireEvent.blur(second);
      expect(field.isIntermediate).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      for (const input of [first, second]) {
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(input).toHaveAttribute("aria-errormessage", "invalid");
      }
    });
  });

  describe("bind without the extension", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("works the same as bindInput", () => {
      const model = new SampleModel();
      const PlainComponent = observer(() => {
        const form = Form.get(model);
        return (
          <input
            aria-label="plain"
            {...form.bind("numberOpt", InputBinding, {
              valueAs: "number",
              getter: () => model.numberOpt,
              setter: (v) => (model.numberOpt = v),
            })}
          />
        );
      });
      render(<PlainComponent />);
      const input = screen.getByLabelText("plain") as HTMLInputElement;
      expect(input.type).toBe("number");
      expect(input.id).toBe(Form.get(model).getField("numberOpt").id);

      fireEvent.change(input, { target: { value: "42" } });
      expect(model.numberOpt).toBe(42);
      expect(input).toHaveDisplayValue("42");
      fireEvent.blur(input);
      expect(input).toHaveAttribute("aria-invalid", "false");
    });

    test("creates a binding separate from the one created by bindInput with the same config", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const config = { getter: () => model.string, setter: () => {} };
      const viaBind = form.bind("string", InputBinding, config);
      const viaExtension = form.bindInput("string", config);
      // PINNED(quirk): bindInput rewrites the cache key to `${valueAs}:${cacheKey}` while Form#bind uses the plain cacheKey, so the two call styles the docs present as equivalent never share a binding instance. Decide: should both styles resolve to the same cache entry? (flip not.toBe -> toBe)
      expect(viaExtension.onChange).not.toBe(viaBind.onChange);
      expect(viaExtension.id).toBe(viaBind.id);
    });
  });
});
