import "@mobx-sentinel/react/extension";
import { action } from "mobx";
import { observer } from "mobx-react-lite";
import { Form } from "@mobx-sentinel/form";
import { useFormHandler } from "@mobx-sentinel/react";
import { Other, Sample, SampleEnum, SampleOption } from "@/main-example/models";

export const SampleForm: React.FC<{ model: Sample }> = observer(({ model }) => {
  const form = Form.get(model);

  useFormHandler(form, "submit", async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return true;
  });

  return (
    <div>
      <div className="input-layout">
        <label {...form.bindLabel(["text"])}>Text input</label>
        <input
          {...form.bindInput("text", {
            getter: () => model.text,
            setter: (v) => (model.text = v),
          })}
        />
        <ErrorText errors={form.getErrors("text")} />
      </div>

      <div className="input-layout">
        <label {...form.bindLabel(["number", "date"])}>Number &amp; Date input</label>
        <input
          {...form.bindInput("number", {
            valueAs: "number",
            getter: () => model.number,
            setter: (v) => (model.number = v),
          })}
        />
        <ErrorText errors={form.getErrors("number")} />
        <input
          {...form.bindInput("date", {
            valueAs: "date",
            getter: () => model.date?.toISOString().split("T")[0] ?? null,
            setter: (v) => (model.date = v),
          })}
        />
        <ErrorText errors={form.getErrors("date")} />
      </div>

      <div className="input-layout">
        <label {...form.bindLabel(["bool"])}>Checkbox</label>
        <label>
          <input
            {...form.bindCheckBox("bool", {
              getter: () => model.bool,
              setter: (v) => (model.bool = v),
            })}
          />
          Yes
        </label>
        <ErrorText errors={form.getErrors("bool")} />
      </div>

      <fieldset>
        <label {...form.bindLabel(["enum"])}>Radio group</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 24px" }}>
          {(() => {
            const bind = form.bindRadioButton("enum", {
              getter: () => model.enum,
              setter: (v) => (model.enum = v ? (v as SampleEnum) : null),
            });
            return Object.values(SampleEnum).map((v, i) => (
              <label key={v}>
                <input {...bind(v, { id: i === 0 })} /> {v}
              </label>
            ));
          })()}
        </div>
        <ErrorText errors={form.getErrors("enum")} />
      </fieldset>

      <div className="input-layout">
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
        <ErrorText errors={form.getErrors("option")} />
      </div>

      <div className="input-layout">
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
        <ErrorText errors={form.getErrors("multiOption")} />
      </div>

      <hr />

      <div className="input-layout">
        <h3 {...form.bindLabel(["nested"])}>Nested form</h3>
        <OtherForm model={model.nested} />
      </div>

      <hr />

      <div className="input-layout">
        <h3 {...form.bindLabel(["array"])}>Dynamic form</h3>
        {model.array.map((item, i) => (
          <OtherForm key={i} model={item} onDelete={action(() => model.array.splice(i, 1))} />
        ))}
        <div className="grid">
          <button className="secondary" onClick={action(() => model.array.push(new Other()))}>
            Add a new form
          </button>
        </div>
        <ErrorText errors={form.getErrors("array")} />
      </div>

      <hr />

      <div className="grid">
        <button className="outline secondary" onClick={() => form.reset()}>
          Reset
        </button>
        <button {...form.bindSubmitButton()}>Submit</button>
      </div>

      <p style={{ marginTop: 16, color: "var(--pico-muted-color)" }}>
        <small>
          <i>
            * Reset only updates Watcher’s change state and Form’s error reporting state. It does not update the model
            itself.
          </i>
        </small>
      </p>
    </div>
  );
});

export const OtherForm: React.FC<{ model: Other; onDelete?: () => void }> = observer(({ model, onDelete }) => {
  const form = Form.get(model);

  return (
    <fieldset className="sub-form" data-deletable={!!onDelete}>
      <div>
        <label {...form.bindLabel(["other"])}>Other</label>
        <input
          {...form.bindInput("other", {
            getter: () => model.other,
            setter: (v) => (model.other = v),
          })}
        />
        <ErrorText errors={form.getErrors("other")} />
      </div>
      {onDelete && (
        <button className="outline secondary" onClick={onDelete}>
          Delete
        </button>
      )}
    </fieldset>
  );
});

const ErrorText: React.FC<{ errors: ReadonlySet<string> }> = observer(({ errors }) => {
  return (
    <>
      {Array.from(errors, (error, i) => (
        <small key={i}>{error}</small>
      ))}
    </>
  );
});
