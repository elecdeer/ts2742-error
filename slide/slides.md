---
theme: neversink
class: bg-tlb-yellow
fonts:
  # 標準テキスト用
  sans: Noto Sans JP
  # UnoCSS で `font-serif` クラスを指定したとき用
  serif: Noto Serif JP
  # コードブロック用
  mono: Fira Code
---

# 推論された型の移植性エラー<br>`TS2742`に挑む

tskaigi 2025 LT @elecdeer

<style>
  code {
    /* --uno: 'bg-slate-900 !'; */
    /* background-color: var(--) */

    /* @apply bg-slate-900; */

    --neversink-fg-code-color:rgb(255, 255, 255);
    --neversink-bg-code-color:rgb(26, 26, 43);
  }
</style>

---
layout: side-title
titlewidth: is-4-8
align: cm-cm
---

:: title ::

<div class="flex justify-center items-center">
   <img src="/deerIconDark.png" alt="my deer icon">
</div>

:: content ::

<div class="text-4xl my-8">elecdeer</div>

<div class="flex flex-col items-center gap-2 my-8">
  <div>
    <simple-icons-x /> @elecdeerdev
  </div>
  <div>
    <simple-icons-twitter /> @elecdeer
  </div>
</div>

<div class="my-8">
チームラボ フロントエンド班
</div>

---
layout: section
align: center
class: bg-tlb-yellow
---

# TS2742エラー見たことありますか？

---

![](/ts2742-ide.png)

> `The inferred type of 'returnValue' cannot be named without a reference to ''../../middle-lib/node_modules/base-lib/dist/index.js'. This is likely not portable. A type annotation is necessary. ts(2742)`

> `'returnValue' の推論された型には、'../../middle-lib/node_modules/base-lib/dist/index.js' への参照なしで名前を付けることはできません。これは、移植性がない可能性があります。型の注釈が必要です。ts(2742)`

<div class="text-4xl text-center my-8">?</div>

---

# 実際の開発で見た例

`@mantine/core`の`createPolymorphicComponent`を使ったら、

`'SomeComponent'` の推論された型には、`'○○○/csstype/○○○○○○○'`への参照なしで名前を付けることはできません。

<br>

`@storybook/experimental-addon-test`の`fn`をラップした関数を作ったら、

`'extendedFn'`の推論された型には、`@vitest/spy`への参照なしで名前を付けることはできません。

---
layout: section
align: center
class: bg-tlb-yellow
---

# どういうエラーなのか？

---

# このエラーは何なのか

TypeScriptがd.tsファイルを生成する際に、**間接的に参照される型**を解決できない場合に発生する。

https://github.com/microsoft/TypeScript/pull/58176#issuecomment-2052698294
が詳しい。

![](/ryan-cavanaugh-comment.png)

---

# tscのd.ts出力を考える

パッケージの依存関係は以下のようになっているとする

```
main
└── middle-lib@1.0.0
    └── base-lib@2.0.0
```

**mainはbase-libには直接依存していない。**いわゆる推移的依存関係（transitive dependency）にある。

---

# node_modulesの構造はパッケージマネージャによって異なる

例えば、pnpmのような厳格な依存関係を持つパッケージマネージャーの場合はこう👇。
（他にもdependenciesやpeerDependenciesがあれば、さらに別の構造になり得る）

npmはデフォルトでhoistingを行うので、node_modulesの構成は異なる。

つまり、**tscはnode_modulesの構造に依存した出力をしてはいけない！**

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
```

```ts
// middle-lib/index.d.ts
export declare const wrappedReturnsInferredSomeComplexType: () => import("base-lib").SomeComplexType;
```

middle-lib/index.d.tsは`base-lib`に依存している

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

export const mainValue: SomeComplexType;
```

node_modulesの構造はパッケージマネージャによって異なるのでNG

```ts
import { getBaseLibValue } from "middle-lib";
import type { SomeComplexType } from "middle-lib/node_modules/base-lib/index.js";

export const mainValue: SomeComplexType;
```

middle-libの下のnode_modulesに依存するのも（動く可能性はあるが）NG

package.jsonのexportsフィールドがある場合は参照不可

---

# これは...?

```ts
import { getBaseLibValue } from "middle-lib";
import type { SomeComplexType } from "base-lib";

// 一見よさそうに見えるが、middle-lib --> base-libとmain --> base-libの指す先が同じとは限らない
// 別のバージョンに依存していた場合は、実装と型が乖離して壊れる可能性がある

export const mainValue: SomeComplexType;
```

tscからするとお手上げ🙌

-> **移植性がない**として`TS2742`エラーを発生させる

---
layout: section
align: center
class: bg-tlb-yellow
---

# われわれはどうするべきなのか

---

# エラーの言うとおり、型注釈を明示的に書く。

```ts
import { wrappedReturnsInferredSomeComplexType } from "ref";

export const returnValue: ReturnType<
  typeof wrappedReturnsInferredSomeComplexType
> = wrappedReturnsInferredSomeComplexType();
```

これで解決!...🤔

---

# 型注釈を書きたくないときもある

関数の型にgenericsがあり、引数によって返り値の型が変わる場合は望ましくない...

```ts
const validator: () => { name: string } = createValidator(
  //                        ^ ここは書きたくないわけで
  z.object({ name: z.string() }),
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
layout: section
align: center
class: bg-tlb-yellow
---

# 基本的にライブラリ側で修正されるのが望ましい

---

# ライブラリ側(middle-lib)の修正

- 型をたどれるように再exportする
- TS5.5以上に上げてみる
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html#consulting-packagejson-dependencies-for-declaration-file-generation
  - TS5.4以前でTS2742エラーが発生している場合、偽陽性かもしれない

---

# ライブラリ側で気づきやすくする

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
layout: section
align: center
class: bg-tlb-yellow
---

# とはいってもライブラリを簡単に修正できないときもある

---

# ユーザ側（main）のworkaround

- 型注釈を書いて型推論を避ける
  - 型推論に意義がある場合はあんまりやりたくない
- tsconfigの`declaration`を`false`にする
  - 有効なd.tsを出力できないからエラーになっているので、そもそも出力しなければエラーにならない
- 直接依存に追加してimportする
  - `import type {} from "base-lib"`をmainのどこかに書く
  - コンパイル対象のどこかに`base-lib`への参照があれば、それと同じ先に解決される
  - ライブラリ側が依存しているバージョンと別のバージョンに解決してしまう可能性があるので要注意
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

---
layout: section
align: center
class: bg-tlb-yellow
---

![](/teamlab-frontend.png)

<br>

# We're Hiring!

TypeScriptを共に書いてくれる仲間を募集中です！

https://www.team-lab.com/recruit/

<!-- TODO: sectionの時にfontをboldにしたい -->

<!--
というか、factの文字サイズを小さくするのが良いのかも
-->
