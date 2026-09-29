import type { FormField } from "@mobx-sentinel/form";

/**
 * Ids for `aria-describedby`: the ones configured on the binding, followed by the error text of the field while its
 * errors are reported
 *
 * The error text is read only while the errors are reported, so a field that has none reported does not observe
 * which error text registers for it.
 */
export function describedBy(field: FormField, configured: string | undefined): string | undefined {
  const errorTextId = field.isErrorReported ? field.errorTextId : undefined;
  return [configured, errorTextId].filter((id) => id).join(" ") || undefined;
}
