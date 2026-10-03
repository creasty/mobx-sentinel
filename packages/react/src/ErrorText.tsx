import type { Form, FormField } from "@mobx-sentinel/form";
import { Observer } from "mobx-react-lite";
import React from "react";
import { errorTextId } from "./errorTextHelper";

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
 * - Gives the `<span>` of each field the id from {@link errorTextId}, which the standard bindings point the field's
 *   form control at with `aria-describedby` while the errors are reported. Show each field in one `ErrorText`, so that
 *   the id stays unique on the page.
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
              <span key={fieldName} id={errorTextId(form.getField(fieldName))}>
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
