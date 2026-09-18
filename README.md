# mobx-sentinel

[![push](https://github.com/creasty/mobx-sentinel/actions/workflows/push.yml/badge.svg)](https://github.com/creasty/mobx-sentinel/actions/workflows/push.yml)
[![codecov](https://codecov.io/gh/creasty/mobx-sentinel/graph/badge.svg?token=K6D0I95Y91)](https://codecov.io/gh/creasty/mobx-sentinel)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> [!CAUTION]
> This library is currently in the early stage of development. User interface is subject to change without notice.

MobX library for non-intrusive class-based model enhancement. Acting as a sentinel, it provides change detection, reactive validation, and form integration capabilities without contamination.

The documentation lives at **[mobx-sentinel.creasty.com](https://mobx-sentinel.creasty.com)**: why the library exists and how it compares, [guides](https://mobx-sentinel.creasty.com/docs/) to each package, and the [API reference](https://mobx-sentinel.creasty.com/apis/).

[apps/example/](./apps/example) is a working invoice editor built with it, deployed at [example.mobx-sentinel.creasty.com](https://example.mobx-sentinel.creasty.com).

## Packages

### `core` — Core functionality like Watcher and Validator [(read more)](https://mobx-sentinel.creasty.com/docs/core/)

<pre><code>npm install --save <b>@mobx-sentinel/core</b></code></pre>

[![npm version](https://badge.fury.io/js/@mobx-sentinel%2Fcore.svg)](https://www.npmjs.com/package/@mobx-sentinel/core)
[![npm size](https://img.shields.io/bundlephobia/min/@mobx-sentinel/core)](https://bundlephobia.com/package/@mobx-sentinel/core)
![target: nodejs, browser](https://img.shields.io/badge/nodejs%2C%20browser-_?label=target&color=007ec6)

- `@nested` annotation for tracking nested models.
  - `@nested` annotation supports objects, boxed observables, arrays, sets, and maps.
  - `@nested.hoist` annotation can be used to hoist sub-fields in a nested model to the parent model.
  - `StandardNestedFetcher` (low-level API) provides a simple but powerful mechanism for tracking and retrieving nested models. Allowing other modules (even your own code) to integrate nested models into their logic without hassle.
- `Watcher` detects changes in models automatically.
  - All `@observable` annotations are automatically watched by default, and `@computed` ones when `@watch` is added.
  - `@watch` annotation can be used where `@observable` is not applicable.<br>
    e.g., on private fields: `@watch #private = observable.box(0)`
  - `@watch.ref` annotation can be used to watch values with identity comparison, in contrast to the default behavior which uses shallow comparison.
  - `@unwatch` annotation and `unwatch(() => ...)` function disable change detection when you need to modify values silently.
- `Validator` and `makeValidatable` provides reactive model validation.
  - Composable from multiple sources.
  - Both sync and async validations are supported.
  - Async validations feature smart job scheduling and are cancellable with [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal).

### `form` — Form and bindings [(read more)](https://mobx-sentinel.creasty.com/docs/form/)

<pre><code>npm install --save <b>@mobx-sentinel/form</b></code></pre>

[![npm version](https://badge.fury.io/js/@mobx-sentinel%2Fform.svg)](https://www.npmjs.com/package/@mobx-sentinel/form)
[![npm size](https://img.shields.io/bundlephobia/min/@mobx-sentinel/form)](https://bundlephobia.com/package/@mobx-sentinel/form)
![target: nodejs, browser](https://img.shields.io/badge/nodejs%2C%20browser-_?label=target&color=007ec6)

- Asynchronous submission
  - Composable from multiple sources.
  - Cancellable with [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal).
- Nested and dynamic (array) forms
  - Works by mutating models directly.
  - Forms are created independently; they don't need to be aware of each other.
- Custom bindings
  - Flexible and easy-to-create.
  - Most cases can be implemented in less than 50 lines.
- Smart error reporting [(read more)](https://mobx-sentinel.creasty.com/docs/form/error-reporting/)
  - Validation is always up to date; reporting decides when users see the errors.
  - Errors wait until the user leaves a field or pauses typing, then follow every fix.
  - Fields and sub-forms that appear later start clean, even after the whole form has been reported.

### `react` — Standard bindings and hooks for React [(read more)](https://mobx-sentinel.creasty.com/docs/react/)

<pre><code>npm install --save <b>@mobx-sentinel/react</b></code></pre>

[![npm version](https://badge.fury.io/js/@mobx-sentinel%2Freact.svg)](https://www.npmjs.com/package/@mobx-sentinel/react)
[![npm size](https://img.shields.io/bundlephobia/min/@mobx-sentinel/react)](https://bundlephobia.com/package/@mobx-sentinel/react)
![target: browser](https://img.shields.io/badge/browser-_?label=target&color=007ec6)

- React hooks that automatically handle component lifecycle under the hood.
- Standard bindings for most common form elements.
