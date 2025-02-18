import { action, computed, makeObservable, observable } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { buildKeyPath, type Validator } from "@form-model/validation";

const internalToken = Symbol("formField.internal");

export class FormField {
  readonly id = uuidV4();
  readonly fieldName: string;
  readonly #validator: Validator<any>;
  readonly #getFinalizationDelayMs: () => number;
  readonly #isTouched = observable.box(false);
  readonly #changeType = observable.box<FormField.ChangeType | null>(null);
  readonly #isErrorReported = observable.box(false);
  #timerId: number | null = null;

  constructor(args: { fieldName: string; validator: Validator<any>; getFinalizationDelayMs: () => number }) {
    makeObservable(this);
    this.fieldName = args.fieldName;
    this.#validator = args.validator;
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
  /** Whether the error states has been reported */
  @computed
  get isErrorReported() {
    return this.#isErrorReported.get() && this.hasErrors;
  }

  @computed.struct
  get errors(): ReadonlySet<string> {
    return this.#validator.getErrorMessages(buildKeyPath(this.fieldName));
  }

  @computed
  get hasErrors() {
    return this.errors.size > 0;
  }

  @action
  reset() {
    this.#changeType.set(null);
    this.#isTouched.set(false);
    this.#isErrorReported.set(false);
    this.#cancelFinalizeChangeWithDelay();
  }

  @action
  markAsTouched() {
    this.#isTouched.set(true);
  }

  @action
  markAsChanged(type: FormField.ChangeType = "final") {
    this.#changeType.set(type);

    switch (type) {
      case "final": {
        this.#cancelFinalizeChangeWithDelay();
        this.#isErrorReported.set(true);
        break;
      }
      case "intermediate": {
        this.#finalizeChangeWithDelay();
        break;
      }
    }
  }

  @action
  reportError() {
    this.#isErrorReported.set(true);
  }

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

  /** @ignore @internal */
  [internalToken]() {
    return {
      isErrorReported: this.#isErrorReported,
    };
  }
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

/** @ignore @internal */
export function debugFormField(field: FormField) {
  return field[internalToken]();
}
