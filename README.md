# form-model

[![push](https://github.com/creasty/form-model/actions/workflows/push.yml/badge.svg)](https://github.com/creasty/form-model/actions/workflows/push.yml)
[![codecov](https://codecov.io/gh/creasty/form-model/graph/badge.svg?token=K6D0I95Y91)](https://codecov.io/gh/creasty/form-model)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> [!CAUTION]
> This library is currently in the early stage of development. User interface is subject to change without notice.

A TypeScript form management library designed to work seamlessly with MobX domain models, providing a clean separation between form state management and domain logic while offering type-safe form bindings for React applications.

## Packages

[core-npm]: https://www.npmjs.com/package/@form-model/core
[core-npm-badge]: https://badge.fury.io/js/@form-model%2Fcore.svg
[core-size]: https://bundlephobia.com/package/@form-model/core
[core-size-badge]: https://badgen.net/bundlephobia/min/@form-model/core
[react-npm]: https://www.npmjs.com/package/@form-model/react
[react-npm-badge]: https://badge.fury.io/js/@form-model%2Freact.svg
[react-size]: https://bundlephobia.com/package/@form-model/react
[react-size-badge]: https://badgen.net/bundlephobia/min/@form-model/react

<pre><code>npm install --save <b>@form-model/core</b></code></pre>

[![npm version][core-npm-badge]][core-npm]
[![npm size][core-size-badge]][core-size]

Use with `mobx`.

<pre><code>npm install --save <b>@form-model/react</b></code></pre>

[![npm version][react-npm-badge]][react-npm]
[![npm size][react-size-badge]][react-size]

Use with `mobx-react-lite`.

## Premises

TL;DR: Three core issues in form management:

1. Model integration: Existing form libraries focus on data serialization, making them incompatible with rich domain models.
2. Mixed responsibilities: Form state management and data/model management are often entangled, creating maintenance challenges.
3. Poor validation UX: Complex coordination of UI events leads to poor validation timing and suboptimal user experiences.

<details><summary>Read more (English)</summary>

In the projects I'm involved with, we deal with complex domains and promote building domain models using MobX on the frontend.<br>
We needed a solution that could leverage existing business logic implemented in classes that define how data should be displayed and updated, and make it usable in forms.

While there are many existing libraries for building forms with MobX, they are all designed from a data serialization perspective rather than a modeling one,
and either cannot use models or do not properly separate data and form state management.<br>
For example, mapping between data and models should be defined in an appropriate transformation layer, not within the form mechanism.
Additionally, validation is inherently a model responsibility and doesn't require form-specific definitions.

Based on these considerations, I believe there are two fundamental challenges in implementing forms:

- Form-specific state management: When considering data separately, this only involves submission and validation processing. For example:
  - Disabling the submit button when submitting or when errors exist
  - Running validation in response to form updates
  - Displaying errors at appropriate times
- Input element binding: Processing UI events appropriately and updating data/models

The timing control of displaying validation errors to users is particularly important for UX.<br>
(Haven't you been frustrated by UIs that show errors right from the start without any user action, or display errors immediately while you're still typing?)<br>
To handle this in a more appropriate way, multiple UI events (change, focus, blur) and states need to be combined, which complicates both "form state management" and "input element binding".

When working with models, most responsibilities should and can be assigned to the model side.<br>
This library was implemented to provide only the essential form-specific functionality on top of that foundation.

</details>

<details><summary>Read more (Japanese)</summary>

私が関わっているプロジェクトでは複雑なドメインを扱っており、フロントエンドでも MobX を用いてドメインモデルを作り込むことを推進している。<br>
データがどのように表示・更新されるべきかというビジネスロジックがクラス実装として存在する前提で、それをフォームでも使えるようにするソリューションを求めていた。

すでに MobX を活用したフォーム構築のためのライブラリは多く存在しているが、どれもモデリングではなくデータシリアライズの観点で設計されており、
モデルを使うことができないか、データとフォームの状態管理の分離が適切にできていないか、のいずれかの問題がある。<br>
例えば、データとモデルのマッピングはフォームの仕組みの中ではなく適切な変換層で定義されるべきである。
また、バリデーションも本来的にモデルが持つべき責務であり、フォームに特化した定義が必要なものではない。

ここまでの話を踏まえて、フォームを実装する上での本質的な課題は以下の2点であると考える。

- フォーム自体の状態管理: データを分離して考えれば、送信やバリデーション処理に関わるものだけである。例えば、
  - 送信中やエラーがある場合は送信ボタンを押せないように制御する。
  - フォームの更新に応じてバリデーションを走らせる。
  - エラーを適切なタイミングで表示する。
- インプット要素との接続: UI イベントを適切に処理し、データ・モデルの更新を行う。

特にバリデーションエラーをユーザに表示するタイミングの制御は良い UX を実現する上で重要である。<br>
(何もしてないのに最初からエラーが表示されていたり、入力途中なのに即座にエラーと表示される UI にイライラしたことはないだろうか？)<br>
より適切なタイミングするためには、復数の UI イベント (change, focus, blur) や状態を組み合わせる必要があり、「フォーム自体の状態管理」と「インプット要素との接続」の両方が複雑になる要因となっている。

モデルがある前提では、基本的にモデル側にほとんどの責務を持たせることができるし、そうするべきである。<br>
その上でフォーム独自の機能として必要な部分だけを提供するライブラリを実装した。

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
- [React](https://react.dev/) integration

--------------------------------------------------------------------------------

## Overview — Model

```typescript
import { observable, makeObservable } from "mobx";
import { FormDelegate } from "@form-model/core";

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

  // ↓ Form-related processing is implemented using a Protocol pattern with symbols.
  //   You can either implement self-delegation as shown here, or literally delegate it to another class.

  [FormDelegate.connect]() {
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

## Overview — React

```tsx
import { observer } from "mobx-react-lite";
import { useForm } from "@form-model/react";
import "@form-model/react/dist/extension"; // Makes .bindTextInput() and other bind methods available

const SampleForm: React.FC<{ model: Sample }> = observer(({ model }) => {
  const form = useForm(model);

  return (
    <form>
      {/* Label */}
      <label {...form.bindLabel(["string"])}>Label</label>

      {/* Text input */}
      <input
        {...form.bindInput("string", {
          getter: () => model.string,
          setter: (v) => (model.string = v),
        })}
      />
      {/* Number input */}
      <input
        {...form.bindInput("number", {
          valueAs: "number", // also supports "date"
          getter: () => model.number,
          setter: (v) => (model.number = v),
        })}
      />

      {/* Check box */}
      <input
        {...form.bindCheckBox("bool", {
          getter: () => model.bool,
          setter: (v) => (model.bool = v),
        })}
      />

      {/* Radio buttons */}
      {(() => {
        const bindRadioButton = form.bindRadioButton("enum", {
          getter: () => model.enum,
          setter: (v) => (model.enum = v ? (v as SampleEnum) : null),
        });
        return Object.values(SampleEnum).map((value) => <input key={value} {...bindRadioButton(value)} />);
      })()}

      {/* Single select box */}
      <select
        {...form.bindSelectBox("option", {
          getter: () => model.option,
          setter: (code) => (model.option = code),
        })}
      >
        {!model.option && <option value="" disabled>Select...</option>}
        {SAMPLE_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>

      {/* Multiple select box */}
      <select
        {...form.bindSelectBox("multipleOption", {
          multiple: true,
          getter: () => model.multipleOption,
          setter: (codes) => (model.multipleOption = codes),
        })}
      >
        ...
      </select>

      {/* Nested form */}
      <OtherForm model={model.nested} />

      {/* Array of nested forms */}
      {model.array.map((item, i) => (
        <OtherForm key={i} model={item} />
      ))}

      {/* Submit button */}
      <button {...form.bindSubmitButton()}>Submit</button>
    </form>
  );
});

const OtherForm: React.FC<{ model: Other }> = observer(({ model }) => {
  const form = useForm(model);

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

--------------------------------------------------------------------------------

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
  - Add a new `@computed get errors()` for most use-cases,<br>
    and repurpose `validate()` for a time-consuming per-field validation (which results can be easily included in the `get errors()`).
- [ ] Better way to implement delegate
  - Problem 1: Unlike `validate()`, `submit()` is more of an application layer responsibility.
  - Problem 2: `connect()` is lengthy. We could make it a field decorator.
- [ ] Add an integration with a data validation library
  - [zod](https://zod.dev/) is a good candidate.
  - i18n support is also essential.
- [ ] Give it a catchy name

## License

MIT
