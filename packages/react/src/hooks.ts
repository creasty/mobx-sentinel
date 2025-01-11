import { Form } from "@form-model/core";
import { useEffect } from "react";

/**
 * Get the form instance for a subject.
 *
 * The difference from `Form.get` is that this hook automatically resets the form
 * when the component is mounted and unmounted.
 *
 * @inheritdoc {@link Form.get}
 */
export function useForm<T extends object>(subject: T, formKey?: symbol): Form<T> {
  const form = Form.get(subject, formKey);
  useEffect(() => {
    form.reset();
    return () => form.reset();
  }, [form]);
  return form;
}
