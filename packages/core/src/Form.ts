import { observable, makeObservable, computed, runInAction, action } from "mobx";
import { FormField, FormFieldName } from "./FormField";
import { FormValidationResult, toErrorMap } from "./validation";
import {
  FormBindingConstructorForField,
  FormBindingFuncForField,
  FormBindingFuncConfig,
  FormBindingFuncForForm,
  FormBindingConstructorForForm,
  FormBinding,
  FormBindingFunc,
} from "./binding";
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

  @computed
  get canSubmit() {
    return !this.isSubmitting && !this.isValidating && this.isValid && this.isDirty;
  }

  @action
  reset() {
    this.isDirty = false;
    this.fields.forEach((field) => field.reset());
  }

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

  private defineBinding(bindingKey: string, create: () => FormBinding) {
    let binding = this.bindings.get(bindingKey);
    if (!binding) {
      binding = create();
      this.bindings.set(bindingKey, binding);
    }
    return binding;
  }

  private bindToField: FormBindingFuncForField<T> = (
    fieldName: FormFieldName<T>,
    binding: FormBindingConstructorForField,
    config?: FormBindingFuncConfig
  ) => {
    const key = `${fieldName}@${binding.name}:${config?.cacheKey}`;
    const instance = this.defineBinding(key, () => {
      const field = this.defineField(fieldName);
      return new binding(field, config);
    });
    instance.config = config; // Update on every call
    return instance.props;
  };

  private bindToForm: FormBindingFuncForForm<Form<T>> = (
    binding: FormBindingConstructorForForm<Form<T>>,
    config?: FormBindingFuncConfig
  ) => {
    const key = `${binding.name}:${config?.cacheKey}`;
    const instance = this.defineBinding(key, () => new binding(this, config));
    instance.config = config; // Update on every call
    return instance.props;
  };

  bind: FormBindingFunc<Form<T>, T> = (...args: any[]) => {
    if (typeof args[0] === "string") {
      return this.bindToField(args[0], args[1], args[2]);
    }
    return this.bindToForm(args[0], args[1]);
  };

  async submit(args?: { force?: boolean }) {
    if (!this.canSubmit) return;

    const submit = this.delegate?.submit;
    if (!submit) return;

    if (args?.force) {
      this.submitAbortCtrl?.abort();
      this.submitAbortCtrl = null;
    } else if (this.isSubmitting) {
      return;
    }

    const abortController = new AbortController();
    this.submitAbortCtrl = abortController;
    runInAction(() => (this.isSubmitting = true));

    let succeed = false;
    try {
      succeed = await submit(abortController.signal);
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

  async validate(args?: { force?: boolean }) {
    const validate = this.delegate?.validate;
    if (!validate) return;

    if (args?.force) {
      this.validateAbortCtrl?.abort();
      this.validateAbortCtrl = null;
    } else if (this.isValidating) {
      return;
    }

    runInAction(() => (this.isValidating = true));
    const abortController = new AbortController();
    this.validateAbortCtrl = abortController;
    try {
      const result = await validate(abortController.signal);
      runInAction(() => {
        this.isValidating = false;
        this.errors = toErrorMap(result);
      });
    } finally {
      this.validateAbortCtrl = null;
      runInAction(() => (this.isValidating = false));
    }
  }
  private validateAbortCtrl: AbortController | null = null;

  @action
  reportValidityOnAllFields() {
    for (const [, field] of this.fields) {
      field.reportValidity();
    }
  }

  getFieldError(fieldName: FormFieldName<T>) {
    const messages = this.errors.get(fieldName);
    if (!messages) return null;

    const field = this.fields.get(fieldName);
    if (!field) return null;
    if (!field.isValidityReportable) return null;

    return messages;
  }
}
