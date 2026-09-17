---
title: "Smart Error Reporting"
description: "When users see validation errors, and how to adjust it."
sidebar:
  order: 4
---

A form is usually invalid long before the user has done anything wrong: required fields start out empty, and an email address stays invalid until its last character is typed. Showing every error the moment it exists scolds users for steps they have not reached yet; holding every error back until submission leaves them guessing.

The form keeps two concerns apart:

- **Validation** belongs to the model. It runs reactively as the model changes, so `form.isValid`, `form.canSubmit`, `field.hasErrors` and `field.errors` are always up to date — enough to disable a submit button or skip an autosave without showing the user anything.
- **Reporting** belongs to the form. For each field, it decides *when* those errors are revealed, based on how the user has interacted with the field. `field.isErrorReported`, `form.getErrors()` and the `aria-invalid` attribute set by the bindings follow it.

## What the User Sees

The standard bindings of [`@mobx-sentinel/react`](/docs/react/) behave as follows. You can try each step in the [example app](https://example.mobx-sentinel.creasty.com).

| When the user... | They see |
| --- | --- |
| opens a form that starts out invalid | No errors. The submit button is disabled, but no field is marked invalid. |
| moves through fields without changing them | No errors. Focusing a field does not report it. |
| starts typing into a text field | No errors while typing. |
| leaves the field, or stops typing for 3 seconds | The errors of that field. |
| picks an option in a checkbox, radio button or select box | The errors of that field, right away. |
| keeps editing a field whose errors have been shown | Errors that follow the value: a fix clears the error as soon as validation confirms it, and a new mistake shows up the same way. |
| hovers the submit button, even while it is disabled | Every outstanding error of the form and its sub-forms. |
| then reveals another field or adds another item | No errors on the new field or item until the user works on it, or until the form reports again. |
| submits successfully, or the form is reset | No errors. Reporting starts over. |

## Intermediate and Final Changes

A text input cannot tell when the user is done, so `InputBinding` and `TextAreaBinding` mark every keystroke as an **intermediate** change — a value that may still be incomplete, like `user@` in an email field — and report nothing yet. The change becomes **final**, and the field's errors are reported, when either:

- the user leaves the field (`onBlur` calls `field.finalizeChangeIfNeeded()`), or
- the user stops typing for [`autoFinalizationDelayMs`](/docs/form/configuration/), 3 seconds by default. Every keystroke restarts the timer, so users who never leave the field, such as on the last field before a disabled submit button, still get feedback.

Checkboxes, radio buttons and select boxes cannot hold a partial value, so their bindings make a final change right away (`field.markAsChanged()`).

Focusing a field marks it as touched (`field.isTouched`) but reports nothing. Leaving a field without changing it reports nothing either, since `finalizeChangeIfNeeded()` only acts on a pending intermediate change. A user who tabs through the form to get an overview does not turn it red.

## Errors Follow the Value Once Shown

A reported field stays reported until the form is reset, and from then on its errors follow every change, intermediate ones included. When the user fixes a mistake, the error disappears as soon as validation confirms the fix, so users learn right away that they got it right instead of when they leave the field. A new mistake in that field shows up the same way, while the user is still typing.

## Reporting the Whole Form

`form.reportError()` reports every field of the form and, recursively, of its sub-forms. Call it when users need to see everything that stands in their way:

- `SubmitButtonBinding` calls it when the pointer moves over the button. The button is disabled while the form is invalid, so hovering it is exactly when users wonder why, and they get the answer before they try to click.
- A `didSubmit` handler can call it when a submission fails, for example after the errors returned by the server have been fed back into the model.

Reporting is an action, not a mode: it covers the fields and sub-forms that exist when it is called. A field exists once a binding, `form.getField()` or `form.getErrors()` has asked for it — in a React app, once it has been rendered. Anything that comes later starts unreported:

- a field revealed afterwards, e.g., a "Due date" input that appears when "Custom" payment terms are selected;
- a sub-form added afterwards, e.g., an invoice line added with "Add a line".

A line the user has just added therefore does not open with "Description is required". Its fields are reported by the user's own changes, or by the next `form.reportError()`, such as when the user hovers the submit button again.

## Nested and Array Forms

Each nested object and array element has its own form (`Form.get(invoice.billTo)`, `Form.get(invoice.lineItems[0])`) with its own reporting state. Nothing has to be passed between them: the parent finds its sub-forms through the `@nested` annotation of the model.

- **Reports travel downwards only.** `form.reportError()` on the parent reaches every sub-form, while reporting a sub-form, or finishing a change in one of its fields, leaves the parent and the sibling sub-forms untouched.
- **Sub-forms added later defer their reporting.** A sub-form that did not exist when the parent reported waits for its own report: the user's changes in it, or the parent's next `reportError()`.

## Waiting for Validation to Settle

Validation handlers are throttled (100 ms by default), and asynchronous handlers can take much longer. Reporting right away could flash a result computed for an older value: an error that is about to go away, or a clean state that a server-side check is about to overturn.

So when a field becomes reported, `field.isErrorReported` stays `undefined` until the validator of its form, including nested validators and asynchronous handlers, has settled. Only then does it show the result. After that, errors change only when new results arrive, so an error is not cleared while its revalidation is still running and does not blink off and on while the user types.

## Accessibility

`field.isErrorReported` is `undefined` until the field is reported, and `true` or `false` afterwards, which maps directly onto `aria-invalid`: the attribute is omitted until the field is reported. The standard bindings pass it through as is, so assistive technologies learn about an error at the same moment sighted users see it.

## Adjusting the Behavior

The behavior is split between the bindings and a few methods of `FormField`, so each part can be changed where it is needed:

- **The pause before intermediate input is reported:** `configureForm({ autoFinalizationDelayMs })` for all forms, or `form.configure({ autoFinalizationDelayMs })` for one form.
- **Reporting on every keystroke:** in a [custom binding](/docs/form/custom-bindings/), call `field.markAsChanged()` (a final change) in `onChange` instead of `field.markAsChanged('intermediate')`.
- **Reporting from your own code:** `field.reportError()` for one field, `form.reportError()` for the whole form.
- **Showing errors regardless of reporting:** `form.getErrors(fieldName, true)` or `field.errors`.
- **Starting over:** `form.reset()` clears the reporting state of every field and sub-form, and runs automatically after a successful submission. The validator keeps its errors; they stay hidden until they are reported again.
- **Letting keyboard users find out what is wrong:** revealing errors on hover needs a pointer, and a disabled button can't be focused with the keyboard. To keep the button enabled, allow invalid submissions and report the errors from a `willSubmit` handler that cancels the submission:

  ```ts
  form.configure({ allowSubmitInvalid: true });
  form.addHandler('willSubmit', async () => {
    if (form.isValid) return true;
    form.reportError();
    return false;
  });
  ```

## How It Differs from Other Libraries

Popular form libraries decide when an error appears in one of two ways. Some run validation on chosen events and show whatever the last run found: React Hook Form's `mode`, VeeValidate's `validateOn*` options, TanStack Form's per-event validators. Others validate on every change and leave the decision to a display condition that the app writes from flags such as `touched` or `submitFailed`: Formik, Final Form, Angular. mobx-sentinel validates continuously, like the latter, but makes the display decision itself and keeps it per field as `isErrorReported`.

Compared with the defaults and documented setups of those libraries (checked in September 2026 against React Hook Form 7, Formik 2, Final Form 5, TanStack Form 1, VeeValidate 4, Angular 22, mobx-react-form 7 and formstate):

- **Moving through a form is not a mistake.** When leaving a field is enough to show its errors, as with the `touched` conditions recommended by Formik, Final Form and Angular, VeeValidate's `<Field>`, React Hook Form's `onBlur` and `onTouched` modes, and mobx-react-form's defaults, tabbing past an empty required field flags it. Here, a field is reported only after its value has changed, or when the whole form is reported.
- **Typing is not finishing.** When errors follow `change`, an email address is flagged from its first keystroke; when they follow `blur`, users who stop typing without leaving the field get no feedback. The standard bindings report on whichever comes first: leaving the field, or a pause. React Hook Form's opt-in `delayError` comes closest, holding errors back for a set time and removing them instantly. Otherwise, the nearest options debounce validation itself, as formstate and mobx-react-form do, which holds back the validity along with the message.
- **Reporting is not a mode.** A submission often changes how the whole form behaves. React Hook Form validates on every change once the form has been submitted (`reValidateMode`), and TanStack Form's `revalidateLogic` switches to `modeAfterSubmission`. Display conditions built on form-wide flags, like Final Form's `submitFailed` or the `form.submitted` check in Angular Material's default error state matcher, show errors on fields that appear later, before the user has touched them. Formik's submit marks every key in `values` as touched, so a conditional field whose key is in `initialValues` shows its error the moment it appears. Here, `form.reportError()` covers what exists when it is called, and fields and sub-forms that appear later still wait for the user.
- **Errors don't blink while validation catches up.** A report waits for pending validation, asynchronous handlers and nested models included, and an error already on screen stays until its revalidation has finished. Elsewhere, an asynchronous error can vanish while its check is still running: Angular replaces errors with the synchronous result on every change, Final Form's field-level async validators clear the error on the next change, and mobx-react-form resets errors before each validation run by default.
- **A disabled submit button explains itself.** Libraries usually reveal hidden errors when a submission is attempted (Formik, for example, touches every field on submit), so the button has to stay clickable for users to find out what is wrong. `SubmitButtonBinding` keeps the button disabled until the form can be submitted and reports every error when the pointer moves over it. For keyboard users, see [Adjusting the Behavior](#adjusting-the-behavior).

These defaults follow widely cited guidance on inline validation: wait until users have finished with a field before showing its errors ([Nielsen Norman Group](https://www.nngroup.com/articles/errors-forms-design-guidelines/)), don't flag fields they have only tabbed through ([Smashing Magazine](https://www.smashingmagazine.com/2022/09/inline-validation-web-forms-ux/)), and once an error is shown, update it as they correct the input ([Baymard Institute](https://baymard.com/blog/inline-form-validation)).
