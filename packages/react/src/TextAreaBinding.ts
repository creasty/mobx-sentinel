import { FormBinding, FormField } from "@mobx-sentinel/form";
import { makeObservable, computed, action } from "mobx";

export namespace TextAreaBinding {
  /** @ignore */
  export type Attrs = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
  /** @ignore */
  export type AttrsRequired = Required<Attrs>;

  export type Config = {
    /** Get the value from the model */
    getter: () => string | null;
    /** Set the value to the model @action */
    setter: (value: string) => void;

    /** [Override] ID of the textarea element */
    id?: Attrs["id"];
    /** [Extend] Change handler */
    onChange?: Attrs["onChange"];
    /** [Extend] Focus handler */
    onFocus?: Attrs["onFocus"];
    /** [Extend] Blur handler */
    onBlur?: Attrs["onBlur"];
  };
}

/**
 * Binding for textarea elements
 *
 * Key features:
 * - Handles intermediate values during typing
 * - Auto-finalizes values on blur
 * - Manages error states and ARIA attributes
 */
export class TextAreaBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: TextAreaBinding.Config
  ) {
    makeObservable(this);
  }

  get value(): string {
    return this.config.getter() ?? "";
  }

  @action
  onChange: TextAreaBinding.AttrsRequired["onChange"] = (e) => {
    this.config.setter(e.currentTarget.value);
    this.field.markAsChanged("intermediate");
    this.config.onChange?.(e);
  };

  onBlur: TextAreaBinding.AttrsRequired["onBlur"] = (e) => {
    this.field.finalizeChangeIfNeeded();
    this.config.onBlur?.(e);
  };

  onFocus: TextAreaBinding.AttrsRequired["onFocus"] = (e) => {
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
      value: this.value,
      id: this.config.id ?? this.field.stableId,
      onChange: this.onChange,
      onFocus: this.onFocus,
      onBlur: this.onBlur,
      "aria-invalid": this.field.isErrorReported,
      "aria-errormessage": this.errorMessages ?? undefined,
    } satisfies TextAreaBinding.Attrs;
  }
}
