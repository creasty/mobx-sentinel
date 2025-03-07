import { FormBinding, FormField } from "@mobx-sentinel/form";
import { makeObservable, computed, action } from "mobx";

export namespace CheckBoxBinding {
  /** @ignore */
  export type Attrs = React.InputHTMLAttributes<HTMLInputElement>;
  /** @ignore */
  export type AttrsRequired = Required<Attrs>;

  export type Config = {
    /** Get the value from the model @computed */
    getter: () => boolean;
    /** Set the value to the model @action */
    setter: (value: boolean) => void;

    /** [Override] ID of the input element */
    id?: Attrs["id"];
    /** [Extend] Change handler */
    onChange?: Attrs["onChange"];
    /** [Extend] Focus handler */
    onFocus?: Attrs["onFocus"];
  };
}

/**
 * Binding for checkbox input elements
 *
 * Key features:
 * - Handles boolean states
 * - Manages error states and ARIA attributes
 */
export class CheckBoxBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: CheckBoxBinding.Config
  ) {
    makeObservable(this);
  }

  @computed
  get checked(): CheckBoxBinding.AttrsRequired["checked"] {
    return this.config.getter();
  }

  @action
  onChange: CheckBoxBinding.AttrsRequired["onChange"] = (e) => {
    this.config.setter(e.currentTarget.checked);
    this.field.markAsChanged();
    this.config.onChange?.(e);
  };

  onFocus: CheckBoxBinding.AttrsRequired["onFocus"] = (e) => {
    this.field.markAsTouched();
    this.config.onFocus?.(e);
  };

  @computed
  get errorMessages() {
    if (!this.field.isErrorReported) return null;
    return Array.from(this.field.errors).join(", ") || null;
  }

  get props() {
    return {
      type: "checkbox",
      id: this.config.id ?? this.field.id,
      checked: this.checked,
      onChange: this.onChange,
      onFocus: this.onFocus,
      "aria-invalid": this.field.isErrorReported,
      "aria-errormessage": this.errorMessages ?? undefined,
    } satisfies CheckBoxBinding.Attrs;
  }
}
