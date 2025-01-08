import { action, computed, makeObservable, observable } from "mobx";
import { v4 as uuidV4 } from "uuid";
import type { Form } from "./Form";
import { ErrorMap } from "./validation";

export class FormField {
  readonly id = uuidV4();
  readonly fieldName: string;
  readonly #form: Form<unknown>;
  readonly #formErrors: ErrorMap;
  readonly #isTouched = observable.box(false);
  readonly #changeType = observable.box<FormField.ChangeType | null>(null);
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
  /**
   * Whether the field value is intermediate (partial input).
   *
   * The input is incomplete and does not yet conform to the expected format.
   * Example: Typing "user@" in an email field.
   */
  get isIntermediate() {
    return this.#changeType.get() === "intermediate";
  }
  /** Whether the field value is changed */
  get isChanged() {
    return !!this.#changeType.get();
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
  markAsChanged(type: FormField.ChangeType = "final") {
    this.#form.markAsDirty();
    this.#changeType.set(type);
    this.#isValidityReported.set(this.isChanged && !this.isIntermediate);
  }

  @action
  reportValidity() {
    this.#isValidityReported.set(true);
  }

  @action
  reset() {
    this.#changeType.set(null);
    this.#isTouched.set(false);
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
      this.markAsChanged("final");
    }, this.#form.config.interimValidationDelayMs);
  }

  cancelDelayedValidation() {
    if (!this.#validationTimerId) return;
    clearTimeout(this.#validationTimerId);
    this.#validationTimerId = null;
  }
  #validationTimerId: any | null = null;
}

export namespace FormField {
  export type NameStrict<T> = keyof T & string;
  export type Name<T> = NameStrict<T> | (string & {});

  /**
   * The type of change that has occurred in the field.
   *
   * - "final" - The input is complete and no further update is necessary to make it valid.
   * - "intermediate" - The input is incomplete and does not yet conform to the expected format.
   */
  export type ChangeType = "final" | "intermediate";
}
