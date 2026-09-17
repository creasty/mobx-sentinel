# mobx-sentinel/form

[![npm version](https://badge.fury.io/js/@mobx-sentinel%2Fform.svg)](https://www.npmjs.com/package/@mobx-sentinel/form)
[![npm size](https://img.shields.io/bundlephobia/min/@mobx-sentinel/form)](https://bundlephobia.com/package/@mobx-sentinel/form)
![target: nodejs, browser](https://img.shields.io/badge/nodejs%2C%20browser-_?label=target&color=007ec6)

Form and bindings for MobX-based form management with validation and submission handling.

Documentation: [guide](https://mobx-sentinel.creasty.com/docs/form/) · [API reference](https://mobx-sentinel.creasty.com/apis/form/)

<pre><code>npm install --save <b>@mobx-sentinel/form</b></code></pre>

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
