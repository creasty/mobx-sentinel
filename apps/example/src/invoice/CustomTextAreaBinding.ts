import { FormBinding, FormField } from "@mobx-sentinel/form";
import { action, computed, makeObservable } from "mobx";

/**
 * A binding this app adds for itself, in about sixty lines.
 *
 * `@mobx-sentinel/react` ships bindings for `<input>`, `<select>`, `<button>`
 * and `<label>`; `<textarea>` is not one of them, and `InputBinding`'s props
 * are typed for `HTMLInputElement`. So this one targets `<textarea>` and adds
 * behaviour no general-purpose binding would: the box grows with its content.
 *
 * The `Custom` prefix is deliberate — nothing here comes from the library.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace CustomTextAreaBinding {
  export type Attrs = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

  export type Config = {
    /** Read the value from the model */
    getter: () => string;
    /** Write the value to the model */
    setter: (value: string) => void;
    /** [Override] ID of the textarea element */
    id?: Attrs["id"];
    /** [Extend] Blur handler */
    onBlur?: Attrs["onBlur"];
    /** Height the box starts at, and never shrinks below */
    minRows?: number;
    /** Height the box stops growing at */
    maxRows?: number;
    placeholder?: Attrs["placeholder"];
  };
}

export class CustomTextAreaBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: CustomTextAreaBinding.Config
  ) {
    makeObservable(this);
  }

  @computed
  get value(): string {
    return this.config.getter();
  }

  /** Grow with the content, between the configured bounds. */
  @computed
  get rows(): number {
    const minRows = this.config.minRows ?? 3;
    const maxRows = this.config.maxRows ?? 10;
    const lines = this.value.split("\n").length;
    return Math.min(Math.max(lines, minRows), maxRows);
  }

  @computed
  get errorMessages(): string | null {
    if (!this.field.isErrorReported) return null; // Respect the form's error reporting strategy
    return Array.from(this.field.errors).join(", ") || null;
  }

  @action
  onChange: NonNullable<CustomTextAreaBinding.Attrs["onChange"]> = (e) => {
    this.config.setter(e.currentTarget.value);
    this.field.markAsChanged("intermediate"); // Still typing — hold the errors back
  };

  onFocus: NonNullable<CustomTextAreaBinding.Attrs["onFocus"]> = () => {
    this.field.markAsTouched();
  };

  onBlur: NonNullable<CustomTextAreaBinding.Attrs["onBlur"]> = (e) => {
    this.field.finalizeChangeIfNeeded(); // Left the field — report now
    this.config.onBlur?.(e);
  };

  get props() {
    return {
      id: this.config.id ?? this.field.id,
      value: this.value,
      rows: this.rows,
      placeholder: this.config.placeholder,
      onChange: this.onChange,
      onFocus: this.onFocus,
      onBlur: this.onBlur,
      "aria-invalid": this.field.isErrorReported,
      "aria-errormessage": this.errorMessages ?? undefined,
    } satisfies CustomTextAreaBinding.Attrs;
  }
}
