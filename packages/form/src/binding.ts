import type { Form } from "./form";
import type { FormField } from "./field";
import { randomId } from "./randomId";

type ConfigOf<T> = T extends new (
  form: Form<any>,
  config: infer Config
) => FormBinding
  ? Config
  : T extends new (
        field: FormField,
        config: infer Config
      ) => FormBinding
    ? Config
    : T extends new (
          fields: FormField[],
          config: infer Config
        ) => FormBinding
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
 * a random id is appended to the name to ensure uniqueness.
 */
export function getSafeBindingName(bindingClass: FormBindingConstructor): string {
  let name = safeBindingNameCache.get(bindingClass);
  if (!name) {
    name = `${bindingClass.name}--${randomId()}`;
    safeBindingNameCache.set(bindingClass, name);
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

/** Parameter of a derived bind method for the config: optional when the config has no required keys */
type ConfigParameter<Config> =
  Partial<Config> extends Config
    ? [config?: Config & FormBindingFunc.Config]
    : [config: Config & FormBindingFunc.Config];

/**
 * Bind method derived from a binding class
 *
 * - A binding for the form takes the config only
 * - A binding for multiple fields takes the field names and the config
 * - A binding for a field takes the field name and the config
 * - The config is optional when none of its keys is required
 * - It returns the props of the binding
 *
 * @remarks
 * The type parameters of a generic binding class fall back to their constraints.
 * Write the method for such a class by hand, as an override in {@link FormBindingMethods}.
 */
export type FormBindingMethod<T, Binding> = Binding extends new (
  form: Form<any>,
  config: infer Config
) => { readonly props: infer Props }
  ? (...config: ConfigParameter<Config>) => Props
  : Binding extends new (
        fields: FormField[],
        config: infer Config
      ) => { readonly props: infer Props }
    ? (fieldNames: FormField.Name<T>[], ...config: ConfigParameter<Config>) => Props
    : Binding extends new (
          field: FormField,
          config: infer Config
        ) => { readonly props: infer Props }
      ? (fieldName: FormField.Name<T>, ...config: ConfigParameter<Config>) => Props
      : never;

/** Signature of a method with its own type parameters replaced by their constraints */
type ErasedSignature<Method> = Method extends (...args: infer Args) => infer Result ? (...args: Args) => Result : never;

/** Whether two types are identical, which is stricter than being assignable to each other */
type IsIdentical<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;

/**
 * Bind methods for the binding classes passed to `extendFormBinding()`
 *
 * `Form` is extended with it to type the methods that `extendFormBinding()` adds.
 *
 * @example
 * ```typescript
 * export const myBindings = extendFormBinding({
 *   bindDropdown: DropdownBinding,
 * });
 *
 * declare module "@mobx-sentinel/form" {
 *   interface Form<T> extends FormBindingMethods<T, typeof myBindings> {}
 * }
 * ```
 *
 * @remarks
 * Each method is derived from its binding class (see {@link FormBindingMethod}),
 * except for the methods written by hand in `Overrides`.
 *
 * A generic binding class needs an override to keep its type parameters, which the derivation replaces with their
 * constraints. An override may differ from the derived method only in having type parameters of its own:
 * with them replaced by their constraints, it must be identical to the derived method.
 * Writing the config with the binding's own types (e.g. `RadioGroupBinding.Config<V>`) keeps it in step with the class.
 *
 * @typeParam T - The subject of the form
 * @typeParam Bindings - Type of the binding classes by method name, as passed to `extendFormBinding()`
 * @typeParam Overrides - Methods written by hand, by method name
 */
export type FormBindingMethods<
  T,
  Bindings extends { [K in keyof Bindings]: FormBindingConstructor },
  Overrides extends {
    [K in keyof Overrides]: K extends keyof Bindings
      ? IsIdentical<ErasedSignature<Overrides[K]>, ErasedSignature<FormBindingMethod<T, Bindings[K]>>> extends true
        ? FormBindingMethod<T, Bindings[K]>
        : "override diverges from the binding"
      : "no binding for this override";
  } = Record<never, never>,
> = {
  [K in keyof Bindings]: K extends keyof Overrides ? Overrides[K] : FormBindingMethod<T, Bindings[K]>;
};
