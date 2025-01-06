import React from "react";
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, runInAction } from "mobx";
import { Form } from "@mobx-form/core";
import "./extension";
import { observer } from "mobx-react-lite";

class SampleModel implements Form.Delegate<SampleModel> {
  constructor() {
    makeObservable(this);
  }

  [Form.submit] = async () => {
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
  const form = Form.get(model);
  return (
    <>
      <button aria-label="submit" {...form.bindSubmitButton()}>
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
    form: Form.get(model),
    button: button,
    async clickButton() {
      await userEvent.click(button);
    },
  };
}

describe("SubmitButtonBinding", () => {
  test("Activates and disables the button", async () => {
    const env = setupEnv();

    expect(env.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();

    act(() => {
      runInAction(() => {
        env.form.isDirty = true;
      });
    });
    expect(env.form.isSubmitting).toBe(false);
    expect(env.form.canSubmit).toBe(true);
    expect(env.button).not.toBeDisabled();

    await env.clickButton();

    expect(env.form.isSubmitting).toBe(true);
    expect(env.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();

    await env.model.completeSubmit();

    expect(env.form.isSubmitting).toBe(false);
    expect(env.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();
  });
});
