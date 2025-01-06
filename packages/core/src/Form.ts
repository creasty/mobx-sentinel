import { observable, makeObservable, computed, runInAction, action } from "mobx";
import { FormField, FormFieldName } from "./FormField";
import { FormValidationResult, toErrorMap } from "./validation";
import { FormBinding, FormBindingConstructor, FormBindingFunc } from "./binding";
import { FormConfig, defaultConfig } from "./config";

export interface FormDelegate<T = object> {
  submit?(abortSignal: AbortSignal): Promise<boolean>;
  validate?(abortSignal: AbortSignal): Promise<FormValidationResult<T>>;
}

export class Form<T> {
  readonly id = crypto.randomUUID();
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

  /** Extension fields for bindings */
  [k: `bind${Capitalize<string>}`]: unknown;

  constructor(args?: { delegate?: FormDelegate<T>; config?: Partial<FormConfig> }) {
    makeObservable(this);
    this.delegate = args?.delegate;
    this.config = { ...defaultConfig, ...args?.config };
  }

  /** Whether the form is valid */
  @computed
  get isValid() {
    return this.invalidFieldCount === 0;
  }

  /** The number of invalid fields */
  @computed
  get invalidFieldCount() {
    return this.errors.size;
  }

  /** Whether the form can be submitted */
  @computed
  get canSubmit() {
    return !this.isSubmitting && !this.isValidating && this.isValid && this.isDirty;
  }

  /** Reset the form's state */
  @action
  reset() {
    this.isDirty = false;
    this.fields.forEach((field) => field.reset());
  }

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

  /** Submit the form */
  async submit(args?: { force?: boolean }) {
    const submit = this.delegate?.submit;
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
    const validate = this.delegate?.validate;
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

  @action
  reportValidityOnAllFields() {
    for (const [, field] of this.fields) {
      field.reportValidity();
    }
  }

  /** Get the error messages for a field */
  getFieldError(fieldName: FormFieldName<T>) {
    const messages = this.errors.get(fieldName);
    if (!messages) return null;

    const field = this.fields.get(fieldName);
    if (!field) return null;
    if (!field.isValidityReportable) return null;

    return messages;
  }
}
