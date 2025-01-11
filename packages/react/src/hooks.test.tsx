import React, { useState } from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, observable } from "mobx";
import { Form } from "@form-model/core";
import "./extension";
import { observer } from "mobx-react-lite";
import { useForm } from "./hooks";

class SampleModel {
  @observable field = "hello";

  constructor() {
    makeObservable(this);
  }
}

const ParentComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <button onClick={() => setMounted(true)}>Mount</button>
      <button onClick={() => setMounted(false)}>Unmount</button>
      {mounted && <SampleComponent model={model} />}
    </>
  );
});

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = useForm(model);
  return <p>{form.id}</p>;
});

describe("useForm", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);

    render(<ParentComponent model={model} />);
    const mountButton = screen.getByText("Mount") as HTMLButtonElement;
    const unmountButton = screen.getByText("Unmount") as HTMLButtonElement;

    return {
      model,
      form,
      mount: () => userEvent.click(mountButton),
      unmount: () => userEvent.click(unmountButton),
    };
  };

  test("auto resets the form when mounted/unmounted", async () => {
    const env = setupEnv();
    const spy = vi.spyOn(env.form, "reset");

    expect(spy).toHaveBeenCalledTimes(0);
    await env.mount();
    expect(spy).toHaveBeenCalledTimes(1);

    await env.unmount();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
