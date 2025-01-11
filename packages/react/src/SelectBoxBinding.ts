import { FormBinding, FormField } from "@form-model/core";
import { makeObservable, computed, action } from "mobx";

export namespace SelectBoxBinding {
  export type Attrs = React.SelectHTMLAttributes<HTMLSelectElement>;
  export type AttrsRequired = Required<Attrs>;
  export type Config = {
    /** [Override] ID of the input element */
    id?: Attrs["id"];
    /** [Callback] Change handler */
    onChange?: Attrs["onChange"];
    /** [Callback] Focus handler */
    onFocus?: Attrs["onFocus"];
  } & (
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
      }
  );
}

export class SelectBoxBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: SelectBoxBinding.Config
  ) {
    makeObservable(this);
  }

  @computed
  get value(): SelectBoxBinding.AttrsRequired["value"] {
    return this.config.getter() ?? "";
  }

  @action
  onChange: SelectBoxBinding.AttrsRequired["onChange"] = (e) => {
    if (this.config.multiple) {
      this.config.setter(Array.from(e.currentTarget.selectedOptions, (o) => o.value));
    } else {
      this.config.setter(e.currentTarget.value);
    }
    this.field.markAsChanged();
    this.field.validate();
    this.config.onChange?.(e);
  };

  onFocus: SelectBoxBinding.AttrsRequired["onFocus"] = (e) => {
    this.field.markAsTouched();
    this.config.onFocus?.(e);
  };

  get props() {
    return {
      id: this.config.id ?? this.field.id,
      multiple: this.config.multiple,
      value: this.value,
      onChange: this.onChange,
      onFocus: this.onFocus,
    } satisfies SelectBoxBinding.Attrs;
  }
}
