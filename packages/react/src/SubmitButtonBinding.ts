import { Form, FormBinding } from "@mobx-sentinel/form";
import { makeObservable, computed } from "mobx";

export namespace SubmitButtonBinding {
  export type Attrs = React.ButtonHTMLAttributes<HTMLButtonElement>;
  export type AttrsRequired = Required<Attrs>;

  export type Config = {
    /** [Extend] Click handler */
    onClick?: Attrs["onClick"];
    /** [Extend] Mouse enter handler */
    onMouseOver?: Attrs["onMouseOver"];
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

  onMouseOver: SubmitButtonBinding.AttrsRequired["onMouseOver"] = (e) => {
    this.form.reportError();
    this.config.onMouseOver?.(e);
  };

  get props() {
    return {
      onClick: this.onClick,
      onMouseOver: this.onMouseOver,
      disabled: !this.form.canSubmit,
      "aria-busy": this.busy,
      "aria-invalid": !this.form.isValid,
    } satisfies SubmitButtonBinding.Attrs;
  }
}
