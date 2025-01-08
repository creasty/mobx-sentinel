import { FormConfig } from "./config";
import { FormValidationResult } from "./validation";

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

/**
 * Object that can be connected to a form.
 *
 * This is a union of:
 * - {@link FormDelegated}
 * - {@link FormDelegate} that implements at least one of {@link FormDelegate.validate} or {@link FormDelegate.connect}.\
 *   {@link FormDelegate.submit} is intentionally not checked, see the connect method for reasoning.
 */
type ConnectableObject =
  | FormDelegated<any>
  | {
      /** Implements {@link FormDelegate.connect} via FormDelegate<T> */
      [FormDelegate.connect]: FormDelegate.Connect;
    }
  | {
      /** Implements {@link FormDelegate.validate} via FormDelegate<T> */
      [FormDelegate.validate]: FormDelegate.Validate<any>;
    };

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
  export type Connect = () => (ConnectableObject | null | undefined)[];
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

/** Check if the object is a {@link ConnectableObject} */
export function isConnectableObject(
  object: any
): object is (FormDelegate<any> | FormDelegated<any>) & ConnectableObject {
  if (!object || typeof object !== "object") {
    return false;
  }
  // object implements Delegated<T>
  if (FormDelegate.delegate in object) {
    return isConnectableObject((object as any)[FormDelegate.delegate]);
  }
  // object implements Delegate<T>
  if (FormDelegate.validate in object || FormDelegate.connect in object) {
    return true;
  }
  return false;
}
