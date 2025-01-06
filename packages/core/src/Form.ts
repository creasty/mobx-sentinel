import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { FormField, FormFieldName } from "./FormField";
import { FormBinding, FormBindingConstructor, FormBindingFunc } from "./binding";
import { FormConfig, defaultConfig } from "./config";
import { FormValidationResult, toErrorMap } from "./validation";
import { FormDelegate, getDelegation, isEligibleForConnecting } from "./delegation";

const registry = new WeakMap<object, Map<Symbol, Form<any>>>();
const registryDefaultKey = Symbol("Form.registryDefaultKey");

const privateConstructorToken = Symbol("Form.privateConstructor");

export class Form<T> {
  readonly id = uuidV4();
  private readonly registryKey?: symbol;
  delegate?: FormDelegate<T>;
  config: FormConfig;
  private readonly fields = new Map<string, FormField>();
  private readonly bindings = new Map<string, FormBinding>();

  @observable.struct private errors = new Map<string, string[]>();
  /** Whether the form is in submitting state */
  @observable isSubmitting = false;
  /** Whether the form is in validation state */
  @observable isValidating = false;
  /** Whether the form is dirty */
  @observable isDirty = false;
  /** Whether the validity has been reported */
  @observable isValidityReported = false;

  /** Extension fields for bindings */
  [k: `bind${Capitalize<string>}`]: unknown;

  /**
   * Get the form instance for a subject.
   *
   * Returns the existing form instance if the subject is already associated with one.
   * Otherwise, creates a new form instance and associates it with the subject.
   *
   * @param subject The subject to associate with the form
   * @param key The key to associate with the form.
   *   If you need to associate multiple forms with the same subject, use different keys.
   */
  static get<T extends object>(subject: T, key?: symbol): Form<T> {
    let map = registry.get(subject);
    if (!map) {
      map = new Map();
      registry.set(subject, map);
    }
    if (!key) {
      key = registryDefaultKey;
    }
    let instance = map.get(key);
    if (!instance) {
      const delegate = getDelegation(subject);
      instance = new Form<T>(privateConstructorToken, {
        registryKey: key,
        delegate,
        config: delegate?.[FormDelegate.config],
      });
      map.set(key, instance);
    }
    return instance;
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
    this.registryKey = args?.registryKey;
    this.delegate = args?.delegate;
    this.config = { ...defaultConfig, ...args?.config };
  }

  /** Whether the form is valid */
  @computed
  get isValid() {
    return this.invalidFieldCount === 0;
  }

  /**
   * The number of invalid fields
   *
   * Includes {@link invalidNestedFormCount}.
   */
  @computed
  get invalidFieldCount() {
    return this.errors.size + this.invalidNestedFormCount;
  }

  /** Whether the form can be submitted */
  @computed
  get canSubmit() {
    return !this.isSubmitting && !this.isValidating && this.isValid && this.isDirty;
  }

  /**
   * Nested forms within the form.
   *
   * Forms are collected from the {@link FormDelegate.connect}.
   */
  @computed.struct
  get nestedForms(): ReadonlySet<Form<unknown>> {
    const forms = new Set<Form<unknown>>();

    const connect = this.delegate?.[FormDelegate.connect]?.bind(this.delegate);
    if (connect) {
      for (const nestedField of connect()) {
        if (!isEligibleForConnecting(nestedField)) continue;
        const form = Form.get(nestedField, this.registryKey);
        forms.add(form);
      }
    }

    return forms;
  }

  /** The number of invalid nested forms */
  @computed
  get invalidNestedFormCount() {
    let count = 0;
    for (const form of this.nestedForms) {
      count += form.isValid ? 0 : 1; // TODO: Should we take isValidityReported into account?
    }
    return count;
  }

  /** Report validity on all fields and nested forms */
  @action
  reportValidity() {
    this.isValidityReported = true;
    for (const [, field] of this.fields) {
      field.reportValidity();
    }
    for (const form of this.nestedForms) {
      form.reportValidity();
    }
  }

