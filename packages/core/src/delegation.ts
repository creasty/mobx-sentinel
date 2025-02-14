import type { FormConfig } from "./config";
import type { Submission } from "./submission";

/** Indirect delegate for the form */
export interface FormDelegated {
  /** Delegate for the form */
  readonly [FormDelegate.delegate]: FormDelegate;
}

/** Delegate for the form */
export interface FormDelegate {
  /** Form configuration */
  readonly [FormDelegate.config]?: FormDelegate.Config;
  /** @see {@link FormDelegate.submit} */
  [FormDelegate.submit]?: FormDelegate.Submit;
}

export namespace FormDelegate {
  /** Form configuration */
  export type Config = Readonly<Partial<FormConfig>>;
  /**
   * Submit the form.
   *
   * Returns true if the form was submitted successfully.
   */
  export type Submit = Submission.EventHandlers["submit"];

  /**
   * Symbol for implementing {@link Config}.
   *
   * Use with the interface {@link FormDelegate}
   */
  export const config = Symbol("FormDelegate.config");
  /**
   * Symbol for implementing {@link Submit}.
   *
   * Use with the interface {@link FormDelegate}
   */
  export const submit = Symbol("FormDelegate.submit");
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
export function getDelegation<T extends object>(subject: T | any): FormDelegate | undefined {
  if (!subject || typeof subject !== "object") {
    return;
  }
  // subject implements Delegated<T>
  if (FormDelegate.delegate in subject) {
    return (subject as any)[FormDelegate.delegate];
  }
  // subject implements Delegate<T>
  if (FormDelegate.config in subject || FormDelegate.submit in subject) {
    return subject as any;
  }
}
