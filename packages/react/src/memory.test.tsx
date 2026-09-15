import React, { StrictMode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { Form } from "@mobx-sentinel/form";
import "./extension";
import { useFormAutoReset, useFormHandler } from "./hooks";

/**
 * Whether the object behind the reference gets garbage collected
 *
 * Create the object in a function of its own that returns only the reference: a local variable of the test, or of a
 * scope shared with a closure that is still alive, would keep it alive. `new WeakRef()` and `WeakRef#deref()` hold
 * their target until the current job ends, so each attempt waits for a new task before collecting.
 *
 * Unmount with `cleanup()` rather than `unmount()`: React Testing Library keeps the element last passed to `render()`,
 * and so its props, until `cleanup()`.
 *
 * @returns `false` if the object is still reachable after a few attempts
 */
async function isCollected(ref: WeakRef<object>) {
  const { gc } = globalThis;
  if (!gc) throw new Error("gc() is not exposed: run Vitest with `execArgv: ['--expose-gc']`");
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
    if (!ref.deref()) return true;
  }
  return false;
}

class SampleModel {
  @observable text = "";

  constructor() {
    makeObservable(this);
  }
}

/** A component whose submit handler captures `payload` */
const HandlerComponent: React.FC<{ form: Form<SampleModel>; payload: object }> = ({ form, payload }) => {
  useFormHandler(form, "submit", async () => {
    void payload;
    return true;
  });
  return null;
};

/** A component whose input binding captures `payload` in its change handler */
const InputComponent: React.FC<{ model: SampleModel; payload?: object }> = observer(({ model, payload }) => {
  const form = Form.get(model);
  return (
    <input
      {...form.bindInput("text", {
        getter: () => model.text,
        setter: (v) => {
          model.text = v;
        },
        onChange: () => void payload,
      })}
    />
  );
});

const AutoResetInputComponent: React.FC<{ model: SampleModel }> = ({ model }) => {
  useFormAutoReset(Form.get(model));
  return <InputComponent model={model} />;
};

describe("useFormHandler", () => {
  it("releases the handler once the component unmounts", async () => {
    const form = Form.get(new SampleModel());
    const mount = (wrap: (element: React.ReactElement) => React.ReactElement) => {
      const payload = {};
      render(wrap(<HandlerComponent form={form} payload={payload} />));
      return new WeakRef(payload);
    };

    const plain = mount((element) => element);
    expect(await isCollected(plain)).toBe(false);
    cleanup();
    expect(await isCollected(plain)).toBe(true);

    // StrictMode runs the effect twice, which adds the handler, removes it and adds it again
    const strict = mount((element) => <StrictMode>{element}</StrictMode>);
    cleanup();
    expect(await isCollected(strict)).toBe(true);
    expect(form.isSubmitting).toBe(false);
  });

  it("keeps only the handler of the latest render", async () => {
    const form = Form.get(new SampleModel());
    const { rerender } = render(<HandlerComponent form={form} payload={{}} />);
    const renderWithPayload = () => {
      const payload = {};
      rerender(<HandlerComponent form={form} payload={payload} />);
      return new WeakRef(payload);
    };
    const first = renderWithPayload();
    // React holds the props of a render until the render after next, so render twice more
    renderWithPayload();
    const latest = renderWithPayload();
    expect(await isCollected(first)).toBe(true);
    expect(await isCollected(latest)).toBe(false);
  });
});

describe("useFormAutoReset", () => {
  it("lets the model go right after the component unmounts, by cancelling a pending auto-finalization", async () => {
    const typeAndUnmount = (Component: React.FC<{ model: SampleModel }>) => {
      const model = new SampleModel();
      render(<Component model={model} />);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "a" } }); // Schedules the auto-finalization
      expect(model.text).toBe("a");
      cleanup();
      return new WeakRef(model);
    };
    const withAutoReset = typeAndUnmount(AutoResetInputComponent);
    const withoutAutoReset = typeAndUnmount(InputComponent);
    expect(await isCollected(withAutoReset)).toBe(true);
    // The timer references the field, and so the form and the model, until it fires
    expect(await isCollected(withoutAutoReset)).toBe(false);
    Form.get(withoutAutoReset.deref()!).reset(); // Cancel the timer, so that it does not outlive the test
  });
});

describe("Bindings", () => {
  it("let the model and the form go once the component unmounts", async () => {
    const refs = (() => {
      const model = new SampleModel();
      render(<InputComponent model={model} payload={{}} />);
      return { model: new WeakRef(model), form: new WeakRef(Form.get(model)) };
    })();
    cleanup();
    expect(await isCollected(refs.model)).toBe(true);
    expect(await isCollected(refs.form)).toBe(true);
  });

  it("keep the config of an unmounted component for as long as the form lives", async () => {
    const model = new SampleModel();
    const captured = (() => {
      const payload = {};
      render(<InputComponent model={model} payload={payload} />);
      return new WeakRef(payload);
    })();
    cleanup();
    // PINNED(quirk): Form#bind caches the binding in the form and replaces its config on every call, so once the component unmounts, the form still holds the config of its last render, and everything its callbacks capture (props, state setters and so on), for as long as the form lives, e.g. while the model is kept in a store. Decide: should a binding let go of its config when the component unmounts?
    expect(await isCollected(captured)).toBe(false);
    expect(model.text).toBe("");
  });
});