  /** Reset the form's state */
  @action
  reset() {
    this.isDirty = false;
    this.isValidityReported = false;
    this.fields.forEach((field) => field.reset());
  }

  /** Get the error messages for a field */
  getFieldError(fieldName: FormFieldName<T>) {
    const messages = this.errors.get(fieldName);
    if (!messages) return null;

    const field = this.fields.get(fieldName);
    if (!field) return null;
    if (!field.isValidityReported) return null;

    return messages;
  }

  /** Submit the form */
  async submit(args?: { force?: boolean }) {
    const submit = this.delegate?.[FormDelegate.submit]?.bind(this.delegate);
    if (!submit) return;

    // Check if the form can be submitted
    if (!this.canSubmit) return;

    if (args?.force) {
      this.submitAbortCtrl?.abort();
      this.submitAbortCtrl = null;
    } else if (this.isSubmitting) {
      return;
    }

    // Start submitting
    runInAction(() => {
      this.isSubmitting = true;
    });
    let succeed = false;
    try {
      const abortCtrl = new AbortController();
      this.submitAbortCtrl = abortCtrl;
      succeed = await submit(abortCtrl.signal);
    } finally {
      this.submitAbortCtrl = null;
      runInAction(() => {
        this.isSubmitting = false;
        if (succeed) {
          this.reset();
        }
      });
    }
  }
  private submitAbortCtrl: AbortController | null = null;

  /** Validate the form */
  async validate(args?: { force?: boolean }) {
    const validate = this.delegate?.[FormDelegate.validate]?.bind(this.delegate);
    if (!validate) return;

    if (args?.force) {
      this.validateAbortCtrl?.abort();
      this.validateAbortCtrl = null;
    } else if (this.isValidating) {
      return;
    }

    // Start validating
    runInAction(() => {
      this.isValidating = true;
    });
    let result: FormValidationResult<T> | undefined;
    try {
      const abortCtrl = new AbortController();
      this.validateAbortCtrl = abortCtrl;
      result = await validate(abortCtrl.signal);
    } finally {
      this.validateAbortCtrl = null;
      runInAction(() => {
        this.isValidating = false;
        if (result) {
          this.errors = toErrorMap(result);
        }
      });
    }
  }
  private validateAbortCtrl: AbortController | null = null;

  /** Define a field by name */
  private defineField(fieldName: FormFieldName<T>) {
    let field = this.fields.get(fieldName);
    if (!field) {
      field = new FormField({
        form: this,
        fieldName: String(fieldName),
      });
      this.fields.set(fieldName, field);
    }
    return field;
  }

  /** Define a binding by key */
  private defineBinding(bindingKey: string, create: () => FormBinding) {
    let binding = this.bindings.get(bindingKey);
    if (!binding) {
      binding = create();
      this.bindings.set(bindingKey, binding);
    }
    return binding;
  }

  /** Create a binding to a field */
  private bindToField: FormBindingFunc.ForField<T> = (
    fieldName: FormFieldName<T>,
    binding: FormBindingConstructor.ForField,
    config?: FormBindingFunc.Config
  ) => {
    const key = `${fieldName}@${binding.name}:${config?.cacheKey}`;
    const instance = this.defineBinding(key, () => {
      const field = this.defineField(fieldName);
      return new binding(field, config);
    });
    instance.config = config; // Update on every call
    return instance.props;
  };

  /** Create a binding to the form */
  private bindToForm: FormBindingFunc.ForForm<Form<T>> = (
    binding: FormBindingConstructor.ForForm<Form<T>>,
    config?: FormBindingFunc.Config
  ) => {
    const key = `${binding.name}:${config?.cacheKey}`;
    const instance = this.defineBinding(key, () => new binding(this, config));
    instance.config = config; // Update on every call
    return instance.props;
  };

  /** Bind to a field or the form */
  bind: FormBindingFunc<Form<T>, T> = (...args: any[]) => {
    if (typeof args[0] === "string") {
      return this.bindToField(args[0], args[1], args[2]);
    }
    return this.bindToForm(args[0], args[1]);
  };
}
