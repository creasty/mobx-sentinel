import { FormConfig } from "./config";
import { FormValidationResult } from "./validation";

/** Constrains a type to an object other than an array */
type NonArrayObject = object & { length?: never };

/** Indirect delegate for the form */
export interface FormDelegated<T> {
  /** Delegate for the form */
  readonly [FormDelegate.delegate]: FormDelegate<T>;
}

/** Delegate for the form */
export interface FormDelegate<T> {
  /** Form configuration */
  readonly [FormDelegate.config]?: FormDelegate.Config;
  /** @see {@link FormDelegate.connect} */
  [FormDelegate.connect]?: FormDelegate.Connect;
  /** @see {@link FormDelegate.submit} */
  [FormDelegate.submit]?: FormDelegate.Submit;
  /** @see {@link FormDelegate.validate} */
  [FormDelegate.validate]?: FormDelegate.Validate<T>;
}

export namespace FormDelegate {
  /** Form configuration */
  export type Config = Readonly<Partial<FormConfig>>;
  /**
   * Connect nested forms to the parent form.
   *
   * By connecting a form, the parent form will be able to integrate the validation state.
   * In regards to submitting a form, on the other hand, the parent form will need to handle submission manually,
   * because the correct sequence of submit events is form-specific.
   *
   * Returns an array of objects (not Form instances) to connect.
   */
  export type Connect = () => (NonArrayObject | null | undefined)[];
  /**
   * Submit the form.
   *
   * Returns true if the form was submitted successfully.
   */
  export type Submit = (abortSignal: AbortSignal) => Promise<boolean>;
  /**
   * Validate the form.
   *
   * Returns a map of field names to error messages.
   */
  export type Validate<T> = (abortSignal: AbortSignal) => Promise<FormValidationResult<T>>;

  /**
   * Symbol for implementing {@link Config}.
   *
   * Use with the interface {@link FormDelegate}
   */
  export const config = Symbol("FormDelegate.config");
  /**
   * Symbol for implementing {@link Connect}.
   *
   * Use with the interface {@link FormDelegate}
   */
  export const connect = Symbol("FormDelegate.connect");
  /**
   * Symbol for implementing {@link Submit}.
   *
   * Use with the interface {@link FormDelegate}
   */
  export const submit = Symbol("FormDelegate.submit");
  /**
   * Symbol for implementing {@link Validate}.
   *
   * Use with the interface {@link FormDelegate}
   */
  export const validate = Symbol("FormDelegate.validate");
  /**
   * Symbol for implementing {@link FormDelegate}.
   *
   * Use with the interface {@link FormDelegated}
   */
  export const delegate = Symbol("FormDelegated.delegate");
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
  // subject implements Delegated<T>
  if (FormDelegate.delegate in subject) {
    return (subject as any)[FormDelegate.delegate];
  }
  // subject implements Delegate<T>
  if (
    FormDelegate.config in subject ||
    FormDelegate.submit in subject ||
    FormDelegate.validate in subject ||
    FormDelegate.connect in subject
  ) {
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
  // subject implements Delegated<T>
  if (FormDelegate.delegate in subject) {
    return isEligibleForConnecting((subject as any)[FormDelegate.delegate]);
  }
  // subject implements Delegate<T>
  if (FormDelegate.validate in subject || FormDelegate.connect in subject) {
    return true;
  }
  return false;
}
