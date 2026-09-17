import React, { StrictMode, Suspense, startTransition, useCallback, useEffect, useLayoutEffect, useState } from "react";
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, observable } from "mobx";
import { Form } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { useFormAutoReset, useFormHandler, useFormSSR } from "./hooks";

class SampleModel {
  @observable field = "hello";

  constructor() {
    makeObservable(this);
  }
}

const ParentComponent: React.FC<{ model: SampleModel; submitHandler: (counter: number) => void }> = observer(
  ({ model, submitHandler }) => {
    const [mounted, setMounted] = useState(false);
    const [counter, setCounter] = useState(0);

    const submitHandlerLocal = useCallback(() => {
      submitHandler(counter);
    }, [submitHandler, counter]);

    return (
      <>
        <p>{counter}</p>
        <button onClick={() => setCounter((v) => v + 1)}>Increment</button>
        <button onClick={() => setMounted(true)}>Mount</button>
        <button onClick={() => setMounted(false)}>Unmount</button>
        {mounted && <SampleComponent model={model} submitHandler={submitHandlerLocal} />}
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
  const incrementButton = screen.getByText("Increment") as HTMLButtonElement;

  return {
    model,
    form,
    spy,
    mount: () => userEvent.click(mountButton),
    unmount: () => userEvent.click(unmountButton),
    increment: () => userEvent.click(incrementButton),
  };
};

/** Create a fresh form */
const newForm = () => Form.get(new SampleModel());

/** Submit the form regardless of canSubmit, flushing React updates */
const submit = async (form: Form<any>) => {
  let result: boolean | undefined;
  await act(async () => {
    result = await form.submit({ force: true });
  });
  return result;
};

/** A promise that can be resolved from outside */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const AutoReset: React.FC<{ form: Form<any> }> = ({ form }) => {
  useFormAutoReset(form);
  return null;
};

type HandlerProps =
  | { form: Form<any>; event: "willSubmit"; handler: Form.Handlers["willSubmit"] }
  | { form: Form<any>; event: "submit"; handler: Form.Handlers["submit"] }
  | { form: Form<any>; event: "didSubmit"; handler: Form.Handlers["didSubmit"] };

const Handler: React.FC<HandlerProps> = ({ form, event, handler }) => {
  // The props are type-checked as a discriminated union; the cast only picks an overload
  useFormHandler(form, event as "submit", handler as Form.Handlers["submit"]);
  return null;
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

  test("does not reset again on re-render with the same form", () => {
    const form = newForm();
    const spy = vi.spyOn(form, "reset");

    const { rerender, unmount } = render(<AutoReset form={form} />);
    expect(spy).toBeCalledTimes(1);

    rerender(<AutoReset form={form} />);
    rerender(<AutoReset form={form} />);
    expect(spy).toBeCalledTimes(1);

    unmount();
    expect(spy).toBeCalledTimes(2);
  });

  test("clears the dirty state from before mount and from while mounted", () => {
    const form = newForm();

    form.markAsDirty();
    expect(form.isDirty).toBe(true);
    const { unmount } = render(<AutoReset form={form} />);
    expect(form.isDirty).toBe(false);

    form.markAsDirty();
    expect(form.isDirty).toBe(true);
    unmount();
    expect(form.isDirty).toBe(false);
  });

  test("resets after the first render has committed", () => {
    const form = newForm();
    form.markAsDirty();
    const renders: boolean[] = [];

    const Component = observer(() => {
      useFormAutoReset(form);
      renders.push(form.isDirty);
      return null;
    });
    render(<Component />);

    // PINNED(quirk): the mount reset runs in a passive effect, so the first render (and paint) still sees the pre-reset state and the component renders a second time once reset() notifies the observer. Decide: should the mount reset happen before the first render is observed (e.g. a reset during initialization)? Note that useLayoutEffect alone would only hide the stale state from paint; the first render would still see it.
    expect(renders).toEqual([true, false]);
  });

  test("resets the previous form before the next one when the form changes", () => {
    const formA = newForm();
    const formB = newForm();
    const calls: string[] = [];
    vi.spyOn(formA, "reset").mockImplementation(() => void calls.push("A"));
    vi.spyOn(formB, "reset").mockImplementation(() => void calls.push("B"));

    const { rerender, unmount } = render(<AutoReset form={formA} />);
    expect(calls).toEqual(["A"]);

    rerender(<AutoReset form={formB} />);
    expect(calls).toEqual(["A", "A", "B"]);

    unmount();
    expect(calls).toEqual(["A", "A", "B", "B"]);
  });

  test("resets three times on mount under StrictMode", () => {
    const form = newForm();
    const spy = vi.spyOn(form, "reset");

    const { unmount } = render(
      <StrictMode>
        <AutoReset form={form} />
      </StrictMode>
    );
    // StrictMode (development) runs mount -> cleanup -> mount
    expect(spy).toBeCalledTimes(3);

    unmount();
    expect(spy).toBeCalledTimes(4);
  });

  test("resets a form shared with a component that is still mounted", () => {
    const form = newForm();

    const { rerender } = render(
      <>
        <AutoReset form={form} />
        <AutoReset form={form} />
      </>
    );
    form.markAsDirty();
    expect(form.isDirty).toBe(true);

    rerender(
      <>
        <AutoReset form={form} />
      </>
    );
    // PINNED(quirk): each hook resets independently, so unmounting one of two consumers wipes the state the other one is still showing. Decide: should resets be reference-counted per form (reset only when the last consumer unmounts), or is sharing a form across auto-reset components unsupported?
    expect(form.isDirty).toBe(false);
  });

  test("resets after layout effects and after the mount effects of descendants", () => {
    const form = newForm();
    form.markAsDirty();
    const log: string[] = [];

    const Child = () => {
      useEffect(() => {
        const field = form.getField("field");
        field.markAsTouched();
        log.push(`child effect: dirty=${form.isDirty} touched=${field.isTouched}`);
      }, []);
      return null;
    };
    const Component = () => {
      useFormAutoReset(form);
      useLayoutEffect(() => void log.push(`layout effect: dirty=${form.isDirty}`), []);
      useEffect(() => void log.push(`effect: dirty=${form.isDirty} touched=${form.getField("field").isTouched}`), []);
      return <Child />;
    };
    render(<Component />);

    // Passive effects run children first, then the hooks of a component in call order.
    // The child did mark the field as touched; the parent's auto reset then cleared it.
    // PINNED(quirk): a descendant's mount effect runs before its ancestor's auto reset, so state it puts into the form on mount is wiped right away (the log shows touched=true, then touched=false). Decide: should the mount reset run before descendants' effects (e.g. during initialization), so children can seed form state on mount? Flipping changes the timing in the log as well as the final isTouched assertion.
    expect(log).toEqual([
      "layout effect: dirty=true",
      "child effect: dirty=true touched=true",
      "effect: dirty=false touched=false",
    ]);
    expect(form.getField("field").isTouched).toBe(false);
  });

  test("resets on every mount and unmount across remounts", () => {
    const form = newForm();
    const spy = vi.spyOn(form, "reset");

    const { rerender, unmount } = render(<AutoReset key="1" form={form} />);
    expect(spy).toBeCalledTimes(1);

    // A new key unmounts the old instance (cleanup) and mounts a new one
    rerender(<AutoReset key="2" form={form} />);
    expect(spy).toBeCalledTimes(3);

    rerender(<></>);
    expect(spy).toBeCalledTimes(4);
    unmount();
    expect(spy).toBeCalledTimes(4);
  });

  test("types", () => {
    expectTypeOf(useFormAutoReset).parameters.toEqualTypeOf<[form: Form<any>]>();
    expectTypeOf(useFormAutoReset).returns.toEqualTypeOf<void>();

    // Compile-time only: the closure is never invoked (hooks cannot be called outside a component)
    const typeOnly = () => {
      // @ts-expect-error Form has private members, so a structurally similar object is not accepted
      useFormAutoReset({ reset() {} });
    };
    expectTypeOf(typeOnly).toBeFunction();
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
    expect(env.spy).toBeCalledWith(0);
  });

  test("updates the handler when the counter is incremented", async () => {
    const env = setupEnv();

    await env.mount();
    expect(env.spy).toBeCalledTimes(0);
    await env.increment();
    await act(async () => {
      await env.form.submit({ force: true });
    });
    expect(env.spy).toBeCalledTimes(1);
    expect(env.spy).toBeCalledWith(1);
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

  test("registers once per form and event, keeping the latest handler without re-registering", async () => {
    const form = newForm();
    const addSpy = vi.spyOn(form, "addHandler");
    const handler1 = vi.fn(async () => true);
    const handler2 = vi.fn(async () => true);
    const handler3 = vi.fn(async () => true);

    const { rerender } = render(<Handler form={form} event="submit" handler={handler1} />);
    expect(addSpy).toBeCalledTimes(1);
    expect(addSpy).toBeCalledWith("submit", expect.any(Function));
    // The registered function is a wrapper, not the handler itself
    expect(addSpy.mock.calls[0][1]).not.toBe(handler1);

    rerender(<Handler form={form} event="submit" handler={handler2} />);
    rerender(<Handler form={form} event="submit" handler={handler3} />);
    expect(addSpy).toBeCalledTimes(1);

    await submit(form);
    expect(handler1).toBeCalledTimes(0);
    expect(handler2).toBeCalledTimes(0);
    expect(handler3).toBeCalledTimes(1);
  });

  test("forwards the arguments to the handler and its result to the submission", async () => {
    const form = newForm();
    const events: unknown[][] = [];
    let willSubmitResult = true;
    let submitResult = true;

    render(
      <>
        <Handler
          form={form}
          event="willSubmit"
          handler={async (...args) => {
            events.push(["willSubmit", ...args]);
            return willSubmitResult;
          }}
        />
        <Handler
          form={form}
          event="submit"
          handler={async (...args) => {
            events.push(["submit", ...args]);
            return submitResult;
          }}
        />
        <Handler form={form} event="didSubmit" handler={(...args) => void events.push(["didSubmit", ...args])} />
      </>
    );

    expect(await submit(form)).toBe(true);
    expect(events).toEqual([
      ["willSubmit", expect.any(AbortSignal)],
      ["submit", expect.any(AbortSignal)],
      ["didSubmit", true],
    ]);
    // Both phases receive the same signal of the submission
    expect(events[0][1]).toBe(events[1][1]);

    events.length = 0;
    submitResult = false;
    expect(await submit(form)).toBe(false);
    expect(events).toEqual([
      ["willSubmit", expect.any(AbortSignal)],
      ["submit", expect.any(AbortSignal)],
      ["didSubmit", false],
    ]);

    events.length = 0;
    willSubmitResult = false;
    expect(await submit(form)).toBe(false);
    expect(events).toEqual([
      ["willSubmit", expect.any(AbortSignal)],
      ["didSubmit", false],
    ]);
  });

  test("moves the registration to the new form when the form changes", async () => {
    const formA = newForm();
    const formB = newForm();
    const handler = vi.fn(async () => true);

    const { rerender, unmount } = render(<Handler form={formA} event="submit" handler={handler} />);
    rerender(<Handler form={formB} event="submit" handler={handler} />);

    await submit(formA);
    expect(handler).toBeCalledTimes(0);
    await submit(formB);
    expect(handler).toBeCalledTimes(1);

    unmount();
    await submit(formB);
    expect(handler).toBeCalledTimes(1);
  });

  test("moves the registration to the new event when the event changes", async () => {
    const form = newForm();
    const log: string[] = [];
    form.addHandler("willSubmit", async () => {
      log.push("raw:willSubmit");
      return true;
    });
    form.addHandler("submit", async () => {
      log.push("raw:submit");
      return true;
    });
    const handler = async () => {
      log.push("hook");
      return true;
    };

    const { rerender } = render(<Handler form={form} event="willSubmit" handler={handler} />);
    await submit(form);
    expect(log).toEqual(["raw:willSubmit", "hook", "raw:submit"]);

    log.length = 0;
    rerender(<Handler form={form} event="submit" handler={handler} />);
    await submit(form);
    expect(log).toEqual(["raw:willSubmit", "raw:submit", "hook"]);
  });

  test("keeps exactly one active registration under StrictMode", async () => {
    const form = newForm();
    const addSpy = vi.spyOn(form, "addHandler");
    const handler = vi.fn(async () => true);

    const { unmount } = render(
      <StrictMode>
        <Handler form={form} event="submit" handler={handler} />
      </StrictMode>
    );
    // StrictMode (development) runs mount -> cleanup -> mount
    expect(addSpy).toBeCalledTimes(2);

    await submit(form);
    expect(handler).toBeCalledTimes(1);

    unmount();
    await submit(form);
    expect(handler).toBeCalledTimes(1);
  });

  test("registers a separate wrapper per hook, so the same function passed twice runs twice", async () => {
    const form = newForm();
    const handler = vi.fn(async () => true);

    render(
      <>
        <Handler form={form} event="submit" handler={handler} />
        <Handler form={form} event="submit" handler={handler} />
      </>
    );
    await submit(form);
    expect(handler).toBeCalledTimes(2);

    // Contrast: Form#addHandler deduplicates the same function
    const raw = vi.fn(async () => true);
    form.addHandler("submit", raw);
    form.addHandler("submit", raw);
    await submit(form);
    expect(raw).toBeCalledTimes(1);
  });

  test("runs handlers in effect order: siblings in tree order, children before their parent", async () => {
    const form = newForm();
    const log: string[] = [];
    const makeHandler = (name: string) => async () => {
      log.push(name);
      return true;
    };

    const Parent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      useFormHandler(form, "submit", makeHandler("parent:1"));
      useFormHandler(form, "submit", makeHandler("parent:2"));
      return <>{children}</>;
    };
    render(
      <Parent>
        <Handler form={form} event="submit" handler={makeHandler("child:1")} />
        <Handler form={form} event="submit" handler={makeHandler("child:2")} />
      </Parent>
    );

    await submit(form);
    expect(log).toEqual(["child:1", "child:2", "parent:1", "parent:2"]);
  });

  test("skips the remaining phases of an unmounted component during an in-flight submission", async () => {
    const form = newForm();
    const gate = deferred<boolean>();
    const log: string[] = [];

    const Component = () => {
      useFormHandler(form, "submit", async () => {
        log.push("submit:start");
        const result = await gate.promise;
        log.push("submit:end");
        return result;
      });
      useFormHandler(form, "didSubmit", (succeed) => void log.push(`didSubmit:${succeed}`));
      return null;
    };
    const { unmount } = render(<Component />);

    let submitted: Promise<boolean> | undefined;
    act(() => {
      submitted = form.submit({ force: true });
    });
    await act(async () => {});
    expect(log).toEqual(["submit:start"]);
    expect(form.isSubmitting).toBe(true);

    unmount();
    gate.resolve(true);
    await act(async () => {
      expect(await submitted).toBe(true);
    });
    expect(log).toEqual(["submit:start", "submit:end"]);
    expect(form.isSubmitting).toBe(false);
  });

  test("uses the handler of a render that was discarded by a suspended transition", async () => {
    const form = newForm();
    const log: string[] = [];
    const gate = deferred<void>();
    let suspended = true;

    const Child: React.FC<{ label: string }> = ({ label }) => {
      useFormHandler(form, "submit", async () => {
        log.push(label);
        return true;
      });
      if (label === "next" && suspended) {
        throw gate.promise;
      }
      return <p>{label}</p>;
    };
    let setLabel!: (label: string) => void;
    const Parent = () => {
      const [label, set] = useState("committed");
      setLabel = set;
      return (
        <Suspense fallback={<p>fallback</p>}>
          <Child label={label} />
        </Suspense>
      );
    };
    render(<Parent />);

    // Control: before the transition, the committed handler runs
    await submit(form);
    expect(log).toEqual(["committed"]);
    log.length = 0;

    await act(async () => {
      startTransition(() => setLabel("next"));
    });
    // The transition keeps the committed UI on screen
    expect(screen.getByText("committed")).toBeInTheDocument();
    expect(screen.queryByText("next")).not.toBeInTheDocument();

    await submit(form);
    // PINNED(quirk): the handler ref is assigned during render, so a render React has not committed (here: suspended inside a transition) already replaces the handler that the committed UI registered. Decide: should the ref be updated after commit (e.g. in useLayoutEffect/useInsertionEffect), at the cost of the handler lagging one commit behind? (see the comment in hooks.ts)
    expect(log).toEqual(["next"]);

    suspended = false;
    await act(async () => {
      gate.resolve();
    });
    expect(await screen.findByText("next")).toBeInTheDocument();
  });

  test("registers after commit, so submissions from layout effects and descendants' mount effects miss the handler", async () => {
    const form = newForm();
    const log: string[] = [];
    const submissions: Promise<boolean>[] = [];

    const Child = () => {
      useEffect(() => {
        log.push("child effect: submit");
        submissions.push(form.submit({ force: true }));
      }, []);
      return null;
    };
    const Component = () => {
      useFormHandler(form, "submit", async () => {
        log.push("handler");
        return true;
      });
      useLayoutEffect(() => {
        log.push("layout effect: submit");
        submissions.push(form.submit({ force: true }));
      }, []);
      return <Child />;
    };
    render(<Component />);
    let results: boolean[] = [];
    await act(async () => {
      results = await Promise.all(submissions);
    });

    // Both submissions ran to completion and succeeded (no other handler vetoed them)
    expect(results).toEqual([true, true]);
    // PINNED(quirk): the handler is registered in a passive effect, so a submission started before passive effects flush for this component (from a layout effect, or from a descendant's mount effect, which runs first) completes without it. With no other handlers registered, Submission#exec has nothing to await, so it finishes synchronously before registration. Decide: should the handler be registered in useLayoutEffect/useInsertionEffect so it is active as soon as the component commits?
    expect(log).toEqual(["layout effect: submit", "child effect: submit"]);

    await submit(form);
    expect(log).toEqual(["layout effect: submit", "child effect: submit", "handler"]);
  });

  test("calls the handler with the internal ref as `this`", async () => {
    const form = newForm();
    const receivers: unknown[] = [];
    function handler(this: unknown) {
      receivers.push(this);
      return Promise.resolve(true);
    }

    render(<Handler form={form} event="submit" handler={handler} />);
    // Contrast: Form#addHandler calls the handler without a receiver
    form.addHandler("submit", handler);
    await submit(form);

    expect(receivers).toHaveLength(2);
    // PINNED(quirk): the wrapper invokes `handlerRef.current(...args)` as a method call, so a non-arrow handler sees the hook's internal `{ current: handler }` ref object as `this` instead of `undefined` (as with Form#addHandler, which the docs call this hook a wrapper for). Decide: should the wrapper call the handler without a receiver? The flip is `toEqual({ current: handler })` -> `toBeUndefined()`.
    expect(receivers[0]).toEqual({ current: handler });
    expect(receivers[1]).toBeUndefined();
  });

  test("passes an unknown event through to Form#addHandler, which throws while committing", () => {
    const form = newForm();
    const addSpy = vi.spyOn(form, "addHandler");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      // The types reject unknown events, and the hook is documented as a thin wrapper around
      // Form#addHandler, so it does no runtime validation of its own. The TypeError comes from
      // Submission#addHandler indexing its handler sets (a form-package concern).
      expect(() => render(<Handler form={form} event={"unknown" as "submit"} handler={async () => true} />)).toThrow(
        TypeError
      );
      expect(addSpy).toBeCalledWith("unknown", expect.any(Function));
    } finally {
      consoleError.mockRestore();
    }
  });

  test("types", () => {
    const form = newForm();

    expectTypeOf(useFormHandler<SampleModel>).returns.toEqualTypeOf<void>();

    // Compile-time only: the closure is never invoked (hooks cannot be called outside a component)
    const typeOnly = () => {
      useFormHandler(form, "willSubmit", async (abortSignal) => {
        expectTypeOf(abortSignal).toEqualTypeOf<AbortSignal>();
        return true;
      });
      useFormHandler(form, "submit", async (abortSignal) => {
        expectTypeOf(abortSignal).toEqualTypeOf<AbortSignal>();
        return true;
      });
      useFormHandler(form, "didSubmit", (succeed) => {
        expectTypeOf(succeed).toEqualTypeOf<boolean>();
      });
      // Handlers may ignore their arguments
      useFormHandler(form, "submit", async () => false);

      // @ts-expect-error unknown event
      useFormHandler(form, "unknown", async () => true);
      // @ts-expect-error submit handlers must return a Promise<boolean>
      useFormHandler(form, "submit", () => true);
      // @ts-expect-error willSubmit handlers must return a Promise<boolean>
      useFormHandler(form, "willSubmit", async () => "yes");
      // @ts-expect-error didSubmit handlers receive a boolean
      useFormHandler(form, "didSubmit", (succeed: string) => void succeed);
      const event = "submit" as string;
      // @ts-expect-error the event must be a literal handler name
      useFormHandler(form, event, async () => true);
      // @ts-expect-error the first argument must be a Form
      useFormHandler({}, "submit", async () => true);

      const events = "submit" as "willSubmit" | "submit";
      // PINNED(quirk): each event has its own overload, so a union of events is rejected even when every member takes the same handler type (the Handler test component above needs a cast for this). Decide: should there be a generic signature keyed by `keyof Form.Handlers`? The flip is deleting the @ts-expect-error below.
      // @ts-expect-error no overload accepts a union of events
      useFormHandler(form, events, async () => true);
    };
    expectTypeOf(typeOnly).toBeFunction();
  });
});

describe("useFormSSR", () => {
  class IdModel {
    @observable field = "hello";

    constructor() {
      makeObservable(this);
    }
  }

  /** The convention the hook is built around: every form component calls it for its own form */
  const FormWithHook: React.FC<{ model: IdModel }> = observer(({ model }) => {
    const form = Form.get(model);
    useFormSSR(form);

    return (
      <>
        <label {...form.bindLabel(["field"])}>Label</label>
        <input
          {...form.bindInput("field", {
            getter: () => model.field,
            setter: (v) => (model.field = v),
          })}
        />
      </>
    );
  });

  /** The same form without the hook, to show what the hook is for */
  const FormWithoutHook: React.FC<{ model: IdModel }> = observer(({ model }) => {
    const form = Form.get(model);

    return (
      <>
        <label {...form.bindLabel(["field"])}>Label</label>
        <input
          {...form.bindInput("field", {
            getter: () => model.field,
            setter: (v) => (model.field = v),
          })}
        />
      </>
    );
  });

  /** Renders on the "server" and hydrates on the "client", each with a model instance of its own */
  const hydrate = (render: () => React.ReactElement) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(render());

    const input = container.querySelector("input");
    const label = container.querySelector("label");
    const serverId = input?.id;
    expect(label?.getAttribute("for")).toBe(serverId);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // A second call, so the client gets its own model -- as a browser does when it
    // rebuilds one from serialized state rather than sharing the server's instance
    let root!: ReturnType<typeof hydrateRoot>;
    act(() => {
      root = hydrateRoot(container, render());
    });
    // Not before the test has looked at the client's form: unmounting gives it its own id back
    onTestFinished(() => {
      act(() => root.unmount());
      container.remove();
    });

    const clientId = container.querySelector("input")?.id;
    const errors = errorSpy.mock.calls.map((call) => String(call[0]));
    errorSpy.mockRestore();

    return { serverId, clientId, errors };
  };

  test("sets the form's stable id during render, in time for the bindings that follow", () => {
    const form = Form.get(new IdModel());
    expect(form.stableId).toBe(form.id);

    const seen: string[] = [];
    const Probe: React.FC = () => {
      useFormSSR(form);
      // Where the bind*() calls of a real form component would run
      seen.push(form.stableId);
      return null;
    };
    render(<Probe />);

    expect(seen[0]).toBeTruthy();
    expect(seen[0]).not.toBe(form.id);
    expect(form.stableId).toBe(seen[0]);
  });

  test("ties the label to the input through the form's stable id", () => {
    const model = new IdModel();
    const form = Form.get(model);
    const { container } = render(<FormWithHook model={model} />);

    const input = container.querySelector("input")!;
    const label = container.querySelector("label")!;

    expect(input.id).toBe(`${form.stableId}:field`);
    expect(label.getAttribute("for")).toBe(input.id);
    // No longer built on the form's uuid
    expect(input.id).not.toContain(form.id);
  });

  test("gives separate forms separate stable ids", () => {
    const model1 = new IdModel();
    const model2 = new IdModel();
    const { container } = render(
      <>
        <FormWithHook model={model1} />
        <FormWithHook model={model2} />
      </>
    );

    const [input1, input2] = Array.from(container.querySelectorAll("input"));
    expect(Form.get(model1).stableId).not.toBe(Form.get(model2).stableId);
    expect(input1.id).not.toBe(input2.id);
  });

  test("keeps the form's stable id across re-renders and under StrictMode", () => {
    const model = new IdModel();
    const form = Form.get(model);

    const Wrapper: React.FC = () => {
      const [counter, setCounter] = useState(0);
      return (
        <>
          <button onClick={() => setCounter((v) => v + 1)}>Re-render {counter}</button>
          <FormWithHook model={model} />
        </>
      );
    };
    const { container } = render(
      <StrictMode>
        <Wrapper />
      </StrictMode>
    );

    const first = form.stableId;
    act(() => container.querySelector("button")!.click());

    expect(form.stableId).toBe(first);
    expect(container.querySelector("input")!.id).toBe(`${first}:field`);
  });

  test("gives the form its own id back on unmount", () => {
    const model = new IdModel();
    const form = Form.get(model);
    const { unmount } = render(<FormWithHook model={model} />);
    expect(form.stableId).not.toBe(form.id);

    unmount();

    expect(form.stableId).toBe(form.id);
    expect(form.getField("field").stableId).toBe(form.getField("field").id);
  });

  test("leaves an id assigned by something else in place on unmount", () => {
    const model = new IdModel();
    const form = Form.get(model);
    const { unmount } = render(<FormWithHook model={model} />);

    form.stableId = "assigned-elsewhere";
    unmount();

    expect(form.stableId).toBe("assigned-elsewhere");
  });

  test("keeps the stable id while mounted under StrictMode, which cleans up effects and runs them again", () => {
    const model = new IdModel();
    const form = Form.get(model);

    // Not an observer: mobx-react-lite renders an observer again after StrictMode's remount, which
    // would put the id back by itself and hide whether the effect does
    let renders = 0;
    const PlainForm: React.FC = () => {
      renders++;
      useFormSSR(form);
      return (
        <input
          {...form.bindInput("field", {
            getter: () => model.field,
            setter: (v) => (model.field = v),
          })}
        />
      );
    };
    const { container, unmount } = render(
      <StrictMode>
        <PlainForm />
      </StrictMode>
    );

    // StrictMode's double render, and nothing after its cleanup, so only the effect can have put it back
    expect(renders).toBe(2);
    expect(form.stableId).not.toBe(form.id);
    expect(container.querySelector("input")!.id).toBe(`${form.stableId}:field`);

    unmount();
    expect(form.stableId).toBe(form.id);
  });

  test("hands the form over to the component that renders it next", () => {
    const model = new IdModel();
    const form = Form.get(model);

    const Switcher: React.FC = () => {
      const [second, setSecond] = useState(false);
      return (
        <>
          <button onClick={() => setSecond(true)}>Switch</button>
          {second ? (
            // Deeper in the tree, so useId() hands the second component an id of its own
            <div>
              <FormWithHook model={model} />
            </div>
          ) : (
            <FormWithHook model={model} />
          )}
        </>
      );
    };
    const { container } = render(<Switcher />);
    const first = form.stableId;

    act(() => container.querySelector("button")!.click());

    // The first component's cleanup runs after the second has rendered, and must not take the id back
    expect(form.stableId).not.toBe(first);
    expect(form.stableId).not.toBe(form.id);
    expect(container.querySelector("input")!.id).toBe(`${form.stableId}:field`);
  });

  test("renders ids that hydration reproduces", () => {
    const models: IdModel[] = [];
    const { serverId, clientId, errors } = hydrate(() => {
      const model = new IdModel();
      models.push(model);
      return <FormWithHook model={model} />;
    });

    const [serverModel, clientModel] = models;
    expect(serverModel).not.toBe(clientModel);
    // Two processes, two model instances, one id
    expect(Form.get(serverModel).getField("field").stableId).toBe(serverId);
    expect(Form.get(clientModel).getField("field").stableId).toBe(serverId);
    expect(clientId).toBe(serverId);
    expect(errors).toEqual([]);
  });

  test("without the hook, the server and the client disagree on the ids", () => {
    const models: IdModel[] = [];
    const { serverId, errors } = hydrate(() => {
      const model = new IdModel();
      models.push(model);
      return <FormWithoutHook model={model} />;
    });

    const [serverModel, clientModel] = models;
    expect(Form.get(serverModel).getField("field").stableId).toBe(serverId);
    // The client's own id is not the one it hydrated onto, and React says so.
    // PINNED(quirk): React leaves the server's `id` in the DOM rather than patching it,
    // so the mismatch shows up in the console instead of in the markup.
    expect(Form.get(clientModel).getField("field").stableId).not.toBe(serverId);
    expect(errors.join("\n")).toMatch(/hydrat/i);
  });

  test("types", () => {
    const form = Form.get(new IdModel());
    expectTypeOf(useFormSSR).parameters.toEqualTypeOf<[form: Form<any>]>();
    expectTypeOf(useFormSSR).returns.toEqualTypeOf<void>();
    expectTypeOf(useFormSSR).toBeCallableWith(form);

    const typeOnly = () => {
      // @ts-expect-error the first argument must be a Form
      useFormSSR({});
    };
    expectTypeOf(typeOnly).toBeFunction();
  });
});
