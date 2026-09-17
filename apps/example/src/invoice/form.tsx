import "@mobx-sentinel/react/extension";
import { KeyPath } from "@mobx-sentinel/core";
import { Form } from "@mobx-sentinel/form";
import { renderRadioGroup, useFormHandler } from "@mobx-sentinel/react";
import { reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import * as api from "@/invoice/api";
import {
  COUNTRIES,
  CountryCode,
  CURRENCIES,
  CurrencyCode,
  formatDate,
  formatMoney,
  PAYMENT_TERMS,
  PaymentTerms,
  TAX_CATEGORIES,
  TaxCategory,
  toDateInput,
  today,
} from "@/invoice/catalog";
import { Invoice, LineItem, MAX_CC_RECIPIENTS, MAX_MEMO_LENGTH, PostalAddress } from "@/invoice/models";

export const InvoiceForm: React.FC<{ model: Invoice }> = observer(({ model }) => {
  // One line to attach a form to a model. No provider, no context, no schema.
  const form = Form.get(model);

  const [issued, setIssued] = useState<string | null>(null);

  // `submit` handlers run serially, receive an AbortSignal, and return whether the
  // submission succeeded. `didSubmit` receives that boolean, and the form resets
  // itself only on `true`.
  useFormHandler(form, "submit", async (abortSignal) => {
    const result = await api.submitInvoice(model.toJSON(), abortSignal);
    if (!result.ok) {
      // The server found something the client could not: feed it back into the
      // model, where it becomes an ordinary validation error.
      model.rejectPurchaseOrder(result.conflict);
      return false;
    }
    // `didSubmit` only learns the outcome, so keep what the next step needs here.
    setIssued(result.invoiceNumber);
    return true;
  });

  // `didSubmit` receives the outcome once the submission finishes, successful or not.
  useFormHandler(form, "didSubmit", (succeed) => {
    if (!succeed) form.reportError();
  });

  return (
    <article>
      <header>
        <InvoiceHeader model={model} />
      </header>

      {issued && (
        <p className="receipt" role="status">
          Sent as <b>{issued}</b>. The form reset itself, so it is no longer dirty.
        </p>
      )}

      <h4>Customer</h4>
      <CustomerFields model={model} />

      <h4>Terms</h4>
      <TermsFields model={model} />

      <h4 {...form.bindLabel(["billTo"])}>Bill to</h4>
      {/* A nested model gets its own form. The parent does not pass anything down. */}
      <AddressForm model={model.billTo} />

      <h4 {...form.bindLabel(["lineItems"])}>Line items</h4>
      <ErrorText errors={form.getErrors("lineItems")} />
      {model.lineItems.map((item) => (
        <LineItemForm
          key={item.id}
          model={item}
          currency={model.currency}
          onDuplicate={() => model.duplicateLineItem(item)}
          onDelete={model.lineItems.length > 1 ? () => model.removeLineItem(item) : undefined}
        />
      ))}
      <button className="secondary" onClick={model.addLineItem}>
        Add a line
      </button>
      <Totals model={model} />

      <h4>Memo</h4>
      <MemoField model={model} />

      <hr />

      <div className="field">
        <label>
          <input
            {...form.bindCheckBox("amountsConfirmed", {
              getter: () => model.amountsConfirmed,
              setter: (v) => (model.amountsConfirmed = v),
            })}
          />
          I have reviewed the amounts above
        </label>
        <ErrorText errors={form.getErrors("amountsConfirmed")} />
      </div>

      <FormActions model={model} />
    </article>
  );
});

const InvoiceHeader: React.FC<{ model: Invoice }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <div className="invoice-header">
      <div>
        <strong>{model.customerName || "New invoice"}</strong>
        <br />
        <small>
          {model.dueOn ? `Due ${formatDate(model.dueOn)}` : "No due date yet"} · {model.lineItems.length} line
          {model.lineItems.length === 1 ? "" : "s"}
        </small>
      </div>
      <div className="invoice-header-status">
        <strong>{model.formattedTotal}</strong>
        <br />
        {/* `isDirty` comes from the Watcher; nothing in the model had to report it. */}
        <small>{form.isDirty ? "Unsaved changes" : "No changes"}</small>
      </div>
    </div>
  );
});

