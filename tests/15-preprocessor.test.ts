import { compile, compileAndRun } from "../dist/index.esm.js";
import { describe, expect, it } from "vitest";

describe("Preprocessor", () => {
  // ── Object macros ──────────────────────────────────────────────────────────

  it("object macro: basic constant substitution", () => {
    const source = `
#define MOD 1000000007
int main() {
  int x = MOD;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1000000007\n");
  });

  it("object macro: expands to type token", () => {
    const source = `
#define ll long long
int main() {
  ll x = 1000000000LL * 3;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3000000000\n");
  });

  it("object macro: chained expansion (macro body contains another macro)", () => {
    const source = `
#define BASE 10
#define LIMIT BASE * BASE
int main() {
  cout << LIMIT << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("100\n");
  });

  it("object macro: redefinition uses last definition", () => {
    const source = `
#define VAL 1
#define VAL 2
int main() {
  cout << VAL << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2\n");
  });

  it("object macro: empty body expands to nothing", () => {
    const source = `
#define NOOP
int main() {
  int x NOOP = 5;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n");
  });

  it("object macro: not expanded inside string literals", () => {
    const source = `
#define HELLO world
int main() {
  cout << "HELLO" << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("HELLO\n");
  });

  it("object macro: not expanded inside line comments", () => {
    const source = `
#define X 999
int main() {
  int x = 1; // X should not expand here
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n");
  });

  // ── Function macros ────────────────────────────────────────────────────────

  it("function macro: rep pattern (2-arg for loop)", () => {
    const source = `
#define rep(i, n) for (int i = 0; i < (n); i++)
int main() {
  int sum = 0;
  rep(i, 5) sum += i;
  cout << sum << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });

  it("function macro: rep pattern (3-arg for loop)", () => {
    const source = `
#define rep(i, a, b) for (int i = (a); i < (b); i++)
int main() {
  int sum = 0;
  rep(i, 2, 6) sum += i;
  cout << sum << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("14\n");
  });

  it("function macro: nested rep", () => {
    const source = `
#define rep(i, n) for (int i = 0; i < (n); i++)
int main() {
  int cnt = 0;
  rep(i, 3) rep(j, 3) cnt++;
  cout << cnt << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("9\n");
  });

  it("function macro: chmin / chmax", () => {
    const source = `
#define chmin(a, b) (a = (a) < (b) ? (a) : (b))
#define chmax(a, b) (a = (a) > (b) ? (a) : (b))
int main() {
  int x = 5;
  chmin(x, 3);
  cout << x << "\\n";
  chmax(x, 4);
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n4\n");
  });

  it("function macro: arg containing nested parens (no spurious split)", () => {
    const source = `
#define SQR(x) ((x) * (x))
int main() {
  int a = 3, b = 4;
  cout << SQR(a + b) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("49\n");
  });

  it("function macro: arg is function call with comma (no arg split)", () => {
    const source = `
#define WRAP(x) (x)
int main() {
  cout << WRAP(max(1, 2)) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2\n");
  });

  it("function macro: arg is another macro (chained expansion)", () => {
    const source = `
#define N 5
#define rep(i, n) for (int i = 0; i < (n); i++)
int main() {
  int sum = 0;
  rep(i, N) sum += i;
  cout << sum << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });

  it("function macro: zero-argument macro", () => {
    const source = `
#define NEWLINE() cout << "\\n"
int main() {
  cout << 42;
  NEWLINE();
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("42\n");
  });

  it("function macro: used without () is not expanded", () => {
    const source = `
#define F(x) ((x) + 1)
int main() {
  // F used as identifier name for user function
  int F = 10;
  cout << F << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });

  it("function macro: wrong arg count is a compile error", () => {
    const source = `
#define ADD(a, b) ((a) + (b))
int main() {
  cout << ADD(1) << "\\n";
  return 0;
}
`;
    const result = compile(source);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toMatch(/macro 'ADD' expects 2/);
  });

  // ── Backslash continuation ─────────────────────────────────────────────────

  it("backslash continuation: multi-line object macro", () => {
    const source = `
#define LONG_EXPR \\
  1 + 2 + 3
int main() {
  cout << LONG_EXPR << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("6\n");
  });

  it("backslash continuation: multi-line function macro", () => {
    const source = `
#define rep(i, n) \\
  for (int i = 0; i < (n); i++)
int main() {
  int s = 0;
  rep(i, 4) s += i;
  cout << s << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("6\n");
  });

  it("backslash continuation: line numbers preserved after macro definition", () => {
    const source = `
#define DOUBLE(x) \\
  ((x) * 2)
int main() {
  cout << DOUBLE(7) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("14\n");
  });

  // ── Variadic macros ────────────────────────────────────────────────────────

  it("variadic macro: __VA_ARGS__ basic expansion", () => {
    const source = `
#define PRINT(...) cout << __VA_ARGS__ << "\\n"
int main() {
  PRINT(42);
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("42\n");
  });

  it("variadic macro: named param + variadic", () => {
    const source = `
#define DBG(label, ...) cout << label << __VA_ARGS__ << "\\n"
int main() {
  DBG("val=", 99);
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("val=99\n");
  });

  it("variadic macro: minimum arg count enforced", () => {
    const source = `
#define DBG(label, ...) cout << label << __VA_ARGS__ << "\\n"
int main() {
  DBG();
  return 0;
}
`;
    const result = compile(source);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toMatch(/macro 'DBG' expects at least 1/);
  });

  // ── const / using alias ────────────────────────────────────────────────────

  it("const decl becomes object macro", () => {
    const source = `
const int MOD = 998244353;
int main() {
  cout << MOD << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("998244353\n");
  });

  it("using alias becomes object macro", () => {
    const source = `
using ll = long long;
int main() {
  ll x = 3000000000LL;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3000000000\n");
  });

  it("using alias: vector type alias", () => {
    const source = `
using vi = vector<int>;
int main() {
  vi v(3, 7);
  cout << v[1] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7\n");
  });

  // ── Compatibility normalization ────────────────────────────────────────────

  it("integer literal suffixes stripped (LL, ULL, etc.)", () => {
    const source = `
int main() {
  long long x = 9000000000LL;
  long long y = 1ULL;
  cout << x + y << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("9000000001\n");
  });

  it("scientific notation integer literal normalized", () => {
    const source = `
const int MOD = 1e9 + 7;
int main() {
  cout << MOD << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1000000007\n");
  });

  it("signed main accepted", () => {
    const source = `
signed main() {
  cout << 1 << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n");
  });

  it("ios_base::sync_with_stdio ignored", () => {
    const source = `
int main() {
  ios_base::sync_with_stdio(false);
  cin.tie(nullptr);
  cout << "ok\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("ok\n");
  });

  it("unsupported directive (#ifdef) is a compile error", () => {
    const source = `
#ifdef DEBUG
int x = 1;
#endif
int main() { return 0; }
`;
    const result = compile(source);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toMatch(/unsupported preprocessor directive/);
  });

  // ── Combined competitive programming patterns ──────────────────────────────

  it("typical competitive template: rep + MOD + ll", () => {
    const source = `
#include <bits/stdc++.h>
using namespace std;
using ll = long long;
const ll MOD = 1e9 + 7;
#define rep(i, n) for (int i = 0; i < (n); i++)

int main() {
  ll ans = 1;
  rep(i, 10) ans = ans * 2 % MOD;
  cout << ans << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1024\n");
  });

  it("all(v) macro expands inside function call", () => {
    const source = `
#define all(v) v.begin(), v.end()
int main() {
  vector<int> v = {3, 1, 2};
  sort(all(v));
  rep(i, 3) cout << v[i] << "\\n";
  return 0;
}
`;
    // rep not defined here — should fail compile
    const result = compile(source);
    expect(result.ok).toBe(false);
  });

  it("all(v) macro with rep defined", () => {
    const source = `
#define rep(i, n) for (int i = 0; i < (n); i++)
#define all(v) v.begin(), v.end()
int main() {
  vector<int> v = {3, 1, 2};
  sort(all(v));
  rep(i, 3) cout << v[i] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n2\n3\n");
  });
});
