import { Form, FormBinding } from "@mobx-sentinel/form";
import { makeObservable, computed } from "mobx";

export namespace SubmitButtonBinding {
  export type Attrs = React.ButtonHTMLAttributes<HTMLButtonElement>;
  export type AttrsRequired = Required<Attrs>;

  export type Config = {
    /** [Extend] Click handler */
    onClick?: Attrs["onClick"];
    /** [Extend] Mouse enter handler */
    onMouseEnter?: Attrs["onMouseEnter"];
  };
}

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
    this.form.submit().catch((e) => void e);
    this.config.onClick?.(e);
  };

  onMouseEnter: SubmitButtonBinding.AttrsRequired["onMouseEnter"] = (e) => {
    this.form.reportError();
    this.config.onMouseEnter?.(e);
  };

  get props() {
    return {
      onClick: this.onClick,
      onMouseEnter: this.onMouseEnter,
      disabled: !this.form.canSubmit,
      "aria-busy": this.busy,
      "aria-invalid": !this.form.isValid,
    } satisfies SubmitButtonBinding.Attrs;
  }
}
