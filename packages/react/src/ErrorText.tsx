import type { Form, FormField } from "@mobx-sentinel/form";
import { Observer } from "mobx-react-lite";
import React, { useEffect, useId } from "react";

export namespace ErrorText {
  export type Props<T> = Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> & {
    /** Form the fields belong to */
    form: Form<T>;
    /** Fields to show the errors of */
    fields: readonly FormField.Name<T>[];
  };
}

/**
 * Render the error messages of form fields
 *
 * @remarks
 * - Shows what `form.getErrors()` returns for each field: its errors once the field reports them
 * - Renders a `<span data-error-text>` holding a `<span>` for each field with errors, which holds a `<span>` per
 *   message, and nothing while there are none
 * - Registers the `<span>` of each field with {@link FormField.registerErrorText}, so that the standard bindings point
 *   the field's form control at it with `aria-describedby` while the errors are reported
 * - Other props, such as `className` and `id`, go to the outer `<span>`
 * - Re-renders as the errors change, so the component that renders it need not be an observer
 *
 * @example
 * ```tsx
 * <input {...form.bindInput("city", { ... })} />
 * <ErrorText form={form} fields={["city"]} />
 *
 * // One text for a row of fields
 * <ErrorText form={form} fields={["city", "region", "postalCode"]} className="error" />
 * ```
 */
export function ErrorText<T>(props: ErrorText.Props<T>): React.ReactElement {
  const { form, fields, ...attributes } = props;
  const idPrefix = useId();
  // The registrations follow the field names, not the array: an inline one is new on every render, and registering
  // again would re-render the controls that read the registration, and with them, often, this component
  const fieldNamesKey = JSON.stringify(fields);

  useEffect(() => {
    const fieldNames: FormField.Name<T>[] = JSON.parse(fieldNamesKey);
    const unregisters = fieldNames.map((fieldName) =>
      form.getField(fieldName).registerErrorText(`${idPrefix}${fieldName}`)
    );
    return () => {
      for (const unregister of unregisters) unregister();
    };
  }, [form, idPrefix, fieldNamesKey]);

  return (
    <Observer>
      {() => {
        const groups = fields.flatMap((fieldName) => {
          const errors = form.getErrors(fieldName);
          return errors.size ? [{ fieldName, errors }] : [];
        });
        if (!groups.length) return null;
        return (
          <span {...attributes} data-error-text="">
            {groups.map(({ fieldName, errors }) => (
              <span key={fieldName} id={`${idPrefix}${fieldName}`}>
                {Array.from(errors, (error) => (
                  <span key={error}>{error}</span>
                ))}
              </span>
            ))}
          </span>
        );
      }}
    </Observer>
  );
}
