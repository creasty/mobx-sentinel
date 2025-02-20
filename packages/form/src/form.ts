import { action, computed, makeObservable, observable, reaction } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { KeyPath, Validator, Watcher, StandardNestedFetcher, buildKeyPath, KeyPathSelf } from "@mobx-sentinel/core";
import { FormField } from "./field";
import { FormBinding, FormBindingConstructor, FormBindingFunc, getSafeBindingName } from "./binding";
import { FormConfig, globalConfig } from "./config";
import { Submission } from "./submission";

const registry = new WeakMap<object, Map<symbol, Form<any>>>();
const defaultFormKey = Symbol("form.defaultFormKey");
const internalToken = Symbol("form.internalToken");

export class Form<T> {
  readonly id = uuidV4();
  readonly #formKey: symbol;
  readonly watcher: Watcher;
  readonly validator: Validator<T>;
  readonly #submission = new Submission();
  readonly #fields = new Map<string, FormField>();
  readonly #bindings = new Map<string, FormBinding>();
  readonly #nestedFetchers: StandardNestedFetcher<Form<any>>;
  readonly #localConfig = observable.box<Partial<FormConfig>>({});

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
   *
   * @throws TypeError when the subject is not an object.
   */
  static get<T extends object>(subject: T, formKey?: symbol): Form<T> {
    const form = this.getSafe(subject, formKey);
    if (!form) {
      throw new TypeError("subject: Expected an object");
    }
    return form;
  }

  /**
   * Get the form instance for a subject.
   *
   * Same as {@link Form.get} but returns null instead of throwing an error.
   */
  static getSafe<T extends object>(subject: T, formKey?: symbol): Form<T> | null {
    if (!subject || typeof subject !== "object") {
      return null;
    }

    formKey ??= defaultFormKey;

    let map = registry.get(subject);
    if (!map) {
      map = new Map();
      registry.set(subject, map);
    }

    let instance = map.get(formKey);
    if (!instance) {
      instance = new this<T>(internalToken, {
        subject,
        formKey,
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
      subject: T & object;
      formKey: symbol;
    }
  ) {
    if (token !== internalToken) {
      throw new Error("private constructor");
    }

    this.#formKey = args.formKey;
    this.watcher = Watcher.get(args.subject);
    this.validator = Validator.get(args.subject);
    this.#nestedFetchers = new StandardNestedFetcher(args.subject, (entry) => Form.getSafe(entry.data, this.#formKey));

    makeObservable(this);

    this.#submission.addHandler("didSubmit", (succeed) => {
      if (succeed) {
        this.reset();
      }
    });

    reaction(
      () => this.config.reactiveValidationDelayMs,
      (delay) => (this.validator.reactionDelayMs = delay),
      { fireImmediately: true }
    );
    reaction(
      () => this.config.asyncValidationEnqueueDelayMs,
      (delay) => (this.validator.enqueueDelayMs = delay),
      { fireImmediately: true }
    );
    reaction(
      () => this.config.asyncValidationScheduleDelayMs,
      (delay) => (this.validator.scheduleDelayMs = delay),
      { fireImmediately: true }
    );
  }

  /**
   * The configuration of the form
   *
   * This is a computed value that combines the global configuration and the local configuration.
   */
  @computed.struct
  get config(): Readonly<FormConfig> {
    return {
      ...globalConfig,
      ...this.#localConfig.get(),
    };
  }

