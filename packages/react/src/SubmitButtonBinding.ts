import { Form, FormBinding } from "@mobx-form/core";
import { makeObservable } from "mobx";

export namespace SubmitButtonBinding {
  export type Attrs = React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export class SubmitButtonBinding implements FormBinding {
  constructor(private readonly form: Form<unknown>) {
    makeObservable(this);
  }

  onClick: SubmitButtonBinding.Attrs["onClick"] = () => {
    this.form.submit().catch((e) => void e);
  };

  onMouseEnter: SubmitButtonBinding.Attrs["onMouseEnter"] = () => {
    this.form.reportError();
  };

  get props() {
    return {
      onClick: this.onClick,
      onMouseEnter: this.onMouseEnter,
      disabled: !this.form.canSubmit,
    } satisfies SubmitButtonBinding.Attrs;
  }
}
