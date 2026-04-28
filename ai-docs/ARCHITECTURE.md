# アーキテクチャ概要

## モジュール依存関係

```
parser → (なし)
runtime → (なし)
stdlib → runtime, types
semantic → stdlib, types
interpreter → stdlib, runtime, parser, types
debugger → interpreter, runtime
index.ts → すべて
```

循環依存なし。各層は下位層のみ参照。

## semantic/

| ファイル | 責務 |
|---|---|
| `validator.ts` | AST 全体の型検査・エラー収集。メインエントリ |
| `builtin-checker.ts` | 組み込み関数・テンプレート呼び出し・メソッド/メンバー呼び出しの型検査 |
| `template-instantiator.ts` | 関数テンプレートの型引数推論・単相化。`substituteExpr` で式内の TypeTemplateArg まで再帰置換する |
| `type-compat.ts` | 型の互換性判定（`sameType`, `isAssignable`, `inferBinaryType` 等） |
| `type-utils.ts` | 型プレディケート純関数（`isIntType`, `containsVoid` 等） |

### 循環依存回避パターン

`builtin-checker.ts` は `validator.ts` の `inferExprType` / `validateExpr` を必要とするが、
`validator.ts` も `builtin-checker.ts` を呼ぶ。コールバック型で解決：

```typescript
export type ValidateExprFn = (expr: ExprNode | null, context: ValidationContext, expected?: TypeNode | "bool" | "int") => TypeNode | null;
export type InferExprTypeFn = (expr: ExprNode, context: ValidationContext) => TypeNode | null;
```

`validator.ts` 側でラムダを渡す：
```typescript
validateBuiltinCall(callee, args, line, col, context, validateExpr, inferExprType);
```

## interpreter/

| ファイル | 責務 |
|---|---|
| `index.ts` | 文実行・関数呼び出し・range-for・デバッグ連携のメインエントリ |
| `evaluator.ts` | 式評価・lvalue location 解決（pair メンバー・map インデックス・tuple get） |
| `builtin-eval.ts` | 組み込み関数・テンプレート・メソッド/メンバー呼び出しの評価（stdlib dispatch への薄い橋渡し） |
| `runtime/` | ランタイム支援（変数スコープ・型変換・デフォルト値等） |

### evaluator.ts における objectKind 分岐について

`pair.first`/`pair.second` の lvalue location 解決、map インデックスの lvalue location 解決、`get<I>(t)` の lvalue location 解決は `evaluator.ts` の core に直書きされている。これは stdlib の registry pattern ではなく、言語の代入意味論（RuntimeLocation）に属するため意図的な設計。stdlib の registry は rvalue（値の読み取り）専用。

### EvalCtx パターン

`builtin-eval.ts` は evaluator の内部メソッドを多数必要とする。
`EvalCtx` インターフェースで依存を逆転：

```typescript
export interface EvalCtx {
  evaluateExpr(expr: ExprNode): RuntimeValue;
  fail(message: string, line: number): never;
  expectInt(value: RuntimeValue, line: number): Extract<RuntimeValue, { kind: "int" }>;
  // ...
}
```

`evaluator.ts` が `evalCtx` getter で `this` をラップして渡す。

## stdlib/

| ファイル | 責務 |
|---|---|
| `metadata.ts` | 組み込み関数・テンプレート型・template 風 builtin の metadata 登録・検索 |
| `template-exprs.ts` | テンプレート式ユーティリティ（`isTemplateNamed`, `getSingleTypeTemplateArg` 等） |
| `template-types.ts` | テンプレート型アクセサ（`vectorElementType`, `iteratorContainerType` 等） |
| `check-registry.ts` / `eval-registry.ts` | stdlib handler の登録・ディスパッチ（free/template/method/member） |
| `vector-methods.ts` / `map-methods.ts` / `pair-members.ts` | コンテナ metadata |
| `builtins/compare.ts` | 値比較純関数（評価器文脈不要） |
| `eval-context.ts` | `EvalCtx` インターフェース定義（stdlib eval 関数が受け取る評価器コンテキスト） |
| `check-context.ts` | `CheckCtx` インターフェース定義（stdlib check 関数が受け取る型検査コンテキスト） |
| `eval/value-functions.ts` | abs / max / min / swap の評価実装 |
| `eval/factories.ts` | make_pair / make_tuple の評価実装 |
| `eval/vector.ts` | vector コンストラクタ・全メソッドの評価実装 |
| `eval/get.ts` | get<N> の評価実装 |
| `eval/pair-map.ts` | pair member / map.size の評価実装 |
| `eval/range-algorithms.ts` | sort / reverse / fill の評価実装 |
| `check/value-functions.ts` | abs / max / min / swap の型検査実装 |
| `check/factories.ts` | make_pair / make_tuple の型検査実装 |
| `check/vector.ts` | vector コンストラクタ・全メソッドの型検査実装 |
| `check/get.ts` | get<N> の型検査実装 |
| `check/methods.ts` | pair member / map メソッドの型検査実装 |
| `check/range-algorithms.ts` | sort / reverse / fill の型検査実装 |

### stdlib の位置づけ（core 直書き解消後の現状）

- `stdlib/eval/` が vector / sort / get<N> などの **振る舞い本体** を保持する
- `stdlib/check/` が同機能の **型検査本体** を保持する
- `semantic/builtin-checker.ts` と `interpreter/builtin-eval.ts` は **薄いディスパッチャ** に徹する
- コアへの intrinsic 直書きは解消済み

補足:

- 上の「コア」は `semantic/` と `interpreter/` の中核を指す
- `pair.first` / `pair.second` は member registry、`map.size()` は method registry、`get<I>` は template-call registry で扱う
- `vector.begin/end` は metadata に従って内部 iterator を返し、range algorithm はその iterator を受け取る
- core 側は `stdlib/*-registry.ts` への dispatch に徹し、std::風 API 名への直書き依存を持たない

### EvalCtx パターン（stdlib 版）

`stdlib/eval/` の各関数は `EvalCtx` を受け取る。`EvalCtx` は `stdlib/eval-context.ts` で定義され、`evaluator.ts` の `evalCtx` getter がこれを実装して渡す。

同様に `stdlib/check/` の各関数は `CheckCtx`（`stdlib/check-context.ts`）を受け取り、`builtin-checker.ts` の `makeCheckCtx()` が ValidationContext を閉じ込めて渡す。

## 新規組み込み追加手順

1. `stdlib/metadata.ts` または `stdlib/*-methods.ts` に metadata を追加
2. `stdlib/check/<category>.ts` に型検査実装を追加し、必要なら `check-registry.ts` へ登録する
3. `stdlib/eval/<category>.ts` に評価実装を追加し、必要なら `eval-registry.ts` へ登録する
4. `semantic/builtin-checker.ts` / `interpreter/builtin-eval.ts` の既存 dispatcher で到達可能か確認する
5. `tests/` にテスト追加
6. `SPECIFICATION.md` 更新
