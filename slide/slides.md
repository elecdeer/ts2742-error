---
theme: ./theme
transition: slide-left
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

TSKaigi 2025 LT @elecdeer

<style>
  code {
    /* --uno: 'bg-slate-900 !'; */
    /* background-color: var(--) */

    /* @apply bg-slate-900; */

    --neversink-fg-code-color:rgb(255, 255, 255);
    --neversink-bg-code-color:rgb(26, 26, 43);
  }
</style>

<!--
（全体）文字サイズを上げたい
-->

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
    <simple-icons-github /> @elecdeer
  </div>
</div>

<div class="my-8">
チームラボ フロントエンド班
</div>

<!--
00:30

会場から5分くらいの所にあるチームラボという会社でフロントエンドエンジニアをやっています
-->

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

<div class="text-4xl text-center my-4">?</div>

<!--
移植性とかいう単語TypeScriptで初めて見た
-->

---

# 実際の開発で見た例

`@mantine/core`の`createPolymorphicComponent`を使ったら、

-> `'SomeComponent'の推論された型には、'○○○/csstype/○○○○○○○'への参照なしで名前を付けることはできません。`

<br>

`@storybook/experimental-addon-test`の`fn`をラップした関数を作ったら、

-> `'extendedFn'の推論された型には、@vitest/spyへの参照なしで名前を付けることはできません。`

<!--
1:00位？

この辺削る？
-->

---
layout: section
align: center
class: bg-tlb-yellow
---

# どういうエラーなのか？

<!--
このTS2742エラーはどういうエラーなのでしょうか
-->

---

# このエラーは何なのか

TypeScriptがd.tsファイルを生成する際に、**間接的に参照される型**を解決できない場合に発生する。

https://github.com/microsoft/TypeScript/pull/58176#issuecomment-2052698294
が詳しい。

![](/ryan-cavanaugh-comment.png)

<!--
本題の部分をもっと大きくしたいかも
-->

---

# tscのd.ts出力を考える

パッケージの依存関係は以下のようになっているとする。

```mermaid
flowchart LR
  main("main")
  middle("middle-lib")
  base("base-lib")

  main --> middle
  middle --> base
```

**mainはbase-libには直接依存していない。** いわゆる推移的依存関係（transitive dependency）

<!--
例として以下のような依存関係のパッケージを考えます
-->

<!--
# node_modulesの構造はパッケージマネージャによって異なる

例えば、pnpmのような厳格な依存関係を持つパッケージマネージャーの場合はこう👇。<br>
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
-->

---
class: codeblock-large
---

# base-libとmiddle-libのd.ts

### base-lib/index.d.ts

```ts
export type SomeComplexType = {
  // （中身は余り関係無いが、単純すぎるとインライン化されるみたい）
  num: number;
  nest?: SomeComplexType;
};
export declare const returnsInferredSomeComplexType: () => SomeComplexType;
```

<br>

### middle-lib/index.d.ts

<!-- prettier-ignore -->
```ts
export declare const wrappedReturnsInferredSomeComplexType: 
  () => import("base-lib").SomeComplexType;
```

`base-lib`に依存している

```mermaid {theme: 'neutral', scale: 0.7}
flowchart LR
  subgraph MainProject["main"]
    main("index.ts")
  end

  subgraph MiddleLib["middle-lib"]
    mid-dts("index.d.ts")
    mid-js("index.js")
  end
  style mid-dts fill:#ffe066, stroke:#b59f00, stroke-width:2px

  subgraph BaseLib["base-lib"]
    base-dts("index.d.ts")
    base-js("index.js")
  end
  style base-dts fill:#ffe066, stroke:#b59f00, stroke-width:2px

  MainProject --> MiddleLib
  MiddleLib --> BaseLib

```

---
class: codeblock-large
---

# mainパッケージでの問題

mainパッケージで以下の様なコードを書いたとする。

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

<div class="my-16" />

```mermaid {theme: 'neutral', scale: 0.7}
flowchart LR
  subgraph MainProject["main"]
    direction LR
    main("index.ts")
    mainDts("index.d.ts")
      style mainDts stroke-dasharray: 5 5
  end
  style main fill:#ffe066, stroke:#b59f00, stroke-width:2px

  subgraph MiddleLib["middle-lib"]
    mid-dts("index.d.ts")
    mid-js("index.js")
  end
  subgraph BaseLib["base-lib"]
    base-dts("index.d.ts")
    base-js("index.js")
  end

  MainProject --> MiddleLib
  MiddleLib --> BaseLib

  main --> mainDts


```

---
class: codeblock-large
---

# ダメな例

### mainパッケージ基準の相対パスで指定

<!-- prettier-ignore -->
```ts
import { getBaseLibValue } from "middle-lib";
import type { SomeComplexType } from 
  "../node_modules/middle-lib/node_modules/base-lib/index.js";

export const mainValue: SomeComplexType;
```

<div class="my-8" />

### middle-libの内部ディレクトリを参照

```ts
import { getBaseLibValue } from "middle-lib";
import type { SomeComplexType } from "middle-lib/node_modules/base-lib/index.js";

export const mainValue: SomeComplexType;
```

