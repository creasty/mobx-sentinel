import { CountryCode, CurrencyCode, PaymentTerms, TaxCategory } from "./catalog";

/**
 * A stand-in for a real backend.
 *
 * It is deliberately slow and occasionally unhappy, so the demo exercises the
 * parts of mobx-sentinel that deal with the network: throttled asynchronous
 * validation, and errors that only the server can produce.
 */

export type AddressPayload = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: CountryCode;
};

export type LineItemPayload = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCategory: TaxCategory;
};

export type InvoicePayload = {
  customerEmail: string;
  customerName: string;
  purchaseOrderNumber: string;
  currency: CurrencyCode;
  issuedOn: string;
  paymentTerms: PaymentTerms;
  dueOn: string | null;
  ccRecipients: string[];
  memo: string;
  billTo: AddressPayload;
  lineItems: LineItemPayload[];
  total: number;
};

export type Customer = {
  email: string;
  name: string;
  currency: CurrencyCode;
  billTo: AddressPayload;
};

export type SubmitResult =
  | { ok: true; invoiceNumber: string }
  | { ok: false; conflict: { field: "purchaseOrderNumber"; value: string; message: string } };

const CUSTOMERS: readonly Customer[] = [
  {
    email: "ap@northwind.example",
    name: "Northwind Traders, Inc.",
    currency: "USD",
    billTo: {
      line1: "1200 Harrison St",
      line2: "Suite 400",
      city: "San Francisco",
      region: "CA",
      postalCode: "94103",
      country: "US",
    },
  },
  {
    email: "rechnung@blaufink.example",
    name: "Blaufink GmbH",
    currency: "EUR",
    billTo: {
      line1: "Torstraße 84",
      line2: "",
      city: "Berlin",
      region: "Berlin",
      postalCode: "10119",
      country: "DE",
    },
  },
  {
    email: "keiri@hinode.example",
    name: "Hinode Manufacturing K.K.",
    currency: "JPY",
    billTo: {
      line1: "2-4-1 Shibuya",
      line2: "Hinode Building 7F",
      city: "Shibuya-ku",
      region: "Tokyo",
      postalCode: "150-0002",
      country: "JP",
    },
  },
];

/** Addresses the demo knows about; shown in the UI so the lookup is discoverable. */
export const KNOWN_CUSTOMER_EMAILS = CUSTOMERS.map((customer) => customer.email);

export const TEAM_MEMBERS: readonly { id: string; name: string }[] = [
  { id: "dana", name: "Dana Whitfield — Controller" },
  { id: "ines", name: "Inés Moreau — AR Lead" },
  { id: "koji", name: "Koji Arakawa — Account Manager" },
  { id: "pat", name: "Pat Nkemelu — Sales Ops" },
  { id: "sam", name: "Sam Oyelaran — Finance Partner" },
];

/** The server already issued an invoice under this PO number. */
const TAKEN_PURCHASE_ORDER = "PO-1042";

function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timerId = setTimeout(resolve, ms);
    abortSignal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timerId);
        reject(abortSignal.reason);
      },
      { once: true }
    );
  });
}

/** Looks a customer up in the CRM. Rejects when the caller aborts, just like `fetch`. */
export async function findCustomer(email: string, abortSignal?: AbortSignal): Promise<Customer | null> {
  await sleep(700, abortSignal);
  return CUSTOMERS.find((customer) => customer.email === email.trim().toLowerCase()) ?? null;
}

export async function submitInvoice(payload: InvoicePayload, abortSignal: AbortSignal): Promise<SubmitResult> {
  await sleep(1400, abortSignal);

  if (payload.purchaseOrderNumber === TAKEN_PURCHASE_ORDER) {
    return {
      ok: false,
      conflict: {
        field: "purchaseOrderNumber",
        value: TAKEN_PURCHASE_ORDER,
        message: `${TAKEN_PURCHASE_ORDER} was already invoiced on 2025-04-18`,
      },
    };
  }

  return { ok: true, invoiceNumber: `INV-${String(Math.floor(Math.random() * 9000) + 1000)}` };
}

/** A draft the user saved earlier, as it would come back from the server. */
export function loadSavedDraft(): Omit<InvoicePayload, "dueOn" | "total"> {
  const customer = CUSTOMERS[0];
  return {
    customerEmail: customer.email,
    customerName: customer.name,
    purchaseOrderNumber: TAKEN_PURCHASE_ORDER,
    currency: customer.currency,
    issuedOn: new Date().toISOString().slice(0, 10),
    paymentTerms: PaymentTerms.NET_30,
    ccRecipients: ["dana"],
    memo: "Invoiced against the master services agreement. Remit to the account on file.",
    billTo: customer.billTo,
    lineItems: [
      { description: "Platform retainer", quantity: 1, unitPrice: 7500, taxCategory: TaxCategory.STANDARD },
      { description: "Onboarding workshop", quantity: 2, unitPrice: 1800, taxCategory: TaxCategory.STANDARD },
      { description: "Reimbursed travel", quantity: 1, unitPrice: 642.35, taxCategory: TaxCategory.EXEMPT },
    ],
  };
}
