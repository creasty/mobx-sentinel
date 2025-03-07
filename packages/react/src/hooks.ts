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
export function useFormHandler<T extends object, Event extends keyof Form.Handlers>(
  form: Form<T>,
  event: Event,
  handler: Form.Handlers[NoInfer<Event>]
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const dispose = form.addHandler(
      event,
      // eslint-disable-next-line prefer-spread, @typescript-eslint/no-unsafe-function-type
      (...args: any[]) => (handlerRef.current as Function).apply(undefined, args) as any
    );
    return dispose;
  }, [form, event]);
}
