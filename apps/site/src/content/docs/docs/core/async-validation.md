---
title: "Asynchronous Validation"
description: "Validate with async handlers that are throttled and can be aborted."
sidebar:
  order: 5
---

Async validations are throttled like sync validations, and changes made while one is running are queued.

**Behaviors**:
- Jobs are throttled like sync validators (default 100ms delay)
- **Changes during a running validation are queued, not aborted**: The running handler completes, and the latest value is validated after it settles. If the change's delay has already passed by then, it is validated `delayMs` after the handler settles; otherwise, when its delay ends. Intermediate values are skipped
- The result of the running validation is currently applied when it settles, so an error for the earlier value may show briefly until the latest value has been validated
- The `abortSignal` is aborted when the validator is reset (`validator.reset()`) or the handler is removed (by calling the function returned from `addAsyncHandler()` or `addValidation()`). The result of an aborted run is discarded, so errors it collected are not applied, even if the handler ignores the signal
- Use the signal with `fetch()` and other async APIs to cancel in-flight requests in those cases

**Error handling**:
- Errors thrown in async handlers are logged to the console but don't break validation
- The validation state transitions continue normally even when errors occur
- This ensures one buggy validator doesn't break the entire validation system

```typescript
class UserModel {
  @observable username = "";

  constructor() {
    makeObservable(this);

    addValidation(
      this,
      () => this.username,
      async (username, builder, abortSignal) => {
        // The signal is aborted by validator.reset() or by removing the handler
        const response = await fetch(`/api/check-username/${username}`, {
          signal: abortSignal
        });

        if (!response.ok) {
          builder.invalidate("username", "Username already taken");
        }
      },
      { initialRun: false }
    );
  }
}

const user = new UserModel();
const validator = Validator.get(user);

runInAction(() => {
  user.username = "john";
});
runInAction(() => {
  user.username = "jane"; // Both changes fall within the same delay: only "jane" is validated
});

// Check validation state
validator.isValidating // true
validator.reactionState // 1 (waiting for the delay)
validator.asyncState // 0 (the job starts after the delay)

await when(() => validator.asyncState > 0); // "jane" is being validated

runInAction(() => {
  user.username = "jake"; // Does not abort "jane": "jake" is validated after it settles
});

await validator.waitForValidation();

// The validation completed successfully
validator.isValid // true or false depending on the result
```
