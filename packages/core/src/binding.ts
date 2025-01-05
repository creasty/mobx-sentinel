import type { FormField, FormFieldName } from "./FormField";

type ConfigOf<T> = T extends new (field: FormField, config: infer Config) => FormBinding ? Config : never;

export interface FormBinding {
  /** Configuration of the binding */
  config?: object;
  /** Binding properties which passed to the view component */
  readonly props: object;
}

export type FormBindingFuncConfig = {
  /** Cache key for the binding */
  cacheKey?: string;
};

export type FormBindingConstructorForField = new (field: FormField, config?: any) => FormBinding;
export interface FormBindingFuncForField<T> {
  /** Create a binding for the field */
  <Binding extends new (field: FormField) => FormBinding>(
    fieldName: FormFieldName<T>,
    binding: Binding
  ): InstanceType<Binding>["props"];

  /** Create a binding for the field with the config */
  <Binding extends new (field: FormField, config: any) => FormBinding>(
    fieldName: FormFieldName<T>,
    binding: Binding,
    config: NoInfer<ConfigOf<Binding>> & FormBindingFuncConfig
  ): InstanceType<Binding>["props"];
}

export type FormBindingConstructorForForm<Form> = new (form: Form, config?: any) => FormBinding;
export interface FormBindingFuncForForm<Form> {
  /** Create a binding for the form */
  <Binding extends new (form: Form) => FormBinding>(binding: Binding): InstanceType<Binding>["props"];

  /** Create a binding for the form with the config */
  <Binding extends new (form: Form, config: any) => FormBinding>(
    binding: Binding,
    config: NoInfer<ConfigOf<Binding>> & FormBindingFuncConfig
  ): InstanceType<Binding>["props"];
}

export interface FormBindingFunc<Form, T> extends FormBindingFuncForField<T>, FormBindingFuncForForm<Form> {}
