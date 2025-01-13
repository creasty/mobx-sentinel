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

## Premises

TL;DR: This library provides a model-centric form management solution for MobX applications. Unlike other form libraries that focus on data serialization, it's designed to work with domain models (classes) while properly separating form state management from business logic. It offers type-safe bindings and smart error handling to create a better developer and user experience.

<details><summary>Read more (English)</summary>

In the projects I'm involved with, we deal with complex domains and promote building domain models on the frontend using MobX.<br>
We needed a solution that could work with forms while assuming business logic for how data should be displayed and updated exists as class implementations.<br>
With models as a premise, most responsibilities can and should be placed on the model side.

While there are already many libraries for building forms using MobX, they are all designed from a data serialization perspective rather than modeling,
and have issues either being unable to use models (classes) or not properly separating data and form state management.<br>
Furthermore, from my research, there wasn't a single one designed to allow type-safe implementation from both model and UI perspectives.<br>
(Check out the [comparison](#comparison-with-other-libraries) section for more details.)

Given this background, I believe there are two fundamental challenges in implementing forms:

- Form-specific state management: When considering data separately, this only involves submission and validation processing. For example:
  - Controlling submit button state based on submission status or validation errors.
  - Running validations in response to form updates.
- Input element connection (a.k.a. binding): Properly handling form state and UI events to update forms, models and UI.
  - Getting values from the model and writing back on input changes.
  - Expressing error states (red borders, displaying messages, etc.)

Additionally, showing error messages to users at appropriate times is important for user experience.<br>
*(Haven't you been frustrated by UIs that show errors before you've done anything, or immediately display errors while you're still typing?)*<br>
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
(詳細は[比較](#comparison-with-other-libraries)セクションを参照)

ここまでの話を踏まえて、フォームを実装する上での本質的な課題は以下の2点であると考える。

- フォーム自体の状態管理: データを分離して考えれば、送信やバリデーション処理に関わるものだけである。例えば、
  - 送信中やエラーがある場合は送信ボタンを押せないように制御する。
  - フォームの更新に応じてバリデーションを走らせる。
- インプット要素との接続: フォームの状態と UI イベントを適切に処理し、フォームとモデルと UI をそれぞれ更新する。
  - モデルから値を取り出し、入力変化があったらモデルに書き込む。
  - エラー状態を表現する。(枠を赤くしたり、メッセージを表示したり等)

また、エラーメッセージをユーザに適切なタイミングで表示することはユーザ体験として重要である。<br>
*(何もしていないのに最初からエラーが表示されていたり、入力途中なのに即座にエラーと表示される UI にイライラしたことはないだろうか？)*<br>
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

<details><summary>Japanese</summary>

- モデルファースト
  - モデルがあることを前提にする。
  - モデルの方の責務になるべく寄せ、フォームの責務を最小限にする。
  - データファーストで簡易にフォームを実装することは目的としない。
- フォーム状態管理とモデルの分離
  - フォームとモデルがお互いに直接的な参照を持たない。
  - モデルがフォームによって汚染されない。
  - フォームはデータを管理しない。
- 隠されていない入出力
  - モデル ↔ インプット要素 の入出力を隠蔽しない。
  - 自明かつ安全にコントロールできるようにする。
- モジュラーな実装
  - Multi-package 構成にし、とりわけ動作モデルと UI を明確に分離する。
  - テスタビリティと拡張性を高める。
- 厳格な型情報
  - 型システムを最大限活用し、エラー検出やコード補完による開発生産性を確保する。

</details>

## Features

- Asynchronous submission (abortable)
- Asynchronous validation (abortable)
- Smart error reporting
- Nested and dynamic (array) forms
- Custom bindings
- [React](https://react.dev/) integration

---

## Overview — Model

<!-- prettier-ignore-start -->

```typescript
import { action, observable, makeObservable } from "mobx";
import { FormDelegate } from "@form-model/core";

// Form-related processing is implemented using a Protocol pattern with symbols (along with the interface).
// You can either implement self-delegation as shown here, or literally delegate it to another class.
class Sample implements FormDelegate<Sample> {
  @observable string: string = "hello";
  @observable number: number | null = null;
  @observable date: Date | null = null;
  @observable bool: boolean = false;
  @observable enum: SampleEnum | null = null;
  @observable option: string | null = null;
  @observable multiOption: string[] = [];

  @observable nested = new Other();
  @observable array = [new Other()];

  constructor() {
    makeObservable(this);
  }

  @action
  addNewForm() {
    this.array.push(new Other());
  }

  [FormDelegate.connect]() {
    // Nested/dynamic forms are achieved by returning a list of models.
    return [this.nested, this.array];
  }

  async [FormDelegate.validate](signal: AbortSignal) {
    return { ... };
  }

  async [FormDelegate.submit](signal: AbortSignal) {
    ...
    return true;
  }
}

class Other implements FormDelegate<Other> {
  @observable other: string = "world";

  constructor() {
    makeObservable(this);
  }

  async [FormDelegate.validate](signal: AbortSignal) {
    return { ... };
  }
}
```

<!-- prettier-ignore-end -->

## Overview — React

<!-- prettier-ignore-start -->

```tsx
import { observer } from "mobx-react-lite";
import { useForm } from "@form-model/react";
import "@form-model/react/dist/extension"; // Makes .bindTextInput() and other bind methods available.

const SampleForm: React.FC<{ model: Sample }> = observer(({ model }) => {
  const form = useForm(model);

  return (
    <form>
      <label {...form.bindLabel(["string"])}>Label</label>

      <input {...form.bindInput("string", {
        getter: () => model.string,
        setter: (v) => (model.string = v),
      })} />
      <input {...form.bindInput("number", {
        valueAs: "number", // also supports "date"
        getter: () => model.number,
        setter: (v) => (model.number = v),
      })} />
      <input {...form.bindCheckBox("bool", {
        getter: () => model.bool,
        setter: (v) => (model.bool = v),
      })} />

      {(() => {
        const bindRadioButton = form.bindRadioButton("enum", {
          getter: () => model.enum,
          setter: (v) => (model.enum = v ? (v as SampleEnum) : null),
        });
        return Object.values(SampleEnum)
          .map((value) => (<input key={value} {...bindRadioButton(value)} />));
      })()}

      <select {...form.bindSelectBox("option", {
        getter: () => model.option,
        setter: (code) => (model.option = code),
      })}>
        {!model.option && (<option value="" disabled>Select...</option>)}
        {SAMPLE_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>{option.name}</option>
        ))}
      </select>

      <select {...form.bindSelectBox("multipleOption", {
        multiple: true,
        getter: () => model.multipleOption,
        setter: (codes) => (model.multipleOption = codes),
      })}>...</select>

      {/* Nested form */}
      <OtherForm model={model.nested} />

      {/* Dynamic form */}
      {model.array.map((item, i) => (<OtherForm key={i} model={item} />))}
      <button onClick={model.addNewForm}>Add a new form</button>

      <button {...form.bindSubmitButton()}>Submit</button>
    </form>
  );
});

const OtherForm: React.FC<{ model: Other }> = observer(({ model }) => {
  const form = useForm(model);

  return (
    <fieldset>
      <input {...form.bindInput("other", {
        getter: () => model.other,
        setter: (v) => (model.other = v),
      })} />
    </fieldset>
  );
});
```

<!-- prettier-ignore-end -->

---

## Comparison with other libraries

- Only two libraries are built with type safety in mind, and neither of them provides binding functionality.
- Only two libraries support class-based implementation, and neither of them provides binding functionality.
- **There isn't a single library that's properly usable.**

| Repository | Stars | Language | Features |
|------------|-------|----------|----------|
| [mobx-react-form](https://github.com/foxhound87/mobx-react-form) | ![GitHub stars](https://img.shields.io/github/stars/foxhound87/mobx-react-form?style=flat) | ![Language](https://img.shields.io/github/languages/top/foxhound87/mobx-react-form) | binding |
| [formstate](https://github.com/formstate/formstate) | ![GitHub stars](https://img.shields.io/github/stars/formstate/formstate?style=flat) | ![Language](https://img.shields.io/github/languages/top/formstate/formstate) | typesafe |
| [formst](https://github.com/formstjs/formst) | ![GitHub stars](https://img.shields.io/github/stars/formstjs/formst?style=flat) | ![Language](https://img.shields.io/github/languages/top/formstjs/formst) | binding |
| [smashing-form](https://github.com/eyedea-io/smashing-form) | ![GitHub stars](https://img.shields.io/github/stars/eyedea-io/smashing-form?style=flat) | ![Language](https://img.shields.io/github/languages/top/eyedea-io/smashing-form) | binding |
| [formstate-x](https://github.com/qiniu/formstate-x) | ![GitHub stars](https://img.shields.io/github/stars/qiniu/formstate-x?style=flat) | ![Language](https://img.shields.io/github/languages/top/qiniu/formstate-x) | typesafe |
| [mobx-form-validate](https://github.com/tdzl2003/mobx-form-validate) | ![GitHub stars](https://img.shields.io/github/stars/tdzl2003/mobx-form-validate?style=flat) | ![Language](https://img.shields.io/github/languages/top/tdzl2003/mobx-form-validate) | class, typesafe |
| [mobx-form](https://github.com/kentik/mobx-form) | ![GitHub stars](https://img.shields.io/github/stars/kentik/mobx-form?style=flat) | ![Language](https://img.shields.io/github/languages/top/kentik/mobx-form) | binding |
| [mobx-schema-form](https://github.com/alexhisen/mobx-schema-form) | ![GitHub stars](https://img.shields.io/github/stars/alexhisen/mobx-schema-form?style=flat) | ![Language](https://img.shields.io/github/languages/top/alexhisen/mobx-schema-form) | - |
| [mobx-form-schema](https://github.com/Yoskutik/mobx-form-schema) | ![GitHub stars](https://img.shields.io/github/stars/Yoskutik/mobx-form-schema?style=flat) | ![Language](https://img.shields.io/github/languages/top/Yoskutik/mobx-form-schema) | class |
| [mobx-form-store](https://github.com/alexhisen/mobx-form-store) | ![GitHub stars](https://img.shields.io/github/stars/alexhisen/mobx-form-store?style=flat) | ![Language](https://img.shields.io/github/languages/top/alexhisen/mobx-form-store) | - |
| [mobx-form-reactions](https://github.com/marvinhagemeister/mobx-form-reactions) | ![GitHub stars](https://img.shields.io/github/stars/marvinhagemeister/mobx-form-reactions?style=flat) | ![Language](https://img.shields.io/github/languages/top/marvinhagemeister/mobx-form-reactions) | - |
| ...and many more | < 10 stars | | |

Legend for the features:
- `class` Can be implemented with classes? Including those with specific implementation requirements.
- `binding` Provides binding functionality?
- `typesafe` Has type-safe interfaces?

## Roadmap to v0.1

- [ ] Extensive documentation
  - UX of smart error reporting.
  - APIs.
  - Examples.
- [ ] Make the initial value of `isDirty` controllable from the model side somehow
  - Add a new `isCreate` property to the delegate?
- [ ] Make the validation strategy configurable
  - Options: smart (default), submit, touch, change, blur, change-and-blur
  - Option to force trigger validate on all nested forms?
- [ ] Make the submission strategy configurable
  - Options: always, first-and-dirty, only-dirty
  - Option to bypass submission when there are validation errors?
- [ ] Computed validation errors & per-field validations
  - Add a new `@computed get errors()` for standard use-cases.
  - Repurpose `validate()` for a time-consuming per-field validation (which results can be easily included in the `get errors()`).
- [ ] Better way to implement delegate
  - Problem 1: Unlike `validate()`, `submit()` is more of an application layer responsibility.
  - Problem 2: `connect()` is lengthy. We could make it a field decorator.
- [ ] Add an integration with a data validation library
  - [zod](https://zod.dev/) is a good candidate.
  - i18n support is also essential.
- [ ] Give it a catchy name

### Other ideas

- Error severity

## License

MIT
