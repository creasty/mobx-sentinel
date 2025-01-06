import { FormConfig } from "./config";
import { FormValidationResult } from "./validation";

/** Constrains a type to an object other than an array */
type NonArrayObject = object & { length?: never };

/** A indirect delegate for a form */
export interface FormDelegated<T> {
  readonly [FormDelegate.delegate]: FormDelegate<T>;
}

/** A delegate for a form */
export interface FormDelegate<T> {
  /** Form configuration */
  readonly [FormDelegate.config]?: Readonly<Partial<FormConfig>>;
  /**
   * Connect nested forms to the parent form.
   *
   * By connecting a form, the parent form will be able to integrate the validation state.
   * In regards to submitting a form, on the other hand, the parent form will need to handle submission manually,
   * because the correct sequence of submit events is form-specific.
   *
   * Returns an array of objects (not Form instances) to connect.
   */
  [FormDelegate.connect]?(): (NonArrayObject | null | undefined)[];
  /**
   * Submit the form.
   *
   * Returns true if the form was submitted successfully.
   */
  [FormDelegate.submit]?(abortSignal: AbortSignal): Promise<boolean>;
  /**
   * Validate the form.
   *
   * Returns a map of field names to error messages.
   */
  [FormDelegate.validate]?(abortSignal: AbortSignal): Promise<FormValidationResult<T>>;
}

export namespace FormDelegate {
  export const config = Symbol("Form.config");
  export const submit = Symbol("Form.submit");
  export const validate = Symbol("Form.validate");
  export const delegate = Symbol("Form.delegate");
  export const connect = Symbol("Form.connect");
}

/**
 * Get the delegation of a subject.
 *
 * Returns the delegation of the subject, or undefined if the subject is not eligible for delegation.
 */
export function getDelegation<T extends object>(subject: T | any): FormDelegate<T> | undefined {
  if (!subject || typeof subject !== "object") {
    return;
  }
  if (FormDelegate.delegate in subject) {
    // subject implements Delegated<T>
    return (subject as any)[FormDelegate.delegate];
  }
  if (
    FormDelegate.config in subject ||
    FormDelegate.submit in subject ||
    FormDelegate.validate in subject ||
    FormDelegate.connect in subject
  ) {
    // subject implements Delegate<T>
    return subject as any;
  }
}

/**
 * Check if the subject is eligible to be connected to a form.
 *
 * Returns true if the subject implements {@link FormDelegate.validate}, or {@link FormDelegate.connect}.
 * {@link FormDelegate.submit} is intentionally not checked, see the connect method for reasoning.
 */
export function isEligibleForConnecting(subject: any): subject is FormDelegate<any> | FormDelegated<any> {
  if (!subject || typeof subject !== "object") {
    return false;
  }
  if (FormDelegate.delegate in subject) {
    // subject implements Delegated<T>
    return isEligibleForConnecting((subject as any)[FormDelegate.delegate]);
  }
  if (FormDelegate.validate in subject || FormDelegate.connect in subject) {
    // subject implements Delegate<T>
    return true;
  }
  return false;
}
