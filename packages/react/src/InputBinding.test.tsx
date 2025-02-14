import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, observable } from "mobx";
import { Form, FormField } from "@form-model/core";
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
      fieldName: "test",
      formErrors: new Map(),
      getFinalizationDelayMs: () => form.config.intermediateValidationDelayMs,
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
});

suite("bindInput", () => {
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
  });
});
