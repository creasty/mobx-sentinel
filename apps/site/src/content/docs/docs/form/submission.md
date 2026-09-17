---
title: "Submission"
description: "Add submission handlers, follow a submission's lifecycle, and cancel one."
sidebar:
  order: 2
---

## Submitting Forms

Forms manage the complete submission lifecycle with three phases, each with its own handlers: `willSubmit` decides whether to go ahead, `submit` does the work and reports whether it succeeded, and `didSubmit` reacts to the outcome.

```ts
// Basic submission (resolves `false` without running any handler unless `canSubmit` is true)
const succeed = await form.submit();

// Force submission even if not ready (cancels a submission in progress)
await form.submit({ force: true });
```

### Adding Submission Handlers

Handlers are executed in registration order:

```ts
// Before submitting: veto or prepare the submission
const dispose1 = form.addHandler('willSubmit', async () => {
  console.log('Submitting...');
  return confirm('Save changes?'); // false stops the submission (it fails)
});

// Perform the submission and report whether it succeeded (executed serially)
const dispose2 = form.addHandler('submit', async (abortSignal) => {
  try {
    await api.saveUser(model, { signal: abortSignal }); // cancels the request when a newer submission replaces this one
    return true; // succeeded
  } catch (error) {
    console.error(error);
    return false; // failed
  }
});

// After submitting: react to the outcome
const dispose3 = form.addHandler('didSubmit', (succeed) => {
  if (succeed) {
    showToast('Saved successfully!');
  } else {
    form.reportError();
  }
});

// Remove handlers when done
dispose1();
dispose2();
dispose3();
```

### Submission Lifecycle

The submission process executes handlers in three phases:

1. **`willSubmit`** - A veto or preparation step before anything is submitted, and a place to log the attempt. Handlers run **serially** (one after another) in registration order. If a handler returns `false` or throws, the remaining handlers and the `submit` phase are skipped and the submission fails.

2. **`submit`** - Performs the submission. Handlers run **serially** in registration order, and each returns whether the submission succeeded. If a handler returns `false` or throws, the remaining handlers are skipped and the submission fails.

3. **`didSubmit`** - Called once with the outcome (`true` if the submission succeeded) after a submission finishes, unless a newer submission cancelled it. Use it for what follows the submission, for example:
    - Showing a completion snackbar or toast
    - Closing a modal or drawer after submission
    - Syncing local state that lives outside the form or model (typically in the component)
    - Logging
    - Moving to the next UI state, or presenting another model that takes this form's result as input
    - Saving a snapshot after submission (e.g. for drafts or autosave)

    These handlers run synchronously within a MobX action.

After a successful submission, the form resets automatically (clearing dirty state and field states).

### What a `submit` Handler Returns

The boolean a `submit` handler returns reports whether the submission succeeded. It becomes the outcome `didSubmit` handlers receive (with several `submit` handlers, `true` only if every one of them returns `true`), and the form resets automatically only when the outcome is `true`. It is meaningful even without any async work: return `false` whenever the submission did not go through, e.g. when the server rejects the data or a precondition does not hold.

The return value is not how a handler stops a cancelled submission; the form enforces cancellation itself (see [Cancelling a Submission](#cancelling-a-submission)). Fallback or cleanup specific to the request belongs in the handler's own `try`/`catch`, with `finally` for cleanup that must always run.

### Passing a Result On

`didSubmit` handlers receive only the boolean. When the next step needs what the submission produced, such as the created record or its ID, have the `submit` handler store it where the `didSubmit` handler or the component can read it:

```ts
let createdUserId: string | null = null;

form.addHandler('submit', async (abortSignal) => {
  const user = await api.saveUser(model, { signal: abortSignal });
  createdUserId = user.id; // keep the result for the next step
  return true;
});

form.addHandler('didSubmit', (succeed) => {
  if (succeed && createdUserId) openUserPage(createdUserId);
});
```

### Cancelling a Submission

Calling `form.submit({ force: true })` while a submission is in progress cancels it: its `AbortSignal` is aborted and a new submission starts. The cancelled submission invokes no further `willSubmit` or `submit` handlers, resolves `false` whatever its handlers return, and neither calls `didSubmit` handlers nor resets the form, while `isSubmitting` stays `true` until the latest submission settles. The latest submission reports the outcome, so `didSubmit` is called once for it, even if the cancelled submission settles later.

The handler that is running when the submission is cancelled is not interrupted, so pass the signal to its async work (e.g. `fetch(url, { signal })`) to cancel that work too. Since `didSubmit` is not called for a cancelled submission, release anything a handler acquired in a `finally` block inside that handler.
