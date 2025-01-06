import type { FormField, FormFieldName } from "./FormField";

type ConfigOf<T> = T extends new (field: FormField, config: infer Config) => FormBinding ? Config : never;

/** Interface for form binding classes */
export interface FormBinding {
  /** Configuration of the binding */
  config?: object;
  /** Binding properties which passed to the view component */
  readonly props: object;
}

/** Polymorphic constructor of binding classes */
export interface FormBindingConstructor<Form>
  extends FormBindingConstructor.ForField,
    FormBindingConstructor.ForForm<Form> {}
export namespace FormBindingConstructor {
  /** Constructor for field binding classes */
  export type ForField = new (field: FormField, config?: any) => FormBinding;
  /** Constructor for form binding classes */
  export type ForForm<Form> = new (form: Form, config?: any) => FormBinding;
}

/** Polymorphic function of Form#bind */
export interface FormBindingFunc<Form, T> extends FormBindingFunc.ForField<T>, FormBindingFunc.ForForm<Form> {}
export namespace FormBindingFunc {
  /** Bind configuration */
  export type Config = {
    /** Cache key for the binding */
    cacheKey?: string;
  };

  /** Bind to a field */
  export interface ForField<T> {
    /** Create a binding for the field */
    <Binding extends new (field: FormField) => FormBinding>(
      fieldName: FormFieldName<T>,
      binding: Binding
    ): InstanceType<Binding>["props"];

    /** Create a binding for the field with the config */
    <Binding extends new (field: FormField, config: any) => FormBinding>(
      fieldName: FormFieldName<T>,
      binding: Binding,
      config: NoInfer<ConfigOf<Binding>> & Config
    ): InstanceType<Binding>["props"];
  }

  /** Bind to the form */
  export interface ForForm<Form> {
    /** Create a binding for the form */
    <Binding extends new (form: Form) => FormBinding>(binding: Binding): InstanceType<Binding>["props"];

    /** Create a binding for the form with the config */
    <Binding extends new (form: Form, config: any) => FormBinding>(
      binding: Binding,
      config: NoInfer<ConfigOf<Binding>> & Config
    ): InstanceType<Binding>["props"];
  }
}
