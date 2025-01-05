import React from "react";
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, runInAction } from "mobx";
import { Form } from "@mobx-form/core";
import "./extension";
import { observer } from "mobx-react-lite";
import { FormDelegate } from "@mobx-form/core";

class SampleModel implements FormDelegate<SampleModel> {
  readonly form = new Form<SampleModel>({ delegate: this });

  constructor() {
    makeObservable(this);
  }

  submit: FormDelegate<SampleModel>["submit"] = async () => {
    return this.submitDeferred.promise;
  };

  private submitDeferred = (() => {
    let resolve = (): void => void 0;
    const promise = new Promise<boolean>((_resolve) => {
      resolve = () => _resolve(true);
    });
    return { promise, resolve };
  })();

  async completeSubmit() {
    this.submitDeferred.resolve();
    return this.submitDeferred.promise;
  }
}

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  return (
    <>
      <button aria-label="submit" {...model.form.bindSubmitButton()}>
        Submit
      </button>
    </>
  );
});

function setupEnv() {
  const model = new SampleModel();

  render(<SampleComponent model={model} />);
  const button = screen.getByLabelText("submit") as HTMLButtonElement;

  return {
    model,
    button: button,
    async clickButton() {
      await userEvent.click(button);
    },
  };
}

describe("SubmitButtonBinding", () => {
  test("Activates and disables the button", async () => {
    const env = setupEnv();

    expect(env.model.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();

    act(() => {
      runInAction(() => {
        env.model.form.isDirty = true;
      });
    });
    expect(env.model.form.isSubmitting).toBe(false);
    expect(env.model.form.canSubmit).toBe(true);
    expect(env.button).not.toBeDisabled();

    await env.clickButton();

    expect(env.model.form.isSubmitting).toBe(true);
    expect(env.model.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();

    await env.model.completeSubmit();

    expect(env.model.form.isSubmitting).toBe(false);
    expect(env.model.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();
  });
});
