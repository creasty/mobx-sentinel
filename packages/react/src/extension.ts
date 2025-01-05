import { Form, FormFieldNameStrict } from "@mobx-form/core";
import { CheckBoxBinding } from "./CheckBoxBinding";
import { InputBinding } from "./InputBinding";
import { RadioButtonBinding } from "./RadioButtonBinding";
import { SelectBoxBinding } from "./SelectBoxBinding";
import { SubmitButtonBinding } from "./SubmitButtonBinding";

export {};

declare module "@mobx-form/core" {
  export interface Form<T> {
    /**
     * Bind the input field to the form.
     *
     * <input> except the following types: button, submit, reset, hidden, image, file, checkbox, and radio.
     * For checkbox and radio, use bindCheckBox and bindRadioButtonFactory respectively.
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
    bindInput(fieldName: FormFieldNameStrict<T>, config: InputBinding.Config): InputBinding["props"];

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
    bindSelectBox(fieldName: FormFieldNameStrict<T>, config: SelectBoxBinding.Config): SelectBoxBinding["props"];

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
    bindCheckBox(fieldName: FormFieldNameStrict<T>, config: CheckBoxBinding.Config): CheckBoxBinding["props"];

    /**
     * Bind the radio button field to the form.
     *
     * @example
     * ```typescript
     * const bindRadioButton = model.form.bindRadioButtonFactory("enum", {
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
    bindRadioButtonFactory(
      fieldName: FormFieldNameStrict<T>,
      config: RadioButtonBinding.Config
    ): RadioButtonBinding["props"];

    /**
     * Bind the submit button to the form.
     *
     * @example
     * ```typescript-react
     * <button {...model.form.bindSubmitButton()}>Submit</button>
     * ```
     */
    bindSubmitButton(): SubmitButtonBinding["props"];
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

Form.prototype.bindRadioButtonFactory = function (fieldName, config) {
  return this.bind(fieldName, RadioButtonBinding, config);
};

Form.prototype.bindSubmitButton = function () {
  return this.bind(SubmitButtonBinding);
};
