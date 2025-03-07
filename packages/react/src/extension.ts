import { Form, FormBindingFuncExtension } from "@mobx-sentinel/form";
import { CheckBoxBinding } from "./CheckBoxBinding";
import { InputBinding } from "./InputBinding";
import { RadioButtonBinding } from "./RadioButtonBinding";
import { SelectBoxBinding } from "./SelectBoxBinding";
import { SubmitButtonBinding } from "./SubmitButtonBinding";
import { LabelBinding } from "./LabelBinding";

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
   * For checkbox and radio, use bindCheckBox and bindRadioButton respectively.
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
   * Bind the radio button field to the form.
   *
   * @example
   * ```typescript
   * const bind = form.bindRadioButton("enum", {
   *   getter: () => model.enum,
   *   setter: (v) => (model.enum = v as SampleEnum),
   * });
   * ```
   * ```tsx
   * Object.values(SampleEnum).map((value) => (
   *   <input key={value} {...bind(value)} />
   * ))
   * ```
   */
  bindRadioButton: FormBindingFuncExtension.ForField.RequiredConfig<T, typeof RadioButtonBinding>;

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
    bindSelectBox: StandardExtensions<T>["bindSelectBox"];
    bindCheckBox: StandardExtensions<T>["bindCheckBox"];
    bindRadioButton: StandardExtensions<T>["bindRadioButton"];
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

Form.prototype.bindSelectBox = function (fieldName, config) {
  return this.bind(fieldName, SelectBoxBinding, config);
};

Form.prototype.bindCheckBox = function (fieldName, config) {
  return this.bind(fieldName, CheckBoxBinding, config);
};

Form.prototype.bindRadioButton = function (fieldName, config) {
  return this.bind(fieldName, RadioButtonBinding, config);
};

Form.prototype.bindSubmitButton = function (config) {
  return this.bind(SubmitButtonBinding, config ?? {});
};

Form.prototype.bindLabel = function (fields, config) {
  return this.bind(fields, LabelBinding, config ?? {});
};
