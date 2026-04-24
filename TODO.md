1. 仕様の固定長配列ゼロ初期化が未実装です。仕様では int a[1000]; はゼロ初期化ですが SPECIFICATION.md:49、実装は初期化子なし配列を未初
     期化要素で作っています。src/interpreter/interpreter.ts:381
  2. 関数まわりの静的検査がまだ不足しています。仕様では void 関数の return expr; はコンパイルエラー、int main() が必須です。
     SPECIFICATION.md:241 SPECIFICATION.md:283 しかし validator は return の型整合や main シグネチャを見ておらず、実行時に流れるか、その
     まま通ります。src/semantic/validator.ts:26 src/semantic/validator.ts:94 実際 void main() は通り、void f(){ return 1; } も通ります。
  3. 仕様上コンパイルエラーにすべき多くの意味エラーが、まだ実行時エラーです。未宣言識別子、引数数不一致、return; in non-void などは仕様
     では compile-time 寄りです。SPECIFICATION.md:356 しかし現状の validator は識別子解決や関数シグネチャ照合をしていません。src/
     semantic/validator.ts:218
  4. 組み込み関数・アルゴリズム群が未実装です。仕様の abs / max / min / swap / sort / reverse / fill はまだコード上に実装がありません。
     SPECIFICATION.md:334 rg でも実装ヒットは実質ありません。
  5. 実行時エラーのスタックトレースが仕様未達です。仕様は複数フレームの stack trace を求めていますが SPECIFICATION.md:373、RuntimeTrap
     は functionName と line しか持たず src/runtime/errors.ts:3、整形も1フレームだけです。src/compiler.ts:35
  6. 再帰深さ上限とステップ上限による停止が未実装です。仕様には stack overflow と step limit 超過があります。SPECIFICATION.md:279
     SPECIFICATION.md:389 しかしコード上に深さ制限や実行ステップ上限のチェックは見当たりません。
  7. 警告機構が未実装です。仕様は「非 void 関数の末尾到達」を warning として出す前提ですが SPECIFICATION.md:392、戻り値モデルは単に未初
     期化や void に流れるだけで、warning を返す経路がありません。src/interpreter/interpreter.ts:202
  8. using namespace std; 許可の仕様に未対応です。仕様は許可と書いていますが SPECIFICATION.md:300、lexer に using / namespace / std 対応
     がなく src/parser/lexer.ts:3、トップレベルも型宣言以外を受けません。src/parser/parser.ts:42
  9. watchList は API 形だけで実装されていません。仕様は watch expression の現在値提供を求めていますが SPECIFICATION.md:485、実装は常に
     空配列です。src/debugger/session.ts:18 src/interpreter/interpreter.ts:1119
  10. pause() は実質未実装に近いです。仕様には実行一時停止 API がありますが SPECIFICATION.md:470、現状の run() は同期実行で、pause() が
     効く running 状態へ外部から割り込む経路がありません。src/debugger/session.ts:63 src/debugger/session.ts:67

  仕様書の不整合

  - int n, m; は仕様例にありますが SPECIFICATION.md:120、EBNF の var_decl は単一宣言しか許していません。SPECIFICATION.md:534 実装も未対
    応です。
  - type = vector<type> と EBNF にはありますが SPECIFICATION.md:515、同時に vector<vector<int>> は将来対応とも書かれています。
    SPECIFICATION.md:97 今の実装は後者寄りで、ネスト vector は未対応です。

  今できている範囲

  - 式評価、制御構文、関数、cin/cout/cerr、固定長配列、vector 基本メソッド、グローバル変数、stepInto/Over/Out と breakpoint はおおむね
    入っています。

  優先順位を付けるなら、次は

  1. 静的意味解析の拡張
  2. 固定長配列初期化仕様の整理
  3. 組み込み関数群
  4. 実行制限と stack trace
     の順が妥当です。