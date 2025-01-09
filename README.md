# form-model

```sh
npm install --save @form-model/core
npm install --save @form-model/react # Optional
```

## Overview

```typescript
// With @form-model/core

enum SampleEnum { ... }

class Sample implements FormDelegate<Sample> {
  @observable stringField: string = "hello";
  @observable numberField: number | null = null;
  @observable dateField: Date | null = null;
  @observable boolField: boolean = false;
  @observable enumField: SampleEnum | null = null;
  @observable optionField: string = SAMPLE_OPTIONS[0].code;
  @observable multiOptionField: string[] = [];

  @observable nested = new Other();
  @observable array = [new Other()];

  [FormDelegate.connect]() {
    return [this.nested, this.array];
  }

  async [FormDelegate.validate]() {
    return { ... };
  }

  async [FormDelegate.submit](signal: AbortSignal) {
    ...
  }
}

class Other implements FormDelegate<Other> {
  @observable otherField: string = "world";

  async [FormDelegate.validate]() {
    return { ... };
  }
}
```

```tsx
// With @form-model/react

const SampleForm: React.FC<{ model: Sample }> = ({ model }) => {
  const form = Form.get(model);

  return (
    <form>
      {/* Text input */}
      <input
        {...form.bindInput("stringField", {
          getter: () => model.stringField,
          setter: (v) => (model.stringField = v),
        })}
      />
      {/* Number input */}
      <input
        {...form.bindInput("numberField", {
          valueAs: "number",
          getter: () => model.numberField,
          setter: (v) => (model.numberField = v),
        })}
      />
      {/* Date input */}
      <input
        {...form.bindInput("dateField", {
          valueAs: "date",
          getter: () => model.dateField?.toISOString().split("T")[0] ?? null,
          setter: (v) => (model.dateField = v),
        })}
      />

      {/* Check box */}
      <input
        {...form.bindCheckBox("boolField", {
          getter: () => model.boolField,
          setter: (v) => (model.boolField = v),
        })}
      />

      {/* Radio buttons */}
      {(() => {
        const bindRadioButton = form.bindRadioButtonFactory("enumField", {
          getter: () => model.enumField,
          setter: (v) => (model.enumField = v ? (v as SampleEnum) : null),
        });
        return Object.values(SampleEnum).map((value) => <input key={value} {...bindRadioButton(value)} />);
      })()}

      {/* Single select box */}
      <select
        {...form.bindSelectBox("optionField", {
          getter: () => model.optionField,
          setter: (code) => (model.optionField = code),
        })}
      >
        {SAMPLE_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>

      {/* Multiple select box */}
      <select
        {...form.bindSelectBox("multipleOptionField", {
          multiple: true,
          getter: () => model.multipleOptionField,
          setter: (codes) => (model.multipleOptionField = codes),
        })}
      >
        ...
      </select>

      {/* Nested form */}
      <OtherForm model={model.nested} />

      {/* Array of nested forms */}
      {model.array.map((item, i) => (
        <OtherForm key={i} model={item} />
      ))}

      {/* Submit button */}
      <button {...form.bindSubmitButton()}>Submit</button>
    </form>
  );
};

const OtherForm: React.FC<{ model: Other }> = ({ model }) => {
  const form = Form.get(model);

  return (
    <fieldset>
      <input
        {...form.bindInput("otherField", {
          getter: () => model.otherField,
          setter: (v) => (model.otherField = v),
        })}
      />
    </fieldset>
  );
};
```
