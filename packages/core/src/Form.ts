import { action, comparer, computed, makeObservable, observable, runInAction } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { FormField } from "./FormField";
import { FormBinding, FormBindingConstructor, FormBindingFunc } from "./binding";
import { FormConfig, defaultConfig } from "./config";
import { FormValidationResult, toErrorMap } from "./validation";
import { FormDelegate, getDelegation, isConnectableObject } from "./delegation";

const registry = new WeakMap<object, Map<symbol, Form<unknown>>>();
const defaultFormKey = Symbol("Form.registryDefaultKey");
const privateConstructorToken = Symbol("Form.privateConstructor");

export class Form<T> {
  readonly id = uuidV4();
  readonly config: Readonly<FormConfig>;
  readonly #delegate?: FormDelegate<T>;
  readonly #registryKey?: symbol;
  readonly #fields = new Map<string, FormField>();
  readonly #bindings = new Map<string, FormBinding>();
  readonly #isSubmitting = observable.box(false);
  readonly #isValidating = observable.box(false);
  readonly #isDirty = observable.box(false);
  readonly #isValidityReported = observable.box(false);
  readonly #errors = observable.map<string, string[]>([], { equals: comparer.structural });

  /** Extension fields for bindings */
  [k: `bind${Capitalize<string>}`]: unknown;

  /**
   * Get the form instance for a subject.
   *
   * - Returns the existing form instance if the subject is already associated with one.\
   *   Otherwise, creates a new form instance and associates it with the subject.
   * - The form instance is cached in the internal registry,
   *   and it will be garbage collected when the subject is no longer in use.\
   *   In rare cases, you may need to manually dispose the form instance using {@link Form.dispose}.
   *
   * @param subject The subject to associate with the form
   * @param formKey The key to associate with the form.
   *   If you need to associate multiple forms with the same subject, use different keys.
   */
  static get<T extends object>(subject: T, formKey?: symbol): Form<T> {
    let map = registry.get(subject);
    if (!map) {
      map = new Map();
      registry.set(subject, map);
    }
    if (!formKey) {
      formKey = defaultFormKey;
    }
    let instance = map.get(formKey);
    if (!instance) {
      const delegate = getDelegation(subject);
      instance = new Form<T>(privateConstructorToken, {
        registryKey: formKey,
        delegate,
        config: delegate?.[FormDelegate.config],
      });
      map.set(formKey, instance);
    }
    return instance;
  }

  /**
   * Manually dispose the form instance for a subject.
   *
   * Use with caution.\
   * You don't usually need to use this method at all.\
   * It's only for advanced use cases, such as testing.
   *
   * @see {@link Form.get}
   */
  static dispose(subject: object, formKey?: symbol) {
    const map = registry.get(subject);
    if (!map) return;
    if (formKey) {
      map.delete(formKey);
    } else {
      map.clear();
    }
  }

  private constructor(
    token: symbol,
    args?: {
      registryKey: symbol;
      delegate?: FormDelegate<T>;
      config?: Partial<FormConfig>;
    }
  ) {
    if (token !== privateConstructorToken) {
      throw new Error("Instantiate Form via Form.get() instead");
    }
    makeObservable(this);
    this.#registryKey = args?.registryKey;
    this.#delegate = args?.delegate;
    this.config = { ...defaultConfig, ...args?.config };
  }

  /**
   * Get the delegate value by key.
   *
   * Returns an object, or a method that is bound to the delegate.
   */
  #getDelegateByKey<K extends symbol & keyof FormDelegate<T>>(key: K): FormDelegate<T>[K] | undefined {
    const delegate = this.#delegate;
    if (!delegate) return;

    const value = delegate[key];
    if (!value) return;

