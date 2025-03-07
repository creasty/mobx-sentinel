import { FormBinding, FormField } from "@mobx-sentinel/form";
import { makeObservable, computed, action } from "mobx";

export namespace SelectBoxBinding {
  export type Attrs = React.SelectHTMLAttributes<HTMLSelectElement>;
  export type AttrsRequired = Required<Attrs>;
  export type Config = {
    /** [Override] ID of the input element */
    id?: Attrs["id"];
    /** [Extend] Change handler */
    onChange?: Attrs["onChange"];
    /** [Extend] Focus handler */
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

/**
 * Binding for select elements
 *
 * Key features:
 * - Supports single and multiple selection
 * - Handles option changes
 * - Manages error states and ARIA attributes
 */
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
    this.config.onChange?.(e);
  };

  onFocus: SelectBoxBinding.AttrsRequired["onFocus"] = (e) => {
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
      id: this.config.id ?? this.field.id,
      multiple: this.config.multiple,
      value: this.value,
      onChange: this.onChange,
      onFocus: this.onFocus,
      "aria-invalid": this.field.isErrorReported,
      "aria-errormessage": this.errorMessages ?? undefined,
    } satisfies SelectBoxBinding.Attrs;
  }
}
