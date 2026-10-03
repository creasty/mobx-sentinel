// A stand-in for an `observer` component, for the tests that bind in a reaction without rendering. Nothing of the
// library's own code imports this file, and the package entry points do not export it.
import { Reaction } from "mobx";

/**
 * Create a view that renders in a reaction, as an `observer` component does
 *
 * - `render()` runs the callback in the reaction and returns what it returns, rethrowing what it throws
 * - The reaction observes what the latest `render()` read, so the bindings it bound stay cached until a later
 *   `render()` binds them no more, or `unmount()` disposes the reaction
 * - Like a component that is not rendered again, the reaction never runs the callback by itself
 */
export function createView() {
  const reaction = new Reaction("view", () => {});
  return {
    render<T>(fn: () => T): T {
      let value!: T;
      let caught: { error: unknown } | undefined;
      reaction.track(() => {
        try {
          value = fn();
        } catch (error) {
          caught = { error };
        }
      });
      if (caught) throw caught.error;
      return value;
    },
    unmount() {
      reaction.dispose();
    },
  };
}
