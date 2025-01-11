import { FormBinding, FormField } from "@form-model/core";
import { makeObservable, computed, action } from "mobx";

export namespace RadioButtonBinding {
  export type Attrs = React.InputHTMLAttributes<HTMLInputElement>;
  export type AttrsRequired = Required<Attrs>;
  export type Config = {
    /** Get the value from the model */
    getter: () => string | null;
    /** Set the value to the model */
    setter: (value: string) => void;

    /** [Override] ID of the input element */
    id?: Attrs["id"];
    /** [Callback] Change handler */
    onChange?: Attrs["onChange"];
    /** [Callback] Focus handler */
    onFocus?: Attrs["onFocus"];
  };
}

export class RadioButtonBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: RadioButtonBinding.Config
  ) {
    makeObservable(this);
  }

  @computed
  get value(): RadioButtonBinding.AttrsRequired["value"] {
    return this.config.getter() ?? "";
  }

  @action
  onChange: RadioButtonBinding.AttrsRequired["onChange"] = (e) => {
    if (!e.currentTarget.checked) return;
    this.config.setter(e.currentTarget.value);
    this.field.markAsChanged();
    this.field.validate();
    this.config.onChange?.(e);
  };

  onFocus: RadioButtonBinding.AttrsRequired["onFocus"] = (e) => {
    this.field.markAsTouched();
    this.config.onFocus?.(e);
  };

  props = (value: string | null, name?: string) => {
    return {
      type: "radio",
      id: this.config.id ?? this.field.id,
      value: value ?? "",
      name: name ?? this.field.id,
      checked: this.value === value,
      onChange: this.onChange,
      onFocus: this.onFocus,
      "aria-invalid": this.field.hasReportedErrors,
      "aria-errormessage": this.field.hasReportedErrors ? this.field.errors?.join(", ") : undefined,
    } satisfies RadioButtonBinding.Attrs;
  };
}
