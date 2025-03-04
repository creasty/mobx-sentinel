import { Form } from "@mobx-sentinel/form";
import { useEffect, useRef } from "react";

/**
 * Auto reset the form when when the component is mounted and unmounted.
 *
 * @param form The form instance.
 */
export function useFormAutoReset(form: Form<any>) {
  useEffect(() => {
    form.reset();
    return () => form.reset();
  }, [form]);
}

/**
 * Add a handler to the form.
 *
 * It automatically removes the handler when the component is unmounted.
 *
 * @param form The form instance.
 * @param event The event of the handler.
 * @param handler The handler.\
 *   No memoization is needed as the handler is stored in a ref internally.
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
