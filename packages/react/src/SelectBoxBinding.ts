import { FormBinding, FormField } from "@mobx-sentinel/form";
import { describedBy } from "./describedBy";
import { makeObservable, computed, action } from "mobx";

export namespace SelectBoxBinding {
  /** @ignore */
  export type Attrs = React.SelectHTMLAttributes<HTMLSelectElement>;
  /** @ignore */
  export type AttrsRequired = Required<Attrs>;

  export type Config = {
    /** [Override] ID of the input element */
    id?: Attrs["id"];
    /** [Extend] Change handler */
    onChange?: Attrs["onChange"];
    /** [Extend] Focus handler */
    onFocus?: Attrs["onFocus"];
    /** [Extend] IDs of the elements describing the select element; the ID of the error text is added while errors are reported */
    "aria-describedby"?: Attrs["aria-describedby"];
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
      id: this.config.id ?? this.field.stableId,
      multiple: this.config.multiple,
      value: this.value,
      onChange: this.onChange,
      onFocus: this.onFocus,
      "aria-invalid": this.field.isErrorReported,
      "aria-errormessage": this.errorMessages ?? undefined,
      "aria-describedby": describedBy(this.field, this.config["aria-describedby"]),
    } satisfies SelectBoxBinding.Attrs;
  }
}
