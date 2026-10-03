import type { FormField } from "@mobx-sentinel/form";

/**
 * Id of the `<span>` in which {@link ErrorText} shows the errors of a field
 *
 * @remarks
 * - The field's `stableId` followed by `:error`
 * - The standard bindings put it in the form control's `aria-describedby` while the field's errors are reported, and a
 *   custom binding can do the same
 */
export function errorTextId(field: FormField): string {
  return `${field.stableId}:error`;
}

/**
 * Ids for `aria-describedby`: the ones configured on the binding, followed by the error text of the field while its
 * errors are reported
 */
export function describedBy(field: FormField, configured: string | undefined): string | undefined {
  const errorText = field.isErrorReported ? errorTextId(field) : undefined;
  return [configured, errorText].filter((id) => id).join(" ") || undefined;
}
