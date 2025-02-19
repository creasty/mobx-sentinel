import React, { useState } from "react";
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, observable } from "mobx";
import { Form } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { useFormAutoReset, useFormHandler } from "./hooks";

class SampleModel {
  @observable field = "hello";

  constructor() {
    makeObservable(this);
  }
}

const ParentComponent: React.FC<{ model: SampleModel; submitHandler: () => void }> = observer(
  ({ model, submitHandler }) => {
    const [mounted, setMounted] = useState(false);
    return (
      <>
        <button onClick={() => setMounted(true)}>Mount</button>
        <button onClick={() => setMounted(false)}>Unmount</button>
        {mounted && <SampleComponent model={model} submitHandler={submitHandler} />}
      </>
    );
  }
);

const SampleComponent: React.FC<{ model: SampleModel; submitHandler: () => void }> = observer(
  ({ model, submitHandler }) => {
    const form = Form.get(model);

    useFormAutoReset(form);

    useFormHandler(form, "submit", async () => {
      submitHandler();
      return true;
    });

    return <p>{form.id}</p>;
  }
);

const setupEnv = () => {
  const model = new SampleModel();
  const form = Form.get(model);
  const spy = vi.fn();

  render(<ParentComponent model={model} submitHandler={spy} />);
  const mountButton = screen.getByText("Mount") as HTMLButtonElement;
  const unmountButton = screen.getByText("Unmount") as HTMLButtonElement;

  return {
    model,
    form,
    spy,
    mount: () => userEvent.click(mountButton),
    unmount: () => userEvent.click(unmountButton),
  };
};

describe("useFormAutoReset", () => {
  test("auto resets the form when mounted/unmounted", async () => {
    const env = setupEnv();
    const spy = vi.spyOn(env.form, "reset");

    expect(spy).toBeCalledTimes(0);
    await env.mount();
    expect(spy).toBeCalledTimes(1);

    await env.unmount();
    expect(spy).toBeCalledTimes(2);
  });
});

describe("useFormHandler", () => {
  test("adds a handler to the form", async () => {
    const env = setupEnv();

    await env.mount();
    expect(env.spy).toBeCalledTimes(0);
    await act(async () => {
      await env.form.submit({ force: true });
    });
    expect(env.spy).toBeCalledTimes(1);
  });

  test("removes the handler when unmounted", async () => {
    const env = setupEnv();

    await env.mount();
    await env.unmount();
    await act(async () => {
      await env.form.submit({ force: true });
    });
    expect(env.spy).toBeCalledTimes(0);
  });
});
