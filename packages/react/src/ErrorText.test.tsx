import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, render } from "@testing-library/react";
import { makeObservable, observable } from "mobx";
import { Form, type FormField } from "@mobx-sentinel/form";
import { ErrorText } from "./ErrorText";

class SampleModel {
  @observable city = "";
  @observable region = "";

  constructor() {
    makeObservable(this);
  }
}

function setUp() {
  const model = new SampleModel();
  const form = Form.get(model);
  const errorsKey = Symbol();

  /** Replace the errors of the model */
  const setErrors = (errors: Partial<Record<keyof SampleModel, string[]>>) =>
    act(() => {
      form.validator.updateErrors(errorsKey, (builder) => {
        for (const [field, messages] of Object.entries(errors)) {
          for (const message of messages) builder.invalidate(field as keyof SampleModel, message);
        }
      });
    });

  /** Report the errors of fields */
  const report = (...fields: (keyof SampleModel)[]) =>
    act(() => {
      for (const field of fields) form.getField(field).reportError();
    });

  return { form, setErrors, report };
}

/** Messages rendered by an ErrorText, in order */
const messagesIn = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-error-text] > span"), (element) => element.textContent);

describe("ErrorText", () => {
  it("renders nothing until the field reports its errors", () => {
    const { form, setErrors, report } = setUp();
    setErrors({ city: ["City is required"] });
    const { container } = render(<ErrorText form={form} fields={["city"]} />);
    expect(container).toBeEmptyDOMElement();

    report("city");
    expect(messagesIn(container)).toEqual(["City is required"]);
  });

  it("renders a span marked with data-error-text, holding a span for each message", () => {
    const { form, setErrors, report } = setUp();
    setErrors({ city: ["City is required", "Use letters only"] });
    report("city");
    const { container } = render(<ErrorText form={form} fields={["city"]} />);

    const outer = container.firstElementChild;
    expect(outer?.tagName).toBe("SPAN");
    expect(outer).toHaveAttribute("data-error-text", "");
    expect(Array.from(outer?.children ?? [], (child) => child.tagName)).toEqual(["SPAN", "SPAN"]);
    expect(messagesIn(container)).toEqual(["City is required", "Use letters only"]);
  });

  it("renders the errors of several fields, each once the field reports them", () => {
    const { form, setErrors, report } = setUp();
    setErrors({ city: ["City is required"], region: ["Region is required"] });
    const { container } = render(<ErrorText form={form} fields={["city", "region"]} />);

    report("region");
    expect(messagesIn(container)).toEqual(["Region is required"]);
    report("city");
    expect(messagesIn(container)).toEqual(["City is required", "Region is required"]);
  });

  it("renders a message shared by several fields once", () => {
    const { form, setErrors, report } = setUp();
    setErrors({ city: ["Required"], region: ["Required"] });
    report("city", "region");
    const { container } = render(<ErrorText form={form} fields={["city", "region"]} />);
    expect(messagesIn(container)).toEqual(["Required"]);
  });

  it("follows the errors of a reported field, and renders nothing once they are gone", () => {
    const { form, setErrors, report } = setUp();
    setErrors({ city: ["City is required"] });
    report("city");
    // Not an observer: ErrorText re-renders by itself
    const Parent = () => <ErrorText form={form} fields={["city"]} />;
    const { container } = render(<Parent />);
    expect(messagesIn(container)).toEqual(["City is required"]);

    setErrors({ city: ["Use letters only"] });
    expect(messagesIn(container)).toEqual(["Use letters only"]);

    setErrors({});
    expect(container).toBeEmptyDOMElement();
  });

  it("passes other props to the outer span", () => {
    const { form, setErrors, report } = setUp();
    setErrors({ city: ["City is required"] });
    report("city");
    const { container } = render(
      <ErrorText form={form} fields={["city"]} id="city-error" className="error" aria-live="polite" />
    );

    const outer = container.firstElementChild;
    expect(outer).toHaveAttribute("id", "city-error");
    expect(outer).toHaveClass("error");
    expect(outer).toHaveAttribute("aria-live", "polite");
    expect(outer).toHaveAttribute("data-error-text", "");
  });

  test("props are typed after the form", () => {
    const { form } = setUp();
    expectTypeOf<React.ComponentProps<typeof ErrorText<SampleModel>>["fields"]>().toEqualTypeOf<
      readonly FormField.Name<SampleModel>[]
    >();

    const assertInvalidProps = () => (
      <>
        {/* @ts-expect-error Unknown field */}
        <ErrorText form={form} fields={["unknown"]} />
        {/* @ts-expect-error The messages are the children */}
        <ErrorText form={form} fields={["city"]}>
          Message
        </ErrorText>
      </>
    );
    void assertInvalidProps;
  });
});
