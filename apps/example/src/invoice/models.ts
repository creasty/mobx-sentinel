import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { makeValidatable, nested, unwatch } from "@mobx-sentinel/core";
import * as api from "./api";
import type { AddressPayload, Customer, InvoicePayload, LineItemPayload } from "./api";
import type { CountryCode, CurrencyCode } from "./catalog";
import {
  addDays,
  COUNTRIES,
  formatMoney,
  PAYMENT_TERMS,
  PaymentTerms,
  roundToMinorUnit,
  TAX_CATEGORIES,
  TaxCategory,
  today,
  toDateInput,
} from "./catalog";

/**
 * The model layer of the example app.
 *
 * These are ordinary MobX classes: they own the business rules, the derived
 * amounts, and the operations. mobx-sentinel is applied from the outside —
 * the only things it adds here are the `@nested` annotation and the
 * `makeValidatable()` calls that declare the rules the model already had.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PURCHASE_ORDER_PATTERN = /^PO-\d{4,}$/;

/** A single line above this needs a manager's approval, so we refuse it here. */
export const LINE_APPROVAL_LIMIT = 25_000;
export const MAX_CC_RECIPIENTS = 3;
export const MAX_MEMO_LENGTH = 400;

let nextLineItemId = 0;

export class LineItem {
  /** Stable identity for React keys; deliberately not observable. */
  readonly id = `line-${++nextLineItemId}`;

  @observable description = "";
  @observable quantity = 1;
  @observable unitPrice: number | null = null;
  @observable taxCategory = TaxCategory.STANDARD;

  constructor(init?: Partial<LineItemPayload>) {
    this.description = init?.description ?? this.description;
    this.quantity = init?.quantity ?? this.quantity;
    this.unitPrice = init?.unitPrice ?? this.unitPrice;
    this.taxCategory = init?.taxCategory ?? this.taxCategory;

    makeObservable(this);

    makeValidatable(this, (b) => {
      const description = this.description.trim();
      if (!description) {
        b.invalidate("description", "Description is required");
      } else if (description.length > 80) {
        b.invalidate("description", "Keep the description under 80 characters");
      }

      if (!Number.isInteger(this.quantity)) {
        b.invalidate("quantity", "Quantity must be a whole number");
      } else if (this.quantity < 1) {
        b.invalidate("quantity", "Quantity must be at least 1");
      }

      if (this.unitPrice === null) {
        b.invalidate("unitPrice", "Unit price is required");
      } else if (this.unitPrice < 0) {
        b.invalidate("unitPrice", "Unit price cannot be negative");
      }

      // A rule about the line as a whole rather than about any one of its fields.
      // `invalidateSelf` reports it on the object itself, so the parent sees it
      // at `lineItems.<i>` instead of `lineItems.<i>.<field>`.
      if (this.amount > LINE_APPROVAL_LIMIT) {
        b.invalidateSelf(`A single line cannot exceed ${LINE_APPROVAL_LIMIT.toLocaleString("en-US")} — split it up`);
      }
    });
  }

  /**
   * Derived amounts are excluded from change detection with `@unwatch`.
   * They move whenever `quantity` or `unitPrice` moves, and repeating that in
   * `changedKeyPaths` would bury the edit the user actually made.
   */
  @unwatch
  @computed
  get amount(): number {
    return (this.unitPrice ?? 0) * this.quantity;
  }

  @unwatch
  @computed
  get taxRate(): number {
    return TAX_CATEGORIES[this.taxCategory].rate;
  }

  toJSON(): LineItemPayload {
    return {
      description: this.description.trim(),
      quantity: this.quantity,
      unitPrice: this.unitPrice ?? 0,
      taxCategory: this.taxCategory,
    };
  }
}

export class PostalAddress {
  @observable line1 = "";
  @observable line2 = "";
  @observable city = "";
  @observable region = "";
  @observable postalCode = "";
  @observable country: CountryCode = "US";

