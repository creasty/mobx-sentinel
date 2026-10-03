import { Form } from "@mobx-sentinel/form";
import { action, IReactionDisposer, observable, reaction } from "mobx";
import { useEffect } from "react";

/** The forms that mounted components guard, each with the number of components guarding it */
const guardedForms = observable.map<Form<any>, number>();
/** Stops the reaction that keeps the `beforeunload` listener, which runs while any form is guarded */
let stopUnloadGuard: IReactionDisposer | null = null;

/**
 * Whether a form guarded by {@link useFormNavigationGuard} has unsaved changes
 *
 * @remarks
 * Hand it to the router as a function rather than calling it during render, so that the router asks at the moment of
 * navigation: a navigation right after the form resets, as from a `didSubmit` handler, then goes through.
 *
 * It reads observables, so an observer that calls it re-renders when the answer changes.
 *
 * @example
 * ```tsx
 * // React Router
 * const blocker = useBlocker(hasUnsavedForms);
 * ```
 */
export function hasUnsavedForms(): boolean {
  for (const form of guardedForms.keys()) {
    if (form.isDirty) return true;
  }
  return false;
}

/** Ask the browser to confirm leaving the page */
function confirmUnload(event: BeforeUnloadEvent) {
  // Asked again, because the listener can outlive the changes: navigating in the action that cleans the form, as a
  // `didSubmit` handler does right after the form resets, fires the event before the reaction removes the listener.
  if (!hasUnsavedForms()) return;
  event.preventDefault();
  event.returnValue = true; // Legacy browsers, e.g. Chrome and Edge before 119, ask only when this is set
}

const guard = action((form: Form<any>) => {
  guardedForms.set(form, (guardedForms.get(form) ?? 0) + 1);
  // Listening only while there are unsaved changes, as MDN advises: Firefox keeps a page with a `beforeunload`
  // listener out of the back/forward cache.
  stopUnloadGuard ??= reaction(
    hasUnsavedForms,
    (unsaved) => {
      if (unsaved) {
        window.addEventListener("beforeunload", confirmUnload);
      } else {
        window.removeEventListener("beforeunload", confirmUnload);
      }
    },
    { fireImmediately: true }
  );
});

const release = action((form: Form<any>) => {
  const count = guardedForms.get(form)!; // Each release follows a guard of the same form
  if (count > 1) {
    guardedForms.set(form, count - 1);
    return;
  }
  guardedForms.delete(form);
  if (guardedForms.size === 0 && stopUnloadGuard) {
    stopUnloadGuard();
    stopUnloadGuard = null;
    window.removeEventListener("beforeunload", confirmUnload);
  }
});

/**
 * Guard against leaving the page while the form has unsaved changes
 *
 * @param form Form instance
 *
 * @remarks
 * While the component is mounted, the form counts toward {@link hasUnsavedForms}:
 * - Closing or reloading the tab, or leaving for another site, brings up the browser's confirmation dialog while the
 *   form is dirty, through the `beforeunload` event.
 * - Navigation inside the app goes through the router, which asks {@link hasUnsavedForms}.
 *
 * The form's {@link Form.isDirty} includes its sub-forms, so guarding the root form covers them.
 * A form that several components guard stays guarded until the last of them unmounts.
 *
 * @example
 * ```tsx
 * const InvoiceForm: React.FC<{ model: Invoice }> = observer(({ model }) => {
 *   const form = Form.get(model);
 *   useFormNavigationGuard(form);
 *   return (...);
 * });
 * ```
 */
export function useFormNavigationGuard(form: Form<any>): void {
  useEffect(() => {
    guard(form);
    return () => release(form);
  }, [form]);
}
