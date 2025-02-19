import type { Form } from "./form";
import type { FormField } from "./field";
import { v4 as uuidV4 } from "uuid";

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
  export type ForMultiField = new (fields: FormField[], config?: any) => FormBinding;
  /** Constructor for form binding classes */
  export type ForForm = new (form: Form<any>, config?: any) => FormBinding;
}

/**
 * Get a safe name for the binding class
 *
 * Since Function.name is vulnerable to minification,
 * a UUID is appended to the name to ensure uniqueness.
 */
export function getSafeBindingName(constructor: FormBindingConstructor): string {
  let name = safeBindingNameCache.get(constructor);
  if (!name) {
    name = `${constructor.name}--${uuidV4()}`;
    safeBindingNameCache.set(constructor, name);
  }
  return name;
}
const safeBindingNameCache = new WeakMap<FormBindingConstructor, string>();

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
      binding: Binding,
      config?: Config
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
    /** Create a binding for the multiple fields */
    <Binding extends new (fields: FormField[]) => FormBinding>(
      fieldNames: FormField.Name<T>[],
      binding: Binding,
      config?: Config
    ): InstanceType<Binding>["props"];

    /** Create a binding for the multiple fields with the config */
    <Binding extends new (fields: FormField[], config: any) => FormBinding>(
      fieldNames: FormField.Name<T>[],
      binding: Binding,
      config: NoInfer<ConfigOf<Binding>> & Config
    ): InstanceType<Binding>["props"];
  }

  /** Bind to the form */
  export interface ForForm<T> {
    /** Create a binding for the form */
    <Binding extends new (form: Form<T>) => FormBinding>(
      binding: Binding,
      config?: Config
    ): InstanceType<Binding>["props"];

    /** Create a binding for the form with the config */
    <Binding extends new (form: Form<T>, config: any) => FormBinding>(
      binding: Binding,
      config: NoInfer<ConfigOf<Binding>> & Config
    ): InstanceType<Binding>["props"];
  }
}

export namespace FormBindingFuncExtension {
  /** Bind configuration */
  export type Config = FormBindingFunc.Config;

  /** Bind to a field */
  export namespace ForField {
    /** Create a binding for the field with an optional config */
    export type OptionalConfig<T, Binding extends new (field: FormField, config?: any) => FormBinding> = (
      fieldName: FormField.Name<T>,
      config?: NoInfer<ConfigOf<Binding>> & Config
    ) => InstanceType<Binding>["props"];

    /** Create a binding for the field with a required config */
    export type RequiredConfig<T, Binding extends new (field: FormField, config: any) => FormBinding> = (
      fieldName: FormField.Name<T>,
      config: NoInfer<ConfigOf<Binding>> & Config
    ) => InstanceType<Binding>["props"];
  }

  /** Bind to multiple fields */
  export namespace ForMultiField {
    /** Create a binding for the multiple fields */
    export type OptionalConfig<T, Binding extends new (fields: FormField[], config?: any) => FormBinding> = (
      fieldNames: FormField.Name<T>[],
      config?: NoInfer<ConfigOf<Binding>> & Config
    ) => InstanceType<Binding>["props"];

    /** Create a binding for the multiple fields with the config */
    export type RequiredConfig<T, Binding extends new (fields: FormField[], config: any) => FormBinding> = (
      fieldNames: FormField.Name<T>[],
      config: NoInfer<ConfigOf<Binding>> & Config
    ) => InstanceType<Binding>["props"];
  }

  /** Bind to the form */
  export namespace ForForm {
    /** Create a binding for the form */
    export type OptionalConfig<T, Binding extends new (form: Form<T>, config: any) => FormBinding> = (
      config?: NoInfer<ConfigOf<Binding>> & Config
    ) => InstanceType<Binding>["props"];

    /** Create a binding for the form with the config */
    export type RequiredConfig<T, Binding extends new (form: Form<T>, config: any) => FormBinding> = (
      config: NoInfer<ConfigOf<Binding>> & Config
    ) => InstanceType<Binding>["props"];
  }
}