<div class="my-8" />

-> node_modulesの構造はパッケージマネージャによって異なるのでNG

大まかには、hoistingするかどうかで変わる

---
class: codeblock-large
---

# これは...?

```ts
import { getBaseLibValue } from "middle-lib";
import type { SomeComplexType } from "base-lib";

export const mainValue: SomeComplexType;
```

一見よさそうに見えるが、middle-lib --> base-libとmain --> base-libの指す先が同じとは限らない

別のバージョンに依存していた場合は、実装と型が乖離して壊れる可能性がある

```mermaid {scale: 0.8}
flowchart LR
  main("main")
  middle("middle-lib")
  baseV1("base-lib@1")
  baseV2("base-lib@2")

  main --> middle
  middle --> baseV1
  main --> baseV2
```

tscからするとお手上げ🙌

-> **移植性がない**として`TS2742`エラーを発生させる

<!--
2:30位？

依存関係の図が欲しいかも
-->

---
layout: section
align: center
class: bg-tlb-yellow
---

# どうするべきなのか

---
class: codeblock-large
---

# ユーザ側（main）の対策

## エラーの言うとおり、型注釈を明示的に書く

```ts
import { wrappedReturnsInferredSomeComplexType } from "ref";

export const returnValue: ReturnType<
  typeof wrappedReturnsInferredSomeComplexType
> = wrappedReturnsInferredSomeComplexType();
```

これで解決!...🤔

<div class="my-8" />

<v-click>

型推論が便利なときは書きたくない...

```ts
const validator: () => { name: string } = createValidator(
  //                        ^ ここは書きたくないわけで
  z.object({ name: z.string() }),
);
```

あと単に冗長

</v-click>

---

# ユーザ側（main）のworkaround

- tsconfigの`declaration`を`false`にする
  - 有効なd.tsを出力できないからエラーになっているので、そもそも出力しなければエラーにならない
- 直接依存に追加してimportする
  - `import type {} from "base-lib"`をmainのどこかに書く
  - コンパイル対象のどこかに`base-lib`への参照があれば、それと同じ先に解決される
  - ライブラリ側が依存しているバージョンと別のバージョンに解決してしまう可能性があるので要注意
- TS5.5以上に上げてみる
  - [Consulting
    package.json
    Dependencies for Declaration File Generation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html#consulting-packagejson-dependencies-for-declaration-file-generation)
  - TS5.4以前でTS2742エラーが発生している場合、偽陽性かもしれない
- 後述の対策をpnpm patch

<!--
全部読む暇はなさそう

見出しだけ読むで良さそう
-->

---
layout: section
align: center
class: bg-tlb-yellow
---

# ライブラリ側の修正の方が望ましい

---
class: codeblock-large
---

# そもそもとして

```ts
import { getBaseLibValue, SomeComplexType } from "middle-lib";

export const mainValue: SomeComplexType;
```

mainのd.ts出力で、こうできれば万事解決である

-> **middle-libからSomeComplexTypeが再exportされていればよい**

<v-click>

<div class="text-4xl text-center my-8">😸</div>

</v-click>

---

# ライブラリ側の実装で事前に気づくことはできるのか

-> **TS5.8時点では完全なチェックはできないが、ある程度防ぐ方法はある**

- tsconfigの`isolatedDeclarations`を有効にする
  - ダメなパターンを実装しにくくなる
    - 全てのパターンを防げるわけでは無さそう？
  - 明示的な型指定が強制されるので、大抵の場合はライブラリ側でエラーになる
- 不適切なビルドを修正する
  - 本来ライブラリ側でTS2742エラー（あるいはTS4023）が出るはずなのに、すり抜ける事がある
    - package.jsonのexportsやesm/cjs問題も影響していそうだが、正直よく分からない
  - tscの出力をそのままpublishしていないライブラリでありがち？
  - `arethetypeswrong`でチェックしてみる

<div class="text-md">
https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
も参考に
</div>

<!--
全部読む暇はなさそう

見出しだけ読むで良さそう
-->

---

# まとめ

- `TS2742`は間接的な依存関係の型を解決できないときに発生する
- ライブラリ側で修正するのが望ましい
  - ユーザ側でのworkaroundもあるが、その方が健全

## TS2742が出る再現例

- https://github.com/elecdeer/ts2742-error

## 参考になるissueとか

- https://github.com/microsoft/TypeScript/pull/58176#issuecomment-2052698294
- https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
- https://github.com/microsoft/TypeScript/issues/48212

<!--
自分で調べるときはこの辺が参考に
-->

---
layout: section
align: center
# class: bg-tlb-yellow
---

![](/teamlab-frontend.png)

<br>

<div class="grid grid-cols-[1fr_auto] gap-4">
  <div class="flex flex-col items-center">

# We're Hiring!

TypeScriptを共に書いてくれるメンバーを募集中です！

サマーインターンシップも応募受付中！

  </div>
  <div class="flex flex-col items-center mx-8">
    <QRCode value="https://www.team-lab.com/recruit/" :size="120" render-as="svg"/>
  </div>
</div>

<!--
QRコードを表示したい
TODO: リンク差し替え
-->
