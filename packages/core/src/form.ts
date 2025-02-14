import { action, computed, makeObservable, observable, reaction } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { Validator, Watcher, getValidator, getWatcher } from "@form-model/validation";
import { FormField } from "./field";
import { FormBinding, FormBindingConstructor, FormBindingFunc, getSafeBindingName } from "./binding";
import { FormConfig, globalConfig } from "./config";
import { FormDelegate, getDelegation } from "./delegation";
import { Submission } from "./submission";

const registry = new WeakMap<object, Map<symbol, Form<any>>>();
const defaultFormKey = Symbol("Form.defaultFormKey");
const internalToken = Symbol("Form.internalToken");

export class Form<T> {
  readonly id = uuidV4();
  readonly #delegate?: FormDelegate;
  readonly #formKey: symbol;
  readonly watcher: Watcher;
  readonly validator: Validator;
  readonly #submission = new Submission();
  readonly #isDirty = observable.box(false);
  readonly #fields = new Map<string, FormField>();
  readonly #bindings = new Map<string, FormBinding>();

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
      const watcher = getWatcher(subject);
      const validator = getValidator(subject);
      instance = new Form<T>(internalToken, {
        formKey,
        delegate,
        watcher,
        validator,
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
    args: {
      formKey: symbol;
      delegate?: FormDelegate;
      watcher: Watcher;
      validator: Validator;
    }
  ) {
    if (token !== internalToken) {
      throw new Error("Instantiate Form via Form.get() instead");
    }
    makeObservable(this);
    this.#formKey = args.formKey;
    this.#delegate = args.delegate;
    this.watcher = args.watcher;
    this.validator = args.validator;

    reaction(
      () => this.watcher.changedTick,
      () => {
        this.markAsDirty();
        this.validate();
      }
    );
    this.#submission.addHandler("submit", async (abortSignal) => {
      const submit = this.#getDelegateByKey(FormDelegate.submit);
      if (!submit) return true;
      return await submit(abortSignal);
    });
    this.#submission.addHandler("didSubmit", (succeed) => {
      if (succeed) {
        this.reset();
      }
    });
  }

  /**
   * Get the delegate value by key.
   *
   * Returns an object, or a method that is bound to the delegate.
   */
  #getDelegateByKey<K extends symbol & keyof FormDelegate>(key: K): FormDelegate[K] | undefined {
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
    return this.#submission.isRunning;
  }

  /** Whether the form is in validator state */
  @computed
  get isValidating() {
    return this.validator.state !== "idle";
  }

  /** Whether the form can be submitted */
  @computed
  get canSubmit() {
    return !this.isSubmitting && !this.isValidating && this.isValid && this.isDirty;
  }

  /** Whether the form is valid (including sub-forms) */
  get isValid() {
    return this.invalidFieldCount === 0 && this.invalidSubFormCount === 0;
  }

  /** Whether the form is dirty (including sub-forms) */
  @computed
  get isDirty() {
    return this.#isDirty.get() || this.watcher.changed || this.dirtySubFormCount > 0;
  }

  /**
   * The number of invalid fields
   *
   * Note that this does not include the number of invalid fields of sub-forms.
   */
  @computed
  get invalidFieldCount() {
    return this.validator.errors.size;
  }

  /**
   * The number of total invalid fields (including sub-forms)
   */
  @computed
  get totalInvalidFieldCount() {
    let count = this.invalidFieldCount;
    for (const form of this.subForms) {
      count += form.totalInvalidFieldCount;
    }
    return count;
  }

  /**
   * Sub-forms within the form.
   *
   * Forms are collected from the {@link FormDelegate.connect}.
   */
  @computed.struct
  get subForms(): ReadonlySet<Form<unknown>> {
    const forms = new Set<Form<unknown>>();

    for (const object of this.watcher.nestedObjects) {
      if (!object || typeof object !== "object") continue;
      const form = Form.get(object, this.#formKey);
      forms.add(form);
    }

    return forms;
  }

  /**
   * The number of invalid sub-forms
   *
   * Note that this is not the number of fields.
   */
  @computed
  get invalidSubFormCount() {
    let count = 0;
    for (const form of this.subForms) {
      count += form.isValid ? 0 : 1;
    }
    return count;
  }

  /**
   * The number of dirty sub-forms
   *
   * Note that this is not the number of fields.
   */
  @computed
  get dirtySubFormCount() {
    let count = 0;
    for (const form of this.subForms) {
      count += form.isDirty ? 1 : 0;
    }
    return count;
  }

  /** Report error states on all fields and sub-forms */
  @action
  reportError() {
    for (const field of this.#fields.values()) {
      field.reportError();
    }
    for (const form of this.subForms) {
      form.reportError();
    }
  }

  /** Reset the form's state */
  @action
  reset() {
    this.#isDirty.set(false);
    this.validator.reset();
    this.watcher.reset();
    for (const field of this.#fields.values()) {
      field.reset();
    }
    for (const form of this.subForms) {
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
   * @returns true when the submission succeeded.
   */
  async submit(args?: { force?: boolean }) {
    if (!args?.force && !this.canSubmit) return false;
    return this.#submission.exec();
  }

  /** Validate the form */
  validate(args?: {
    /** Force the validator to be executed immediately */
    force?: boolean;
  }) {
    this.validator.request({
      force: !!args?.force,
      enqueueDelayMs: this.config.validationDelayMs,
      scheduleDelayMs: this.config.subsequentValidationDelayMs,
    });
  }

  /**
   * Subscribe to the form events.
   *
   * @returns A function to unsubscribe from the event.
   */
  addHandler<K extends keyof Form.EventHandlers<T>>(event: K, handler: Form.EventHandlers<T>[K]) {
    switch (event) {
      case "willSubmit":
      case "submit":
      case "didSubmit":
        return this.#submission.addHandler(event, handler as any);
      case "validate":
        return this.validator.addHandler(handler as any);
      default:
        event satisfies never;
        throw new Error(`Invalid event: ${event}`);
    }
  }

  /** Get a field by name */
  getField(fieldName: FormField.Name<T>) {
    let field = this.#fields.get(fieldName);
    if (!field) {
      field = new FormField({
        fieldName: String(fieldName),
        formErrors: this.validator.errors,
        getFinalizationDelayMs: () => this.config.intermediateValidationDelayMs,
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
    const key = `${getSafeBindingName(binding)}:${config?.cacheKey}`;
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
    const key = `${fieldName}@${getSafeBindingName(binding)}:${config?.cacheKey}`;
    const instance = this.#defineBinding(key, () => {
      const field = this.getField(fieldName);
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
    const key = `${fieldNames.join(",")}@${getSafeBindingName(binding)}:${config?.cacheKey}`;
    const instance = this.#defineBinding(key, () => {
      const fields = fieldNames.map((name) => this.getField(name));
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
    const field = this.getField(fieldName);

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
   * @ignore
   */
  [internalToken]() {
    return {
      fields: this.#fields,
      bindings: this.#bindings,
      submission: this.#submission,
    };
  }
}

export namespace Form {
  export type EventHandlers<T> = Submission.EventHandlers & {
    validate: Validator.Handler<T>;
  };
}

/** @internal */
export function getInternal<T>(form: Form<T>) {
  return form[internalToken]();
}
