import { FormBinding, FormField } from "@mobx-sentinel/form";
import { action, computed, makeObservable } from "mobx";
import type { CustomDropdown } from "./CustomDropdown";

export namespace CustomDropdownBinding {
  export type Config = {
    /** Get the values of the checked options from the model */
    getter: () => readonly string[];
    /** Set the values of the checked options to the model @action */
    setter: (value: string[]) => void;
  };
}

/**
 * Binding for {@link CustomDropdown}
 *
 * Checking an option is an intermediate change, as a keystroke in a text input is: the choice is final once the list
 * closes, or after a pause, and that is when its errors are reported.
 *
 * The `Custom` prefix is deliberate — nothing here comes from the library.
 */
export class CustomDropdownBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: CustomDropdownBinding.Config
  ) {
    makeObservable(this);
  }

  @action
  onChange = (value: string[]) => {
    this.config.setter(value);
    this.field.markAsChanged("intermediate");
  };

  @computed
  get errorMessages() {
    if (!this.field.isErrorReported) return null;
    return Array.from(this.field.errors).join(", ") || null;
  }

  get props() {
    return {
      id: this.field.stableId,
      value: this.config.getter(),
      onChange: this.onChange,
      onFocus: this.field.markAsTouched,
      onClose: this.field.finalizeChangeIfNeeded,
      "aria-invalid": this.field.isErrorReported,
      "aria-errormessage": this.errorMessages ?? undefined,
    } satisfies Partial<CustomDropdown.Props>;
  }
}
