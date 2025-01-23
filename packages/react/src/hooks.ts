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
 * Subscribe to the form events.
 *
 * It automatically unsubscribes when the component is unmounted.
 *
 * @param form The form instance.
 * @param event The event to subscribe to.
 * @param handler The event handler.
 */
export function useFormEvent<T extends object, Event extends keyof Form.EventHandlers<T>>(
  form: Form<T>,
  event: Event,
  handler: Form.EventHandlers<T>[Event]
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => form.addHandler(event, handlerRef.current), [form, event]);
}
