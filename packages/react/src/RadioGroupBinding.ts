import { FormBinding, FormField } from "@mobx-sentinel/form";
import { makeObservable, computed, action } from "mobx";
import { createElement, Fragment } from "react";

export namespace RadioGroupBinding {
  /** @ignore */
  export type Attrs = React.InputHTMLAttributes<HTMLInputElement>;
  /** @ignore */
  export type AttrsRequired = Required<Attrs>;

  /**
   * Value that a radio button of the group stands for
   *
   * @remarks The button's `value` attribute is its string form, or an empty string for `null`.
   */
  export type Option = string | number | boolean | null;

  export type Config<V extends Option = Option> = {
    /** Get the value from the model */
    getter: () => V;
    /** Set the option of the selected radio button to the model @action */
    setter: (value: V) => void;

    /** [Extend] Change handler */
    onChange?: Attrs["onChange"];
    /** [Extend] Focus handler */
    onFocus?: Attrs["onFocus"];
  };

  /** Overrides for one radio button of the group */
  export type ButtonConfig = {
    /**
     * [Override] ID of the input element.
     *
     * - `true`: Use the field's stable ID as the ID.
     * - `false`: No ID.
     * - `string`: Use the given string as the ID.
     */
    id?: string | boolean;
    /** [Override] Name attribute of the input element */
    name?: string;
  };
}

/**
 * Binding for a group of radio buttons
 *
 * Key features:
 * - Binds a radio button per option, grouped by name
 * - Types the options after the getter, and passes the option itself to the setter
 * - Supports optional (nullable) values, including a `null` option
 * - Manages error states and ARIA attributes
 */
export class RadioGroupBinding<V extends RadioGroupBinding.Option = RadioGroupBinding.Option> implements FormBinding {
  readonly #changeHandlers = new Map<V, RadioGroupBinding.AttrsRequired["onChange"]>();

  constructor(
    private readonly field: FormField,
    public config: RadioGroupBinding.Config<V>
  ) {
    makeObservable(this);
  }

  get value(): V {
    return this.config.getter();
  }

  onFocus: RadioGroupBinding.AttrsRequired["onFocus"] = (e) => {
    this.field.markAsTouched();
    this.config.onFocus?.(e);
  };

  @computed
  get errorMessages() {
    if (!this.field.isErrorReported) return null;
    return Array.from(this.field.errors).join(", ") || null;
  }

  props = (
    /** Option that the radio button stands for */
    option: V,
    config?: RadioGroupBinding.ButtonConfig
  ) => {
    return {
      type: "radio",
      id: config?.id === true ? this.field.stableId : config?.id ? config.id : undefined,
      value: option === null ? "" : String(option),
      name: config?.name ?? this.field.stableId,
      checked: this.value === option,
      onChange: this.#getChangeHandler(option),
      onFocus: this.onFocus,
      "aria-invalid": this.field.isErrorReported,
      "aria-errormessage": this.errorMessages ?? undefined,
    } satisfies RadioGroupBinding.Attrs;
  };

  /**
   * Get the change handler of the radio button for the option
   *
   * Each option has a handler of its own, which passes the option itself to the setter rather than reading it back
   * from the `value` attribute: that is only its string form, which options like `1` and `"1"`, or `null` and `""`,
   * share. The handler is created once per option, so the props keep the same handler across renders.
   */
  #getChangeHandler(option: V) {
    let handler = this.#changeHandlers.get(option);
    if (!handler) {
      handler = action((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.currentTarget.checked) return;
        this.config.setter(option);
        this.field.markAsChanged();
        this.config.onChange?.(e);
      });
      this.#changeHandlers.set(option, handler);
    }
    return handler;
  }
}

/**
 * Render a radio button for each option of a radio group
 *
 * @remarks
 * - `renderOption` receives the option, a `bind` function that returns the props of the option's radio button,
 *   and the option's index. `bind` takes the same overrides as the binding's second argument.
 * - Each option is keyed by its value, so the element that `renderOption` returns needs no `key`.
 *
 * @example
 * ```tsx
 * {renderRadioGroup({
 *   binding: form.bindRadioGroup("role", {
 *     getter: () => model.role,
 *     setter: (v) => (model.role = v),
 *   }),
 *   options: Object.values(Role),
 *   renderOption: (role, bind) => (
 *     <label>
 *       <input {...bind()} /> {role}
 *     </label>
 *   ),
 * })}
 * ```
 */
export function renderRadioGroup<V extends RadioGroupBinding.Option>(args: {
  /** What `form.bindRadioGroup()` returns */
  binding: RadioGroupBinding<V>["props"];
  /** Options to render a radio button for, in order */
  options: readonly V[];
  /** Render the radio button of an option */
  renderOption: (
    option: V,
    bind: (config?: RadioGroupBinding.ButtonConfig) => ReturnType<RadioGroupBinding<V>["props"]>,
    index: number
  ) => React.ReactNode;
}): React.ReactElement {
  return createElement(
    Fragment,
    null,
    args.options.map((option, index) =>
      createElement(
        Fragment,
        // Typed, so that options sharing a string form, like `1` and `"1"`, or `null` and `"null"`, keep distinct keys
        { key: `${typeof option}:${String(option)}` },
        args.renderOption(option, (config) => args.binding(option, config), index)
      )
    )
  );
}
