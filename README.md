# form-model

[![push](https://github.com/creasty/form-model/actions/workflows/push.yml/badge.svg)](https://github.com/creasty/form-model/actions/workflows/push.yml)
[![codecov](https://codecov.io/gh/creasty/form-model/graph/badge.svg?token=K6D0I95Y91)](https://codecov.io/gh/creasty/form-model)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> [!CAUTION]
> This plugin is currently in the early stage of development. User interface is subject to change without notice.

A TypeScript form management library designed to work seamlessly with MobX domain models, providing a clean separation between form state management and domain logic while offering type-safe form bindings for React applications.

## Packages

[npm-core]: https://www.npmjs.com/package/@form-model/core
[npm-react]: https://www.npmjs.com/package/@form-model/react
[npm-core-badge]: https://badge.fury.io/js/@form-model%2Fcore.svg
[npm-react-badge]: https://badge.fury.io/js/@form-model%2Freact.svg

| [![npm version][npm-core-badge]][npm-core] | [![npm version][npm-react-badge]][npm-react] |
|---|---|
| <code>npm install --save <b>@form-model/core</b></code> | <code>npm install --save <b>@form-model/react</b></code> |
| Use with <code>mobx</code> | Use with <code>mobx-react-lite</code> |

## Premises

私が関わっているプロジェクトでは複雑なドメインを扱っており、フロントエンドでも MobX を用いてドメインモデルを作り込むことを推進している。<br>
データがどのように表示・更新されるべきかというビジネスロジックがクラス実装として存在する前提で、それをフォームでも使えるようにするソリューションを求めていた。

すでに MobX を活用したフォーム構築のためのライブラリは多く存在しているが、どれもモデリングではなくデータシリアライズの観点で設計されており、
モデルを使うことができないか、データとフォームの状態管理の分離が適切にできていないか、のいずれかの問題がある。<br>
例えば、データ(サーバとの通信)とドメインモデルのマッピングはフォームの仕組みの中ではなく適切な変換層で定義されるべきである。
また、バリデーションも本来的にドメインモデルが持つべき責務であり、フォームに特化した定義が必要なものではない。

ここまでの話を踏まえて、フォームを実装する上での本質的な課題は以下の2点であると考える。

- フォーム自体の状態管理: データを分離して考えれば、送信やバリデーション処理に関わるものだけである。例えば、
  - 送信中やエラーがある場合は送信ボタンを押せないように制御する。
  - フォームの更新に応じてバリデーションを走らせる。
  - エラーを適切なタイミングで表示する。
- インプット要素との接続: UI イベントを適切に処理し、データ・モデルの更新を行う。

特にバリデーションエラーをユーザに表示するタイミング制御が UX 上重要である。<br>
何もしてないのに最初からエラーが表示されていたり、入力途中なのに即座にエラーと表示される UI にイライラしたことはないだろうか？<br>
より適切なタイミングするためには、復数の UI イベント (change, focus, blur) や状態を組み合わせる必要があり、「フォーム自体の状態管理」と「インプット要素との接続」の両方が複雑になる要因となっている。

ドメインモデルがある前提では、基本的にドメインモデル側にほとんどの責務を持たせることができるし、そうするべきである。
その上でフォーム独自の機能として必要な部分だけを提供するライブラリを実装した。

## Design principles

- ドメインモデルファースト
  - ドメインモデルがあることを前提にする。
  - ドメインモデルの方の責務になるべく寄せ、フォームの責務を最小限にする。
  - データドリブンで簡易にフォームを実装することは目的としない。
- フォーム状態管理とドメインモデルの分離
  - フォームとドメインモデルがお互いに直接的な参照を持たない。
  - ドメインモデルがフォームによって汚染されない。
  - フォームはデータを管理しない。
- 隠されていない入出力
  - ドメインモデル ↔ インプット要素 の入出力を隠蔽しない。
  - 自明かつ安全にコントロールできるようにする。
- モジュラーな実装
  - Multi-package 構成にし、とりわけ動作モデルと UI を明確に分離する。
  - テスタビリティと拡張性を高める。
- 賢い型情報
  - 型システムを最大限活用し、エラー検出やコード補完による開発生産性を確保する。

## Features

- Asynchronous submission
- Asynchronous validation
- Nested forms
- Dynamic forms - arrays, etc - work without special treatment
- [React](https://react.dev/) integration
- [zod](https://zod.dev/) extension *(coming soon)*

--------------------------------------------------------------------------------

## Overview

```typescript
import { observable, makeObservable } from "mobx";
import { FormDelegate } from "@form-model/core";

enum SampleEnum { ... }

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

  // ↓ フォーム関連の処理は symbol による Protocol パターンで実装する。
  //   例は自分自身を Delegate として実装しているパターン。もちろん別のクラスに移譲することも可能。

  [FormDelegate.connect]() {
    return [this.nested, this.array];
  }

  async [FormDelegate.validate]() {
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

  async [FormDelegate.validate]() {
    return { ... };
  }
}
```

```tsx
import { observer } from "mobx-react-lite";
import "@form-model/react";
import { Form } from "@form-model/core";

const SampleForm: React.FC<{ model: Sample }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <form>
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
          valueAs: "number",
          getter: () => model.number,
          setter: (v) => (model.number = v),
        })}
      />
      {/* Date input */}
      <input
        {...form.bindInput("date", {
          valueAs: "date",
          getter: () => model.date?.toISOString().split("T")[0] ?? null,
          setter: (v) => (model.date = v),
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
        const bindRadioButton = form.bindRadioButtonFactory("enum", {
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

--------------------------------------------------------------------------------

## License

MIT
