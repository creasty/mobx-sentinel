import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, observable } from "mobx";
import { Form } from "@mobx-form/core";
import "./extension";
import { observer } from "mobx-react-lite";

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

function setupEnv(inputLabel: string) {
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
}

describe("SelectBoxBinding", () => {
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
  });
});
