import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, observable } from "mobx";
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
  });
});

suite("bindRadioButton", () => {
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
});
