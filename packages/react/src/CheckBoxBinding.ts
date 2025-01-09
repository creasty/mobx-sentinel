import { FormBinding, FormField } from "@form-model/core";
import { makeObservable, computed, action } from "mobx";

export namespace CheckBoxBinding {
  export type Attrs = React.InputHTMLAttributes<HTMLInputElement>;

  export type Config = {
    /** Get the value from the model */
    getter: () => boolean;
    /** Set the value to the model */
    setter: (value: boolean) => void;
  };
}

export class CheckBoxBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: CheckBoxBinding.Config
  ) {
    makeObservable(this);
  }

  @computed
  get checked(): CheckBoxBinding.Attrs["checked"] {
    return this.config.getter();
  }

  @action
  onChange: CheckBoxBinding.Attrs["onChange"] = (e) => {
    this.config.setter(e.currentTarget.checked);
    this.field.markAsChanged();
    this.field.validate();
  };

  onFocus: CheckBoxBinding.Attrs["onFocus"] = () => {
    this.field.markAsTouched();
  };

  get props() {
    return {
      type: "checkbox",
      checked: this.checked,
      onChange: this.onChange,
      onFocus: this.onFocus,
    } satisfies CheckBoxBinding.Attrs;
  }
}
