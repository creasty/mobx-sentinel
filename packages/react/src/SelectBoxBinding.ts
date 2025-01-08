import { FormBinding, FormField } from "@mobx-form/core";
import { makeObservable, computed, action } from "mobx";

export namespace SelectBoxBinding {
  export type Attrs = React.SelectHTMLAttributes<HTMLSelectElement>;

  export type Config =
    | {
        /** Whether multiple options can be selected in the list */
        multiple?: false;
        /** Get the value from the model */
        getter: () => string;
        /** Set the value to the model */
        setter: (value: string) => void;
      }
    | {
        /** Whether multiple options can be selected in the list */
        multiple: true;
        /** Get the value from the model */
        getter: () => string[];
        /** Set the value to the model */
        setter: (value: string[]) => void;
      };
}

export class SelectBoxBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: SelectBoxBinding.Config
  ) {
    makeObservable(this);
  }

  @computed
  get value(): SelectBoxBinding.Attrs["value"] {
    return this.config.getter() ?? "";
  }

  @action
  onChange: SelectBoxBinding.Attrs["onChange"] = (e) => {
    if (this.config.multiple) {
      this.config.setter(Array.from(e.currentTarget.selectedOptions, (o) => o.value));
    } else {
      this.config.setter(e.currentTarget.value);
    }
    this.field.markAsChanged();
    this.field.validate();
  };

  onFocus: SelectBoxBinding.Attrs["onFocus"] = () => {
    this.field.markAsTouched();
  };

  get props() {
    return {
      multiple: this.config.multiple,
      value: this.value,
      onChange: this.onChange,
      onFocus: this.onFocus,
    } satisfies SelectBoxBinding.Attrs;
  }
}
