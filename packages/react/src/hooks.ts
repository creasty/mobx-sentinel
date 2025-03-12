import { Form } from "@mobx-sentinel/form";
import { useEffect, useRef } from "react";

/**
 * Auto reset the form when the component is mounted and unmounted
 *
 * @param form Form instance
 *
 * @remarks
 * - Calls `form.reset()` on mount
 * - Calls `form.reset()` on unmount
 * - Useful for cleaning up form state
 */
export function useFormAutoReset(form: Form<any>) {
  useEffect(() => {
    form.reset();
    return () => form.reset();
  }, [form]);
}

/**
 * Add a handler to the form with automatic cleanup
 *
 * @param form Form instance
 * @param event Event of the handler
 * @param handler Handler to add
 *
 * @remarks
 * No memoization of the handler is needed as it is stored in a ref internally.
 */
export function useFormHandler<T extends object>(
  form: Form<T>,
  event: "willSubmit",
  handler: Form.Handlers["willSubmit"]
): void;
export function useFormHandler<T extends object>(
  form: Form<T>,
  event: "submit",
  handler: Form.Handlers["submit"]
): void;
export function useFormHandler<T extends object>(
  form: Form<T>,
  event: "didSubmit",
  handler: Form.Handlers["didSubmit"]
): void;
export function useFormHandler<T extends object>(form: Form<T>, event: any, handler: any) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const dispose = form.addHandler(event, (...args) => handlerRef.current(...args));
    return dispose;
  }, [form, event]);
}
