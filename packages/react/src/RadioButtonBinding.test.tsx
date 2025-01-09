import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, observable } from "mobx";
import { Form } from "@form-model/core";
import "./extension";
import { observer } from "mobx-react-lite";

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

  const bindRadioButton1 = form.bindRadioButtonFactory("enum", {
    getter: () => model.enum,
    setter: (v) => (model.enum = v ? (v as SampleEnum) : SampleEnum.ZULU),
  });
  const bindRadioButton2 = form.bindRadioButtonFactory("enumOpt", {
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
