import React, { StrictMode } from "react";
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { renderToString } from "react-dom/server";
import { Form } from "@mobx-sentinel/form";
import { hasUnsavedForms, useFormNavigationGuard } from "./navigationGuard";

class SampleModel {
  @observable field = "hello";

  constructor() {
    makeObservable(this);
  }
}

/** Create a fresh form */
const newForm = () => Form.get(new SampleModel());

const Guard: React.FC<{ form: Form<any> }> = ({ form }) => {
  useFormNavigationGuard(form);
  return null;
};

/** Fire `beforeunload` as the browser does before the page unloads, and tell whether a listener asked to stay */
function unloadPrevented() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** Keep track of the `beforeunload` listeners on the window until the test finishes */
function trackUnloadListeners() {
  const listeners = new Set<unknown>();
  const { addEventListener, removeEventListener } = window;
  const add = vi.spyOn(window, "addEventListener").mockImplementation((...args) => {
    if (args[0] === "beforeunload") listeners.add(args[1]);
    Reflect.apply(addEventListener, window, args);
  });
  const remove = vi.spyOn(window, "removeEventListener").mockImplementation((...args) => {
    if (args[0] === "beforeunload") listeners.delete(args[1]);
    Reflect.apply(removeEventListener, window, args);
  });
  onTestFinished(() => {
    add.mockRestore();
    remove.mockRestore();
  });
  return listeners;
}

describe("hasUnsavedForms", () => {
  test("counts a dirty form while a component guarding it is mounted", () => {
    const form = newForm();

    const { unmount } = render(<Guard form={form} />);
    expect(hasUnsavedForms()).toBe(false);

    form.markAsDirty();
    expect(hasUnsavedForms()).toBe(true);

    form.reset();
    expect(hasUnsavedForms()).toBe(false);

    form.markAsDirty();
    unmount();
    expect(hasUnsavedForms()).toBe(false);
  });

  test("leaves out the dirty forms that no mounted component guards", () => {
    const unguarded = newForm();
    unguarded.markAsDirty();
    const guarded = newForm();

    render(<Guard form={guarded} />);
    expect(hasUnsavedForms()).toBe(false);

    guarded.markAsDirty();
    expect(hasUnsavedForms()).toBe(true);
  });

  test("keeps a form guarded until the last of the components guarding it unmounts", () => {
    const form = newForm();
    form.markAsDirty();

    const { rerender, unmount } = render(
      <>
        <Guard form={form} />
        <Guard form={form} />
      </>
    );
    expect(hasUnsavedForms()).toBe(true);

    rerender(
      <>
        <Guard form={form} />
      </>
    );
    expect(hasUnsavedForms()).toBe(true);

    unmount();
    expect(hasUnsavedForms()).toBe(false);
  });

  test("moves the guard to the new form when the form changes", () => {
    const formA = newForm();
    const formB = newForm();
    formA.markAsDirty();

    const { rerender } = render(<Guard form={formA} />);
    expect(hasUnsavedForms()).toBe(true);

    rerender(<Guard form={formB} />);
    expect(hasUnsavedForms()).toBe(false);

    formB.markAsDirty();
    expect(hasUnsavedForms()).toBe(true);
  });

  test("keeps the guard under StrictMode, which cleans up effects and runs them again", () => {
    const form = newForm();
    form.markAsDirty();

    const { unmount } = render(
      <StrictMode>
        <Guard form={form} />
      </StrictMode>
    );
    expect(hasUnsavedForms()).toBe(true);
    expect(unloadPrevented()).toBe(true);

    unmount();
    expect(hasUnsavedForms()).toBe(false);
    expect(unloadPrevented()).toBe(false);
  });

  test("re-renders an observer that reads it when the answer changes", () => {
    const form = newForm();
    const Status = observer(() => <p>{hasUnsavedForms() ? "Unsaved changes" : "All saved"}</p>);

    render(
      <>
        <Guard form={form} />
        <Status />
      </>
    );
    expect(screen.getByText("All saved")).toBeInTheDocument();

    act(() => form.markAsDirty());
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    act(() => form.reset());
    expect(screen.getByText("All saved")).toBeInTheDocument();
  });

  test("does nothing on the server, where effects don't run", () => {
    const form = newForm();
    form.markAsDirty();

    renderToString(<Guard form={form} />);
    expect(hasUnsavedForms()).toBe(false);
  });

  test("types", () => {
    expectTypeOf(hasUnsavedForms).toEqualTypeOf<() => boolean>();
  });
});

describe("useFormNavigationGuard", () => {
  test("asks the browser to confirm leaving the page while a guarded form is dirty", () => {
    const form = newForm();

    const { unmount } = render(<Guard form={form} />);
    expect(unloadPrevented()).toBe(false);

    form.markAsDirty();
    expect(unloadPrevented()).toBe(true);

    form.reset();
    expect(unloadPrevented()).toBe(false);

    form.markAsDirty();
    unmount();
    expect(unloadPrevented()).toBe(false);
  });

  test("listens for `beforeunload` only while a guarded form is dirty, with one listener for all of them", () => {
    const listeners = trackUnloadListeners();
    const formA = newForm();
    const formB = newForm();

    const { unmount } = render(<Guard form={formA} />);
    render(<Guard form={formB} />);
    expect(listeners.size).toBe(0);

    formA.markAsDirty();
    expect(listeners.size).toBe(1);
    formB.markAsDirty();
    expect(listeners.size).toBe(1);

    formA.reset();
    expect(listeners.size).toBe(1);
    formB.reset();
    expect(listeners.size).toBe(0);

    formA.markAsDirty();
    expect(listeners.size).toBe(1);
    unmount(); // Only formA's component; formB is still guarded, and clean
    expect(listeners.size).toBe(0);
  });

  test("lets the page go when a `didSubmit` handler navigates, although the listener is still there", async () => {
    const listeners = trackUnloadListeners();
    const form = newForm();
    render(<Guard form={form} />);

    let listening: boolean | undefined;
    let prevented: boolean | undefined;
    form.addHandler("submit", async () => true);
    form.addHandler("didSubmit", () => {
      // Navigating with `location.href = ...` fires `beforeunload` before the assignment returns
      listening = listeners.size > 0;
      prevented = unloadPrevented();
    });

    form.markAsDirty();
    await form.submit({ force: true });

    // didSubmit handlers run in one action after the form resets itself, so the listener comes off only after them
    expect(listening).toBe(true);
    expect(prevented).toBe(false);
    expect(listeners.size).toBe(0);
  });

  test("types", () => {
    expectTypeOf(useFormNavigationGuard).parameters.toEqualTypeOf<[form: Form<any>]>();
    expectTypeOf(useFormNavigationGuard).returns.toEqualTypeOf<void>();
  });
});
