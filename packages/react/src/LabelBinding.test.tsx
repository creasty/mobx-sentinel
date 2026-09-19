import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { autorun, makeObservable, observable, reaction, runInAction } from "mobx";
import { Form, FormField } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { LabelBinding } from "./LabelBinding";

class SampleModel {
  @observable field1 = "hello";
  @observable field2 = "world";

  constructor() {
    makeObservable(this);
  }
}

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <>
      <label aria-label="label" {...form.bindLabel(["field1", "field2"])}>
        Label
      </label>
      <input
        aria-label="field1"
        {...form.bindInput("field1", {
          getter: () => model.field1,
          setter: (v) => (model.field1 = v),
        })}
      />
      <input
        aria-label="field2"
        {...form.bindInput("field2", {
          getter: () => model.field2,
          setter: (v) => (model.field2 = v),
        })}
      />
    </>
  );
});

describe("LabelBinding", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = new FormField({
      fieldName: "field1",
      validator: form.validator,
      getFinalizationDelayMs: () => form.config.autoFinalizationDelayMs,
    });
    const binding = new LabelBinding([field], {});

    return {
      model,
      form,
      field,
      binding,
    };
  };

  const setupMultiEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field1 = form.getField("field1");
    const field2 = form.getField("field2");
    const binding = new LabelBinding([field1, field2], {});

    return {
      model,
      form,
      field1,
      field2,
      binding,
      /** Set error messages for the field. Returns a function to remove them. */
      invalidate(fieldName: "field1" | "field2", ...messages: string[]) {
        return form.validator.updateErrors(Symbol(), (builder) => {
          for (const message of messages) {
            builder.invalidate(fieldName, message);
          }
        });
      },
    };
  };

  describe("props.htmlFor", () => {
    it("uses the field id by default", () => {
      const env = setupEnv();
      expect(env.binding.props.htmlFor).toBe(env.field.id);
    });

    it("uses the provided id", () => {
      const env = setupEnv();
      env.binding.config.htmlFor = "somethingElse";
      expect(env.binding.props.htmlFor).toBe("somethingElse");
    });

    it("uses the stable id of the first field when bound to multiple fields", () => {
      const env = setupMultiEnv();
      expect(env.binding.firstFieldStableId).toBe(env.field1.stableId);
      expect(env.binding.props.htmlFor).toBe(env.field1.stableId);
      expect(env.binding.props.htmlFor).not.toBe(env.field2.stableId);
    });

    it("follows the order of the given fields", () => {
      const env = setupMultiEnv();
      const binding = new LabelBinding([env.field2, env.field1], {});
      expect(binding.firstFieldStableId).toBe(env.field2.stableId);
      expect(binding.props.htmlFor).toBe(env.field2.stableId);
    });

    it("is undefined when bound to no fields", () => {
      const binding = new LabelBinding([], {});
      expect(binding.firstFieldStableId).toBeUndefined();
      expect(binding.props.htmlFor).toBeUndefined();
    });

    it("follows a newly set stable id of the form while an observer holds the binding", () => {
      const form = Form.get(new SampleModel());
      form.stableId = "_R_0_";
      const binding = new LabelBinding([form.getField("field1")], {});

      // As an observer component rendering the label does. Unobserved, a computed would
      // recompute on every read and hide the difference.
      const dispose = autorun(() => void binding.props.htmlFor);
      expect(binding.props.htmlFor).toBe("_R_0_:field1");

      form.stableId = "_R_1_";
      expect(binding.props.htmlFor).toBe("_R_1_:field1");
      dispose();
    });

    it("keeps an empty string override instead of falling back to the field id", () => {
      const env = setupEnv();
      env.binding.config.htmlFor = "";
      expect(env.binding.props.htmlFor).toBe("");
    });

    it("falls back to the field id when the override is removed", () => {
      const env = setupEnv();
      env.binding.config.htmlFor = "somethingElse";
      expect(env.binding.props.htmlFor).toBe("somethingElse");
      env.binding.config = {};
      expect(env.binding.props.htmlFor).toBe(env.field.id);
      env.binding.config = { htmlFor: undefined };
      expect(env.binding.props.htmlFor).toBe(env.field.id);
    });

    it("reads the config on every access without tracking it", () => {
      const env = setupEnv();
      const values: (string | undefined)[] = [];
      const dispose = autorun(() => {
        values.push(env.binding.props.htmlFor);
      });

      env.binding.config.htmlFor = "somethingElse";
      // The config is a plain object (it's replaced on every bind call), so observers are not notified
      expect(values).toEqual([env.field.id]);
      expect(env.binding.props.htmlFor).toBe("somethingElse");

      dispose();
    });
  });

  describe("props", () => {
    it("has no error state when no errors are reported", () => {
      const env = setupEnv();
      expect(env.binding.props).toStrictEqual({
        htmlFor: env.field.id,
        "aria-invalid": false,
        "aria-errormessage": undefined,
      });
    });

    it("returns a new object on every access", () => {
      const env = setupEnv();
      expect(env.binding.props).not.toBe(env.binding.props);
      expect(env.binding.props).toStrictEqual(env.binding.props);
    });

    it("keeps aria-invalid false (not undefined) until errors are reported", () => {
      const env = setupEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "invalid1");
      });
      expect(env.field.isErrorReported).toBeUndefined();
      expect(env.binding.props["aria-invalid"]).toBe(false);
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();

      env.field.reportError();
      expect(env.field.isErrorReported).toBe(true);
      expect(env.binding.props["aria-invalid"]).toBe(true);
    });

    it("is not invalid when the reported field has no errors", () => {
      const env = setupEnv();
      env.field.reportError();
      expect(env.field.isErrorReported).toBe(false);
      expect(env.binding.props["aria-invalid"]).toBe(false);
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });

    it("sets aria-errormessage to the text of the first error message", () => {
      const env = setupEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "invalid1");
        builder.invalidate("field1", "invalid2");
      });
      env.field.reportError();

      expect(env.binding.props["aria-invalid"]).toBe(true);
      // PINNED(quirk): aria-errormessage is set to the error message text itself, while it is an ID reference (@types/react: "Identifies the element that provides an error message for the object"); the form docs say "with error text" and the react docs say "linking to error text". Decide: should the binding reference the id of an element that renders the message instead of embedding the text?
      expect(env.binding.props["aria-errormessage"]).toBe("invalid1");
    });

    it("is invalid when a reported error has an empty message", () => {
      const env = setupEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "");
      });
      env.field.reportError();
      expect(env.field.isErrorReported).toBe(true);
      expect(env.binding.firstErrorMessage).toBe("");

      expect(env.binding.props["aria-invalid"]).toBe(true);
      // PINNED(quirk): aria-errormessage becomes an empty string (not undefined) for an empty message, so the attribute is rendered without a value. Decide: should an empty message be normalized to undefined like the absence of errors?
      expect(env.binding.props["aria-errormessage"]).toBe("");
    });

    it("lets an empty message of an earlier field hide the error of a later field", () => {
      const env = setupMultiEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", new Error()); // An Error without a message yields an empty message
        builder.invalidate("field2", "field2 is invalid");
      });
      env.form.reportError();
      expect(env.field1.isErrorReported).toBe(true);
      expect(env.field2.isErrorReported).toBe(true);
      expect(env.binding.firstErrorMessage).toBe("");

      expect(env.binding.props["aria-invalid"]).toBe(true);
    });
  });

  describe("firstErrorMessage", () => {
    it("returns null if no errors", () => {
      const env = setupEnv();
      expect(env.binding.firstErrorMessage).toBeNull();
      env.field.reportError();
      expect(env.binding.firstErrorMessage).toBeNull();
    });

    it("returns the error messages if errors are reported", () => {
      const env = setupEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "invalid1");
        builder.invalidate("field1", "invalid2");
      });
      expect(env.binding.firstErrorMessage).toBeNull();
      env.field.reportError();
      expect(env.binding.firstErrorMessage).toEqual("invalid1");
    });

    it("returns null when bound to no fields", () => {
      const binding = new LabelBinding([], {});
      expect(binding.firstErrorMessage).toBeNull();
      expect(binding.props).toStrictEqual({
        htmlFor: undefined,
        "aria-invalid": false,
        "aria-errormessage": undefined,
      });
    });

    it("skips fields whose errors are not reported", () => {
      const env = setupMultiEnv();
      env.invalidate("field1", "field1 is invalid");
      env.invalidate("field2", "field2 is invalid");
      env.field2.reportError();

      expect(env.field1.isErrorReported).toBeUndefined();
      expect(env.binding.firstErrorMessage).toBe("field2 is invalid");
      expect(env.binding.props["aria-errormessage"]).toBe("field2 is invalid");
    });

    it("skips reported fields without errors", () => {
      const env = setupMultiEnv();
      env.invalidate("field2", "field2 is invalid");
      env.field1.reportError();
      env.field2.reportError();

      expect(env.field1.isErrorReported).toBe(false);
      expect(env.binding.firstErrorMessage).toBe("field2 is invalid");
    });

    it("prefers the first field in the given order", () => {
      const env = setupMultiEnv();
      env.invalidate("field1", "field1 is invalid");
      env.invalidate("field2", "field2 is invalid");
      env.field1.reportError();
      env.field2.reportError();

      expect(env.binding.firstErrorMessage).toBe("field1 is invalid");
      expect(new LabelBinding([env.field2, env.field1], {}).firstErrorMessage).toBe("field2 is invalid");
    });

    it("returns null again when the errors are removed", () => {
      const env = setupMultiEnv();
      const removeErrors = env.invalidate("field1", "field1 is invalid");
      env.field1.reportError();
      expect(env.binding.firstErrorMessage).toBe("field1 is invalid");

      removeErrors();
      expect(env.binding.firstErrorMessage).toBeNull();
      expect(env.binding.props["aria-invalid"]).toBe(false);
      expect(env.binding.props["aria-errormessage"]).toBeUndefined();
    });

    it("returns null again when the field is reset", () => {
      const env = setupMultiEnv();
      env.invalidate("field1", "field1 is invalid");
      env.field1.reportError();
      expect(env.binding.firstErrorMessage).toBe("field1 is invalid");

      env.field1.reset();
      expect(env.binding.firstErrorMessage).toBeNull();
    });

    it("waits for the validation to finish before showing errors reported during validation", () => {
      vi.useFakeTimers();
      try {
        const env = setupMultiEnv();
        env.form.validator.addSyncHandler((builder) => {
          if (env.model.field1 !== "valid") {
            builder.invalidate("field1", "field1 is invalid");
          }
        });
        vi.runAllTimers();
        expect(env.form.validator.isValidating).toBe(false);

        runInAction(() => {
          env.model.field1 = "still invalid";
        });
        expect(env.form.validator.isValidating).toBe(true);
        env.field1.reportError();
        expect(env.binding.firstErrorMessage).toBeNull();

        vi.runAllTimers();
        expect(env.form.validator.isValidating).toBe(false);
        expect(env.binding.firstErrorMessage).toBe("field1 is invalid");
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps showing the previous message while the validator is revalidating", () => {
      vi.useFakeTimers();
      try {
        const env = setupMultiEnv();
        env.form.validator.addSyncHandler((builder) => {
          if (env.model.field1 !== "valid") {
            builder.invalidate("field1", "field1 is invalid");
          }
        });
        vi.runAllTimers();
        env.field1.reportError();
        expect(env.binding.firstErrorMessage).toBe("field1 is invalid");

        runInAction(() => {
          env.model.field1 = "valid";
        });
        expect(env.form.validator.isValidating).toBe(true);
        expect(env.binding.firstErrorMessage).toBe("field1 is invalid");

        vi.runAllTimers();
        expect(env.form.validator.isValidating).toBe(false);
        expect(env.binding.firstErrorMessage).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("notifies observers only when the first message changes", () => {
      const env = setupMultiEnv();
      env.field1.reportError();
      env.field2.reportError();

      const values: (string | null)[] = [];
      const dispose = reaction(
        () => env.binding.firstErrorMessage,
        (message) => values.push(message)
      );

      const removeField1Errors = env.invalidate("field1", "field1 is invalid");
      expect(values).toEqual(["field1 is invalid"]);

      // A change to a later field is hidden behind the first message
      const removeField2Errors = env.invalidate("field2", "field2 is invalid");
      expect(values).toEqual(["field1 is invalid"]);

      removeField1Errors();
      expect(values).toEqual(["field1 is invalid", "field2 is invalid"]);

      removeField2Errors();
      expect(values).toEqual(["field1 is invalid", "field2 is invalid", null]);

      dispose();
    });

    it("does not re-run observers when the errors change but the first message stays the same", () => {
      const env = setupMultiEnv();
      env.invalidate("field1", "field1 is invalid");
      env.field1.reportError();

      let runs = 0;
      const dispose = autorun(() => {
        void env.binding.firstErrorMessage;
        runs++;
      });
      expect(runs).toBe(1);

      // field1.errors changes, while the first message doesn't
      const removeSecondError = env.invalidate("field1", "field1 is still invalid");
      expect([...env.field1.errors]).toEqual(["field1 is invalid", "field1 is still invalid"]);
      removeSecondError();
      expect([...env.field1.errors]).toEqual(["field1 is invalid"]);
      expect(runs).toBe(1);

      dispose();
    });
  });
});

