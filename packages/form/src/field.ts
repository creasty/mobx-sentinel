import { action, comparer, computed, makeObservable, observable, reaction } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { KeyPath, type Validator } from "@mobx-sentinel/core";

const internalToken = Symbol("formField.internal");

/**
 * Form field that tracks input state and validation errors
 *
 * Key features:
 * - Tracks touch state
 * - Handles intermediate (partial) input states
 * - Manages error reporting
 * - Supports auto-finalization of intermediate values
 */
export class FormField {
  readonly id = uuidV4();
  readonly fieldName: string;
  readonly validator: Validator<any>;
  readonly #getFinalizationDelayMs: () => number;
  readonly #isTouched = observable.box(false);
  readonly #changeType = observable.box<FormField.ChangeType | null>(null);
  readonly #isReported = observable.box(false);
  readonly #isReportedDelayed = observable.box(false);
  #timerId: number | null = null;

  /** @ignore */
  constructor(args: { fieldName: string; validator: Validator<any>; getFinalizationDelayMs: () => number }) {
    makeObservable(this);
    this.fieldName = args.fieldName;
    this.validator = args.validator;
    this.#getFinalizationDelayMs = args.getFinalizationDelayMs;

    // Delay the error reporting until the validation is up-to-date.
    reaction(
      () => [this.#isReported.get(), this.validator.isValidating] as const,
      ([isReported, isValidating]) => {
        if (!isValidating) {
          this.#isReportedDelayed.set(isReported);
        }
      },
      { equals: comparer.shallow }
    );
  }

  /**
   * Whether the field is touched.
   *
   * A field becomes touched when the user interacts with it.
   */
  get isTouched() {
    return this.#isTouched.get();
  }

  /**
   * Whether the field value is intermediate (partial input)
   *
   * @example
   * - Typing "user@" in an email field
   * - Typing a partial date "2024-"
   *
   * @remarks
   * Intermediate values are automatically finalized after a delay
   */
  get isIntermediate() {
    return this.#changeType.get() === "intermediate";
  }

  /**
   * Whether the field value is changed
   */
  get isChanged() {
    return !!this.#changeType.get();
  }

  /**
   * Whether the error states has been reported.
   *
   * Check this value to determine if errors should be displayed to the user.
   *
   * @returns
   * - `undefined` - Validity is undetermined (not yet reported)
   * - `false` - Field is valid
   * - `true` - Field is invalid
   *
   * @remarks
   * - Error reporting is delayed until validation is complete.
   * - It can be used directly with the `aria-invalid` attribute.
   */
  @computed
  get isErrorReported() {
    if (!this.#isReportedDelayed.get()) return undefined;
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

  /**
   * Reset the field state
   *
   * @remarks
   * - Clears touched state
   * - Clears change state
   * - Clears error reporting
   * - Cancels any pending auto-finalization
   */
  @action
  reset() {
    this.#changeType.set(null);
    this.#isTouched.set(false);
    this.#isReported.set(false);
    this.#cancelFinalizeChangeWithDelay();
  }

  /**
   * Mark the field as touched
   *
   * It's usually triggered by `onFocus`.
   */
  @action
  markAsTouched() {
    this.#isTouched.set(true);
  }

  /**
   * Mark the field as changed
   *
   * It's usually triggered by `onChange`.
   *
   * @param type Default to "final"
   *
   * @remarks
   * - "final" immediately reports errors
   * - "intermediate" schedules auto-finalization after delay
   */
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

  /**
   * Report the errors of the field.
   *
   * It will wait until the validation is up-to-date before reporting the errors.
   */
  @action
  reportError() {
    this.#isReported.set(true);
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
      isReported: this.#isReported,
    };
  }
}

export namespace FormField {
  /** Strict field name */
  export type NameStrict<T> = keyof T & string;
  /** Augmented field name with an arbitrary suffix */
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
