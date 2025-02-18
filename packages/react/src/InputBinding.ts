import { FormBinding, FormField } from "@form-model/core";
import { makeObservable, computed, action } from "mobx";

export namespace InputBinding {
  export type Attrs = React.InputHTMLAttributes<HTMLInputElement>;
  export type AttrsRequired = Required<Attrs>;

  type DateValueType = "date" | "datetime-local" | "month" | "time" | "week";
  type NumericValueType = "number" | "range" | DateValueType;
  type StringType =
    | "color"
    | "text"
    | "tel"
    | "url"
    | "email"
    | "password"
    | "search"
    | DateValueType
    | NumericValueType;

  export type Config = {
    /** [Override] ID of the input element */
    id?: Attrs["id"];
    /** [Extend] Change handler */
    onChange?: Attrs["onChange"];
    /** [Extend] Focus handler */
    onFocus?: Attrs["onFocus"];
    /** [Extend] Blur handler */
    onBlur?: Attrs["onBlur"];
  } & (
    | {
        /**
         * Type of form control.
         *
         * When unspecified, it is deduced from the valueAs.
         * @default "text" - when valueAs is undefined or "string"
         */
        type?: StringType;
        /**
         * Value type of the input element.
         * It determines how getter/setter should handle the value.
         */
        valueAs?: "string";
        /** Get the value from the model @computed */
        getter: () => string | null;
        /** Set the value to the model @action */
        setter: (value: string) => void;
      }
    | {
        /**
         * Type of form control.
         *
         * When unspecified, it is deduced from the valueAs.
         * @default "number" - when valueAs is "number"
         */
        type?: NumericValueType;
        /**
         * Value type of the input element.
         * It determines how getter/setter should handle the value.
         */
        valueAs: "number";
        /** Get the value from the model @computed */
        getter: () => number | null;
        /** Set the value to the model @action */
        setter: (value: number | null) => void;
      }
    | {
        /**
         * Type of form control.
         *
         * When unspecified, it is deduced from the valueAs.
         * @default "date" - when valueAs is "date"
         */
        type?: DateValueType;
        /**
         * Value type of the input element.
         * It determines how getter/setter should handle the value.
         */
        valueAs: "date";
        /**
         * Get the value from the model @computed
         *
         * String representation of the date.
         * As Date instance has no distinction between date and datetime,
         * it's developers' responsibility to format the date correctly.
         *
         * | `type` attr    | Expected format   | Example           |
         * |----------------|-------------------|-------------------|
         * | date           | YYYY-MM-DD        | 2024-12-31        |
         * | datetime-local | YYYY-MM-DDTHH:mm  | 2024-12-31T23:59  |
         * | time           | HH:mm or HH:mm:ss | 23:59 or 23:59:59 |
         * | week           | YYYY-Www          | 2024-W52          |
         * | month          | YYYY-MM           | 2024-12           |
         *
         * @example
         * ```
         * date.toISOString().split("T")[0]
         * ```
         */
        getter: () => string | null;
        /** Set the value to the model @action */
        setter: (value: Date | null) => void;
      }
  );
}

export class InputBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: InputBinding.Config
  ) {
    makeObservable(this);
  }

  @computed
  get value(): InputBinding.AttrsRequired["value"] {
    return this.config.getter() ?? "";
  }

  get type(): InputBinding.AttrsRequired["type"] {
    if (this.config.type) return this.config.type;

    switch (this.config.valueAs) {
      case "number":
        return "number";
      case "date":
        return "date";
      default:
        return "text";
    }
  }

  @action
  onChange: InputBinding.AttrsRequired["onChange"] = (e) => {
    switch (this.config.valueAs) {
      case "number": {
        const value = e.currentTarget.valueAsNumber;
        this.config.setter(isNaN(value) ? null : value);
        break;
      }
      case "date":
        this.config.setter(e.currentTarget.valueAsDate);
        break;
      default:
        this.config.setter(e.currentTarget.value);
        break;
    }
    this.field.markAsChanged("intermediate");
    this.config.onChange?.(e);
  };

  onBlur: InputBinding.AttrsRequired["onBlur"] = (e) => {
    this.field.finalizeChangeIfNeeded();
    this.config.onBlur?.(e);
  };

  onFocus: InputBinding.AttrsRequired["onFocus"] = (e) => {
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
      type: this.type,
      value: this.value,
      id: this.config.id ?? this.field.id,
      onChange: this.onChange,
      onFocus: this.onFocus,
      onBlur: this.onBlur,
      "aria-invalid": this.field.isErrorReported,
      "aria-errormessage": this.errorMessages ?? undefined,
    } satisfies InputBinding.Attrs;
  }
}
