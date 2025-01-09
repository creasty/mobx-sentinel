import { FormBinding, FormField } from "@form-model/core";
import { makeObservable, computed, action } from "mobx";

export namespace RadioButtonBinding {
  export type Attrs = React.InputHTMLAttributes<HTMLInputElement>;

  export type Config = {
    /** Get the value from the model */
    getter: () => string | null;
    /** Set the value to the model */
    setter: (value: string) => void;
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
  get value(): RadioButtonBinding.Attrs["value"] {
    return this.config.getter() ?? "";
  }

  @action
  onChange: RadioButtonBinding.Attrs["onChange"] = (e) => {
    if (!e.currentTarget.checked) return;
    this.config.setter(e.currentTarget.value);
    this.field.markAsChanged();
    this.field.validate();
  };

  onFocus: RadioButtonBinding.Attrs["onFocus"] = () => {
    this.field.markAsTouched();
  };

  props = (value: string | null, name?: string) => {
    return {
      type: "radio",
      value: value ?? "",
      name: name ?? this.field.id,
      checked: this.value === value,
      onChange: this.onChange,
      onFocus: this.onFocus,
    } satisfies RadioButtonBinding.Attrs;
  };
}
