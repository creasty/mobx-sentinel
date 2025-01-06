import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { v4 as uuidV4 } from "uuid";
import type { Form } from "./Form";

export type FormFieldNameStrict<T> = keyof T & string;
export type FormFieldName<T> = FormFieldNameStrict<T> | (string & {});

export class FormField {
  readonly id = uuidV4();
  private readonly form: Form<unknown>;
  readonly fieldName: string;

  /** Whether the field is touched */
  @observable isTouched = false;
  /** Whether the field value is changed */
  @observable isChanged = false;
  /** Whether the field value is provisional */
  @observable isProvisional = false;

  constructor(args: { form: Form<any>; fieldName: string }) {
    makeObservable(this);
    this.form = args.form;
    this.fieldName = args.fieldName;
  }

  @computed
  get isValidityReportable() {
    return this.isChanged && !this.isProvisional;
  }

  @action
  markAsChanged(type: "committed" | "provisional") {
    this.form.isDirty = true;
    this.isChanged = true;
    this.isProvisional = type === "provisional";
  }

  @action
  markAsTouched() {
    this.isTouched = true;
  }

  @action
  reportValidity() {
    this.isProvisional = false;
    this.isChanged = true;
  }

  @action
  reset() {
    this.isChanged = false;
    this.isTouched = false;
    this.isProvisional = false;
  }

  validate() {
    this.cancelDelayedValidation();
    this.form.validate().catch((e) => void e);
  }

  validateWithDelay() {
    this.cancelDelayedValidation();
    this.validationTimerId = setTimeout(() => {
      this.validate();
      runInAction(() => {
        this.isProvisional = false;
      });
    }, this.form.config.interimValidationDelayMs);
  }

  private cancelDelayedValidation() {
    if (!this.validationTimerId) return;
    clearTimeout(this.validationTimerId as any);
    this.validationTimerId = null;
  }
  private validationTimerId: number | null = null;
}
