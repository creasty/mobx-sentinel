import { act, render, screen, within } from "@testing-library/react";
import { type UserEvent, userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { InvoiceForm } from "./form";
import { Invoice } from "./models";

/**
 * Integration tests: the invoice editor, used the way a person uses it.
 *
 * Each test runs through all three packages at once, as an application imports
 * them: the rules the models declare with `@mobx-sentinel/core`, the form state
 * of `@mobx-sentinel/form`, and the bindings and hooks of `@mobx-sentinel/react`.
 * Nothing is mocked; the fake backend in ./api runs as-is, on fake timers.
 */

/** Rules re-run this long after a change they read (`Validator.defaultDelayMs`) */
const RULES_MS = 100;
/** The CRM check runs this long after the email changes... */
const CRM_THROTTLE_MS = 300;
/** ...and the lookup takes this long */
const CRM_LOOKUP_MS = 700;
/** The fake backend takes this long to answer a submission */
const SUBMIT_MS = 1400;
/** The autosave runs this long after a change */
const AUTOSAVE_MS = 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Render a new invoice, and set up a user to edit it */
function setup() {
  render(<InvoiceForm model={new Invoice()} />);
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

/** Let time pass, settling whatever the timers set off */
function elapse(ms: number) {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Restore the saved draft and confirm its amounts, which makes a complete invoice */
async function completeFromDraft(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Restore draft" }));
  await user.click(screen.getByLabelText("I have reviewed the amounts above"));
  await elapse(CRM_THROTTLE_MS + CRM_LOOKUP_MS);
}

function sendButton() {
  return screen.getByRole("button", { name: /^(Send invoice|Sending…)$/ });
}

describe("a new invoice", () => {
  test("holds its errors back until they are reported", () => {
    setup();

    // The rules have run, so the invoice knows it is invalid...
    expect(sendButton()).toHaveAttribute("aria-invalid", "true");
    // ...but none of its fields has been reported, so none of them says so yet
    expect(screen.getByLabelText("Billing contact")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Customer email is required")).not.toBeInTheDocument();
    // Nothing has changed yet, and the invalid invoice can't be sent
    expect(screen.getByText("No changes")).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });
});

describe("error reporting", () => {
  test("reports a field once the user leaves it, then follows its value", async () => {
    const user = setup();
    const purchaseOrder = screen.getByLabelText("Purchase order (optional)");

    await user.type(purchaseOrder, "1234");
    await elapse(RULES_MS);
    // The rule already fails, but the user is still typing
    expect(screen.queryByText("Purchase orders look like PO-1234")).not.toBeInTheDocument();
    expect(purchaseOrder).not.toHaveAttribute("aria-invalid");

    await user.tab();
    expect(screen.getByText("Purchase orders look like PO-1234")).toBeInTheDocument();
    expect(purchaseOrder).toHaveAttribute("aria-invalid", "true");
    expect(purchaseOrder).toHaveAttribute("aria-errormessage", "Purchase orders look like PO-1234");
    expect(screen.getByText("Purchase order (optional)")).toHaveAttribute("aria-invalid", "true");

    await user.clear(purchaseOrder);
    await user.type(purchaseOrder, "PO-1234");
    await elapse(RULES_MS);
    expect(screen.queryByText("Purchase orders look like PO-1234")).not.toBeInTheDocument();
    expect(purchaseOrder).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("Purchase order (optional)")).toHaveAttribute("aria-invalid", "false");
  });

  test("reports every field, sub-forms included, when the send button is hovered", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Customer name"), "Ada");
    await elapse(RULES_MS);

    await user.hover(sendButton());

    // The invoice's own fields
    expect(screen.getByLabelText("Customer name")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("Customer email is required")).toBeInTheDocument();
    expect(screen.getByText("Confirm the amounts before sending")).toBeInTheDocument();
    // The address: a nested model with a form of its own, which the invoice's heading answers for
    expect(screen.getByText("Street address is required")).toBeInTheDocument();
    expect(screen.getByText("ZIP code is required")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bill to" })).toHaveAttribute("aria-invalid", "true");
    // The line item: a nested model in an array
    expect(screen.getByText("Description is required")).toBeInTheDocument();
    expect(screen.getByText("Unit price is required")).toBeInTheDocument();
  });

  test("re-validates a sub-form when a field its rules read changes", async () => {
    const user = setup();
    const zipCode = screen.getByLabelText("ZIP code");

    await user.type(zipCode, "94103");
    await user.tab();
    await elapse(RULES_MS);
    expect(zipCode).toHaveAttribute("aria-invalid", "false");

    await user.selectOptions(screen.getByLabelText("Country"), "Japan");
    await elapse(RULES_MS);
    // The same input, relabelled for Japan and checked against its rules without being touched
    expect(screen.getByLabelText("Postal code")).toBe(zipCode);
    expect(screen.getByText("Postal codes in Japan look like 150-0001")).toBeInTheDocument();
    expect(zipCode).toHaveAttribute("aria-invalid", "true");

    await user.clear(zipCode);
    await user.type(zipCode, "150-0001");
    await elapse(RULES_MS);
    expect(screen.queryByText("Postal codes in Japan look like 150-0001")).not.toBeInTheDocument();
    expect(zipCode).toHaveAttribute("aria-invalid", "false");
  });

  test("validates a field that only appears for the terms that need it", async () => {
    const user = setup();

    await user.click(screen.getByLabelText("Pick a date"));
    await user.hover(sendButton());
    await elapse(RULES_MS);
    expect(screen.getByText("Pick a due date")).toBeInTheDocument();

    const dueDate = screen.getByLabelText("Due date");
    await user.type(dueDate, "2000-01-01");
    await elapse(RULES_MS);
    expect(screen.queryByText("Pick a due date")).not.toBeInTheDocument();
    expect(screen.getByText("The due date cannot precede the issue date")).toBeInTheDocument();
    expect(dueDate).toHaveAttribute("aria-invalid", "true");
  });
});

describe("line items", () => {
  test("checks the rules that span the lines, and the rules of a line as a whole", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Description"), "Consulting");
    await user.type(screen.getByLabelText("Unit price"), "100");
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await elapse(RULES_MS);
    await user.hover(sendButton());

    // A rule of the invoice about its lines, reported under the "Line items" heading
    expect(screen.getByText('"Consulting" appears on more than one line')).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Line items" })).toHaveAttribute("aria-invalid", "true");

    // A rule of one line as a whole, shown on that line
    const [, secondUnitPrice] = screen.getAllByLabelText("Unit price");
    await user.clear(secondUnitPrice);
    await user.type(secondUnitPrice, "30000");
    await elapse(RULES_MS);
    expect(screen.getByText("A single line cannot exceed 25,000 — split it up")).toBeInTheDocument();

    // Deleting the line takes both errors with it
    await user.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    await elapse(RULES_MS);
    expect(screen.getAllByLabelText("Description")).toHaveLength(1);
    expect(screen.queryByText('"Consulting" appears on more than one line')).not.toBeInTheDocument();
    expect(screen.queryByText("A single line cannot exceed 25,000 — split it up")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Line items" })).toHaveAttribute("aria-invalid", "false");
  });
});

describe("the CRM check", () => {
  test("holds the email's errors back until the asynchronous check settles", async () => {
    const user = setup();
    const email = screen.getByLabelText("Billing contact");

    await user.type(email, "someone@example.com");
    await user.tab();
    await elapse(CRM_THROTTLE_MS);
    // Reported, but the lookup is still running
    expect(screen.getByText("Checking the CRM…")).toBeInTheDocument();
    expect(sendButton()).toHaveAttribute("aria-busy", "true");
    expect(email).not.toHaveAttribute("aria-invalid");

    await elapse(CRM_LOOKUP_MS);
    expect(screen.queryByText("Checking the CRM…")).not.toBeInTheDocument();
    expect(sendButton()).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText("No customer in the CRM uses this address")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");

    await user.clear(email);
    await user.type(email, "ap@northwind.example");
    await elapse(CRM_THROTTLE_MS + CRM_LOOKUP_MS);
    expect(screen.queryByText("No customer in the CRM uses this address")).not.toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "false");
  });

  test("clears the errors reported on the customer and the address once the lookup fills them in", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Billing contact"), "rechnung@blaufink.example");
    await user.hover(sendButton());
    await elapse(CRM_THROTTLE_MS + CRM_LOOKUP_MS);
    expect(screen.getByText("Customer name is required")).toBeInTheDocument();
    expect(screen.getByText("Street address is required")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bill to" })).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: "Look up" }));
    await elapse(CRM_LOOKUP_MS + RULES_MS);

    expect(screen.getByLabelText("Customer name")).toHaveValue("Blaufink GmbH");
    expect(screen.getByLabelText("Street address")).toHaveValue("Torstraße 84");
    expect(screen.getByLabelText("Country")).toHaveValue("DE");
    expect(screen.queryByText("Customer name is required")).not.toBeInTheDocument();
    expect(screen.queryByText("Street address is required")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bill to" })).toHaveAttribute("aria-invalid", "false");
  });

  test("goes idle again when a typo in the email is corrected before the check runs", async () => {
    const user = setup();
    await completeFromDraft(user);
    expect(sendButton()).toBeEnabled();

    await user.type(screen.getByLabelText("Billing contact"), "x{Backspace}");
    await elapse(CRM_THROTTLE_MS + CRM_LOOKUP_MS);
    expect(sendButton()).toBeEnabled();
    expect(sendButton()).toHaveAttribute("aria-busy", "false");
  });
});

describe("drafts and autosave", () => {
  test("restores a draft without making the invoice dirty", async () => {
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Restore draft" }));
    await elapse(CRM_THROTTLE_MS + CRM_LOOKUP_MS + AUTOSAVE_MS);
    expect(screen.getByLabelText("Customer name")).toHaveValue("Northwind Traders, Inc.");
    expect(screen.getAllByLabelText("Description")).toHaveLength(3);
    // Hydrated inside unwatch(), so none of it counts as an edit
    expect(screen.getByText("No changes")).toBeInTheDocument();
    expect(screen.queryByText(/Draft autosaved at/)).not.toBeInTheDocument();

    // The user's first edit does
    await user.click(screen.getByLabelText("I have reviewed the amounts above"));
    await elapse(AUTOSAVE_MS);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByText(/Draft autosaved at/)).toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  test("autosaves after an edit, but not after a second edit inside a line item", async () => {
    const user = setup();
    const lastAutosave = () => screen.queryByText(/Draft autosaved at/)?.textContent;

    await user.type(screen.getByLabelText("Customer name"), "Ada");
    await elapse(AUTOSAVE_MS);
    const afterNameEdit = lastAutosave();
    expect(afterNameEdit).toBeDefined();

    // A line item is a nested model, and its first edit reaches the invoice's autosave
    await elapse(60_000);
    await user.type(screen.getByLabelText("Description"), "Consulting");
    await elapse(AUTOSAVE_MS);
    const afterDescriptionEdit = lastAutosave();
    expect(afterDescriptionEdit).not.toBe(afterNameEdit);

    await elapse(60_000);
    await user.type(screen.getByLabelText("Unit price"), "100");
    await elapse(AUTOSAVE_MS);
    // PINNED(bug): the invoice's watcher only reacts when a line item's `changed` flips to true, so further edits of a line already edited do not advance the invoice's changedTick, and the autosave never runs for them. Expected: the autosave runs after this edit too. Flip this assertion when fixing (see "the parent only reacts to the nested `changed` flipping to true" in packages/core/src/watcher.test.ts).
    expect(lastAutosave()).toBe(afterDescriptionEdit);
  });
});

describe("sending", () => {
  test("turns a conflict reported by the server into an error on the field, and sends once it is fixed", async () => {
    const user = setup();
    // The draft's purchase order has already been invoiced, which only the server knows
    await completeFromDraft(user);

    await user.click(sendButton());
    expect(sendButton()).toHaveTextContent("Sending…");
    expect(sendButton()).toBeDisabled();
    await elapse(SUBMIT_MS + RULES_MS);

    const purchaseOrder = screen.getByLabelText("Purchase order (optional)");
    expect(screen.getByText("PO-1042 was already invoiced on 2025-04-18")).toBeInTheDocument();
    expect(purchaseOrder).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();

    await user.clear(purchaseOrder);
    await user.type(purchaseOrder, "PO-2042");
    await elapse(RULES_MS);
    expect(screen.queryByText("PO-1042 was already invoiced on 2025-04-18")).not.toBeInTheDocument();

    await user.click(sendButton());
    await elapse(SUBMIT_MS);
    expect(screen.getByRole("status")).toHaveTextContent(/^Sent as INV-\d{4}\./);
    // A successful submission resets the form, and leaves the model as it was, still valid
    expect(screen.getByText("No changes")).toBeInTheDocument();
    expect(purchaseOrder).not.toHaveAttribute("aria-invalid");
    expect(purchaseOrder).toHaveValue("PO-2042");
    expect(sendButton()).toBeEnabled();
  });
});

describe("resetting", () => {
  test("resets the form state, sub-forms included, without touching the model", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Customer name"), "Ada");
    await elapse(RULES_MS);
    await user.hover(sendButton());
    expect(screen.getByText("Customer email is required")).toBeInTheDocument();
    expect(screen.getByText("Street address is required")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset form state" }));
    expect(screen.getByText("No changes")).toBeInTheDocument();
    expect(screen.queryByText("Customer email is required")).not.toBeInTheDocument();
    expect(screen.queryByText("Street address is required")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Customer name")).toHaveValue("Ada");
  });
});

describe("the notify list", () => {
  test("holds its errors back while the list is open, and reports them once it closes", async () => {
    const user = setup();
    // The legend names the group, which holds the summary of the list and its checkboxes
    const notify = within(screen.getByRole("group", { name: "Notify (up to 3)" })).getByText("Nobody");

    await user.click(notify);
    await user.click(screen.getByRole("checkbox", { name: "Dana Whitfield — Controller" }));
    await user.click(screen.getByRole("checkbox", { name: "Inés Moreau — AR Lead" }));
    await user.click(screen.getByRole("checkbox", { name: "Koji Arakawa — Account Manager" }));
    await user.click(screen.getByRole("checkbox", { name: "Pat Nkemelu — Sales Ops" }));
    await elapse(RULES_MS);
    expect(notify).toHaveTextContent(
      "Dana Whitfield — Controller, Inés Moreau — AR Lead, Koji Arakawa — Account Manager, Pat Nkemelu — Sales Ops"
    );
    // The rule already fails, but the user is still choosing
    expect(screen.queryByText("Notify at most 3 people")).not.toBeInTheDocument();
    expect(notify).not.toHaveAttribute("aria-invalid");

    await user.keyboard("{Escape}");
    expect(notify.closest("details")).not.toHaveAttribute("open");
    expect(notify).toHaveFocus();
    expect(screen.getByText("Notify at most 3 people")).toBeInTheDocument();
    expect(notify).toHaveAttribute("aria-invalid", "true");
    expect(notify).toHaveAttribute("aria-errormessage", "Notify at most 3 people");
    expect(screen.getByText("Notify (up to 3)")).toHaveAttribute("aria-invalid", "true");
  });

  test("closes the list, and reports its errors, once focus leaves it", async () => {
    const user = setup();
    const notify = within(screen.getByRole("group", { name: "Notify (up to 3)" })).getByText("Nobody");

    await user.click(notify);
    await user.click(screen.getByRole("checkbox", { name: "Sam Oyelaran — Finance Partner" }));
    await elapse(RULES_MS);
    expect(notify.closest("details")).toHaveAttribute("open");

    // Past the last option, to the next field
    await user.tab();
    expect(screen.getByLabelText("Street address")).toHaveFocus();
    expect(notify.closest("details")).not.toHaveAttribute("open");
    expect(notify).toHaveTextContent("Sam Oyelaran — Finance Partner");
    expect(notify).toHaveAttribute("aria-invalid", "false");
  });
});

describe("the memo", () => {
  test("holds its errors back while the user types, and reports them once the user leaves it", async () => {
    const user = setup();
    const memo = screen.getByPlaceholderText("Anything the customer's accounts payable team should know");

    await user.click(memo);
    await user.paste("x".repeat(401));
    await elapse(RULES_MS);
    expect(screen.getByText("-1 characters left")).toBeInTheDocument();
    expect(screen.queryByText("Keep the memo under 400 characters")).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByText("Keep the memo under 400 characters")).toBeInTheDocument();
    expect(memo).toHaveAttribute("aria-invalid", "true");
  });
});
