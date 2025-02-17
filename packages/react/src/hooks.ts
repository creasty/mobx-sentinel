import { Form } from "@form-model/core";
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
 * @param handler The handler.
 */
export function useFormHandler<T extends object, Event extends keyof Form.Handlers<T>>(
  form: Form<T>,
  event: Event,
  handler: Form.Handlers<T>[NoInfer<Event>]
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => form.addHandler(event, handlerRef.current), [form, event]);
}