  constructor() {
    makeObservable(this);

    // Validation is reactive, so switching the country immediately re-checks
    // the postal code and the region against that country's rules.
    makeValidatable(this, (b) => {
      const rules = COUNTRIES[this.country];

      if (!this.line1.trim()) {
        b.invalidate("line1", "Street address is required");
      }
      if (!this.city.trim()) {
        b.invalidate("city", "City is required");
      }
      if (rules.region.required && !this.region.trim()) {
        b.invalidate("region", `${rules.region.label} is required`);
      }

      const postalCode = this.postalCode.trim();
      if (!postalCode) {
        b.invalidate("postalCode", `${rules.postalCode.label} is required`);
      } else if (!rules.postalCode.pattern.test(postalCode)) {
        b.invalidate("postalCode", `${rules.postalCode.label}s in ${rules.name} look like ${rules.postalCode.example}`);
      }
    });
  }

  @action
  replaceWith(address: AddressPayload) {
    this.line1 = address.line1;
    this.line2 = address.line2;
    this.city = address.city;
    this.region = address.region;
    this.postalCode = address.postalCode;
    this.country = address.country;
  }

  toJSON(): AddressPayload {
    return {
      line1: this.line1.trim(),
      line2: this.line2.trim(),
      city: this.city.trim(),
      region: this.region.trim(),
      postalCode: this.postalCode.trim(),
      country: this.country,
    };
  }
}

export class Invoice {
  @observable customerEmail = "";
  @observable customerName = "";
  @observable purchaseOrderNumber = "";
  @observable currency: CurrencyCode = "USD";
  @observable issuedOn: Date = today();
  @observable paymentTerms = PaymentTerms.NET_30;
  @observable customDueOn: Date | null = null;
  @observable ccRecipients: string[] = [];
  @observable memo = "";
  @observable amountsConfirmed = false;

  /** `@nested` lets Watcher, Validator and Form see through to the sub-models. */
  @nested @observable billTo = new PostalAddress();
  @nested @observable lineItems: LineItem[] = [new LineItem()];

  /**
   * The conflict the server reported for the last submission.
   *
   * `@unwatch` keeps it out of change detection: a server response is not a
   * user edit, and it must not make the invoice look unsaved.
   */
  @unwatch @observable private rejectedPurchaseOrder: { value: string; message: string } | null = null;

  constructor() {
    makeObservable(this);

    // (1) The rules of the invoice itself.
    makeValidatable(this, (b) => {
      const email = this.customerEmail.trim();
      if (!email) {
        b.invalidate("customerEmail", "Customer email is required");
      } else if (!EMAIL_PATTERN.test(email)) {
        b.invalidate("customerEmail", "Enter a valid email address");
      }

      if (!this.customerName.trim()) {
        b.invalidate("customerName", "Customer name is required");
      }

      const purchaseOrder = this.purchaseOrderNumber.trim();
      if (purchaseOrder && !PURCHASE_ORDER_PATTERN.test(purchaseOrder)) {
        b.invalidate("purchaseOrderNumber", "Purchase orders look like PO-1234");
      }

      if (this.paymentTerms === PaymentTerms.CUSTOM) {
        if (!this.customDueOn) {
          b.invalidate("customDueOn", "Pick a due date");
        } else if (this.customDueOn < this.issuedOn) {
          b.invalidate("customDueOn", "The due date cannot precede the issue date");
        }
      }

      if (this.ccRecipients.length > MAX_CC_RECIPIENTS) {
        b.invalidate("ccRecipients", `Notify at most ${MAX_CC_RECIPIENTS} people`);
      }

      if (this.memo.length > MAX_MEMO_LENGTH) {
        b.invalidate("memo", `Keep the memo under ${MAX_MEMO_LENGTH} characters`);
      }

      if (!this.amountsConfirmed) {
        b.invalidate("amountsConfirmed", "Confirm the amounts before sending");
      }

      // Rules that span the line items belong to the invoice, not to a line.
      if (this.lineItems.length === 0) {
        b.invalidate("lineItems", "Add at least one line item");
      } else if (this.total <= 0) {
        b.invalidate("lineItems", "The invoice total must be greater than zero");
      }
      const descriptions = new Set<string>();
      for (const item of this.lineItems) {
        const description = item.description.trim().toLowerCase();
        if (!description) continue;
        if (descriptions.has(description)) {
          b.invalidate("lineItems", `"${item.description.trim()}" appears on more than one line`);
          break;
        }
        descriptions.add(description);
      }
    });

    // (2) An asynchronous rule, composed on top of the synchronous ones.
    // The Validator throttles the calls; a keystroke made while a lookup is in
    // flight is checked after that lookup settles.
    makeValidatable(
      this,
      () => this.customerEmail.trim().toLowerCase(),
      async (email, b, abortSignal) => {
        if (!email || !EMAIL_PATTERN.test(email)) return; // (1) already reports this
        try {
          const customer = await api.findCustomer(email, abortSignal);
          if (!customer) {
            b.invalidate("customerEmail", "No customer in the CRM uses this address");
          }
        } catch (e) {
          if (abortSignal.aborted) return; // the validator was reset or the handler removed
          throw e;
        }
      },
      { initialRun: false, delayMs: 300 }
    );

    // (3) Errors only the server can produce are just another source of rules.
    // They stay visible until the user edits the value the server rejected.
    makeValidatable(this, (b) => {
      const rejected = this.rejectedPurchaseOrder;
      if (rejected && rejected.value === this.purchaseOrderNumber.trim()) {
        b.invalidate("purchaseOrderNumber", rejected.message);
      }
    });
  }