  /** Configure the form locally */
  @action.bound
  configure: {
    /** Override the global configuration locally */
    (config: Partial<Readonly<FormConfig>>): void;
    /** Reset to the global configuration */
    (reset: true): void;
  } = (arg0) => {
    if (typeof arg0 === "object") {
      Object.assign(this.#localConfig.get(), arg0);
    } else {
      this.#localConfig.set({});
    }
  };

  /** Whether the form is dirty (including sub-forms) */
  get isDirty() {
    return this.watcher.changed;
  }

  /** Whether the form is valid (including sub-forms) */
  get isValid() {
    return this.validator.isValid;
  }

  /** The number of invalid fields */
  get invalidFieldCount() {
    return this.validator.invalidKeyCount;
  }

  /** The number of total invalid field paths (counts invalid fields in sub-forms) */
  get invalidFieldPathCount() {
    return this.validator.invalidKeyPathCount;
  }

  /** Whether the form is in validator state */
  get isValidating() {
    return this.validator.isValidating;
  }

  /** Whether the form is in submitting state */
  get isSubmitting() {
    return this.#submission.isRunning;
  }

  /** Whether the form is busy (submitting or validating) */
  @computed
  get isBusy() {
    return this.isSubmitting || this.isValidating;
  }

  /** Whether the form can be submitted */
  @computed
  get canSubmit() {
    return (
      !this.isBusy &&
      (this.config.allowSubmitInvalid || this.isValid) &&
      (this.config.allowSubmitNonDirty || this.isDirty)
    );
  }

  /**
   * Sub-forms within the form.
   *
   * Forms are collected via `@nested` annotation.
   */
  @computed.struct
  get subForms(): ReadonlyMap<KeyPath, Form<any>> {
    const result = new Map<KeyPath, Form<any>>();
    for (const entry of this.#nestedFetchers) {
      result.set(entry.keyPath, entry.data);
    }
    return result;
  }

  /** Report error states on all fields and sub-forms */
  @action
  reportError() {
    for (const field of this.#fields.values()) {
      field.reportError();
    }
    for (const entry of this.#nestedFetchers) {
      entry.data.reportError();
    }
  }

  /** Reset the form's state */
  @action
  reset() {
    this.validator.reset();
    this.watcher.reset();
    for (const field of this.#fields.values()) {
      field.reset();
    }
    for (const entry of this.#nestedFetchers) {
      entry.data.reset();
    }
  }

  /** Mark the form as dirty */
  @action
  markAsDirty() {
    this.watcher.assumeChanged();
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
  validate(...args: Parameters<Validator<T>["request"]>) {
    this.validator.request(...args);
  }

  /**
   * Add a handler to the form
   *
   * @returns A function to remove the handler.
   */
  addHandler<K extends keyof Form.Handlers<T>>(
    event: K,
    handler: Form.Handlers<T>[NoInfer<K>],
    options?: Form.HandlerOptions[NoInfer<K>]
  ) {
    switch (event) {
      case "willSubmit":
      case "submit":
      case "didSubmit":
        return this.#submission.addHandler(event, handler as any);
      case "asyncValidate":
        return this.validator.addAsyncHandler(handler as any, options);
      case "validate":
        return this.validator.addReactiveHandler(handler as any, options);
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
        validator: this.validator,
        getFinalizationDelayMs: () => this.config.autoFinalizationDelayMs,
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

  /**
   * Get the error messages for a field
   *
   * @param fieldName - The field name to get errors for.
   * @param includePreReported - Whether to include errors that are yet to be reported.
   */
  getErrors(fieldName: FormField.Name<T>, includePreReported = false): ReadonlySet<string> {
    const field = this.getField(fieldName);

    if (!includePreReported && !field.isErrorReported) {
      return new Set();
    }

    // Reading errors from FormField#errors is computed,
    // so notifications only trigger when the error of the specific field changes
    return field.errors;
  }

  /**
   * Get all error messages for the form
   *
   * @param fieldName - The field name to get errors for. If omitted, all errors are returned.
   */
  getAllErrors(fieldName?: FormField.Name<T>) {
    return this.validator.getErrorMessages(fieldName ? buildKeyPath(fieldName) : KeyPathSelf, true);
  }

  /** The first error message (including nested objects) */
  @computed
  get firstErrorMessage() {
    return this.validator.firstErrorMessage;
  }

  /** @internal @ignore */
  [internalToken]() {
    return {
      fields: this.#fields,
      bindings: this.#bindings,
      submission: this.#submission,
    };
  }
}

export namespace Form {
  export type Handlers<T> = Submission.Handlers & {
    asyncValidate: Validator.AsyncHandler<T>;
    validate: Validator.ReactiveHandler<T>;
  };
  export type HandlerOptions = {
    willSubmit: never;
    submit: never;
    didSubmit: never;
    asyncValidate: Validator.HandlerOptions;
    validate: Validator.HandlerOptions;
  };
}

/** @internal @ignore */
export function debugForm<T>(form: Form<T>) {
  return form[internalToken]();
}
