import type { Form } from "./Form";
import type { FormField } from "./FormField";

type ConfigOf<T> = T extends new (form: Form<any>, config: infer Config) => FormBinding
  ? Config
  : T extends new (field: FormField, config: infer Config) => FormBinding
    ? Config
    : T extends new (fields: FormField[], config: infer Config) => FormBinding
      ? Config
      : never;

/** Interface for form binding classes */
export interface FormBinding {
  /** Configuration of the binding */
  config?: object;
  /** Binding properties which passed to the view component */
  readonly props: object;
}

/** Polymorphic constructor of binding classes */
export type FormBindingConstructor =
  | FormBindingConstructor.ForField
  | FormBindingConstructor.ForMultiField
  | FormBindingConstructor.ForForm;
export namespace FormBindingConstructor {
  /** Constructor for field binding classes */
  export type ForField = new (field: FormField, config?: any) => FormBinding;
  /** Constructor for multi-field binding classes */
  export type ForMultiField = new (field: FormField[], config?: any) => FormBinding;
  /** Constructor for form binding classes */
  export type ForForm = new (form: Form<any>, config?: any) => FormBinding;
}

/** Polymorphic function of Form#bind */
export interface FormBindingFunc<T>
  extends FormBindingFunc.ForField<T>,
    FormBindingFunc.ForMultiField<T>,
    FormBindingFunc.ForForm<T> {}
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
      fieldName: FormField.Name<T>,
      binding: Binding
    ): InstanceType<Binding>["props"];

    /** Create a binding for the field with the config */
    <Binding extends new (field: FormField, config: any) => FormBinding>(
      fieldName: FormField.Name<T>,
      binding: Binding,
      config: NoInfer<ConfigOf<Binding>> & Config
    ): InstanceType<Binding>["props"];
  }

  /** Bind to multiple fields */
  export interface ForMultiField<T> {
    /** Create a binding for the fields */
    <Binding extends new (fields: FormField[]) => FormBinding>(
      fieldNames: FormField.Name<T>[],
      binding: Binding
    ): InstanceType<Binding>["props"];

    /** Create a binding for the field with the config */
    <Binding extends new (fields: FormField[], config: any) => FormBinding>(
      fieldNames: FormField.Name<T>[],
      binding: Binding,
      config: NoInfer<ConfigOf<Binding>> & Config
    ): InstanceType<Binding>["props"];
  }

  /** Bind to the form */
  export interface ForForm<T> {
    /** Create a binding for the form */
    <Binding extends new (form: Form<T>) => FormBinding>(binding: Binding): InstanceType<Binding>["props"];

    /** Create a binding for the form with the config */
    <Binding extends new (form: Form<T>, config: any) => FormBinding>(
      binding: Binding,
      config: NoInfer<ConfigOf<Binding>> & Config
    ): InstanceType<Binding>["props"];
  }
}
