import { Form, FormBindingFuncExtension, FormField } from "@mobx-sentinel/form";
import { CheckBoxBinding } from "./CheckBoxBinding";
import { InputBinding } from "./InputBinding";
import { RadioGroupBinding } from "./RadioGroupBinding";
import { SelectBoxBinding } from "./SelectBoxBinding";
import { SubmitButtonBinding } from "./SubmitButtonBinding";
import { LabelBinding } from "./LabelBinding";
import { TextAreaBinding } from "./TextAreaBinding";

/**
 * Standard binding extensions for React form elements
 *
 * `Form` will be extended with these methods.
 *
 * @remarks This interface exists for the sole purpose of documentation.
 */
export interface StandardExtensions<T> {
  /**
   * Bind the input field to the form.
   *
   * `<input>` except the following types: button, submit, reset, hidden, image, file, checkbox, and radio.
   * For checkbox and radio, use bindCheckBox and bindRadioGroup respectively, and for `<textarea>`, use bindTextArea.
   *
   * @example
   * ```tsx
   * <input
   *   {...form.bindInput("string", {
   *     getter: () => model.string,
   *     setter: (v) => (model.string = v),
   *   })}
   * />
   * ```
   * ```tsx
   * <input
   *   {...form.bindInput("number", {
   *     valueAs: "number", // also supports "date"
   *     getter: () => model.number,
   *     setter: (v) => (model.number = v),
   *   })}
   * />
   * ```
   */
  bindInput: FormBindingFuncExtension.ForField.RequiredConfig<T, typeof InputBinding>;

  /**
   * Bind the textarea field to the form.
   *
   * @example
   * ```tsx
   * <textarea
   *   rows={4}
   *   {...form.bindTextArea("string", {
   *     getter: () => model.string,
   *     setter: (v) => (model.string = v),
   *   })}
   * />
   * ```
   */
  bindTextArea: FormBindingFuncExtension.ForField.RequiredConfig<T, typeof TextAreaBinding>;

  /**
   * Bind the select box field to the form.
   *
   * @example
   * ```tsx
   * <select
   *   {...form.bindSelectBox("single", {
   *     getter: () => model.code,
   *     setter: (v) => (model.code = v),
   *   })}
   * >
   *   ...
   * </select>
   * ```
   */
  bindSelectBox: FormBindingFuncExtension.ForField.RequiredConfig<T, typeof SelectBoxBinding>;

  /**
   * Bind the checkbox field to the form.
   *
   * @example
   * ```tsx
   * <input
   *   {...form.bindCheckBox("boolean", {
   *     getter: () => model.boolean,
   *     setter: (v) => (model.boolean = v),
   *   })}
   * />
   * ```
   */
  bindCheckBox: FormBindingFuncExtension.ForField.RequiredConfig<T, typeof CheckBoxBinding>;

  /**
   * Bind the radio group field to the form.
   *
   * The type of the options is inferred from the getter, and the setter receives the option of the selected button.
   * It returns a function that takes an option and returns the props of its radio button.
   *
   * @example
   * ```typescript
   * const bind = form.bindRadioGroup("enum", {
   *   getter: () => model.enum,
   *   setter: (v) => (model.enum = v),
   * });
   * ```
   * ```tsx
   * Object.values(SampleEnum).map((value) => (
   *   <input key={value} {...bind(value)} />
   * ))
   * ```
   * Or with `renderRadioGroup` from `@mobx-sentinel/react`:
   * ```tsx
   * renderRadioGroup({
   *   binding: form.bindRadioGroup("enum", {
   *     getter: () => model.enum,
   *     setter: (v) => (model.enum = v),
   *   }),
   *   options: Object.values(SampleEnum),
   *   renderOption: (value, bind) => <input {...bind()} />,
   * })
   * ```
   */
  bindRadioGroup: <V extends RadioGroupBinding.Option>(
    fieldName: FormField.Name<T>,
    config: RadioGroupBinding.Config<V> & FormBindingFuncExtension.Config
  ) => RadioGroupBinding<V>["props"];

  /**
   * Bind the submit button to the form.
   *
   * @example
   * ```tsx
   * <button {...form.bindSubmitButton()}>Submit</button>
   * ```
   */
  bindSubmitButton: FormBindingFuncExtension.ForForm.OptionalConfig<T, typeof SubmitButtonBinding>;

  /**
   * Bind the label to the form.
   *
   * @example
   * ```tsx
   * <label {...form.bindLabel(["field1"])}>Label</label>
   * <label {...form.bindLabel(["field1", "field2"])}>Label</label>
   * ```
   */
  bindLabel: FormBindingFuncExtension.ForMultiField.OptionalConfig<T, typeof LabelBinding>;
}

declare module "@mobx-sentinel/form" {
  export interface Form<T> extends StandardExtensions<T> {
    bindInput: StandardExtensions<T>["bindInput"];
    bindTextArea: StandardExtensions<T>["bindTextArea"];
    bindSelectBox: StandardExtensions<T>["bindSelectBox"];
    bindCheckBox: StandardExtensions<T>["bindCheckBox"];
    bindRadioGroup: StandardExtensions<T>["bindRadioGroup"];
    bindSubmitButton: StandardExtensions<T>["bindSubmitButton"];
    bindLabel: StandardExtensions<T>["bindLabel"];
  }
}

Form.prototype.bindInput = function (fieldName, config) {
  return this.bind(fieldName, InputBinding, {
    ...config,
    cacheKey: `${config.valueAs}:${config.cacheKey}`,
  });
};

Form.prototype.bindTextArea = function (fieldName, config) {
  return this.bind(fieldName, TextAreaBinding, config);
};

Form.prototype.bindSelectBox = function (fieldName, config) {
  return this.bind(fieldName, SelectBoxBinding, config);
};

Form.prototype.bindCheckBox = function (fieldName, config) {
  return this.bind(fieldName, CheckBoxBinding, config);
};

Form.prototype.bindRadioGroup = function (fieldName, config) {
  // Form#bind only knows the config of RadioGroupBinding with its options widened to RadioGroupBinding.Option,
  // which a setter for a narrower type of options doesn't fit
  return this.bind(fieldName, RadioGroupBinding, config as RadioGroupBinding.Config<any>);
};

Form.prototype.bindSubmitButton = function (config) {
  return this.bind(SubmitButtonBinding, config ?? {});
};

Form.prototype.bindLabel = function (fields, config) {
  return this.bind(fields, LabelBinding, config ?? {});
};
