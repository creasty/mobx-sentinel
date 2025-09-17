import { autorun } from "mobx";
import { Submission } from "./submission";
import { vi } from "vitest";

describe("Submission", () => {
  describe("#exec", () => {
    it("executes handlers in order", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 1");
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit 1");
        return true;
      });
      submission.addHandler("didSubmit", () => {
        timeline.push("didSubmit 1");
      });
      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 2");
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit 2");
        return true;
      });
      submission.addHandler("didSubmit", () => {
        timeline.push("didSubmit 2");
      });

      await submission.exec();
      expect(timeline).toMatchInlineSnapshot(`
        [
          "willSubmit 1",
          "willSubmit 2",
          "submit 1",
          "submit 2",
          "didSubmit 1",
          "didSubmit 2",
        ]
      `);
    });

    it("sets isRunning flag during execution", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      autorun(() => {
        timeline.push(`isRunning: ${submission.isRunning}`);
      });

      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit");
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit");
        return true;
      });
      submission.addHandler("didSubmit", () => {
        timeline.push("didSubmit");
      });

      await submission.exec();
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isRunning: false",
          "isRunning: true",
          "willSubmit",
          "submit",
          "didSubmit",
          "isRunning: false",
        ]
      `);
    });

    it("processes willSubmit handlers serially regardless of timing", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 1 start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        timeline.push("willSubmit 1 end");
        return true;
      });
      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 2 start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        timeline.push("willSubmit 2 end");
        return true;
      });
      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 3 start");
        await new Promise((resolve) => setTimeout(resolve, 30));
        timeline.push("willSubmit 3 end");
        return true;
      });

      await submission.exec();
      expect(timeline).toMatchInlineSnapshot(`
        [
          "willSubmit 1 start",
          "willSubmit 1 end",
          "willSubmit 2 start",
          "willSubmit 2 end",
          "willSubmit 3 start",
          "willSubmit 3 end",
        ]
      `);
    });

    it("processes submit handlers serially regardless of timing", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      submission.addHandler("submit", async () => {
        timeline.push("submit 1 start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        timeline.push("submit 1 end");
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit 2 start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        timeline.push("submit 2 end");
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit 3 start");
        await new Promise((resolve) => setTimeout(resolve, 30));
        timeline.push("submit 3 end");
        return true;
      });

      await submission.exec();
      expect(timeline).toMatchInlineSnapshot(`
        [
          "submit 1 start",
          "submit 1 end",
          "submit 2 start",
          "submit 2 end",
          "submit 3 start",
          "submit 3 end",
        ]
      `);
    });

    it("returns true when all submit handlers succeed", async () => {
      const submission = new Submission();

      submission.addHandler("submit", async () => true);
      submission.addHandler("submit", async () => true);

      const result = await submission.exec();
      expect(result).toBe(true);
    });

    it("returns false when any submit handler fails and stops execution", async () => {
      const submission = new Submission();
      const firstHandler = vi.fn(async () => true);
      const secondHandler = vi.fn(async () => false);
      const thirdHandler = vi.fn(async () => true);

      submission.addHandler("submit", firstHandler);
      submission.addHandler("submit", secondHandler);
      submission.addHandler("submit", thirdHandler);

      const result = await submission.exec();
      expect(result).toBe(false);
      expect(firstHandler).toHaveBeenCalled();
      expect(secondHandler).toHaveBeenCalled();
      expect(thirdHandler).not.toHaveBeenCalled();
    });

    it("skips submit handlers when willSubmit returns false", async () => {
      const submission = new Submission();
      const willSubmitHandler1 = vi.fn(async () => true);
      const willSubmitHandler2 = vi.fn(async () => false);
      const willSubmitHandler3 = vi.fn(async () => true);
      const submitHandler = vi.fn(async () => true);

      submission.addHandler("willSubmit", willSubmitHandler1);
      submission.addHandler("willSubmit", willSubmitHandler2);
      submission.addHandler("willSubmit", willSubmitHandler3);
      submission.addHandler("submit", submitHandler);

      const result = await submission.exec();
      expect(result).toBe(false);
      expect(willSubmitHandler1).toHaveBeenCalled();
      expect(willSubmitHandler2).toHaveBeenCalled();
      expect(willSubmitHandler3).not.toHaveBeenCalled();
      expect(submitHandler).not.toHaveBeenCalled();
    });

    it("handles errors in willSubmit handlers", async () => {
      const submission = new Submission();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      submission.addHandler("willSubmit", async () => {
        throw new Error("Test error");
      });

      const result = await submission.exec();
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("handles errors in submit handlers", async () => {
      const submission = new Submission();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      submission.addHandler("submit", async () => {
        throw new Error("Test error");
      });

      const result = await submission.exec();
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("handles errors in didSubmit handlers", async () => {
      const submission = new Submission();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      submission.addHandler("didSubmit", () => {
        throw new Error("Test error");
      });

      const result = await submission.exec();
      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("aborts previous execution when called again", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      let counter = 0;
      submission.addHandler("submit", async (abortSignal) => {
        const localCounter = ++counter;
        timeline.push(`submit ${localCounter} start`);
        await new Promise((resolve) => {
          const timerId = setTimeout(() => {
            resolve(true);
            timeline.push(`submit ${localCounter} completed`);
          }, 100);
          abortSignal.onabort = () => {
            timeline.push(`submit ${localCounter} aborted`);
            clearTimeout(timerId);
          };
        });
        return true;
      });

      submission.exec();
      await submission.exec();

      expect(timeline).toMatchInlineSnapshot(`
        [
          "submit 1 start",
          "submit 1 aborted",
          "submit 2 start",
          "submit 2 completed",
        ]
      `);
    });
  });

  describe("#on", () => {
    it("returns cleanup function that removes the handler", async () => {
      const submission = new Submission();
      const handler = vi.fn();

      const dispose = submission.addHandler("willSubmit", handler);
      await submission.exec();
      expect(handler).toHaveBeenCalledTimes(1);

      dispose();
      await submission.exec();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