const CustomerFields: React.FC<{ model: Invoice }> = observer(({ model }) => {
  const form = Form.get(model);
  const [lookingUp, setLookingUp] = useState(false);

  const fillFromCrm = async () => {
    setLookingUp(true);
    try {
      const customer = await api.findCustomer(model.customerEmail);
      if (customer) model.applyCustomer(customer);
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <>
      <div className="field">
        <label {...form.bindLabel(["customerEmail"])}>Billing contact</label>
        <div className="row">
          <input
            placeholder={api.KNOWN_CUSTOMER_EMAILS[0]}
            {...form.bindInput("customerEmail", {
              type: "email",
              getter: () => model.customerEmail,
              setter: (v) => (model.customerEmail = v),
            })}
          />
          <button className="outline secondary" aria-busy={lookingUp} onClick={fillFromCrm}>
            Look up
          </button>
        </div>
        <ErrorText errors={form.getErrors("customerEmail")} />
        <small>
          {/* `asyncState` counts this model's in-flight async validations — here, the CRM lookup. */}
          {form.validator.asyncState > 0
            ? "Checking the CRM…"
            : `Known to the CRM: ${api.KNOWN_CUSTOMER_EMAILS.join(", ")}. Anything else is rejected asynchronously.`}
        </small>
      </div>

      <div className="row">
        <div className="field">
          <label {...form.bindLabel(["customerName"])}>Customer name</label>
          <input
            {...form.bindInput("customerName", {
              getter: () => model.customerName,
              setter: (v) => (model.customerName = v),
            })}
          />
          <ErrorText errors={form.getErrors("customerName")} />
        </div>

        <div className="field">
          <label {...form.bindLabel(["purchaseOrderNumber"])}>Purchase order (optional)</label>
          <input
            placeholder="PO-1234"
            {...form.bindInput("purchaseOrderNumber", {
              getter: () => model.purchaseOrderNumber,
              setter: (v) => (model.purchaseOrderNumber = v),
            })}
          />
          <ErrorText errors={form.getErrors("purchaseOrderNumber")} />
        </div>
      </div>
    </>
  );
});

const TermsFields: React.FC<{ model: Invoice }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <>
      <div className="row">
        <div className="field">
          <label {...form.bindLabel(["currency"])}>Currency</label>
          <select
            {...form.bindSelectBox("currency", {
              getter: () => model.currency,
              setter: (v) => (model.currency = v as CurrencyCode),
            })}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label {...form.bindLabel(["issuedOn"])}>Issue date</label>
          <input
            {...form.bindInput("issuedOn", {
              valueAs: "date",
              getter: () => toDateInput(model.issuedOn),
              setter: (v) => (model.issuedOn = v ?? today()),
            })}
          />
          <ErrorText errors={form.getErrors("issuedOn")} />
        </div>
      </div>

      <fieldset className="field">
        <label {...form.bindLabel(["paymentTerms"])}>Payment terms</label>
        <div className="choices">
          {/* The options are typed after the getter: the setter receives a PaymentTerms, with no cast. */}
          {renderRadioGroup({
            binding: form.bindRadioGroup("paymentTerms", {
              getter: () => model.paymentTerms,
              setter: (v) => (model.paymentTerms = v),
            }),
            options: Object.values(PaymentTerms),
            renderOption: (terms, bind, i) => (
              <label>
                <input {...bind({ id: i === 0 })} /> {PAYMENT_TERMS[terms].label}
              </label>
            ),
          })}
        </div>
      </fieldset>

      {/* Conditional rules live in the model; the UI only has to follow along. */}
      {model.paymentTerms === PaymentTerms.CUSTOM && (
        <div className="field">
          <label {...form.bindLabel(["customDueOn"])}>Due date</label>
          <input
            {...form.bindInput("customDueOn", {
              valueAs: "date",
              getter: () => toDateInput(model.customDueOn),
              setter: (v) => (model.customDueOn = v),
            })}
          />
          <ErrorText errors={form.getErrors("customDueOn")} />
        </div>
      )}

      <div className="field">
        <label {...form.bindLabel(["ccRecipients"])}>Notify (up to {MAX_CC_RECIPIENTS})</label>
        <select
          size={api.TEAM_MEMBERS.length}
          {...form.bindSelectBox("ccRecipients", {
            multiple: true,
            getter: () => model.ccRecipients,
            setter: (v) => (model.ccRecipients = v),
          })}
        >
          {api.TEAM_MEMBERS.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        <ErrorText errors={form.getErrors("ccRecipients")} />
      </div>
    </>
  );
});

