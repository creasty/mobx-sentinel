# mobx-sentinel

[![push](https://github.com/creasty/mobx-sentinel/actions/workflows/push.yml/badge.svg)](https://github.com/creasty/mobx-sentinel/actions/workflows/push.yml)
[![codecov](https://codecov.io/gh/creasty/mobx-sentinel/graph/badge.svg?token=K6D0I95Y91)](https://codecov.io/gh/creasty/mobx-sentinel)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> [!CAUTION]
> This library is currently in the early stage of development. User interface is subject to change without notice.

A TypeScript library for non-intrusive model enhancement in MobX applications. It provides model change detection, validation, and form integration capabilities while maintaining the purity of your domain models. Think of it as a sentinel that watches and augments your models without contaminating them.

## Motivation

TL;DR: This library provides non-intrusive change detection and validation capabilities for domain models, with form management being one of its applications. Unlike other libraries that focus on data serialization or require models to implement specific interfaces, it's designed to work with plain classes while properly separating concerns.

<details><summary>Read more on form management (English)</summary>

In the projects I'm involved with, we deal with complex domains and promote building domain models on the frontend using MobX.<br>
We needed a solution that could work with forms while assuming business logic for how data should be displayed and updated exists as class implementations.<br>
With models as a premise, most responsibilities can and should be placed on the model side.

While there are already many libraries for building forms using MobX, they are all designed from a data serialization perspective rather than modeling,
and have issues either being unable to use models (classes) or not properly separating data and form state management.<br>
Furthermore, from my research, there wasn't a single one designed to allow type-safe implementation from both model and UI ends.<br>
(Check out the [Alternatives](#alternatives) section for more details.)

Given this background, I believe there are two fundamental challenges in implementing forms:

- Form-specific state management: When considering data separately, this only involves submission and validation processing. For example:
  - Disabling the submit button based on submission status or validation errors.
  - Running validations in response to form updates.
- Input element connection (a.k.a. binding): Properly handling form state and UI events to update forms, models and UI.
  - Getting values from the model and writing back on input changes.
  - Expressing error states (red borders, displaying messages, etc.)

Additionally, showing error messages to users at appropriate times is important for user experience — _Haven't you been frustrated by UIs that show errors before you've done anything, or immediately display errors while you're still typing?_<br>
Achieving optimal experience requires coordinating multiple UI events (change, focus, blur) and states.<br>
While this is something we'd prefer to delegate to a library since it's complex to write manually, it's a major factor complicating implementation on both "form state management" and "input element connection" fronts, and many existing libraries haven't achieved proper design.

This library aims to solve these problems through a model-centric design that properly separates and minimizes form responsibilities.

</details>

<details><summary>Read more on form management (Japanese)</summary>

私が関わっているプロジェクトでは複雑なドメインを扱っており、フロントエンドでも MobX を用いてドメインモデルを作り込むことを推進している。<br>
データがどのように表示・更新されるべきかというビジネスロジックがクラス実装として存在する前提で、それをフォームでも使えるようにするソリューションを求めていた。<br>
モデルがある前提では、基本的にモデル側にほとんどの責務を持たせることができるし、そうするべきである。

すでに MobX を活用したフォーム構築のためのライブラリは多く存在しているが、どれもモデリングではなくデータシリアライズの観点で設計されており、
モデル(クラス)を使うことができないか、データとフォームの状態管理の分離が適切にできていないかのいずれかの問題がある。
さらに私の調べた限り、モデルと UI の両方から型安全に実装ができる設計になっているものは1つとして存在しなかった。<br>
(詳細は [Alternatives](#alternatives) セクションを参照)

ここまでの話を踏まえて、フォームを実装する上での本質的な課題は以下の2点であると考える。

- フォーム自体の状態管理: データを分離して考えれば、送信やバリデーション処理に関わるものだけである。例えば、
  - 送信中やエラーがある場合は送信ボタンを押せないように制御する。
  - フォームの更新に応じてバリデーションを走らせる。
- インプット要素との接続: フォームの状態と UI イベントを適切に処理し、フォームとモデルと UI をそれぞれ更新する。
  - モデルから値を取り出し、入力変化があったらモデルに書き込む。
  - エラー状態を表現する。(枠を赤くする、メッセージを表示する等)

また、エラーメッセージをユーザに適切なタイミングで表示することはユーザ体験として重要である — _何もしていないのに最初からエラーが表示されていたり、入力途中なのに即座にエラーと表示される UI にイライラしたことはないだろうか？_<br>
最適な体験を実現するためには、複数の UI イベント (change, focus, blur) や状態を組み合わせる必要がある。<br>
これを手で書くのは大変なためライブラリに任せたいところだが、「フォーム自体の状態管理」と「インプット要素との接続」の両側面で実装が複雑になる主な要因であると考えており、多くの既存ライブラリは適切な設計ができていない。

このライブラリはモデルを中心とした設計で、フォームの責務を適切に分離し最小限にすることで、これらの問題を解決しようとしている。

</details>

## Packages

### `core` — Core functionality like Watcher and Validator

<pre><code>npm install --save <b>@mobx-sentinel/core</b></code></pre>

[![npm version](https://badge.fury.io/js/@mobx-sentinel%2Fcore.svg)](https://www.npmjs.com/package/@mobx-sentinel/core)
[![npm size](https://img.shields.io/bundlephobia/min/@mobx-sentinel/core)](https://bundlephobia.com/package/@mobx-sentinel/core)
![target: nodejs, browser](https://img.shields.io/badge/nodejs%2C%20browser-_?label=target&color=007ec6)

- `@nested` annotation for tracking nested models.
  - `@nested` annotation supports objects, boxed observables, arrays, sets, and maps.
  - `@nested.hoist` annotation can be used to hoist sub-fields in a nested model to the parent model.
  - `StandardNestedFetcher` (low-level API) provides a simple but powerful mechanism for tracking and retrieving nested models. Allowing other modules (even your own code) to integrate nested models into their logic without hassle.
- `Watcher` detects changes in models automatically.
  - All `@observable` and `@computed` annotations are automatically watched by default.
  - `@watch` annotation can be used where `@observable` is not applicable.<br>
    e.g., on private fields: `@watch #private = observable.box(0)`
  - `@watch.ref` annotation can be used to watch values with identity comparison, in contrast to the default behavior which uses shallow comparison.
  - `@unwatch` annotation and `unwatch(() => ...)` function disable change detection when you need to modify values silently.
- `Validator` and `makeValidatable` provides reactive model validation.
  - Composable from multiple sources.
  - Both sync and async validations are supported.
  - Async validations feature smart job scheduling and are cancellable with [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal).

### `form` — Form and bindings

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
- Smart error reporting
  - Original validation strategy for a supreme user experience.

### `react` — Standard bindings and hooks for React

<pre><code>npm install --save <b>@mobx-sentinel/react</b></code></pre>

[![npm version](https://badge.fury.io/js/@mobx-sentinel%2Freact.svg)](https://www.npmjs.com/package/@mobx-sentinel/react)
[![npm size](https://img.shields.io/bundlephobia/min/@mobx-sentinel/react)](https://bundlephobia.com/package/@mobx-sentinel/react)
![target: browser](https://img.shields.io/badge/browser-_?label=target&color=007ec6)

- React hooks that automatically handle component lifecycle under the hood.
- Standard bindings for most common form elements.

## Design principles

- Model first
  - Assumes the existence of domain models
  - Pushes responsibilities towards the model side, minimizing form responsibilities
  - Not intended for simple data-first form implementations
- Separation of form state and model
  - No direct references between forms and models
  - Models remain uncontaminated by form logic
  - Forms don't manage data directly
- Transparent I/O
  - No hidden magic between model ↔ input element interactions
  - Makes control obvious and safe
- Modular implementation
  - Multi-package architecture with clear separation between behavior model and UI
  - Enhances testability and extensibility
- Rigorous typing
  - Maximizes use of TypeScript's type system for error detection and code completion
  - Improves development productivity

## Architecture

<details>

- `┈┈` Dashed lines indicate non-reactive, unidirectional relationships.
- `──` Solid lines indicate reactive, unidirectional relationships.
- `━━` Heavy lines indicate reactive, bidirectional relationships.

Key points:

- Watcher and Validator observe your model, and Form and FormField utilize them.
- Form has no reactive dependencies on FormField/FormBinding.
- State synchronization is only broadcast from Form to FormField (and Watcher).

```mermaid
graph TB

%%subgraph external
%%  Object((Object))
%%end

subgraph core package
  nested(["@nested"])
  StandardNestedFetcher -.-> |retrieves| nested
  %%StandardNestedFetcher -.-> |reads| Object

  watch(["@watch, @watch.ref, @unwatch"])
  Watcher -.-> |retrieves| watch
  Watcher -.-> |uses| StandardNestedFetcher
  %%Watcher --> |observes| Object

  Validator
  Validator --> |delegates| AsyncJob["AsyncJob<br>(internal)"]
  Validator -.-> |uses| StandardNestedFetcher
  %%Validator --> |observes| Object

  watch & Watcher & nested & StandardNestedFetcher -.-> |uses| AnnotationProcessor["AnnotationProcessor<br>(internal)"]
end

subgraph form package
  Form -.-> |manages/updates| FormField
  Form -.-> |manages| FormBinding["&lt;&lt;interface&gt;&gt;<br>FormBinding"]
  %%FormBinding -.-> |references| Form & FormField
  Form ==> Watcher
  FormField & Form  ==> Validator
  Form -.-> |uses| StandardNestedFetcher
  Form --> |delegates| Submission["Submission<br>(internal)"]
end

subgraph react package
  Hooks --> |updates| Form

  Bindings -.-> |implements| FormBinding
  Bindings ==> Form & FormField
end
```

</details>

## Overview

[apps/example/](./apps/example) is deployed at [mobx-sentinel-example.creasty.com](https://mobx-sentinel-example.creasty.com).

### Model-side

```typescript
import { action, observable, makeObservable } from "mobx";
import { nested, makeValidatable } from "@mobx-sentinel/core";

export class Sample {
  @observable text: string = "";
  @observable number: number | null = null;
  @observable date: Date | null = null;
  @observable bool: boolean = false;
  @observable enum: SampleEnum | null = null;
  @observable option = SampleOption.all[0].code;
  @observable multiOption: string[] = [];

  // Nested/dynamic objects can be tracked with @nested annotation
  @nested @observable nested = new Other();
  @nested @observable array = [new Other()];

  constructor() {
    makeObservable(this);

    // 'Reactive validation' is implemented here
    makeValidatable(this, (b) => {
      if (this.text === "") b.invalidate("text", "Text is required");
      if (this.number === null) b.invalidate("number", "Number is required");
      if (this.date === null) b.invalidate("date", "Date is required");
      if (this.bool === false) b.invalidate("bool", "Bool must be true");
      if (this.enum === null) b.invalidate("enum", "Enum is required");
      if (this.option === SampleOption.all[0].code) b.invalidate("option", "Option must not be 'Alpha'");
      if (this.multiOption.length === 0) b.invalidate("multiOption", "Multi option is required");
      if (this.array.length === 0) b.invalidate("array", "Array is required");
    });
  }
}
```

```typescript
const model = new Sample();

// Do something with the model...
model.text = "hello";
model.nested.other = "world";

// Check if the model has changed
const watcher = Watcher.get(model);
watcher.changed //=> true
watcher.changedKeyPaths //=> Set ["text", "nested.other"]

// Check if the model is valid
const validator = Validator.get(model);
validator.isValid //=> false
validator.invalidKeyPaths //=> Set ["number", "date", ..., "array.0.other"]

// Iterate over all errors
for (const [keyPath, error] of validator.findErrors(KeyPathSelf, true)) {
  console.log(keyPath, error);
}
```

### UI-side

```tsx
import { observer } from "mobx-react-lite";
import { Form } from "@mobx-sentinel/form";
import { useFormHandler } from "@mobx-sentinel/react";
import "@mobx-sentinel/react/dist/extension"; // Makes .bindTextInput() and other bind methods available.

const SampleForm: React.FC<{ model: Sample }> = observer(({ model }) => {
  const form = Form.get(model);

  useFormHandler(form, "submit", async (abortSignal) => {
    // TODO: Serialize the model and send the data to a server
    return true;
  });

  return (
    <>
      <fieldset>
        <label {...form.bindLabel(["text", "bool"])}>Text input & Checkbox</label>
        <input
         {...form.bindInput("text", {
            getter: () => model.text,
            setter: (v) => (model.text = v),
          })}
        />
        <input
          {...form.bindCheckBox("bool", {
            getter: () => model.bool,
            setter: (v) => (model.bool = v),
          })}
        />
      </fieldset>

      ...

      <div>
        <label {...form.bindLabel(["nested"])}>Nested form</label>
        <OtherForm model={model.nested} />
      </div>

      <div>
        <label {...form.bindLabel(["array"])}>Dynamic form</label>
        {model.array.map((item, i) => (
          <OtherForm key={i} model={item} />
        ))}
        <button onClick={action(() => model.array.push(new Other()))}>Add a new form</button>
      </div>

      <button {...form.bindSubmitButton()}>Submit</button>
    </>
  );
});
```

```tsx
const OtherForm: React.FC<{ model: Other }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <fieldset>
      <input
        {...form.bindInput("other", {
          getter: () => model.other,
          setter: (v) => (model.other = v),
        })}
      />
    </fieldset>
  );
});
```

## Alternatives

Criteria:
[**T**] Type-safe interfaces.
[**B**] Binding for UI.
[**C**] Class-based implementation.

[img-ts]: https://cdn.simpleicons.org/typescript/3178c6?size=16
[img-js]: https://cdn.simpleicons.org/javascript/f7df1e?size=16
[img-adequate]: https://img.shields.io/badge/adequate-_?style=flat&label=test&color=yellowgreen
[img-sparse]: https://img.shields.io/badge/sparse-_?style=flat&label=test&color=red

<!-- prettier-ignore-start -->

| Repository | Stars | Tests | T | B | C |
|------------|-------|-------|---|---|---|
| ![TypeScript][img-ts] [mobx-react-form](https://github.com/foxhound87/mobx-react-form) | ![GitHub stars](https://img.shields.io/github/stars/foxhound87/mobx-react-form?style=flat-square&label&color=960) | [![Codecov Coverage](https://img.shields.io/codecov/c/github/foxhound87/mobx-react-form/master.svg)](https://codecov.io/gh/foxhound87/mobx-react-form) | | ✓ | |
| ![TypeScript][img-ts] [formstate](https://github.com/formstate/formstate) | ![GitHub stars](https://img.shields.io/github/stars/formstate/formstate?style=flat-square&label&color=960) | ![Adequate][img-adequate] | ✓ | | |
| ![TypeScript][img-ts] [formst](https://github.com/formstjs/formst) | ![GitHub stars](https://img.shields.io/github/stars/formstjs/formst?style=flat-square&label&color=960) | N/A | | ✓ | |
| ![TypeScript][img-ts] [smashing-form](https://github.com/eyedea-io/smashing-form) | ![GitHub stars](https://img.shields.io/github/stars/eyedea-io/smashing-form?style=flat-square&label&color=960) | ![Sparse][img-sparse] | | ✓ | |
| ![TypeScript][img-ts] [formstate-x](https://github.com/qiniu/formstate-x) | ![GitHub stars](https://img.shields.io/github/stars/qiniu/formstate-x?style=flat-square&label&color=960) | [![Coverage Status](https://coveralls.io/repos/github/qiniu/formstate-x/badge.svg?branch=master)](https://coveralls.io/github/qiniu/formstate-x?branch=master) | ✓ | | |
| ![JavaScript][img-js] [mobx-form-validate](https://github.com/tdzl2003/mobx-form-validate) | ![GitHub stars](https://img.shields.io/github/stars/tdzl2003/mobx-form-validate?style=flat-square&label&color=960) | N/A | | | ✓ |
| ![JavaScript][img-js] [mobx-form](https://github.com/kentik/mobx-form) | ![GitHub stars](https://img.shields.io/github/stars/kentik/mobx-form?style=flat-square&label&color=960) | N/A | | ✓ | |
| ![JavaScript][img-js] [mobx-schema-form](https://github.com/alexhisen/mobx-schema-form) | ![GitHub stars](https://img.shields.io/github/stars/alexhisen/mobx-schema-form?style=flat-square&label&color=960) | ![Sparse][img-sparse] | | | |
| ![TypeScript][img-ts] [mobx-form-schema](https://github.com/Yoskutik/mobx-form-schema) | ![GitHub stars](https://img.shields.io/github/stars/Yoskutik/mobx-form-schema?style=flat-square&label&color=960) | ![Jest coverage](https://raw.githubusercontent.com/Yoskutik/mobx-form-schema/master/badges/coverage-jest%20coverage.svg) | | | ✓ |
| ![JavaScript][img-js] [mobx-form-store](https://github.com/alexhisen/mobx-form-store) | ![GitHub stars](https://img.shields.io/github/stars/alexhisen/mobx-form-store?style=flat-square&label&color=960) | ![Adequate][img-adequate] | | | |
| ![TypeScript][img-ts] [mobx-form-reactions](https://github.com/marvinhagemeister/mobx-form-reactions) | ![GitHub stars](https://img.shields.io/github/stars/marvinhagemeister/mobx-form-reactions?style=flat-square&label&color=960) | N/A | | | |
| ...and many more | <10 | | | | | |

<!-- prettier-ignore-end -->

## Milestones

Check out https://github.com/creasty/mobx-sentinel/milestones

## License

MIT
