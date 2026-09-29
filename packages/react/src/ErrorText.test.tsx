import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { autorun, makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { Form, type FormField } from "@mobx-sentinel/form";
import "./extension";
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

  return { model, form, setErrors, report };
}

/** Messages rendered by an ErrorText, in order */
const messagesIn = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-error-text] > span > span"), (element) => element.textContent);

/** Inputs for the city and the region, and an ErrorText for both when `showErrorText` is set */
const Fields: React.FC<{
  env: ReturnType<typeof setUp>;
  showErrorText?: boolean;
  cityDescribedBy?: string;
}> = observer(({ env: { model, form }, showErrorText = true, cityDescribedBy }) => (
  <>
    <input
      aria-label="City"
      {...form.bindInput("city", {
        getter: () => model.city,
        setter: (v) => (model.city = v),
        "aria-describedby": cityDescribedBy,
      })}
    />
    <input
      aria-label="Region"
      {...form.bindInput("region", {
        getter: () => model.region,
        setter: (v) => (model.region = v),
      })}
    />
    {showErrorText && <ErrorText form={form} fields={["city", "region"]} />}
  </>
));

describe("ErrorText", () => {
  it("renders nothing until the field reports its errors", () => {
    const { form, setErrors, report } = setUp();
    setErrors({ city: ["City is required"] });
    const { container } = render(<ErrorText form={form} fields={["city"]} />);
    expect(container).toBeEmptyDOMElement();

    report("city");
    expect(messagesIn(container)).toEqual(["City is required"]);
  });

  it("renders a span marked with data-error-text, holding a span with an id for each field with errors, which holds a span for each message", () => {
    const { form, setErrors, report } = setUp();
    setErrors({ city: ["City is required", "Use letters only"], region: ["Region is required"] });
    report("city", "region");
    const { container } = render(<ErrorText form={form} fields={["city", "region"]} />);

    const outer = container.firstElementChild;
    expect(outer?.tagName).toBe("SPAN");
    expect(outer).toHaveAttribute("data-error-text", "");
    const groups = Array.from(outer?.children ?? []);
    expect(groups.map((group) => group.tagName)).toEqual(["SPAN", "SPAN"]);
    expect(groups.map((group) => Array.from(group.children, (message) => message.textContent))).toEqual([
      ["City is required", "Use letters only"],
      ["Region is required"],
    ]);
    expect(new Set(groups.map((group) => group.id)).size).toBe(2);
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

  it("renders a message that several fields share once for each of them", () => {
    const { form, setErrors, report } = setUp();
    setErrors({ city: ["Required"], region: ["Required"] });
    report("city", "region");
    const { container } = render(<ErrorText form={form} fields={["city", "region"]} />);
    expect(messagesIn(container)).toEqual(["Required", "Required"]);
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

  it("registers the span of each field while it is mounted", () => {
    const { form, setErrors, report } = setUp();
    const { container, unmount } = render(<ErrorText form={form} fields={["city", "region"]} />);
    const cityId = form.getField("city").errorTextId;
    expect(cityId).toEqual(expect.any(String));
    expect(form.getField("region").errorTextId).toEqual(expect.any(String));
    expect(form.getField("region").errorTextId).not.toBe(cityId);

    setErrors({ city: ["City is required"] });
    report("city");
    expect(container.querySelector("[data-error-text] > span")).toHaveAttribute("id", cityId);

    unmount();
    expect(form.getField("city").errorTextId).toBeUndefined();
    expect(form.getField("region").errorTextId).toBeUndefined();
  });

  it("keeps its registrations when rendered again with an equal array of fields", () => {
    const { form } = setUp();
    const Parent = () => <ErrorText form={form} fields={["city"]} />;
    const { rerender } = render(<Parent />);
    const seen: (string | undefined)[] = [];
    const dispose = autorun(() => {
      seen.push(form.getField("city").errorTextId);
    });

    rerender(<Parent />);
    rerender(<Parent />);
    expect(seen).toHaveLength(1);
    dispose();
  });

  it("points each bound control at the span of its own field while the field's errors are reported", () => {
    const env = setUp();
    render(<Fields env={env} />);
    const city = screen.getByLabelText("City");
    const region = screen.getByLabelText("Region");

    env.setErrors({ city: ["City is required"], region: ["Region is required"] });
    expect(city).not.toHaveAttribute("aria-describedby");
    expect(region).not.toHaveAttribute("aria-describedby");

    env.report("city");
    expect(city).toHaveAccessibleDescription("City is required");
    expect(region).not.toHaveAttribute("aria-describedby");

    env.report("region");
    expect(region).toHaveAccessibleDescription("Region is required");

    env.setErrors({ region: ["Region is required"] });
    expect(city).not.toHaveAttribute("aria-describedby");
  });

  it("points a control at an ErrorText that appears after its errors are reported, and lets go once it is gone", () => {
    const env = setUp();
    const { rerender } = render(<Fields env={env} showErrorText={false} />);
    const city = screen.getByLabelText("City");
    env.setErrors({ city: ["City is required"] });
    env.report("city");
    expect(city).not.toHaveAttribute("aria-describedby");

    rerender(<Fields env={env} showErrorText />);
    expect(city).toHaveAccessibleDescription("City is required");

    rerender(<Fields env={env} showErrorText={false} />);
    expect(city).not.toHaveAttribute("aria-describedby");
  });

  it("keeps the ids given to the binding, and adds the error text after them", () => {
    const env = setUp();
    render(
      <>
        <p id="city-hint">Letters only.</p>
        <Fields env={env} cityDescribedBy="city-hint" />
      </>
    );
    const city = screen.getByLabelText("City");
    expect(city).toHaveAccessibleDescription("Letters only.");

    env.setErrors({ city: ["City is required"] });
    env.report("city");
    expect(city).toHaveAccessibleDescription("Letters only. City is required");
  });

  it("points a control at one error text when several show its field", () => {
    const env = setUp();
    render(
      <>
        <Fields env={env} />
        <ErrorText form={env.form} fields={["city"]} />
      </>
    );
    const city = screen.getByLabelText("City");
    env.setErrors({ city: ["City is required"] });
    env.report("city");
    expect(screen.getAllByText("City is required")).toHaveLength(2);
    expect(city.getAttribute("aria-describedby")?.split(" ")).toHaveLength(1);
    expect(city).toHaveAccessibleDescription("City is required");
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