  @unwatch
  @computed
  get dueOn(): Date | null {
    const { netDays } = PAYMENT_TERMS[this.paymentTerms];
    return netDays === null ? this.customDueOn : addDays(this.issuedOn, netDays);
  }

  @unwatch
  @computed
  get subtotal(): number {
    const sum = this.lineItems.reduce((total, item) => total + item.amount, 0);
    return roundToMinorUnit(sum, this.currency);
  }

  @unwatch
  @computed
  get taxAmount(): number {
    const sum = this.lineItems.reduce((total, item) => total + item.amount * item.taxRate, 0);
    return roundToMinorUnit(sum, this.currency);
  }

  @unwatch
  @computed
  get total(): number {
    return roundToMinorUnit(this.subtotal + this.taxAmount, this.currency);
  }

  @unwatch
  @computed
  get formattedTotal(): string {
    return formatMoney(this.total, this.currency);
  }

  @action.bound
  addLineItem() {
    this.lineItems.push(new LineItem());
  }

  @action
  duplicateLineItem(item: LineItem) {
    const index = this.lineItems.indexOf(item);
    if (index < 0) return;
    this.lineItems.splice(index + 1, 0, new LineItem(item.toJSON()));
  }

  @action
  removeLineItem(item: LineItem) {
    const index = this.lineItems.indexOf(item);
    if (index < 0) return;
    this.lineItems.splice(index, 1);
  }

  /** Copy what the CRM knows about the customer onto the invoice. */
  @action
  applyCustomer(customer: Customer) {
    this.customerName = customer.name;
    this.currency = customer.currency;
    this.billTo.replaceWith(customer.billTo);
  }

  @action
  rejectPurchaseOrder(conflict: { value: string; message: string }) {
    this.rejectedPurchaseOrder = conflict;
  }

  /**
   * Restore a draft the user saved earlier.
   *
   * `unwatch()` hydrates the model without the Watcher noticing, so a restored
   * draft does not count as an unsaved edit: the invoice is populated, yet the
   * form stays pristine until the user actually changes something.
   */
  restoreDraft = () => {
    const draft = api.loadSavedDraft();
    unwatch(() =>
      runInAction(() => {
        this.customerEmail = draft.customerEmail;
        this.customerName = draft.customerName;
        this.purchaseOrderNumber = draft.purchaseOrderNumber;
        this.currency = draft.currency;
        this.issuedOn = new Date(`${draft.issuedOn}T00:00:00Z`);
        this.paymentTerms = draft.paymentTerms;
        this.customDueOn = null;
        this.ccRecipients = [...draft.ccRecipients];
        this.memo = draft.memo;
        this.billTo.replaceWith(draft.billTo);
        this.lineItems.splice(0, this.lineItems.length, ...draft.lineItems.map((item) => new LineItem(item)));
      })
    );
  };

  toJSON(): InvoicePayload {
    return {
      customerEmail: this.customerEmail.trim().toLowerCase(),
      customerName: this.customerName.trim(),
      purchaseOrderNumber: this.purchaseOrderNumber.trim(),
      currency: this.currency,
      issuedOn: toDateInput(this.issuedOn)!,
      paymentTerms: this.paymentTerms,
      dueOn: toDateInput(this.dueOn),
      ccRecipients: [...this.ccRecipients],
      memo: this.memo.trim(),
      billTo: this.billTo.toJSON(),
      lineItems: this.lineItems.map((item) => item.toJSON()),
      total: this.total,
    };
  }
}
