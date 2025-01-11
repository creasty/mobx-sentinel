import { Form, FormBinding } from "@form-model/core";
import { makeObservable } from "mobx";

export namespace SubmitButtonBinding {
  export type Attrs = React.ButtonHTMLAttributes<HTMLButtonElement>;
  export type AttrsRequired = Required<Attrs>;

  export type Config = {
    /** [Callback] Click handler */
    onClick?: Attrs["onClick"];
    /** [Callback] Mouse enter handler */
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
    } satisfies SubmitButtonBinding.Attrs;
  }
}
