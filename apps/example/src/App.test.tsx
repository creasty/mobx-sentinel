import { act, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** The row headed by `label` in a section of the debugger panel */
function debuggerRow(section: string, label: string) {
  const details = screen.getByText(section, { selector: "summary" }).closest("details")!;
  return within(details).queryByRole("rowheader", { name: label })?.closest("tr") ?? null;
}

describe("App", () => {
  test("shows the live state of the invoice's form, watcher and validator next to the form", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    expect(debuggerRow("Form", "isDirty")).toHaveTextContent("false");
    // The errors of the nested models, under their key paths from the invoice
    expect(debuggerRow("Validator", "billTo.line1")).toHaveTextContent("Street address is required");
    expect(debuggerRow("Validator", "lineItems.0.description")).toHaveTextContent("Description is required");

    await user.type(screen.getByLabelText("Description"), "Consulting");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(debuggerRow("Form", "isDirty")).toHaveTextContent("true");
    expect(debuggerRow("Watcher", "changedKeyPaths")).toHaveTextContent("lineItems.0.description");
    expect(debuggerRow("Validator", "lineItems.0.description")).toBeNull();
  });
});