describe("bindLabel", () => {
  const setupEnv = () => {
    const model = new SampleModel();

    render(<SampleComponent model={model} />);
    const label = screen.getByLabelText("label") as HTMLLabelElement;
    const field1 = screen.getByLabelText("field1") as HTMLInputElement;
    const field2 = screen.getByLabelText("field2") as HTMLInputElement;

    return {
      model,
      form: Form.get(model),
      label,
      field1,
      field2,
      clickLabel: () => userEvent.click(label),
    };
  };

  test("focuses the first field when clicked", async () => {
    const env = setupEnv();
    expect(env.field1).not.toHaveFocus();
    await env.clickLabel();
    expect(env.field1).toHaveFocus();
  });

  test("associates the label with the first input via the for attribute", () => {
    const env = setupEnv();
    expect(env.field1.id).toBe(env.form.getField("field1").id);
    expect(env.label).toHaveAttribute("for", env.field1.id);
    expect(env.label.control).toBe(env.field1);
  });

  test("reflects the first reported error in the aria attributes", () => {
    const env = setupEnv();
    expect(env.label).toHaveAttribute("aria-invalid", "false");
    expect(env.label).not.toHaveAttribute("aria-errormessage");

    act(() => {
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field2", "field2 is invalid");
      });
    });
    expect(env.label).toHaveAttribute("aria-invalid", "false");
    expect(env.label).not.toHaveAttribute("aria-errormessage");

    act(() => {
      env.form.reportError();
    });
    expect(env.label).toHaveAttribute("aria-invalid", "true");
    expect(env.label).toHaveAttribute("aria-errormessage", "field2 is invalid");
  });

  test("uses the custom htmlFor", async () => {
    const model = new SampleModel();
    const Component = observer(() => {
      const form = Form.get(model);
      return (
        <>
          <label aria-label="label" {...form.bindLabel(["field1"], { htmlFor: "custom-id" })}>
            Label
          </label>
          <input
            aria-label="field1"
            {...form.bindInput("field1", {
              id: "custom-id",
              getter: () => model.field1,
              setter: (v) => (model.field1 = v),
            })}
          />
        </>
      );
    });
    render(<Component />);
    const label = screen.getByLabelText("label") as HTMLLabelElement;
    const input = screen.getByLabelText("field1") as HTMLInputElement;

    expect(label).toHaveAttribute("for", "custom-id");
    await userEvent.click(label);
    expect(input).toHaveFocus();
  });

  test("updates the aria attributes through the lifecycle of the errors", () => {
    const env = setupEnv();
    let removeErrors: () => void = () => void 0;
    act(() => {
      removeErrors = env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "field1 is invalid");
      });
      env.form.reportError();
    });
    expect(env.label).toHaveAttribute("aria-invalid", "true");
    expect(env.label).toHaveAttribute("aria-errormessage", "field1 is invalid");

    // Resetting the form clears the reported state, but not the errors
    act(() => {
      env.form.reset();
    });
    expect(env.form.isValid).toBe(false);
    expect(env.label).toHaveAttribute("aria-invalid", "false");
    expect(env.label).not.toHaveAttribute("aria-errormessage");

    // Reporting only a field without errors keeps the label valid
    act(() => {
      env.form.getField("field2").reportError();
    });
    expect(env.label).toHaveAttribute("aria-invalid", "false");

    act(() => {
      env.form.reportError();
    });
    expect(env.label).toHaveAttribute("aria-invalid", "true");
    expect(env.label).toHaveAttribute("aria-errormessage", "field1 is invalid");

    act(() => {
      removeErrors();
    });
    expect(env.label).toHaveAttribute("aria-invalid", "false");
    expect(env.label).not.toHaveAttribute("aria-errormessage");
    expect(env.label).toHaveAttribute("for", env.field1.id);
  });

  test("binds an augmented field name to its own field, separate from the base field", () => {
    const form = Form.get(new SampleModel());
    const baseField = form.getField("field1");
    const augmentedField = form.getField("field1:suffix");
    expect(augmentedField).not.toBe(baseField);
    expect(form.bindLabel(["field1:suffix"]).htmlFor).toBe(augmentedField.id);
    expect(form.bindLabel(["field1:suffix"]).htmlFor).not.toBe(baseField.id);

    form.validator.updateErrors(Symbol(), (builder) => {
      builder.invalidate("field1", "field1 is invalid");
    });
    form.reportError();
    expect(baseField.isErrorReported).toBe(true);
    expect(form.bindLabel(["field1"])["aria-invalid"]).toBe(true);

    // PINNED(quirk): a label bound to an augmented name ("field1:suffix") looks up errors under the key path "field1:suffix", so it never shows the errors of the base field "field1" (augmentedField.isErrorReported is false). Decide: should augmented field names share the errors of their base field?
    expect(augmentedField.isErrorReported).toBe(false);
    expect(form.bindLabel(["field1:suffix"])["aria-invalid"]).toBe(false);
  });

  describe("binding cache", () => {
    test("uses the same field (and id) as the other bindings of the field", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const labelProps = form.bindLabel(["field1"]);
      const inputProps = form.bindInput("field1", {
        getter: () => model.field1,
        setter: (v) => (model.field1 = v),
      });
      expect(labelProps.htmlFor).toBe(form.getField("field1").id);
      expect(labelProps.htmlFor).toBe(inputProps.id);
    });

    test("replaces the config on every call", () => {
      const form = Form.get(new SampleModel());
      expect(form.bindLabel(["field1"], { htmlFor: "custom-id" }).htmlFor).toBe("custom-id");
      expect(form.bindLabel(["field1"]).htmlFor).toBe(form.getField("field1").id);
    });

    test("distinguishes bindings by the order of the field names", () => {
      const form = Form.get(new SampleModel());
      expect(form.bindLabel(["field1", "field2"]).htmlFor).toBe(form.getField("field1").stableId);
      expect(form.bindLabel(["field2", "field1"]).htmlFor).toBe(form.getField("field2").stableId);
    });
  });

  test("types", () => {
    const form = Form.get(new SampleModel());

    expectTypeOf(form.bindLabel).parameter(0).toEqualTypeOf<FormField.Name<SampleModel>[]>();
    expectTypeOf(form.bindLabel).toBeCallableWith(["field1"]);
    expectTypeOf(form.bindLabel).toBeCallableWith(["field1", "field2:suffix"], { htmlFor: "id", cacheKey: "key" });
    expectTypeOf(form.bindLabel(["field1"])).toEqualTypeOf<{
      htmlFor: string | undefined;
      "aria-invalid": boolean;
      "aria-errormessage": string | undefined;
    }>();
    expectTypeOf<LabelBinding.Config>().toEqualTypeOf<{ htmlFor?: string | undefined }>();
    expectTypeOf<LabelBinding["firstFieldStableId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<LabelBinding["firstErrorMessage"]>().toEqualTypeOf<string | null>();
    expectTypeOf<LabelBinding["props"]>().toEqualTypeOf<ReturnType<typeof form.bindLabel>>();
    expectTypeOf(LabelBinding).constructorParameters.toEqualTypeOf<[FormField[], LabelBinding.Config]>();

    // @ts-expect-error Unknown field name
    form.bindLabel(["unknown"]);
    // @ts-expect-error Unknown config key
    form.bindLabel(["field1"], { id: "id" });
    // Use fresh forms below: a plain field name shares the cache key with the single-element array,
    // so an existing binding for ["field1"] would be returned instead of crashing.
    const freshForm = () => Form.get(new SampleModel());
    // @ts-expect-error Field names must be an array (a plain string is bound to a single field and crashes)
    expect(() => freshForm().bindLabel("field1")).toThrow(TypeError);
    // @ts-expect-error The config is required when binding without the extension (it crashes without one)
    expect(() => freshForm().bind(["field1"], LabelBinding)).toThrow(TypeError);
  });
});
