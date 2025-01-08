import { action, computed, makeObservable, observable } from "mobx";
import { v4 as uuidV4 } from "uuid";
import type { Form } from "./Form";
import { ErrorMap } from "./validation";

export type FormFieldNameStrict<T> = keyof T & string;
export type FormFieldName<T> = FormFieldNameStrict<T> | (string & {});

export class FormField {
  readonly id = uuidV4();
  readonly fieldName: string;
  readonly #form: Form<unknown>;
  readonly #formErrors: ErrorMap;
  readonly #isTouched = observable.box(false);
  readonly #isProvisional = observable.box(false);
  readonly #isChanged = observable.box(false);
  readonly #isValidityReported = observable.box(false);

  constructor(args: { form: Form<any>; formErrors: ErrorMap; fieldName: string }) {
    makeObservable(this);
    this.#form = args.form;
    this.#formErrors = args.formErrors;
    this.fieldName = args.fieldName;
  }

  /** Whether the field is touched */
  get isTouched() {
    return this.#isTouched.get();
  }
  /** Whether the field value is provisional */
  get isProvisional() {
    return this.#isProvisional.get();
  }
  /** Whether the field value is changed */
  get isChanged() {
    return this.#isChanged.get();
  }
  /** Whether the field validity has been reported */
  get isValidityReported() {
    return this.#isValidityReported.get();
  }

  @computed.struct
  get errors() {
    return this.#formErrors.get(this.fieldName) ?? null;
  }

  @action
  markAsTouched() {
    this.#isTouched.set(true);
  }

  @action
  markAsChanged(type: "committed" | "provisional") {
    this.#form.markAsDirty();
    this.#isChanged.set(true);
    this.#isProvisional.set(type === "provisional");
    this.#isValidityReported.set(this.isChanged && !this.isProvisional);
  }

  @action
  reportValidity() {
    this.#isValidityReported.set(true);
  }

  @action
  reset() {
    this.#isChanged.set(false);
    this.#isTouched.set(false);
    this.#isProvisional.set(false);
    this.#isValidityReported.set(false);
    this.cancelDelayedValidation();
  }

  validate() {
    this.cancelDelayedValidation();
    this.#form.validate().catch((e) => void e);
  }

  validateWithDelay() {
    this.cancelDelayedValidation();
    this.#validationTimerId = setTimeout(() => {
      this.validate();
      this.markAsChanged("committed");
    }, this.#form.config.interimValidationDelayMs);
  }

  cancelDelayedValidation() {
    if (!this.#validationTimerId) return;
    clearTimeout(this.#validationTimerId);
    this.#validationTimerId = null;
  }
  #validationTimerId: any | null = null;
}
