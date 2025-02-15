/**
 * Test cases for undocumented behavior of MobX
 */

import { observable, reaction, runInAction } from "mobx";

describe("mobx", () => {
  describe("reaction()", () => {
    test("debounced scheduler affects on both observing expression and effect", async () => {
      const obj = observable({ expr: 0, effect: 0 });
      const exprFn = vi.fn(() => {
        return obj.expr;
      });
      const effectFn = vi.fn((value: number) => {
        obj.effect = value;
      });

      let timerId: number | null = null;
      reaction(exprFn, effectFn, {
        scheduler: (fn) => {
          if (timerId) clearTimeout(timerId);
          timerId = +setTimeout(fn, 100);
        },
      });
      for (let i = 0; i < 10; i++) {
        runInAction(() => obj.expr++);
      }

      await vi.waitFor(() => expect(obj.effect).toBe(obj.expr));
      expect(exprFn).toBeCalledTimes(2);
      expect(exprFn).nthReturnedWith(1, 0);
      expect(exprFn).nthReturnedWith(2, 10);
      expect(effectFn).toBeCalledTimes(1);
      expect(effectFn).lastCalledWith(10, 0, expect.anything());
    });
  });
});
