import { action, computed, makeObservable, observable } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { KeyPath, type Validator } from "@mobx-sentinel/core";

const internalToken = Symbol("formField.internal");

export class FormField {
  readonly id = uuidV4();
  readonly fieldName: string;
  readonly validator: Validator<any>;
  readonly #getFinalizationDelayMs: () => number;
  readonly #isTouched = observable.box(false);
  readonly #changeType = observable.box<FormField.ChangeType | null>(null);
  readonly #isErrorReported = observable.box(false);
  #timerId: number | null = null;

  /** @ignore */
  constructor(args: { fieldName: string; validator: Validator<any>; getFinalizationDelayMs: () => number }) {
    makeObservable(this);
    this.fieldName = args.fieldName;
    this.validator = args.validator;
    this.#getFinalizationDelayMs = args.getFinalizationDelayMs;
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

  /**
   * Whether the error states has been reported
   *
   * Check this value to determine if errors should be displayed.
   *
   * @returns
   * - 'undefined': Error reporting is pending.
   * - 'false': The field has no errors.
   * - 'true': The field has errors.
   *
   * This distinction is essential for `aria-invalid` attribute.
   */
  @computed
  get isErrorReported() {
    if (!this.#isErrorReported.get()) return undefined;
    return this.hasErrors;
  }

  /**
   * Error messages for the field
   *
   * Regardless of {@link isErrorReported}, this value is always up-to-date.
   */
  @computed.struct
  get errors(): ReadonlySet<string> {
    return this.validator.getErrorMessages(KeyPath.build(this.fieldName));
  }

  /**
   * Whether the field has errors
   *
   * Regardless of {@link isErrorReported}, this value is always up-to-date.
   */
  @computed
  get hasErrors() {
    return this.validator.hasErrors(KeyPath.build(this.fieldName));
  }

  /** Reset the field to its initial state */
  @action
  reset() {
    this.#changeType.set(null);
    this.#isTouched.set(false);
    this.#isErrorReported.set(false);
    this.#cancelFinalizeChangeWithDelay();
  }

  /** Mark the field as touched (usually triggered by onFocus) */
  @action
  markAsTouched() {
    this.#isTouched.set(true);
  }

  /** Mark the field as changed (usually triggered by onChange) */
  @action
  markAsChanged(type: FormField.ChangeType = "final") {
    this.#changeType.set(type);

    switch (type) {
      case "final": {
        this.#cancelFinalizeChangeWithDelay();
        this.reportError();
        break;
      }
      case "intermediate": {
        this.#finalizeChangeWithDelay();
        break;
      }
    }
  }

  /** Report the errors of the field */
  @action
  reportError() {
    this.#isErrorReported.set(true);
  }

  /** Finalize the intermediate change if needed (usually triggered by onBlur) */
  finalizeChangeIfNeeded() {
    this.#cancelFinalizeChangeWithDelay();
    if (this.isIntermediate) {
      this.markAsChanged("final");
    }
  }

  #finalizeChangeWithDelay() {
    this.#cancelFinalizeChangeWithDelay();
    this.#timerId = +setTimeout(() => {
      this.finalizeChangeIfNeeded();
    }, this.#getFinalizationDelayMs());
  }

  #cancelFinalizeChangeWithDelay() {
    if (this.#timerId) {
      clearTimeout(this.#timerId);
      this.#timerId = null;
    }
  }

  /** @internal @ignore */
  [internalToken]() {
    return {
      isErrorReported: this.#isErrorReported,
    };
  }
}

export namespace FormField {
  /** Strict field name */
  export type NameStrict<T> = keyof T & string;
  /** Augmented field name with an arbitrary suffix followed by a colon */
  export type NameAugmented<T> = `${NameStrict<T>}:${string}`;
  /** Field name */
  export type Name<T> = NameStrict<T> | NameAugmented<T>;

  /**
   * The type of change that has occurred in the field.
   *
   * - "final" - The input is complete and no further update is necessary to make it valid.
   * - "intermediate" - The input is incomplete and does not yet conform to the expected format.
   */
  export type ChangeType = "final" | "intermediate";
}

/** @internal @ignore */
export function debugFormField(field: FormField) {
  return field[internalToken]();
}
