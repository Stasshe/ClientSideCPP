# 実装ディレクティブ

`SPECIFICATION.md` は「最終的にどう振る舞うべきか」を定義する文書であり、日々の実装優先順位までは拘束していない。
このファイルは、実装担当が何から着手し、どこまでを 1 変更で揃えるかを強制するための運用ディレクティブである。

## 1. 基本方針

- 広い仕様を薄く触るより、競技プログラミングの実在コードを 1 本ずつ確実に通す
- 新機能は parser だけ、runtime だけのように片肺で入れない
- 1 機能を追加したら、`parser`、`semantic`、`interpreter/runtime`、`debugger`、`tests`、`README` / `SPECIFICATION` の差分を同一変更で揃える
- 「C++ 全体を一般化して実装する」のではなく、「競プロ頻出パターンを安全に再現する組み込み」として切り分けてよい
- 未実装機能に遭遇したら、曖昧に通そうとせず、明確な compile error か、今回のマイルストーン対象なら最後まで実装する

## 2. 優先順位

実装優先順位は以下で固定する。

1. このファイルにあるゴールデンプログラムを通す
2. そのために必要な標準ライブラリ断片・構文糖衣を実装する
3. その機能に対応する診断とデバッグ表示を揃える
4. その後に周辺機能や一般化を行う

`SPECIFICATION.md` に書いてあるが、ゴールデンプログラムに不要な機能は後回しでよい。

## 3. 現在の最優先ゴールデンプログラム

以下のプログラムを compile + run できる状態を、次の主要マイルストーンの必達条件とする。

```cpp
#include<iostream>
#include<vector>
#include<map>
using ll = long long;
using namespace std;
void solve()
{
    int n,k;cin>>n>>k;
    vector<int>a(n+1);
    map<int,ll>q;
    for(int i=1;i<=n;i++)cin>>a[i],q[a[i]]+=a[i];
    vector<ll>b;
    for(auto x:q)b.push_back(x.second);
    sort(b.begin(),b.end(),greater<>());
    ll ans=0;
    for(int i=k;i<b.size();i++)ans+=b[i];
    cout<<ans<<'\n';
}
int main()
{
    int t=1;
    while(t--)solve();
    return 0;   
}
```

## 4. このゴールデンプログラムで最低限必要な対応

このプログラムを通すために、少なくとも以下を実装対象として扱う。

- `#include <iostream>`、`#include <vector>`、`#include <map>` を受理する
- `using ll = long long;` の型エイリアスを受理する
- `map<int, ll>` を組み込みコンテナとしてサポートする
- `q[a[i]]` による参照取得と、未存在キーへの既定値挿入をサポートする
- `for (auto x : q)` の range-for をサポートする
- map の要素は `.first` と `.second` でアクセスできる値として扱う
- `sort(first, last, greater<>())` を受理する
- `greater<>` は今回の対象では「降順比較子」としての組み込みサポートでよい

## 5. 実装粒度のルール

このゴールデンプログラム対応では、以下を禁止する。

- parser だけ通して runtime が落ちる状態で止める
- runtime だけ実装して validator / diagnostics が未整備のままにする
- README / `SPECIFICATION.md` / テストを更新せずに機能だけ追加する
- 汎用テンプレート実装が大変だからといって `map` 対応を無期限に先送りする

許容する近道は以下。

- `map` は一般テンプレートではなく、`vector` / `pair` と同様に組み込み ADT として実装する
- `greater<>` は完全なテンプレート機構ではなく、`sort` 用の既知 comparator として特別扱いする
- `#include` は実ファイル探索ではなく、サポート済み標準ヘッダ名の受理として実装する

## 6. 受け入れ条件

最低でも次の入出力を自動テスト化する。

### Case 1

入力:

```text
8 2
1 1 2 2 2 3 4 4
```

出力:

```text
5
```

### Case 2

入力:

```text
5 1
7 7 7 1 1
```

出力:

```text
2
```

## 7. 実装時の判断基準

- 仕様が広すぎて迷ったら、「このゴールデンプログラムを通すために必要か」で優先度を決める
- 新しい競プロ断片を追加目標にするときは、このファイルにゴールデンプログラムと受け入れ条件を先に追記する
- 機能要求が複数ある場合も、同時に全部一般化せず、通すべき実例を先に固定する
