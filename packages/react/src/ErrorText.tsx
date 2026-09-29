import type { Form, FormField } from "@mobx-sentinel/form";
import { Observer } from "mobx-react-lite";
import React from "react";

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
 * - Shows what `form.getErrors()` returns for the fields: the errors of each field once the field reports them
 * - Renders a `<span data-error-text>` holding one `<span>` per message, and nothing while there are none
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
        const errors = form.getErrors(...fields);
        if (!errors.size) return null;
        return (
          <span {...attributes} data-error-text="">
            {Array.from(errors, (error) => (
              <span key={error}>{error}</span>
            ))}
          </span>
        );
      }}
    </Observer>
  );
}
