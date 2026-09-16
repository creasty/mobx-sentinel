import { Form } from "@mobx-sentinel/form";
import { useEffect, useId, useRef } from "react";

/**
 * Prepare the form for server-side rendering
 *
 * @param form Form instance
 *
 * @remarks
 * Makes what the server renders agree with the client render that hydrates it:
 * - Element ids: assigns React's `useId()` to the form's {@link Form.stableId}, which the
 *   stable ids of its fields build on
 *
 * Call it at the top of each component that renders a form, before any `bind*` call.
 * It covers that form only: a sub-form rendered by its own component calls it for itself,
 * so no component has to know what its ancestors did.
 *
 * Harmless in a client-rendered app, so shared components can call it unconditionally.
 * Anything it takes care of in the future has to keep it that way.
 *
 * @example
 * ```tsx
 * const AddressForm: React.FC<{ model: PostalAddress }> = observer(({ model }) => {
 *   const form = Form.get(model);
 *   useFormSSR(form);
 *   return (...);
 * });
 * ```
 */
export function useFormSSR(form: Form<any>): void {
  const id = useId();
  // Assigned during render so the bindings called later in this same render can see it.
  // stableId is a plain field rather than an observable, so the write notifies nothing,
  // and useId() hands back the same string on every render of this component -- including
  // the second one StrictMode performs.
  form.stableId = id;
}

/**
 * Auto reset the form when the component is mounted and unmounted
 *
 * @param form Form instance
 *
 * @remarks
 * - Calls `form.reset()` on mount
 * - Calls `form.reset()` on unmount
 * - Useful for cleaning up form state
 */
export function useFormAutoReset(form: Form<any>) {
  useEffect(() => {
    form.reset();
    return () => form.reset();
  }, [form]);
}

/**
 * Add a submission handler to the form with automatic cleanup
 *
 * @param form Form instance
 * @param event Submission phase of the handler (`willSubmit`, `submit` or `didSubmit`)
 * @param handler Handler to add
 *
 * @remarks
 * No memoization of the handler is needed as it is stored in a ref internally.
 */
export function useFormHandler<T extends object>(
  form: Form<T>,
  event: "willSubmit",
  handler: Form.Handlers["willSubmit"]
): void;
export function useFormHandler<T extends object>(
  form: Form<T>,
  event: "submit",
  handler: Form.Handlers["submit"]
): void;
export function useFormHandler<T extends object>(
  form: Form<T>,
  event: "didSubmit",
  handler: Form.Handlers["didSubmit"]
): void;
export function useFormHandler<T extends object>(form: Form<T>, event: any, handler: any) {
  const handlerRef = useRef(handler);
  // Assigning during render is what keeps the handler current without the caller memoizing it.
  // The catch is that a render React throws away still leaves its handler behind -- the React
  // Compiler rules in eslint-plugin-react-hooks 7 flag exactly this, and Biome has no equivalent.
  // Moving the assignment into an effect would fix that, but it also delays the update to after
  // commit, so it is left as a deliberate behavioral decision to make separately.
  handlerRef.current = handler;

  useEffect(() => {
    const dispose = form.addHandler(event, (...args) => handlerRef.current(...args));
    return dispose;
  }, [form, event]);
}
