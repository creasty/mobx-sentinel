import { Form, FormBinding } from "@mobx-sentinel/form";
import { makeObservable, computed } from "mobx";

export namespace SubmitButtonBinding {
  /** @ignore */
  export type Attrs = React.ButtonHTMLAttributes<HTMLButtonElement>;
  /** @ignore */
  export type AttrsRequired = Required<Attrs>;

  export type Config = {
    /** [Extend] Click handler */
    onClick?: Attrs["onClick"];
    /** [Extend] Mouse enter handler */
    onMouseOver?: Attrs["onMouseOver"];
    /**
     * Keep the button disabled until the form is dirty.
     *
     * A click that reaches the button meanwhile doesn't submit the form either.
     *
     * @default false
     */
    disableUnlessDirty?: boolean;
  };
}

/**
 * Binding for submit button elements
 *
 * Key features:
 * - Handles form submission
 * - Auto-disables during submission or validation, or when invalid (and optionally, until the form is dirty)
 * - Reports errors on hover
 * - Manages busy states and ARIA attributes
 */
export class SubmitButtonBinding implements FormBinding {
  constructor(
    private readonly form: Form<unknown>,
    public config: SubmitButtonBinding.Config
  ) {
    makeObservable(this);
  }

  @computed
  get busy(): boolean {
    return this.form.isSubmitting || this.form.isValidating;
  }

  onClick: SubmitButtonBinding.AttrsRequired["onClick"] = (e) => {
    // Form#submit() checks the rest of what disables the button
    if (!this.#waitsForChange()) {
      this.form.submit().catch((e) => void e);
    }
    this.config.onClick?.(e);
  };

  onMouseOver: SubmitButtonBinding.AttrsRequired["onMouseOver"] = (e) => {
    this.form.reportError();
    this.config.onMouseOver?.(e);
  };

  /** Whether the button is disabled because of `disableUnlessDirty` */
  #waitsForChange() {
    return !!this.config.disableUnlessDirty && !this.form.isDirty;
  }

  get props() {
    return {
      onClick: this.onClick,
      onMouseOver: this.onMouseOver,
      disabled: !this.form.canSubmit || this.#waitsForChange(),
      "aria-busy": this.busy,
      "aria-invalid": !this.form.isValid,
    } satisfies SubmitButtonBinding.Attrs;
  }
}
