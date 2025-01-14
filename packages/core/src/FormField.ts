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
  readonly #isErrorReported = observable.box(false);

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
  /** Whether the error states has been reported */
  get isErrorReported() {
    return this.#isErrorReported.get();
  }

  @computed.struct
  get errors() {
    return this.#formErrors.get(this.fieldName) ?? null;
  }

  @computed
  get hasErrors() {
    return !!this.errors;
  }

  @computed
  get hasReportedErrors() {
    return this.isErrorReported && this.hasErrors;
  }

  @action
  markAsTouched() {
    this.#isTouched.set(true);
  }

  @action
  markAsChanged(type: FormField.ChangeType = "final") {
    this.#form.markAsDirty();
    this.#changeType.set(type);
    this.#isErrorReported.set(this.isChanged && !this.isIntermediate);
  }

  @action
  reportError() {
    this.#isErrorReported.set(true);
  }

  @action
  reset() {
    this.#changeType.set(null);
    this.#isTouched.set(false);
    this.#isErrorReported.set(false);
    this.cancelDelayedValidation();
  }

  validate() {
    this.cancelDelayedValidation();
    this.#form.validate({ force: true });
  }

  validateWithDelay() {
    this.cancelDelayedValidation();
    this.#validationTimerId = setTimeout(() => {
      this.validate();
      this.markAsChanged("final");
    }, this.#form.config.intermediateValidationDelayMs);
  }

  cancelDelayedValidation() {
    if (!this.#validationTimerId) return;
    clearTimeout(this.#validationTimerId);
    this.#validationTimerId = null;
  }
  #validationTimerId: ReturnType<typeof setTimeout> | null = null;
}

export namespace FormField {
  export type NameStrict<T> = keyof T & string;
  export type NameAugmented<T> = `${NameStrict<T>}:${string}`;
  export type Name<T> = NameStrict<T> | NameAugmented<T>;

  /**
   * The type of change that has occurred in the field.
   *
   * - "final" - The input is complete and no further update is necessary to make it valid.
   * - "intermediate" - The input is incomplete and does not yet conform to the expected format.
   */
  export type ChangeType = "final" | "intermediate";
}