    if (typeof value === "function") {
      return value.bind(delegate) as any;
    }
    return value;
  }

  /** Whether the form is in submitting state */
  get isSubmitting() {
    return this.#isSubmitting.get();
  }
  /** Whether the form is in validation state */
  get isValidating() {
    return this.#isValidating.get();
  }
  /** Whether the form is dirty */
  get isDirty() {
    return this.#isDirty.get();
  }
  /** Whether the validity has been reported */
  get isValidityReported() {
    return this.#isValidityReported.get();
  }

  /** Whether the form can be submitted */
  @computed
  get canSubmit() {
    return !this.isSubmitting && !this.isValidating && this.isValid && this.isDirty;
  }

  /** Whether the form is valid */
  get isValid() {
    return this.invalidFieldCount === 0 && this.invalidNestedFormCount === 0;
  }

  /**
   * The number of invalid fields
   *
   * Note that this does not include the number of invalid fields of nested forms.
   */
  @computed
  get invalidFieldCount() {
    return this.#errors.size;
  }

  /**
   * The number of invalid nested forms
   *
   * Note that this is not the number of fields.
   */
  @computed
  get invalidNestedFormCount() {
    let count = 0;
    for (const form of this.nestedForms) {
      count += form.isValid ? 0 : 1;
    }
    return count;
  }

  /**
   * Nested forms within the form.
   *
   * Forms are collected from the {@link FormDelegate.connect}.
   */
  @computed.struct
  get nestedForms(): ReadonlySet<Form<unknown>> {
    const forms = new Set<Form<unknown>>();

    const connect = this.#getDelegateByKey(FormDelegate.connect);
    if (connect) {
      for (const object of connect()) {
        if (!object) continue;
        const items = Array.isArray(object) ? object : [object];
        for (const item of items) {
          if (!isConnectableObject(item)) continue;
          const form = Form.get(item, this.#registryKey);
          forms.add(form);
        }
      }
    }

    return forms;
  }

  /** Report validity on all fields and nested forms */
  @action
  reportValidity() {
    this.#isValidityReported.set(true);
    for (const field of this.#fields.values()) {
      field.reportValidity();
    }
    for (const form of this.nestedForms) {
      form.reportValidity();
    }
  }

  /** Reset the form's state */
  @action
  reset() {
    this.#isDirty.set(false);
    this.#isValidityReported.set(false);
    for (const field of this.#fields.values()) {
      field.reset();
    }
    for (const form of this.nestedForms) {
      form.reset();
    }
  }

  /** Mark the form as dirty */
  @action
  markAsDirty() {
    this.#isDirty.set(true);
  }

  /**
   * Submit the form.
   *
   * Returns true if the submission is occurred,
   * false if the submission is discarded/canceled (e.g. invalid form, already in progress).
   * Note that the return value does not indicate whether the submission succeeded.
   *
   * The process is delegated to the {@link FormDelegate.submit}.
   */
  async submit(args?: { force?: boolean }) {
    const submit = this.#getDelegateByKey(FormDelegate.submit);
    if (!submit) return false;

    if (args?.force) {
      this.#submitAbortCtrl?.abort();
      this.#submitAbortCtrl = null;
    } else if (this.isSubmitting) {
      return false;
    } else if (!this.canSubmit) {
      return false;
    }

    // Start submitting
    runInAction(() => {
      this.#isSubmitting.set(true);
    });
    let succeed = false;
    const abortCtrl = new AbortController();
    try {
      this.#submitAbortCtrl = abortCtrl;
      succeed = await submit(abortCtrl.signal);
    } finally {
      this.#submitAbortCtrl = null;
      runInAction(() => {
        this.#isSubmitting.set(false);
        if (succeed) {
          this.reset();
        }
      });
    }
    return !abortCtrl.signal.aborted;
  }
  #submitAbortCtrl: AbortController | null = null;

  /**
   * Validate the form.
   *
   * Returns true if the validation is occurred,
   * false if the validation is discarded/canceled (e.g. already in progress).
   * Note that the return value does not indicate the validation result.
   *
   * The process is delegated to the {@link FormDelegate.validate}.
   */
  async validate(args?: { force?: boolean }) {
    const validate = this.#getDelegateByKey(FormDelegate.validate);
    if (!validate) return false;

    if (args?.force) {
      this.#validateAbortCtrl?.abort();
      this.#validateAbortCtrl = null;
    } else if (this.isValidating) {
      return false;
    }

    // Start validating
    runInAction(() => {
      this.#isValidating.set(true);
    });
    let result: FormValidationResult<T> | undefined;
    const abortCtrl = new AbortController();
    try {
      this.#validateAbortCtrl = abortCtrl;
      result = await validate(abortCtrl.signal);
    } finally {
      this.#validateAbortCtrl = null;
      runInAction(() => {
        this.#isValidating.set(false);
        if (result) {
          this.#errors.replace(toErrorMap(result));
        }
      });
    }
    return !abortCtrl.signal.aborted;
  }
  #validateAbortCtrl: AbortController | null = null;

  /** Get a field by name */
  #getField(fieldName: FormField.Name<T>) {
    let field = this.#fields.get(fieldName);
    if (!field) {
      field = new FormField({
        form: this,
        formErrors: this.#errors,
        fieldName: String(fieldName),
      });
      this.#fields.set(fieldName, field);
    }
    return field;
  }

  /** Define a binding by key */
  #defineBinding(bindingKey: string, create: () => FormBinding) {
    let binding = this.#bindings.get(bindingKey);
    if (!binding) {
      binding = create();
      this.#bindings.set(bindingKey, binding);
    }
    return binding;
  }

  /** Create a binding to a field */
  #bindToField: FormBindingFunc.ForField<T> = (
    fieldName: FormField.Name<T>,
    binding: FormBindingConstructor.ForField,
    config?: FormBindingFunc.Config
  ) => {
    const key = `${fieldName}@${binding.name}:${config?.cacheKey}`;
    const instance = this.#defineBinding(key, () => {
      const field = this.#getField(fieldName);
      return new binding(field, config);
    });
    instance.config = config; // Update on every call
    return instance.props;
  };

  /** Create a binding to the form */
  #bindToForm: FormBindingFunc.ForForm<T> = (
    binding: FormBindingConstructor.ForForm,
    config?: FormBindingFunc.Config
  ) => {
    const key = `${binding.name}:${config?.cacheKey}`;
    const instance = this.#defineBinding(key, () => new binding(this, config));
    instance.config = config; // Update on every call
    return instance.props;
  };

  /** Bind to a field or the form */
  bind: FormBindingFunc<T> = (...args: any[]) => {
    if (typeof args[0] === "string") {
      return this.#bindToField(args[0], args[1], args[2]);
    }
    return this.#bindToForm(args[0], args[1]);
  };

  /** Get the error messages for a field */
  getError(fieldName: FormField.Name<T>) {
    // Reading errors from FormField#errors is computed,
    // so notifications only trigger when the error of the specific field changes
    return this.#getField(fieldName)?.errors ?? null;
  }
}
