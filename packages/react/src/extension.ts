import { extendFormBinding, FormBindingFunc, FormBindingMethods, FormField } from "@mobx-sentinel/form";
import { CheckBoxBinding } from "./CheckBoxBinding";
import { InputBinding } from "./InputBinding";
import { RadioGroupBinding } from "./RadioGroupBinding";
import { SelectBoxBinding } from "./SelectBoxBinding";
import { SubmitButtonBinding } from "./SubmitButtonBinding";
import { LabelBinding } from "./LabelBinding";
import { TextAreaBinding } from "./TextAreaBinding";

/**
 * Standard bindings for React form elements, by the name of the method they add to `Form`
 *
 * Importing `@mobx-sentinel/react/extension` adds the methods to every form with `extendFormBinding()`.
 * Their types are {@link StandardExtensions}.
 */
export const standardBindings = extendFormBinding({
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
  bindInput: InputBinding,

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
  bindTextArea: TextAreaBinding,

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
  bindSelectBox: SelectBoxBinding,

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
  bindCheckBox: CheckBoxBinding,

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
  bindRadioGroup: RadioGroupBinding,

  /**
   * Bind the submit button to the form.
   *
   * @example
   * ```tsx
   * <button {...form.bindSubmitButton()}>Submit</button>
   * ```
   */
  bindSubmitButton: SubmitButtonBinding,

  /**
   * Bind the label to the form.
   *
   * @example
   * ```tsx
   * <label {...form.bindLabel(["field1"])}>Label</label>
   * <label {...form.bindLabel(["field1", "field2"])}>Label</label>
   * ```
   */
  bindLabel: LabelBinding,
});

/**
 * Standard bind methods for React form elements
 *
 * `Form` is extended with these methods when `@mobx-sentinel/react/extension` is imported.
 * Each one binds a class of {@link standardBindings} to the form.
 */
export type StandardExtensions<T> = FormBindingMethods<
  T,
  typeof standardBindings,
  {
    // RadioGroupBinding is generic, so its method is written out to type the options after the getter
    bindRadioGroup: <V extends RadioGroupBinding.Option>(
      fieldName: FormField.Name<T>,
      config: RadioGroupBinding.Config<V> & FormBindingFunc.Config
    ) => RadioGroupBinding<V>["props"];
  }
>;

declare module "@mobx-sentinel/form" {
  export interface Form<T> extends StandardExtensions<T> {}
}
