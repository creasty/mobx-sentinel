import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { FormField } from "./FormField";
import { FormBinding, FormBindingConstructor, FormBindingFunc } from "./binding";
import { FormConfig, globalConfig } from "./config";
import { Validation } from "./validation";
import { FormDelegate, getDelegation, isConnectableObject } from "./delegation";

const registry = new WeakMap<object, Map<symbol, Form<any>>>();
const defaultFormKey = Symbol("Form.defaultFormKey");
const internalToken = Symbol("Form.internalToken");

export class Form<T> {
  readonly id = uuidV4();
  readonly #delegate?: FormDelegate<T>;
  readonly #formKey: symbol;
  readonly #validation: Validation;
  readonly #fields = new Map<string, FormField>();
  readonly #bindings = new Map<string, FormBinding>();
  readonly #isSubmitting = observable.box(false);
  readonly #isDirty = observable.box(false);

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
    formKey ??= defaultFormKey;

    let map = registry.get(subject);
    if (!map) {
      map = new Map();
      registry.set(subject, map);
    }

    let instance = map.get(formKey);
    if (!instance) {
      const delegate = getDelegation(subject);
      instance = new Form<T>(internalToken, { formKey, delegate });
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
    args: {
      formKey: symbol;
      delegate?: FormDelegate<T>;
    }
  ) {
    if (token !== internalToken) {
      throw new Error("Instantiate Form via Form.get() instead");
    }
    makeObservable(this);
    this.#formKey = args.formKey;
    this.#delegate = args.delegate;

    this.#validation = new Validation({
      requestDelayMs: this.config.validationDelayMs,
      scheduleDelayMs: this.config.subsequentValidationDelayMs,
    });
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

  @computed
  get config(): Readonly<FormConfig> {
    return {
      ...globalConfig,
      ...this.#getDelegateByKey(FormDelegate.config),
    };
  }

  /** Whether the form is in submitting state */
  get isSubmitting() {
    return this.#isSubmitting.get();
  }
  /** Whether the form is in validation state */
  @computed
  get isValidating() {
    return this.#validation.isRunning || this.#validation.isScheduled;
  }
  /** Whether the form is dirty */
  get isDirty() {
    return this.#isDirty.get();
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
    return this.#validation.errors.size;
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
          const form = Form.get(item, this.#formKey);
          forms.add(form);
        }
      }
    }

    return forms;
  }

  /** Report error states on all fields and nested forms */
  @action
  reportError() {
    for (const field of this.#fields.values()) {
      field.reportError();
    }
    for (const form of this.nestedForms) {
      form.reportError();
    }
  }

  /** Reset the form's state */
  @action
  reset() {
    this.#isDirty.set(false);
    this.#validation.reset();
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
   * The process is delegated to the {@link FormDelegate.validate}.
   *
   * @returns The execution status, or null if no delegate is found.
   */
  validate(args?: Validation.ExecutorOptions): Validation.Status | null {
    const validate = this.#getDelegateByKey(FormDelegate.validate);
    if (!validate) return null;
    return this.#validation.request(validate, args);
  }

  /** Get a field by name */
  #getField(fieldName: FormField.Name<T>) {
    let field = this.#fields.get(fieldName);
    if (!field) {
      field = new FormField({
        form: this,
        formErrors: this.#validation.errors,
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

  /** Create a binding to multiple fields */
  #bindToMultiField: FormBindingFunc.ForMultiField<T> = (
    fieldNames: FormField.Name<T>[],
    binding: FormBindingConstructor.ForMultiField,
    config?: FormBindingFunc.Config
  ) => {
    const key = `${fieldNames.join(",")}@${binding.name}:${config?.cacheKey}`;
    const instance = this.#defineBinding(key, () => {
      const fields = fieldNames.map((name) => this.#getField(name));
      return new binding(fields, config);
    });
    instance.config = config; // Update on every call
    return instance.props;
  };

  /** Bind to a field or the form */
  bind: FormBindingFunc<T> = (...args: any[]) => {
    if (typeof args[0] === "string") {
      return this.#bindToField(args[0] as any, args[1], args[2]);
    }
    if (Array.isArray(args[0])) {
      return this.#bindToMultiField(args[0], args[1], args[2]);
    }
    return this.#bindToForm(args[0], args[1]);
  };

  /** Get the error messages for a field */
  getError(fieldName: FormField.Name<T>, includePreReported = false) {
    const field = this.#getField(fieldName);

    if (!includePreReported && !field.isErrorReported) {
      return null;
    }

    // Reading errors from FormField#errors is computed,
    // so notifications only trigger when the error of the specific field changes
    return field.errors;
  }

  /**
   * Get the internal properties of the form.
   *
   * For internal testing purposes only.
   *
   * @internal
   */
  [internalToken]() {
    return {
      getField: this.#getField.bind(this),
      fields: this.#fields,
      bindings: this.#bindings,
      validation: this.#validation,
    };
  }
}

/** @internal */
export function getInternal<T>(form: Form<T>) {
  return form[internalToken]();
}
