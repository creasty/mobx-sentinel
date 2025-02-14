# form-model

[![push](https://github.com/creasty/form-model/actions/workflows/push.yml/badge.svg)](https://github.com/creasty/form-model/actions/workflows/push.yml)
[![codecov](https://codecov.io/gh/creasty/form-model/graph/badge.svg?token=K6D0I95Y91)](https://codecov.io/gh/creasty/form-model)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> [!CAUTION]
> This library is currently in the early stage of development. User interface is subject to change without notice.

A TypeScript form management library designed to work seamlessly with MobX domain models, providing a clean separation between form state management and domain logic while offering type-safe form bindings for React applications.

## Packages

<pre><code>npm install --save <b>@form-model/core</b></code></pre>

[![npm version](https://badge.fury.io/js/@form-model%2Fcore.svg)](https://www.npmjs.com/package/@form-model/core)
[![npm size](https://badgen.net/bundlephobia/min/@form-model/core)](https://bundlephobia.com/package/@form-model/core)

Use with `mobx`.

<pre><code>npm install --save <b>@form-model/react</b></code></pre>

[![npm version](https://badge.fury.io/js/@form-model%2Freact.svg)](https://www.npmjs.com/package/@form-model/react)
[![npm size](https://badgen.net/bundlephobia/min/@form-model/react)](https://bundlephobia.com/package/@form-model/react)

Use with `mobx-react-lite`.

## Premises / Motivation

TL;DR: This library provides a model-centric form management solution for MobX applications. Unlike other form libraries that focus on data serialization, it's designed to work with domain models (classes) while properly separating form state management from business logic. It offers type-safe bindings and smart error handling to create a better developer and user experience.

<details><summary>Read more (English)</summary>

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

<details><summary>Read more (Japanese)</summary>

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

## Features

- Asynchronous submission and validation
  - Composable from multiple sources.
  - Cancellable with [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal).
- Nested and dynamic (array) forms
  - Works by mutating models directly.
  - Forms are created independently; they don't need to be aware of each other.
- Custom bindings
  - Flexible and easy-to-create.
  - Most cases can be implemented in less than 50 lines.
- React integration
  - React hooks that automatically handle component lifecycle under the hood.
  - Standard bindings for most common form elements.
- Smart error reporting
  - Original validation strategy for a supreme user experience.

---

## Overview — Model

```typescript
import { action, observable, makeObservable } from "mobx";
import { watch, makeValidatable } from "@form-model/validation";

class Sample {
  @observable text: string = "";
  @observable number: number | null = null;
  @observable date: Date | null = null;
  @observable bool: boolean = false;
  @observable enum: SampleEnum | null = null;
  @observable option: string | null = null;
  @observable multiOption: string[] = [];

  // Nested/dynamic objects can be tracked with the annotation.
  @watch.nested @observable nested = new Other();
  @watch.nested @observable array = [new Other()];

  constructor() {
    makeObservable(this);

    // Validation is implemented by returning an object with error messages.
    makeValidatable(this, () => {
      return {
        text: this.text === "" ? "Required" : null,
        number: this.number === null ? "Required" : null,
        date: this.date === null ? "Required" : null,
        enum: this.enum === null ? "Required" : null,
        option: this.option === null ? "Required" : null,
        multiOption: this.multiOption.length === 0 ? "Required" : null,
        array: this.array.length === 0 ? "Required" : null,
      };
    });
  }

  @action
  addNewForm() {
    this.array.push(new Other());
  }
}

class Other {
  @observable other: string = "";

  constructor() {
    makeObservable(this);

    makeValidatable(this, () => {
      return {
        other: this.other === "" ? "Required" : !isValidFormat(this.other) ? "Invalid format" : null,
      };
    });
  }
}
```

</details>

## Overview — React

```tsx
import { observer } from "mobx-react-lite";
import { Form } from "@form-model/core";
import { useFormEvent } from "@form-model/react";
import "@form-model/react/dist/extension"; // Makes .bindTextInput() and other bind methods available.

const SampleForm: React.FC<{ model: Sample }> = observer(({ model }) => {
  const form = Form.get(model);

  useFormEvent(form, "submit", async (abortSignal) => {
    // TODO: Serialize the model and send the data to a server
    return true;
  });

  // Optional:
  // useFormEvent(form, "validate", async (abortSignal) => {
  //   return {
  //     // Extend validation rules here.
  //   };
  // });

  return (
    <form>
      <label {...form.bindLabel(["text"])}>Text input</label>
      <input
        {...form.bindInput("text", {
          getter: () => model.text,
          setter: (v) => (model.text = v),
        })}
      />

      <fieldset>
        <label {...form.bindLabel(["number", "bool"])}>Number input & Checkbox</label>
        <input
          {...form.bindInput("number", {
            valueAs: "number", // also supports "date"
            getter: () => model.number,
            setter: (v) => (model.number = v),
          })}
        />
        <input
          {...form.bindCheckBox("bool", {
            getter: () => model.bool,
            setter: (v) => (model.bool = v),
          })}
        />
      </fieldset>

      <fieldset role="radiogroup">
        <label {...form.bindLabel(["enum"])}>Radio buttons</label>
        {(() => {
          const bind = form.bindRadioButton("enum", {
            getter: () => model.enum,
            setter: (v) => (model.enum = v ? (v as SampleEnum) : null),
          });
          return Object.values(SampleEnum).map((v) => <input key={v} {...bind(v)} />);
        })()}
      </fieldset>

      <label {...form.bindLabel(["option"])}>Select box</label>
      <select
        {...form.bindSelectBox("option", {
          getter: () => model.option,
          setter: (v) => (model.option = v),
        })}
      >
        ...
      </select>

      <label {...form.bindLabel(["multiOption"])}>Multi select box</label>
      <select
        {...form.bindSelectBox("multiOption", {
          multiple: true,
          getter: () => model.multiOption,
          setter: (v) => (model.multiOption = v),
        })}
      >
        ...
      </select>

      <fieldset>
        <label {...form.bindLabel(["nested"])}>Nested form</label>
        <OtherForm model={model.nested} />
      </fieldset>

      <fieldset>
        <label {...form.bindLabel(["array"])}>Dynamic form</label>
        {model.array.map((item, i) => (
          <OtherForm key={i} model={item} />
        ))}
        <button onClick={model.addNewForm}>Add a new form</button>
      </fieldset>

      <button {...form.bindSubmitButton()}>Submit</button>
    </form>
  );
});

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

---

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

Check out https://github.com/creasty/form-model/milestones

## License

MIT
