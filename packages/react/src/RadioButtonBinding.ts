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

    /** [Extend] Change handler */
    onChange?: Attrs["onChange"];
    /** [Extend] Focus handler */
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
    this.config.onChange?.(e);
  };

  onFocus: RadioButtonBinding.AttrsRequired["onFocus"] = (e) => {
    this.field.markAsTouched();
    this.config.onFocus?.(e);
  };

  props = (
    /** Value of the radio button */
    value: string | null,
    opt?: {
      /**
       * [Override] ID of the input element.
       *
       * - `true`: Use the field ID as the ID.
       * - `string`: Use the given string as the ID.
       */
      id?: string | true;
      /** [Override] Name attribute of the input element */
      name?: string;
    }
  ) => {
    return {
      type: "radio",
      id: opt?.id === true ? this.field.id : opt?.id,
      value: value ?? "",
      name: opt?.name ?? this.field.id,
      checked: this.value === value,
      onChange: this.onChange,
      onFocus: this.onFocus,
      "aria-invalid": this.field.hasReportedErrors,
      "aria-errormessage": this.field.hasReportedErrors ? this.field.errors?.join(", ") : undefined,
    } satisfies RadioButtonBinding.Attrs;
  };
}
