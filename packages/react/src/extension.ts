import { Form, FormField } from "@form-model/core";
import { CheckBoxBinding } from "./CheckBoxBinding";
import { InputBinding } from "./InputBinding";
import { RadioButtonBinding } from "./RadioButtonBinding";
import { SelectBoxBinding } from "./SelectBoxBinding";
import { SubmitButtonBinding } from "./SubmitButtonBinding";
import { LabelBinding } from "./LabelBinding";

export {};

declare module "@form-model/core" {
  export interface Form<T> {
    /**
     * Bind the input field to the form.
     *
     * <input> except the following types: button, submit, reset, hidden, image, file, checkbox, and radio.
     * For checkbox and radio, use bindCheckBox and bindRadioButton respectively.
     *
     * @example
     * ```typescript-react
     * <input
     *   {...model.form.bindInput("string", {
     *     getter: () => model.string,
     *     setter: (v) => (model.string = v),
     *   })}
     * />
     * ```
     */
    bindInput(fieldName: FormField.Name<T>, config: InputBinding.Config): InputBinding["props"];

    /**
     * Bind the select box field to the form.
     *
     * @example
     * ```typescript-react
     * <select
     *   {...model.form.bindSelectBox("single", {
     *     getter: () => model.single.code,
     *     setter: (v) => (model.single = findSampleOption(v)),
     *   })}
     * >
     *   ...
     * </select>
     * ```
     */
    bindSelectBox(fieldName: FormField.Name<T>, config: SelectBoxBinding.Config): SelectBoxBinding["props"];

    /**
     * Bind the checkbox field to the form.
     *
     * @example
     * ```typescript-react
     * <input
     *   {...model.form.bindCheckBox("boolean", {
     *     getter: () => model.boolean,
     *     setter: (v) => (model.boolean = v),
     *   })}
     * />
     * ```
     */
    bindCheckBox(fieldName: FormField.Name<T>, config: CheckBoxBinding.Config): CheckBoxBinding["props"];

    /**
     * Bind the radio button field to the form.
     *
     * @example
     * ```typescript
     * const bindRadioButton = model.form.bindRadioButton("enum", {
     *   getter: () => model.enum,
     *   setter: (v) => (model.enum = v ? (v as SampleEnum) : SampleEnum.ZULU),
     * });
     * ```
     * ```typescript-react
     * Object.values(SampleEnum).map((value) => (
     *   <input key={value} {...bindRadioButton(value)} />
     * ))
     * ```
     */
    bindRadioButton(fieldName: FormField.Name<T>, config: RadioButtonBinding.Config): RadioButtonBinding["props"];

    /**
     * Bind the submit button to the form.
     *
     * @example
     * ```typescript-react
     * <button {...model.form.bindSubmitButton()}>Submit</button>
     * ```
     */
    bindSubmitButton(config?: SubmitButtonBinding.Config): SubmitButtonBinding["props"];

    /**
     * Bind the label to the form.
     *
     * @example
     * ```typescript-react
     * <label {...model.form.bindLabel(["field1", "field2"])}>Label</label>
     * ```
     */
    bindLabel(fields: FormField.Name<T>[], config?: LabelBinding.Config): LabelBinding["props"];
  }
}

Form.prototype.bindInput = function (fieldName, config) {
  return this.bind(fieldName, InputBinding, {
    cacheKey: config.valueAs,
    ...config,
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
