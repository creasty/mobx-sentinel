import { FormBinding, FormField } from "@mobx-sentinel/form";
import { makeObservable, computed } from "mobx";

export namespace LabelBinding {
  /** @ignore */
  export type Attrs = React.LabelHTMLAttributes<HTMLLabelElement>;
  /** @ignore */
  export type AttrsRequired = Required<Attrs>;

  export type Config = {
    /** [Override] ID of the target element */
    htmlFor?: Attrs["htmlFor"];
  };
}

/**
 * Binding for label elements
 *
 * Key features:
 * - Associates labels with form fields
 * - Supports multiple field associations
 * - Shows error states from associated fields
 */
export class LabelBinding implements FormBinding {
  constructor(
    private readonly fields: FormField[],
    public config: LabelBinding.Config
  ) {
    makeObservable(this);
  }

  // Not @computed: FormField#stableId reads a plain field on the form, which nothing can observe.
  // While an observer held it, a computed would keep the first id it saw.
  get firstFieldStableId() {
    return this.fields.at(0)?.stableId;
  }

  @computed
  get firstErrorMessage() {
    for (const field of this.fields) {
      if (!field.isErrorReported) continue;
      for (const error of field.errors) {
        return error;
      }
    }
    return null;
  }

  get props() {
    return {
      htmlFor: this.config.htmlFor ?? this.firstFieldStableId,
      "aria-invalid": this.fields.some((field) => field.isErrorReported),
      "aria-errormessage": this.firstErrorMessage ?? undefined,
    } satisfies LabelBinding.Attrs;
  }
}
