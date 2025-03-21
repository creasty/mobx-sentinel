import { action, computed, makeObservable, observable } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { Validator, Watcher, StandardNestedFetcher, KeyPath } from "@mobx-sentinel/core";
import { FormField } from "./field";
import { FormBinding, FormBindingConstructor, FormBindingFunc, getSafeBindingName } from "./binding";
import { FormConfig, globalConfig } from "./config";
import { Submission } from "./submission";

const registry = new WeakMap<object, Map<symbol, Form<any>>>();
const defaultFormKey = Symbol("form.defaultFormKey");
const internalToken = Symbol("form.internalToken");

/**
 * Form manages submission, fields, and bindings.
 *
 * Key features:
 * - Manages form fields and their states
 * - Supports nested forms
 * - Manages form submission lifecycle
 * - Provides binding system for UI integration
 * - Integrates with Watcher for change detection
 * - Integrates with Validator for validation
 */
export class Form<T> {
  readonly id = uuidV4();
  readonly #formKey: symbol;
  readonly watcher: Watcher;
  readonly validator: Validator<T>;
  readonly #nestedFetcher: StandardNestedFetcher<Form<any>>;
  readonly #submission = new Submission();
  readonly #fields = new Map<string, FormField>();
  readonly #bindings = new Map<string, FormBinding>();
  readonly #localConfig = observable.box<Partial<FormConfig>>({});

  /** Extension fields for bindings */
  [k: `bind${Capitalize<string>}`]: unknown;

  /**
   * Get a form instance for the subject.
   *
   * @remarks
   * - Returns existing instance if one exists for the subject
   * - Creates new instance if none exists
   * - Instances are cached and garbage collected with their subjects
   * - Multiple forms per subject supported via `formKey`
   *
   * @param subject The model object to create form for
   * @param formKey Optional key for multiple forms per subject
   *
   * @throws `TypeError` if subject is not an object
   */
  static get<T extends object>(subject: T, formKey?: symbol): Form<T> {
    const form = this.getSafe(subject, formKey);
    if (!form) {
      throw new TypeError("subject: Expected an object");
    }
    return form;
  }

  /**
   * Get a form instance for the subject.
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
   * Manually dispose the form instance for the subject.
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
    this.#nestedFetcher = new StandardNestedFetcher(args.subject, (entry) => Form.getSafe(entry.data, this.#formKey));

    makeObservable(this);

    this.#submission.addHandler("didSubmit", (succeed) => {
      if (succeed) {
        this.reset();
      }
    });
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

  /**
   * Whether the form is dirty (including sub-forms)
   *
   * @remarks Alias for {@link Watcher.changed}.
   */
  get isDirty() {
    return this.watcher.changed;
  }

  /**
   * Whether the form is valid (including sub-forms)
   *
   * @remarks Alias for {@link Validator.isValid}.
   */
  get isValid() {
    return this.validator.isValid;
  }

  /**
   * The number of invalid fields
   *
   * @remarks Alias for {@link Validator.invalidKeyCount}.
   */
  get invalidFieldCount() {
    return this.validator.invalidKeyCount;
  }

  /**
   * The number of total invalid field paths (counts invalid fields in sub-forms)
   *
   * @remarks Alias for {@link Validator.invalidKeyPathCount}.
   */
  get invalidFieldPathCount() {
    return this.validator.invalidKeyPathCount;
  }

  /**
   * Whether the form is in validator state
   *
   * @remarks Alias for {@link Validator.isValidating}.
   */
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

  /**
   * Whether the form can be submitted
   *
   * @remarks
   * - Checks if the form is not busy
   * - Checks if the form is valid or allows invalid submissions
   * - Checks if the form is dirty or allows non-dirty submissions
   */
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
  get subForms() {
    return this.#nestedFetcher.dataMap;
  }

  /** Report error states on all fields and sub-forms */
  @action
  reportError() {
    for (const field of this.#fields.values()) {
      field.reportError();
    }
    for (const entry of this.#nestedFetcher) {
      entry.data.reportError();
    }
  }

  /**
   * Reset the form's state
   *
   * @remarks
   * - Resets the fields
   * - Resets the sub-forms
   * - Resets the watcher
   * - Does not reset the validator
   */
  @action
  reset() {
    // NOTE: DO NOT reset the validator here.
    this.watcher.reset();
    for (const field of this.#fields.values()) {
      field.reset();
    }
    for (const entry of this.#nestedFetcher) {
      entry.data.reset();
    }
  }

  /**
   * Mark the form as dirty
   *
   * @remarks Alias for {@link Watcher.assumeChanged}.
   */
  markAsDirty() {
    this.watcher.assumeChanged();
  }

  /**
   * Submit the form.
   *
   * @remarks
   * - Checks if {@link canSubmit} is `true`
   * - Executes handlers in order
   * - Aborts if any `submit` handler returns `false`
   * - Handles exceptions in all phases
   * - Resets the form after successful submission
   *
   * @param args.force Whether to force submission even if {@link canSubmit} is `false`.
   *   It cancels any in-progress submission if any.
   *
   * @returns `true` if submission succeeded, `false` if failed or aborted
   */
  async submit(args?: { force?: boolean }) {
    if (!args?.force && !this.canSubmit) return false;
    return this.#submission.exec();
  }

  /**
   * Add a submission handler
   *
   * @remarks
   * Handlers are called in this order:
   * 1. `willSubmit` - Called before submission starts
   * 2. `submit` - Async handlers that perform the submission (serialized)
   * 3. `didSubmit` - Called after submission completes
   *
   * @see {@link Form.Handlers}
   *
   * @returns Function to remove the handler
   */
  addHandler: {
    (event: "willSubmit", handler: Submission.Handlers["willSubmit"]): void;
    (event: "submit", handler: Submission.Handlers["submit"]): void;
    (event: "didSubmit", handler: Submission.Handlers["didSubmit"]): void;
  } = (...args) => this.#submission.addHandler(...args);

  /**
   * Get a field by name
   *
   * @remarks Fields are cached and reused.
   */
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

  /**
   * Create UI binding for form elements
   *
   * @remarks
   * - Can bind to individual fields
   * - Can bind to multiple fields
   * - Can bind to the entire form
   * - Bindings are cached and reused
   * - Supports configuration via binding classes
   */
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
   * Get error messages for a field
   *
   * @param fieldName Field to get errors for
   * @param includePreReported Whether to include errors not yet reported
   *
   * @returns Set of error messages
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
   * @param fieldName Field to get errors for. If omitted, all errors are returned.
   *
   * @returns Set of error messages
   */
  getAllErrors(fieldName?: FormField.Name<T>) {
    return this.validator.getErrorMessages(fieldName ? KeyPath.build(fieldName) : KeyPath.Self, true);
  }

  /**
   * The first error message (including nested objects)
   *
   * @remarks Alias for {@link Validator.firstErrorMessage}.
   */
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
  /** @inline */
  export type Handlers = Submission.Handlers;
}

/** @internal @ignore */
export function debugForm<T>(form: Form<T>) {
  return form[internalToken]();
}
