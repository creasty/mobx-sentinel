import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Every user-event call goes through Testing Library's async wrapper, which ends by waiting on a zero-delay timer and
// only advances fake timers to fire it when they are Jest's. Pointing its `jest` at Vitest keeps the calls from hanging.
Object.assign(globalThis, { jest: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) } });

// Testing Library unmounts after each test by itself only when the test API is global, and here it is imported.
afterEach(() => {
  cleanup();
});
