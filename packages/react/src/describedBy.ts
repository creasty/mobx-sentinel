import type { FormField } from "@mobx-sentinel/form";
import { errorTextId } from "./errorTextId";

/**
 * Ids for `aria-describedby`: the ones configured on the binding, followed by the error text of the field while its
 * errors are reported
 */
export function describedBy(field: FormField, configured: string | undefined): string | undefined {
  const errorText = field.isErrorReported ? errorTextId(field) : undefined;
  return [configured, errorText].filter((id) => id).join(" ") || undefined;
}
