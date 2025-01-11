import { FormBinding, FormField } from "@form-model/core";
import { makeObservable, computed } from "mobx";

export namespace LabelBinding {
  export type Attrs = React.LabelHTMLAttributes<HTMLLabelElement>;
  export type AttrsRequired = Required<Attrs>;

  export type Config = {
    /** [Override] ID of the target element */
    htmlFor?: Attrs["htmlFor"];
  };
}

export class LabelBinding implements FormBinding {
  constructor(
    private readonly fields: FormField[],
    public config: LabelBinding.Config
  ) {
    makeObservable(this);
  }

  @computed
  get firstFieldId() {
    return this.fields.at(0)?.id;
  }

  @computed
  get errorMessage(): LabelBinding.Attrs["aria-errormessage"] {
    for (const field of this.fields) {
      if (field.hasReportedErrors && field.errors) {
        return field.errors.at(0);
      }
    }
    return undefined;
  }

  get props() {
    return {
      htmlFor: this.config.htmlFor ?? this.firstFieldId,
      "aria-invalid": !!this.errorMessage,
      "aria-errormessage": this.errorMessage,
    } satisfies LabelBinding.Attrs;
  }
}
