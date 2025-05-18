---
theme: neversink
color: amber-light
---

# 推論された型の移植性エラー<br>`TS2742`に挑む

---

# elecdeer

`${自己紹介をここに}`

---

# TS2742エラー見たことありますか？

---

<!-- TODO: example2の例に差し替え -->

> `The inferred type of 'ExtendedSomeComponent' cannot be named without a reference to ''../../ref/node_modules/csstype/index.js'. This is likely not portable. A type annotation is necessary. ts(2742)`

> `'ExtendedSomeComponent' の推論された型には、'../../ref/node_modules/csstype/index.js' への参照なしで名前を付けることはできません。これは、移植性がない可能性があります。型の注釈が必要です。ts(2742)`

```ts
import { SomeComponent } from "ref";

export const ExtendedSomeComponent = (
  //         ~~~~~~~~~~~~~~~~~~~~~
  props: ComponentProps<SomeComponent> & {
    enable: boolean;
  }
) => {
  // ...
};
```

🤔

---

# 実際の開発で見た例

`@mantine/core`経由での`csstype`への間接参照

- `createPolymorphicComponent`が怪しい

<!-- example4に似た例 -->

`@storybook/experimental-addon-test`経由での`@vitest/spy`への間接参照

- `fn`の型をこねくり回していたら出た

<!-- このページ場所とかそもそも要らないかとか要検討 -->

---

# このエラーは何なのか

TypeScriptがd.tsファイルを生成する際に、間接的に参照される型を解決できない場合に発生する。

https://github.com/microsoft/TypeScript/pull/58176#issuecomment-2052698294
が詳しい。

---

# tscのd.ts出力を考える

パッケージの依存関係は以下の様になっているとする

```
main
└── middle-lib@1.0.0
    └── base-lib@2.0.0
```

mainはbase-libには直接依存していない。いわゆる推移的依存関係（transitive dependency）にある。

---

このとき、pnpmのような厳格な依存関係を持つパッケージマネージャーを使っていると、以下の様なnode_modulesの構成になる。
（他にも依存パッケージがあれば、この限りではないが...）
npmはデフォルトでhoistingを行うので、node_modulesの構成は異なる。

```
.
└── main/
    ├── package.json
    ├── node_modules/
    │   └── middle-lib/  <-- symlink
    │       ├── package.json
    │       ├── node_modules/  <-- symlink
    │       │   └── base-lib/
    │       │       ├── package.json
    │       │       ├── node_modules
    │       │       ├── index.js
    │       │       └── index.d.ts
    │       ├── index.js
    │       └── index.d.ts
    └── src/
        └── index.ts
```

---

# base-libとmiddle-libのd.ts

```ts
// base-lib/index.d.ts
export type SomeComplexType = {
  // （中身は割とどうでも良い）
  num: number;
  nest?: SomeComplexType;
};
export declare const returnsInferredSomeComplexType: () => SomeComplexType;

// middle-lib/index.d.ts
export declare const wrappedReturnsInferredSomeComplexType: () => import("subref").SomeComplexType;
```

---

# mainパッケージでの問題

mainパッケージで以下の様なコードを書いたとする

```ts
import { wrappedReturnsInferredSomeComplexType } from "middle-lib";

export const mainValue = wrappedReturnsInferredSomeComplexType();
//             ^| base-libの型SomeComplexTypeに推論されるが...
```

このコードをコンパイルしたとき、d.tsはどのように出力すべきか？

```ts
import { wrappedReturnsInferredSomeComplexType } from "middle-lib";

export const mainValue: ???;
```

---

# ダメな例

```ts
import { getBaseLibValue } from "middle-lib";
import type { SomeComplexType } from "../node_modules/middle-lib/node_modules/base-lib/index.js";
// node_modulesの構造はパッケージマネージャによって異なるのでNG!

export const mainValue: SomeComplexType;
```

```ts
import { getBaseLibValue } from "middle-lib";
import type { SomeComplexType } from "middle-lib/node_modules/base-lib/index.js";
// middle-libの下のnode_modulesに依存するのも（動く可能性はあるが）NG
// package.jsonのexportsフィールドによってはそもそも参照不可

export const mainValue: SomeComplexType;
```

---

```ts
import { getBaseLibValue } from "middle-lib";
import type { SomeComplexType } from "base-lib";
// これは...?
// 一見よさそうに見えるが、middle-lib --> base-libとmain --> base-libの指す先が同じとは限らない
// 別のバージョンに依存していた場合は、実装と型が乖離して壊れる可能性がある

export const mainValue: SomeComplexType;
```

tscからするとお手上げ🙌

-> "移植性がない"として`TS2742`エラーを発生させる

---

# どうするべきなのか

エラーの言うとおり、型注釈を明示的に書く。

```ts
import { wrappedReturnsInferredSomeComplexType } from "ref";

export const returnValue: ReturnType<
  typeof wrappedReturnsInferredSomeComplexType
> = wrappedReturnsInferredSomeComplexType();
```

これで解決!...🤔

---

関数の型にgenericsがあり、引数によって返り値の型が変わる場合は望ましくない...

```ts
const validator: () => { name: string } = createValidator(
  //                        ^ ここは書きたくないわけで
  z.object({ name: z.string() })
);
```

あと単に冗長

---

# そもそもとして

```ts
import { getBaseLibValue, SomeComplexType } from "middle-lib";
export const mainValue: SomeComplexType;
```

mainのd.ts出力で、こうできれば万事解決である

-> middle-libからSomeComplexTypeがexportされていれば解決

---

# 基本的にライブラリ側で修正されるのが望ましい

---

# ライブラリ側の修正

- 型をたどれるように再exportする
- TS5.5以上に上げてみる
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html#consulting-packagejson-dependencies-for-declaration-file-generation
  - TS5.4以前でTS2742エラーが発生している場合、偽陽性かもしれない

---

- tsconfigの`isolatedDeclarations`を有効にする
  - ダメなパターンを実装しにくくなる
    - 全てのパターンを防げるわけでは無さそう？
  - 明示的な型指定が強制されるので、大抵の場合はライブラリ側でエラーになる
- 不適切なビルドを修正する
  - 本来ライブラリ側でTS2742エラー（あるいはTS4023）が出るはずなのに、すり抜ける事がある
    - package.jsonのexportsやesm/cjs問題も影響していそうだが、正直よく分からない
  - tscの出力をそのままpublishしていないライブラリでありがち？
  - `arethetypeswrong`でチェックしてみる

https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
も参考に

---

# とはいってもライブラリを簡単に修正できるわけではない

ユーザ側（main）のworkaround

- tsconfigの`declaration`を`false`にする
  - 有効なd.tsを出力できないからエラーになっているので、そもそも出力しなければエラーにならない
- 型注釈を書いて型推論を避ける
  - 型推論に意義がある場合はあんまりやりたくない
- 直接依存に追加してimportする
  - mainのどこかに`base-lib`への参照がある場合には、それと同じ先に解決される
  - ライブラリ側が依存しているバージョンと別のバージョンに解決してしまう可能性があるので注意が必要
- pnpm patch

---

# まとめ

- `TS2742`は間接的な依存関係の型を解決できないときに発生する
- ライブラリ側で修正するのが望ましい
  - ユーザ側でのworkaroundもあるが、その方が健全

## 参考になるissueとか

- https://github.com/microsoft/TypeScript/pull/58176#issuecomment-2052698294
- https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
- https://github.com/microsoft/TypeScript/issues/48212
