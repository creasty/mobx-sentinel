import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { autorun, makeObservable, observable, reaction, runInAction } from "mobx";
import { Form } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { SubmitButtonBinding } from "./SubmitButtonBinding";

class SampleModel {
  @observable field = "hello";

  constructor() {
    makeObservable(this);
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

function createDeferred<T>() {
  let resolve: (value: T) => void = () => void 0;
  const promise = new Promise<T>((_resolve) => {
    resolve = _resolve;
  });
  return { promise, resolve };
}

/** Add a submit handler that stays pending until resolved */
const addPendingSubmitHandler = (form: Form<SampleModel>) => {
  const deferred = createDeferred<boolean>();
  const submitHandler = vi.fn((_abortSignal: AbortSignal) => deferred.promise);
  form.addHandler("submit", submitHandler);
  const didSubmit = new Promise<boolean>((resolve) => {
    form.addHandler("didSubmit", resolve);
  });
  return {
    submitHandler,
    didSubmit,
    resolve: deferred.resolve,
  };
};

/** Make the form invalid. Returns a function to remove the error. */
const invalidate = (form: Form<SampleModel>) => {
  return form.validator.updateErrors(Symbol(), (builder) => {
    builder.invalidate("field", "invalid");
  });
};

/** Add a validation handler whose re-validation is observable via form.isValidating */
const addRequiredValidation = (model: SampleModel) => {
  Form.get(model).validator.addSyncHandler((builder) => {
    if (!model.field) {
      builder.invalidate("field", "required");
    }
  });
  vi.runAllTimers();
};

describe("SubmitButtonBinding", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const binding = new SubmitButtonBinding(form, {});
    const element = document.createElement("button");
    const fakeEvent = () => {
      return { currentTarget: element } as any;
    };

    return {
      model,
      form,
      binding,
      fakeEvent,
    };
  };

  describe("#busy", () => {
    it("is false when the form is idle", () => {
      const env = setupEnv();
      expect(env.binding.busy).toBe(false);
    });

    it("is true while the form is submitting", async () => {
      const env = setupEnv();
      const submission = addPendingSubmitHandler(env.form);
      env.form.markAsDirty();

      env.binding.onClick(env.fakeEvent());
      expect(env.form.isSubmitting).toBe(true);
      expect(env.binding.busy).toBe(true);

      submission.resolve(true);
      await submission.didSubmit;
      expect(env.binding.busy).toBe(false);
    });

    it("is true while the form is validating", () => {
      vi.useFakeTimers();
      try {
        const env = setupEnv();
        addRequiredValidation(env.model);
        expect(env.binding.busy).toBe(false);

        runInAction(() => {
          env.model.field = "";
        });
        expect(env.form.isValidating).toBe(true);
        expect(env.binding.busy).toBe(true);

        vi.runAllTimers();
        expect(env.form.isValidating).toBe(false);
        expect(env.binding.busy).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("notifies observers only when the busy state flips", async () => {
      vi.useFakeTimers();
      try {
        const env = setupEnv();
        addRequiredValidation(env.model);
        const submission = addPendingSubmitHandler(env.form);
        const values: boolean[] = [];
        const dispose = reaction(
          () => env.binding.busy,
          (busy) => values.push(busy)
        );

        env.form.markAsDirty();
        env.binding.onClick(env.fakeEvent());
        expect(values).toEqual([true]);

        // Validating while submitting doesn't change the busy state
        runInAction(() => {
          env.model.field = "world";
        });
        expect(env.form.isValidating).toBe(true);
        vi.runAllTimers();
        expect(env.form.isValidating).toBe(false);
        expect(values).toEqual([true]);

        submission.resolve(true);
        await submission.didSubmit;
        expect(values).toEqual([true, false]);

        dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not re-run observers while the busy state stays true", async () => {
      vi.useFakeTimers();
      try {
        const env = setupEnv();
        addRequiredValidation(env.model);
        const submission = addPendingSubmitHandler(env.form);
        let runs = 0;
        const dispose = autorun(() => {
          void env.binding.busy;
          runs++;
        });
        expect(runs).toBe(1);

        env.form.markAsDirty();
        env.binding.onClick(env.fakeEvent());
        expect(env.binding.busy).toBe(true);
        expect(runs).toBe(2);

        runInAction(() => {
          env.model.field = "world";
        });
        expect(env.form.isValidating).toBe(true);

        // The submission finishes while the form is still validating
        submission.resolve(true);
        await submission.didSubmit;
        expect(env.form.isSubmitting).toBe(false);
        expect(env.form.isValidating).toBe(true);
        expect(env.binding.busy).toBe(true);
        expect(runs).toBe(2);

        vi.runAllTimers();
        expect(env.binding.busy).toBe(false);
        expect(runs).toBe(3);

        dispose();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("#onClick", () => {
    it("works without a callback", () => {
      const env = setupEnv();
      env.binding.onClick(env.fakeEvent());
    });

    it("calls the callback if provided", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onClick = callback;
      env.binding.onClick(env.fakeEvent());
      expect(callback).toBeCalledWith(env.fakeEvent());
    });

    it("starts the submission synchronously when the form can be submitted", async () => {
      const env = setupEnv();
      const submission = addPendingSubmitHandler(env.form);
      const submitSpy = vi.spyOn(env.form, "submit");
      env.form.markAsDirty();

      env.binding.onClick(env.fakeEvent());
      expect(submitSpy).toHaveBeenCalledTimes(1);
      expect(submitSpy).toHaveBeenCalledWith(); // Not forced
      expect(submission.submitHandler).toHaveBeenCalledTimes(1);
      expect(env.form.isSubmitting).toBe(true);

      submission.resolve(true);
      await expect(submitSpy.mock.results[0].value).resolves.toBe(true);
      expect(env.form.isSubmitting).toBe(false);
    });

    it("calls the callback after starting the submission", () => {
      const env = setupEnv();
      addPendingSubmitHandler(env.form);
      const isSubmitting: boolean[] = [];
      env.binding.config.onClick = () => {
        isSubmitting.push(env.form.isSubmitting);
      };
      env.form.markAsDirty();

      env.binding.onClick(env.fakeEvent());
      expect(isSubmitting).toEqual([true]);
    });

    it("does not submit when the form cannot be submitted, but still calls the callback", async () => {
      const env = setupEnv();
      const submission = addPendingSubmitHandler(env.form);
      const submitSpy = vi.spyOn(env.form, "submit");
      const callback = vi.fn();
      env.binding.config.onClick = callback;
      expect(env.form.canSubmit).toBe(false);

      env.binding.onClick(env.fakeEvent());
      expect(submission.submitHandler).not.toHaveBeenCalled();
      expect(env.form.isSubmitting).toBe(false);
      expect(callback).toHaveBeenCalledTimes(1);
      await expect(submitSpy.mock.results[0].value).resolves.toBe(false);
    });

    it("ignores clicks while the submission is in progress", async () => {
      const env = setupEnv();
      const submission = addPendingSubmitHandler(env.form);
      const submitSpy = vi.spyOn(env.form, "submit");
      const callback = vi.fn();
      env.binding.config.onClick = callback;
      env.form.markAsDirty();

      env.binding.onClick(env.fakeEvent());
      env.binding.onClick(env.fakeEvent());
      expect(submitSpy).toHaveBeenCalledTimes(2);
      expect(submission.submitHandler).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(2);
      await expect(submitSpy.mock.results[1].value).resolves.toBe(false);

      // The in-flight submission is not aborted
      expect(submission.submitHandler.mock.calls[0][0].aborted).toBe(false);
      submission.resolve(true);
      await expect(submission.didSubmit).resolves.toBe(true);
      await expect(submitSpy.mock.results[0].value).resolves.toBe(true);
    });

    it("allows submitting again after a submit handler throws", async () => {
      const env = setupEnv();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => void 0);
      try {
        const error = new Error("failed");
        env.form.addHandler("submit", async () => {
          throw error;
        });
        const didSubmit = new Promise<boolean>((resolve) => {
          env.form.addHandler("didSubmit", resolve);
        });
        env.form.markAsDirty();

        env.binding.onClick(env.fakeEvent());
        expect(env.binding.props.disabled).toBe(true);
        await expect(didSubmit).resolves.toBe(false);

        expect(consoleError).toHaveBeenCalledWith(error);
        expect(env.binding.busy).toBe(false);
        expect(env.form.isDirty).toBe(true);
        expect(env.binding.props.disabled).toBe(false);
      } finally {
        consoleError.mockRestore();
      }
    });

    it("swallows a rejection of form.submit()", async () => {
      const env = setupEnv();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => void 0);
      try {
        const rejected = Promise.reject(new Error("unexpected"));
        const catchSpy = vi.spyOn(rejected, "catch");
        vi.spyOn(env.form, "submit").mockReturnValue(rejected);
        const callback = vi.fn();
        env.binding.config.onClick = callback;

        expect(() => env.binding.onClick(env.fakeEvent())).not.toThrow();
        expect(catchSpy).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);
        await expect(catchSpy.mock.results[0].value).resolves.toBeUndefined();

        // The rejection is deliberately discarded (`.catch((e) => void e)`) to avoid an unhandled rejection.
        // A real Form#submit() never rejects: Submission catches and logs handler errors itself.
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("does not submit while the form is validating, but still calls the callback", () => {
      vi.useFakeTimers();
      try {
        const env = setupEnv();
        addRequiredValidation(env.model);
        const submission = addPendingSubmitHandler(env.form);
        const callback = vi.fn();
        env.binding.config.onClick = callback;

        runInAction(() => {
          env.model.field = "world";
        });
        expect(env.form.isDirty).toBe(true);
        expect(env.form.isValidating).toBe(true);

        env.binding.onClick(env.fakeEvent());
        expect(submission.submitHandler).not.toHaveBeenCalled();
        expect(env.form.isSubmitting).toBe(false);
        expect(callback).toHaveBeenCalledTimes(1);

        // A click after the validation has finished submits
        vi.runAllTimers();
        env.binding.onClick(env.fakeEvent());
        expect(submission.submitHandler).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("passes the received event object to the callback as is", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onClick = callback;
      const event = env.fakeEvent();

      env.binding.onClick(event);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toBe(event);
    });

    it("propagates an error thrown by the callback, after the submission has started", async () => {
      const env = setupEnv();
      const submission = addPendingSubmitHandler(env.form);
      const error = new Error("callback failed");
      env.binding.config.onClick = () => {
        throw error;
      };
      env.form.markAsDirty();

      expect(() => env.binding.onClick(env.fakeEvent())).toThrow(error);
      expect(submission.submitHandler).toHaveBeenCalledTimes(1);
      expect(env.form.isSubmitting).toBe(true);

      submission.resolve(true);
      await expect(submission.didSubmit).resolves.toBe(true);
    });
  });

  describe("onMouseOver", () => {
    it("works without a callback", () => {
      const env = setupEnv();
      env.binding.onMouseOver(env.fakeEvent());
    });

    it("calls the callback if provided", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onMouseOver = callback;
      env.binding.onMouseOver(env.fakeEvent());
      expect(callback).toBeCalledWith(env.fakeEvent());
    });

    it("reports errors of the fields before calling the callback", () => {
      const env = setupEnv();
      const field = env.form.getField("field");
      invalidate(env.form);
      const isErrorReported: (boolean | undefined)[] = [];
      env.binding.config.onMouseOver = () => {
        isErrorReported.push(field.isErrorReported);
      };
      expect(field.isErrorReported).toBeUndefined();

      env.binding.onMouseOver(env.fakeEvent());
      expect(isErrorReported).toEqual([true]);
      expect(field.isErrorReported).toBe(true);
    });

    it("reports errors even when the form cannot be submitted, without submitting", () => {
      const env = setupEnv();
      const reportErrorSpy = vi.spyOn(env.form, "reportError");
      const submitSpy = vi.spyOn(env.form, "submit");
      invalidate(env.form);
      expect(env.form.canSubmit).toBe(false);

      env.binding.onMouseOver(env.fakeEvent());
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      expect(submitSpy).not.toHaveBeenCalled();
      expect(env.form.isSubmitting).toBe(false);
    });

    it("passes the received event object to the callback as is", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onMouseOver = callback;
      const event = env.fakeEvent();

      env.binding.onMouseOver(event);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toBe(event);
    });

    it("propagates an error thrown by the callback, after reporting errors", () => {
      const env = setupEnv();
      const field = env.form.getField("field");
      invalidate(env.form);
      const error = new Error("callback failed");
      env.binding.config.onMouseOver = () => {
        throw error;
      };

      expect(() => env.binding.onMouseOver(env.fakeEvent())).toThrow(error);
      expect(field.isErrorReported).toBe(true);
    });
  });

  describe("props", () => {
    it("exposes the handlers and the state of the form", () => {
      const env = setupEnv();
      expect(env.binding.props).toStrictEqual({
        onClick: env.binding.onClick,
        onMouseOver: env.binding.onMouseOver,
        disabled: true,
        "aria-busy": false,
        "aria-invalid": false,
      });
    });

    it("returns the same handlers on every access", () => {
      const env = setupEnv();
      expect(env.binding.props).not.toBe(env.binding.props);
      expect(env.binding.props.onClick).toBe(env.binding.props.onClick);
      expect(env.binding.props.onMouseOver).toBe(env.binding.props.onMouseOver);
    });

    it("is disabled when the form is not dirty", () => {
      const env = setupEnv();
      expect(env.form.isDirty).toBe(false);
      expect(env.binding.props.disabled).toBe(true);
    });

    it("is enabled when the form is dirty and valid", () => {
      const env = setupEnv();
      env.form.markAsDirty();
      expect(env.binding.props.disabled).toBe(false);
      expect(env.binding.props["aria-invalid"]).toBe(false);
      expect(env.binding.props["aria-busy"]).toBe(false);
    });

    it("is disabled when the form is dirty but invalid", () => {
      const env = setupEnv();
      env.form.markAsDirty();
      const removeError = invalidate(env.form);
      expect(env.binding.props.disabled).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBe(true);

      removeError();
      expect(env.binding.props.disabled).toBe(false);
      expect(env.binding.props["aria-invalid"]).toBe(false);
    });

    it("is enabled when the form is invalid if allowSubmitInvalid is set", () => {
      const env = setupEnv();
      env.form.configure({ allowSubmitInvalid: true });
      env.form.markAsDirty();
      invalidate(env.form);
      expect(env.binding.props.disabled).toBe(false);
      expect(env.binding.props["aria-invalid"]).toBe(true);
    });

    it("is enabled when the form is not dirty if allowSubmitNonDirty is set", () => {
      const env = setupEnv();
      env.form.configure({ allowSubmitNonDirty: true });
      expect(env.binding.props.disabled).toBe(false);
    });

    it("is disabled and busy while submitting, regardless of the config", async () => {
      const env = setupEnv();
      env.form.configure({ allowSubmitInvalid: true, allowSubmitNonDirty: true });
      const submission = addPendingSubmitHandler(env.form);

      env.binding.onClick(env.fakeEvent());
      expect(env.binding.props.disabled).toBe(true);
      expect(env.binding.props["aria-busy"]).toBe(true);

      submission.resolve(true);
      await submission.didSubmit;
      expect(env.binding.props.disabled).toBe(false);
      expect(env.binding.props["aria-busy"]).toBe(false);
    });

    it("is disabled and busy while validating, regardless of the config", () => {
      vi.useFakeTimers();
      try {
        const env = setupEnv();
        env.form.configure({ allowSubmitInvalid: true, allowSubmitNonDirty: true });
        addRequiredValidation(env.model);

        runInAction(() => {
          env.model.field = "";
        });
        expect(env.binding.props.disabled).toBe(true);
        expect(env.binding.props["aria-busy"]).toBe(true);

        vi.runAllTimers();
        expect(env.binding.props.disabled).toBe(false);
        expect(env.binding.props["aria-busy"]).toBe(false);
        expect(env.binding.props["aria-invalid"]).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("sets aria-invalid as soon as the form is invalid, before errors are reported", () => {
      const env = setupEnv();
      const field = env.form.getField("field");
      invalidate(env.form);
      expect(field.isErrorReported).toBeUndefined();

      // PINNED(quirk): aria-invalid mirrors form.isValid immediately, whereas the field bindings (e.g. LabelBinding) wait until errors are reported; also, aria-invalid is not a supported state of the button role. Decide: should it follow the reported error state, or be dropped from the button?
      expect(env.binding.props["aria-invalid"]).toBe(true);
    });
  });
});

describe("bindSubmitButton", () => {
  const setupEnv = () => {
    const model = new SampleModel();

    const form = Form.get(model);
    let resolve = (): void => void 0;
    const promise = new Promise<boolean>((_resolve) => {
      resolve = () => _resolve(true);
    });
    form.addHandler("submit", () => promise);

    render(<SampleComponent model={model} />);
    const button = screen.getByLabelText("submit") as HTMLButtonElement;

    return {
      model,
      form: Form.get(model),
      button: button,
      async clickButton() {
        await userEvent.click(button);
      },
      async hoverButton() {
        await userEvent.hover(button);
      },
      async completeSubmit() {
        resolve();
        return promise;
      },
    };
  };

  /** Render a submit button (with a child element) bound to the form */
  const renderSubmitButton = (form: Form<SampleModel>, config?: SubmitButtonBinding.Config) => {
    const Component = observer(() => (
      <button aria-label="submit" {...form.bindSubmitButton(config)}>
        <span>Submit</span>
      </button>
    ));
    render(<Component />);
    return screen.getByLabelText("submit") as HTMLButtonElement;
  };

  test("Activates and disables the button", async () => {
    const env = setupEnv();

    expect(env.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();

    act(() => {
      env.form.markAsDirty();
    });
    expect(env.form.isSubmitting).toBe(false);
    expect(env.form.canSubmit).toBe(true);
    expect(env.button).not.toBeDisabled();

    await env.clickButton();

    expect(env.form.isSubmitting).toBe(true);
    expect(env.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();

    await act(async () => {
      await env.completeSubmit();
    });

    expect(env.form.isSubmitting).toBe(false);
    expect(env.form.canSubmit).toBe(false);
    expect(env.button).toBeDisabled();
  });

  test("Hovering the button triggers form.reportError()", async () => {
    const env = setupEnv();
    const spy = vi.spyOn(env.form, "reportError");

    act(() => {
      env.form.markAsDirty();
    });
    await env.hoverButton();

    expect(spy).toBeCalledTimes(1);
  });

  test("renders the state as attributes", async () => {
    const env = setupEnv();
    expect(env.button).toBeDisabled();
    expect(env.button).toHaveAttribute("aria-busy", "false");
    expect(env.button).toHaveAttribute("aria-invalid", "false");

    act(() => {
      env.form.markAsDirty();
    });
    expect(env.button).not.toBeDisabled();
    expect(env.button).not.toHaveAttribute("disabled");

    await env.clickButton();
    expect(env.button).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      await env.completeSubmit();
    });
    expect(env.button).toHaveAttribute("aria-busy", "false");

    act(() => {
      env.form.markAsDirty();
      invalidate(env.form);
    });
    expect(env.button).toBeDisabled();
    expect(env.button).toHaveAttribute("aria-invalid", "true");
  });

  test("clicking the disabled button does not submit the form", async () => {
    const env = setupEnv();
    const submitSpy = vi.spyOn(env.form, "submit");
    expect(env.button).toBeDisabled();

    await env.clickButton();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(env.form.isSubmitting).toBe(false);
  });

  test("re-enables the button when the submission fails", async () => {
    const form = Form.get(new SampleModel());
    const submission = addPendingSubmitHandler(form);
    form.markAsDirty();
    const button = renderSubmitButton(form);
    expect(button).not.toBeDisabled();

    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      submission.resolve(false);
      await submission.didSubmit;
    });
    expect(form.isDirty).toBe(true);
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "false");
  });

  test("marks the button as busy while validating", () => {
    vi.useFakeTimers();
    try {
      const model = new SampleModel();
      const form = Form.get(model);
      addRequiredValidation(model);
      const button = renderSubmitButton(form);
      expect(button).toHaveAttribute("aria-busy", "false");

      act(() => {
        runInAction(() => {
          model.field = "";
        });
      });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");

      act(() => {
        vi.runAllTimers();
      });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "false");
      expect(button).toHaveAttribute("aria-invalid", "true");

      act(() => {
        runInAction(() => {
          model.field = "world";
        });
        vi.runAllTimers();
      });
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute("aria-invalid", "false");
    } finally {
      vi.useRealTimers();
    }
  });

  test("hovering reports errors even when the button is disabled", async () => {
    const form = Form.get(new SampleModel());
    const field = form.getField("field");
    invalidate(form);
    const button = renderSubmitButton(form);
    expect(button).toBeDisabled();

    // React dispatches onMouseOver to disabled buttons (unlike onClick)
    await userEvent.hover(button);
    expect(field.isErrorReported).toBe(true);
  });

  test("hovering a child element of the button reports errors again", async () => {
    const form = Form.get(new SampleModel());
    form.markAsDirty();
    const onMouseOver = vi.fn();
    const button = renderSubmitButton(form, { onMouseOver });
    const reportErrorSpy = vi.spyOn(form, "reportError");
    // Keep the button enabled so the result doesn't depend on how disabled buttons receive mouse events
    expect(button).not.toBeDisabled();

    await userEvent.hover(button);
    expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    expect(onMouseOver).toHaveBeenCalledTimes(1);

    await userEvent.hover(screen.getByText("Submit"));
    // PINNED(quirk): the handler is bound to onMouseOver, which bubbles, so moving onto a child element fires it again, while the Config JSDoc describes it as a "Mouse enter handler". Decide: bind to onMouseEnter (fires once per entry), or fix the JSDoc?
    expect(reportErrorSpy).toHaveBeenCalledTimes(2);
    expect(onMouseOver).toHaveBeenCalledTimes(2);
  });

  test("does not prevent the native submission of an enclosing <form>", () => {
    const form = Form.get(new SampleModel());
    form.markAsDirty();
    const onSubmit = vi.fn((e: React.FormEvent) => {
      e.preventDefault(); // Keep jsdom from navigating
    });
    const Component = observer(() => (
      <form onSubmit={onSubmit}>
        <button aria-label="submit" {...form.bindSubmitButton()}>
          Submit
        </button>
      </form>
    ));
    render(<Component />);
    const button = screen.getByLabelText("submit");

    // fireEvent returns false only when a handler called preventDefault() on the click event
    const notPrevented = fireEvent.click(button);
    expect(form.isSubmitting).toBe(false); // No handlers, so the submission completes synchronously
    // PINNED(quirk): the binding neither sets type="button" nor calls preventDefault(), so inside a <form> the button (type defaults to "submit") also triggers a native form submission (a page navigation in browsers). Decide: should the binding set type="button" or prevent the default action, or is wrapping in a <form> the caller's responsibility?
    expect(button).not.toHaveAttribute("type");
    expect(notPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("submits only once when double-clicked", async () => {
    const form = Form.get(new SampleModel());
    const submission = addPendingSubmitHandler(form);
    const onClick = vi.fn();
    form.markAsDirty();
    const button = renderSubmitButton(form, { onClick });

    await userEvent.dblClick(button);
    expect(submission.submitHandler).toHaveBeenCalledTimes(1);
    // The button is disabled after the first click, so the second click doesn't reach the handler
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await act(async () => {
      submission.resolve(true);
      await submission.didSubmit;
    });
    expect(form.isDirty).toBe(false);
    expect(button).toBeDisabled();
  });

  test.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ])("submits when activated with the %s key", async (_, key) => {
    const form = Form.get(new SampleModel());
    const submission = addPendingSubmitHandler(form);
    form.markAsDirty();
    const button = renderSubmitButton(form);

    act(() => {
      button.focus();
    });
    await userEvent.keyboard(key);
    expect(submission.submitHandler).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      submission.resolve(true);
      await submission.didSubmit;
    });
    expect(button).toHaveAttribute("aria-busy", "false");
  });

  test("submits a non-dirty invalid form when the config allows it", async () => {
    const form = Form.get(new SampleModel());
    form.configure({ allowSubmitInvalid: true, allowSubmitNonDirty: true });
    const submission = addPendingSubmitHandler(form);
    invalidate(form);
    const button = renderSubmitButton(form);
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-invalid", "true");

    await userEvent.click(button);
    expect(submission.submitHandler).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      submission.resolve(true);
      await submission.didSubmit;
    });
    // The successful submission resets the form, but it stays submittable
    expect(form.isDirty).toBe(false);
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-invalid", "true");
  });

  describe("binding cache", () => {
    test("replaces the config on every call while keeping the handlers", () => {
      const form = Form.get(new SampleModel());
      const first = vi.fn();
      const second = vi.fn();
      const event = {} as any;

      const props1 = form.bindSubmitButton({ onClick: first, onMouseOver: first });
      const props2 = form.bindSubmitButton({ onClick: second });
      expect(props2.onClick).toBe(props1.onClick);
      expect(props2.onMouseOver).toBe(props1.onMouseOver);

      props1.onClick(event);
      props1.onMouseOver(event);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);

      form.bindSubmitButton();
      props1.onClick(event);
      expect(second).toHaveBeenCalledTimes(1);
    });

    test("creates a separate binding per cacheKey", () => {
      const form = Form.get(new SampleModel());
      const props = form.bindSubmitButton();
      expect(form.bindSubmitButton({ cacheKey: "another" }).onClick).not.toBe(props.onClick);
      expect(form.bindSubmitButton({ cacheKey: "another" }).onClick).toBe(
        form.bindSubmitButton({ cacheKey: "another" }).onClick
      );
    });
  });

  test("types", () => {
    const form = Form.get(new SampleModel());

    expectTypeOf(form.bindSubmitButton).toBeCallableWith();
    expectTypeOf(form.bindSubmitButton).toBeCallableWith({
      onClick: () => void 0,
      onMouseOver: () => void 0,
      cacheKey: "key",
    });
    expectTypeOf(form.bindSubmitButton()).toEqualTypeOf<{
      onClick: React.MouseEventHandler<HTMLButtonElement>;
      onMouseOver: React.MouseEventHandler<HTMLButtonElement>;
      disabled: boolean;
      "aria-busy": boolean;
      "aria-invalid": boolean;
    }>();
    expectTypeOf<SubmitButtonBinding.Config>().toEqualTypeOf<{
      onClick?: React.MouseEventHandler<HTMLButtonElement> | undefined;
      onMouseOver?: React.MouseEventHandler<HTMLButtonElement> | undefined;
    }>();
    expectTypeOf<SubmitButtonBinding["busy"]>().toEqualTypeOf<boolean>();
    expectTypeOf<SubmitButtonBinding["onClick"]>().toEqualTypeOf<React.MouseEventHandler<HTMLButtonElement>>();
    expectTypeOf<SubmitButtonBinding["onMouseOver"]>().toEqualTypeOf<React.MouseEventHandler<HTMLButtonElement>>();
    expectTypeOf<SubmitButtonBinding["props"]>().toEqualTypeOf<ReturnType<typeof form.bindSubmitButton>>();
    expectTypeOf(SubmitButtonBinding).constructorParameters.toEqualTypeOf<
      [Form<unknown>, SubmitButtonBinding.Config]
    >();

    // @ts-expect-error Unknown config key
    form.bindSubmitButton({ onFocus: () => void 0 });

    // @ts-expect-error The config is required when binding without the extension
    const props = form.bind(SubmitButtonBinding) as SubmitButtonBinding["props"];
    // Without a config, the props can be read but the handlers crash
    expect(props.disabled).toBe(true);
    expect(() => props.onClick({} as any)).toThrow(TypeError);
    expect(() => props.onMouseOver({} as any)).toThrow(TypeError);
  });
});
