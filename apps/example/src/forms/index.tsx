"use client";

import "@mobx-sentinel/react/extension";

import { observer } from "mobx-react-lite";
import { Form } from "@mobx-sentinel/form";
import { useFormHandler } from "@mobx-sentinel/react";
import { Other, Sample, SampleEnum, SampleOption } from "@/models";
import { useEffect, useState } from "react";
import { action } from "mobx";
import { Debugger } from "./Debugger";

export const DefaultSampleForm = observer(() => {
  const [sample] = useState(() => new Sample());

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  if (!isClient) return null;

  return (
    <div className="grid">
      <SampleForm model={sample} />
      <Debugger model={sample} />
    </div>
  );
});

export const SampleForm: React.FC<{ model: Sample }> = observer(({ model }) => {
  const form = Form.get(model);

  useFormHandler(form, "submit", async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return true;
  });

  return (
    <div>
      <fieldset>
        <label {...form.bindLabel(["text"])}>Text input</label>
        <input
          {...form.bindInput("text", {
            getter: () => model.text,
            setter: (v) => (model.text = v),
          })}
        />
        {Array.from(form.getErrors("text"), (error, i) => (
          <small key={i}>{error}</small>
        ))}
      </fieldset>

      <fieldset>
        <label {...form.bindLabel(["number", "date"])}>Number &amp; Date input</label>
        <input
          {...form.bindInput("number", {
            valueAs: "number",
            getter: () => model.number,
            setter: (v) => (model.number = v),
          })}
        />
        {Array.from(form.getErrors("number"), (error, i) => (
          <small key={i}>{error}</small>
        ))}
        <input
          {...form.bindInput("date", {
            valueAs: "date",
            getter: () => model.date?.toISOString().split("T")[0] ?? null,
            setter: (v) => (model.date = v),
          })}
        />
        {Array.from(form.getErrors("date"), (error, i) => (
          <small key={i}>{error}</small>
        ))}
      </fieldset>

      <fieldset>
        <label {...form.bindLabel(["bool"])}>Checkbox</label>
        <input
          {...form.bindCheckBox("bool", {
            getter: () => model.bool,
            setter: (v) => (model.bool = v),
          })}
        />
        {Array.from(form.getErrors("bool"), (error, i) => (
          <small key={i}>{error}</small>
        ))}
      </fieldset>

      <fieldset>
        <label {...form.bindLabel(["enum"])}>Radio group</label>
        {(() => {
          const bind = form.bindRadioButton("enum", {
            getter: () => model.enum,
            setter: (v) => (model.enum = v ? (v as SampleEnum) : null),
          });
          return Object.values(SampleEnum).map((v) => (
            <label key={v}>
              <input {...bind(v)} /> {v}
            </label>
          ));
        })()}
        {Array.from(form.getErrors("enum"), (error, i) => (
          <small key={i}>{error}</small>
        ))}
      </fieldset>

      <fieldset>
        <label {...form.bindLabel(["option"])}>Select box</label>
        <select
          {...form.bindSelectBox("option", {
            getter: () => model.option,
            setter: (v) => (model.option = v),
          })}
        >
          {SampleOption.all.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
        {Array.from(form.getErrors("option"), (error, i) => (
          <small key={i}>{error}</small>
        ))}
      </fieldset>

      <fieldset>
        <label {...form.bindLabel(["multiOption"])}>Multi select box</label>
        <select
          {...form.bindSelectBox("multiOption", {
            multiple: true,
            getter: () => model.multiOption,
            setter: (v) => (model.multiOption = v),
          })}
        >
          {SampleOption.all.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
        {Array.from(form.getErrors("multiOption"), (error, i) => (
          <small key={i}>{error}</small>
        ))}
      </fieldset>

      <hr />

      <fieldset>
        <label {...form.bindLabel(["nested"])}>Nested form</label>
        <OtherForm model={model.nested} />
      </fieldset>

      <hr />

      <fieldset>
        <label {...form.bindLabel(["array"])}>Dynamic form</label>
        {model.array.map((item, i) => (
          <OtherForm key={i} model={item} onDelete={action(() => model.array.splice(i, 1))} />
        ))}
        <div>
          <button className="secondary" onClick={action(() => model.array.push(new Other()))}>
            Add a new form
          </button>
        </div>
        {Array.from(form.getErrors("array"), (error, i) => (
          <small key={i}>{error}</small>
        ))}
      </fieldset>

      <hr />

      <button {...form.bindSubmitButton()}>Submit</button>
    </div>
  );
});

export const OtherForm: React.FC<{ model: Other; onDelete?: () => void }> = observer(({ model, onDelete }) => {
  const form = Form.get(model);

  return (
    <fieldset>
      <div role="group">
        <input
          {...form.bindInput("other", {
            getter: () => model.other,
            setter: (v) => (model.other = v),
          })}
        />
        {onDelete && (
          <button className="outline secondary" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
      {Array.from(form.getErrors("other"), (error, i) => (
        <small key={i}>{error}</small>
      ))}
    </fieldset>
  );
});
