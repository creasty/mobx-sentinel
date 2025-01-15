import { Form } from "@form-model/core";
import { useEffect, useRef } from "react";

/**
 * Get the form instance for a subject.
 *
 * The difference from `Form.get` is that this hook automatically resets the form
 * when the component is mounted and unmounted.
 *
 * @inheritdoc {@link @form-model/core!Form.get}
 */
export function useForm<T extends object>(subject: T, opt?: { formKey?: symbol; noReset?: boolean }): Form<T> {
  const form = Form.get(subject, opt?.formKey);
  useEffect(() => {
    if (opt?.noReset) return;
    form.reset();
    return () => form.reset();
  }, [form]);
  return form;
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