/**
 * A sub-form for a nested model.
 *
 * It takes the model, not the parent form: forms are looked up per model and
 * are completely independent of one another.
 */
const AddressForm: React.FC<{ model: PostalAddress }> = observer(({ model }) => {
  const form = Form.get(model);
  const rules = COUNTRIES[model.country];

  return (
    <div className="sub-form">
      <div className="field">
        <label {...form.bindLabel(["line1", "line2"])}>Street address</label>
        <input
          {...form.bindInput("line1", {
            getter: () => model.line1,
            setter: (v) => (model.line1 = v),
          })}
        />
        <ErrorText errors={form.getErrors("line1")} />
        <input
          placeholder="Apartment, suite, floor (optional)"
          {...form.bindInput("line2", {
            getter: () => model.line2,
            setter: (v) => (model.line2 = v),
          })}
        />
      </div>

      <div className="row">
        <div className="field">
          <label {...form.bindLabel(["country"])}>Country</label>
          <select
            {...form.bindSelectBox("country", {
              getter: () => model.country,
              setter: (v) => (model.country = v as CountryCode),
            })}
          >
            {Object.entries(COUNTRIES).map(([code, country]) => (
              <option key={code} value={code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label {...form.bindLabel(["city"])}>City</label>
          <input
            {...form.bindInput("city", {
              getter: () => model.city,
              setter: (v) => (model.city = v),
            })}
          />
          <ErrorText errors={form.getErrors("city")} />
        </div>
      </div>

      <div className="row">
        <div className="field">
          {/* Labels and rules follow the selected country. */}
          <label {...form.bindLabel(["region"])}>{rules.region.label}</label>
          <input
            {...form.bindInput("region", {
              getter: () => model.region,
              setter: (v) => (model.region = v),
            })}
          />
          <ErrorText errors={form.getErrors("region")} />
        </div>

        <div className="field">
          <label {...form.bindLabel(["postalCode"])}>{rules.postalCode.label}</label>
          <input
            placeholder={rules.postalCode.example}
            {...form.bindInput("postalCode", {
              getter: () => model.postalCode,
              setter: (v) => (model.postalCode = v),
            })}
          />
          <ErrorText errors={form.getErrors("postalCode")} />
        </div>
      </div>
    </div>
  );
});

const LineItemForm: React.FC<{
  model: LineItem;
  currency: CurrencyCode;
  onDuplicate: () => void;
  onDelete?: () => void;
}> = observer(({ model, currency, onDuplicate, onDelete }) => {
  const form = Form.get(model);

  return (
    <div className="sub-form">
      <div className="row">
        <div className="field wide">
          <label {...form.bindLabel(["description"])}>Description</label>
          <input
            {...form.bindInput("description", {
              getter: () => model.description,
              setter: (v) => (model.description = v),
            })}
          />
          <ErrorText errors={form.getErrors("description")} />
        </div>

        <div className="field">
          <label {...form.bindLabel(["quantity"])}>Qty</label>
          <input
            {...form.bindInput("quantity", {
              valueAs: "number",
              getter: () => model.quantity,
              setter: (v) => (model.quantity = v ?? 0),
            })}
          />
          <ErrorText errors={form.getErrors("quantity")} />
        </div>

        <div className="field">
          <label {...form.bindLabel(["unitPrice"])}>Unit price</label>
          <input
            {...form.bindInput("unitPrice", {
              valueAs: "number",
              getter: () => model.unitPrice,
              setter: (v) => (model.unitPrice = v),
            })}
          />
          <ErrorText errors={form.getErrors("unitPrice")} />
        </div>

        <div className="field">
          <label {...form.bindLabel(["taxCategory"])}>Tax</label>
          <select
            {...form.bindSelectBox("taxCategory", {
              getter: () => model.taxCategory,
              setter: (v) => (model.taxCategory = v as TaxCategory),
            })}
          >
            {Object.values(TaxCategory).map((category) => (
              <option key={category} value={category}>
                {TAX_CATEGORIES[category].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="line-item-footer">
        <ErrorText errors={selfErrors(form)} />
        <span>{formatMoney(model.amount, currency)}</span>
        <button className="outline secondary" onClick={onDuplicate}>
          Duplicate
        </button>
        <button className="outline secondary" onClick={onDelete} disabled={!onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
});

const Totals: React.FC<{ model: Invoice }> = observer(({ model }) => (
  <table className="totals">
    <tbody>
      <tr>
        <th scope="row">Subtotal</th>
        <td>{formatMoney(model.subtotal, model.currency)}</td>
      </tr>
      <tr>
        <th scope="row">Tax</th>
        <td>{formatMoney(model.taxAmount, model.currency)}</td>
      </tr>
      <tr>
        <th scope="row">Total</th>
        <td>
          <b>{model.formattedTotal}</b>
        </td>
      </tr>
    </tbody>
  </table>
));

const MemoField: React.FC<{ model: Invoice }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <div className="field">
      <textarea
        rows={3}
        placeholder="Anything the customer's accounts payable team should know"
        {...form.bindTextArea("memo", {
          getter: () => model.memo,
          setter: (v) => (model.memo = v),
        })}
      />
      <ErrorText errors={form.getErrors("memo")} />
      <small>{MAX_MEMO_LENGTH - model.memo.length} characters left</small>
    </div>
  );
});

const FormActions: React.FC<{ model: Invoice }> = observer(({ model }) => {
  const form = Form.get(model);
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);

  // `changedTick` increments on every detected change — the hook every
  // autosave, undo stack or sync loop needs, without touching the model.
  useEffect(
    () =>
      reaction(
        () => form.watcher.changedTick,
        () => setAutosavedAt(new Date().toLocaleTimeString()),
        { delay: 1000 }
      ),
    [form]
  );

  return (
    <>
      <div className="grid">
        <button className="outline secondary" onClick={model.restoreDraft}>
          Restore draft
        </button>
        <button className="outline secondary" onClick={form.reset}>
          Reset form state
        </button>
        {/* Disabled until the form is valid and idle, and with `disableUnlessDirty`, dirty.
            Sending resets the form, so the same invoice can't be sent twice.
            Hovering it reveals every outstanding error. */}
        <button {...form.bindSubmitButton({ disableUnlessDirty: true })}>
          {form.isSubmitting ? "Sending…" : "Send invoice"}
        </button>
      </div>

      <p className="hints">
        <small>
          {autosavedAt ? <>Draft autosaved at {autosavedAt}. </> : null}
          Hover the disabled button to reveal every outstanding error. <i>Restore draft</i> hydrates the model inside{" "}
          <code>unwatch()</code>, so the form stays pristine until you change something yourself.{" "}
          <i>Reset form state</i> clears the Watcher and the error reporting state — it does not touch the model.
        </small>
      </p>
    </>
  );
});

/**
 * Errors reported with `builder.invalidateSelf()`.
 *
 * They belong to the object rather than to one of its fields, so they are
 * filed under `KeyPath.Self` instead of under a field name.
 */
function selfErrors(form: Form<object>): ReadonlySet<string> {
  const messages = new Set<string>();
  for (const [keyPath, error] of form.validator.findErrors(KeyPath.Self)) {
    if (KeyPath.isSelf(keyPath)) messages.add(error.message);
  }
  return messages;
}

const ErrorText: React.FC<{ errors: ReadonlySet<string> }> = observer(({ errors }) => (
  <>
    {Array.from(errors, (error, i) => (
      <small className="error" key={i}>
        {error}
      </small>
    ))}
  </>
));
