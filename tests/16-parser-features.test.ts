import { compile, compileAndRun } from "../dist/index.esm.js";
import { describe, expect, it } from "vitest";

// ── using T = X; type aliases ──────────────────────────────────────────────

describe("Type aliases (using T = X;)", () => {
  it("global ll = long long", () => {
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

  it("global vi = vector<int>", () => {
    const source = `
using vi = vector<int>;
int main() {
  vi v = {1, 2, 3};
  for (int x : v) cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n2\n3\n");
  });

  it("global pii = pair<int,int>", () => {
    const source = `
using pii = pair<int, int>;
int main() {
  pii p = make_pair(7, 3);
  cout << p.first << " " << p.second << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7 3\n");
  });

  it("local alias inside function", () => {
    const source = `
int main() {
  using ll = long long;
  ll x = 1000000000LL * 2;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2000000000\n");
  });

  it("alias used in function parameter type", () => {
    const source = `
using ll = long long;
ll double_it(ll x) { return x * 2; }
int main() {
  cout << double_it(5) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });

  it("alias used in cin target", () => {
    const source = `
using ll = long long;
int main() {
  ll a, b;
  cin >> a >> b;
  cout << a + b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "3000000000 1000000000");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("4000000000\n");
  });

  it("chained aliases: vll = vector<ll>", () => {
    const source = `
using ll = long long;
using vll = vector<ll>;
int main() {
  vll v = {1000000000LL, 2000000000LL};
  cout << v[0] + v[1] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3000000000\n");
  });

  it("alias in for-loop variable declaration", () => {
    const source = `
using ll = long long;
int main() {
  ll sum = 0;
  for (ll i = 1; i <= 5; i++) sum += i;
  cout << sum << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("15\n");
  });

  it("multiple aliases coexist", () => {
    const source = `
using ll = long long;
using pll = pair<long long, long long>;
int main() {
  ll a = 100, b = 200;
  pll p = make_pair(a, b);
  cout << p.first << " " << p.second << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("100 200\n");
  });
});

// ── const qualifier ────────────────────────────────────────────────────────

describe("const qualifier", () => {
  it("const int global", () => {
    const source = `
const int MOD = 1000000007;
int main() {
  int x = 5;
  cout << x % MOD << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n");
  });

  it("const long long global", () => {
    const source = `
const long long INF = 1000000000000LL;
int main() {
  cout << INF << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1000000000000\n");
  });

  it("const int local", () => {
    const source = `
int main() {
  const int k = 7;
  cout << k * 2 << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("14\n");
  });

  it("const vector accepted (no mutation check)", () => {
    const source = `
int main() {
  const vector<int> v = {1, 2, 3};
  cout << v[0] << " " << v[2] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1 3\n");
  });

  it("const string local", () => {
    const source = `
int main() {
  const string prefix = "hello";
  cout << prefix << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("hello\n");
  });

  it("const + using alias together", () => {
    const source = `
using ll = long long;
const ll MOD = 1000000007;
int main() {
  ll x = 2000000010LL % MOD;
  cout << x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1000000003\n");
  });
});

// ── const int/ll as array size ─────────────────────────────────────────────

describe("const as array size", () => {
  it("const int used as global array size", () => {
    const source = `
const int MAXN = 5;
int a[MAXN];
int main() {
  for (int i = 0; i < MAXN; i++) a[i] = i * i;
  for (int i = 0; i < MAXN; i++) cout << a[i] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0\n1\n4\n9\n16\n");
  });

  it("const int used as local array size", () => {
    const source = `
int main() {
  const int N = 4;
  int a[N];
  for (int i = 0; i < N; i++) a[i] = i + 10;
  for (int i = 0; i < N; i++) cout << a[i] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n11\n12\n13\n");
  });

  it("const ll used as array size", () => {
    const source = `
const long long M = 3;
int b[M];
int main() {
  b[0] = 7; b[1] = 8; b[2] = 9;
  for (int i = 0; i < M; i++) cout << b[i] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7\n8\n9\n");
  });

  it("multiple arrays with same const size", () => {
    const source = `
const int N = 3;
int a[N];
int b[N];
int main() {
  for (int i = 0; i < N; i++) { a[i] = i; b[i] = N - i; }
  for (int i = 0; i < N; i++) cout << a[i] + b[i] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n3\n3\n");
  });

  it("non-const identifier as array size is a compile error", () => {
    const source = `
int main() {
  int n = 5;
  int a[n];
  return 0;
}
`;
    const result = compile(source);
    expect(result.ok).toBe(false);
  });
});

// ── cin trailing comma expressions ─────────────────────────────────────────

describe("cin trailing comma expressions", () => {
  it("cin >> a, expr modifies variable", () => {
    const source = `
int main() {
  int a, sum = 0;
  cin >> a, sum += a;
  cin >> a, sum += a;
  cout << sum << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "3 7");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });

  it("cin trailing expr in for loop without braces", () => {
    const source = `
int main() {
  int n;
  cin >> n;
  vector<int> a(n);
  long long sum = 0;
  for (int i = 0; i < n; i++) cin >> a[i], sum += a[i];
  cout << sum << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "5\n1 2 3 4 5");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("15\n");
  });

  it("cin trailing expr builds map", () => {
    const source = `
int main() {
  int n;
  cin >> n;
  vector<int> a(n);
  map<int,int> freq;
  for (int i = 0; i < n; i++) cin >> a[i], freq[a[i]]++;
  for (auto& p : freq) cout << p.first << ":" << p.second << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "4\n1 2 1 3");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1:2\n2:1\n3:1\n");
  });

  it("multiple trailing exprs after one cin", () => {
    const source = `
int main() {
  int a, b = 0, c = 0;
  cin >> a, b = a * 2, c = a + b;
  cout << b << " " << c << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "5");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10 15\n");
  });

  it("cin >> chain then trailing expr", () => {
    const source = `
int main() {
  int a, b, extra = 0;
  cin >> a >> b, extra = a + b;
  cout << extra << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "4 6");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });

  it("cin trailing with array index update", () => {
    const source = `
const int N = 5;
int a[N];
int main() {
  long long sum = 0;
  for (int i = 0; i < N; i++) cin >> a[i], sum += a[i];
  cout << sum << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "10 20 30 40 50");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("150\n");
  });
});

// ── combined: aliases + const + cin ───────────────────────────────────────

describe("combined parser features", () => {
  it("using ll + const ll MOD + cin", () => {
    const source = `
using ll = long long;
const ll MOD = 1000000007;
int main() {
  int n;
  cin >> n;
  ll ans = 0;
  for (int i = 0; i < n; i++) {
    ll x;
    cin >> x;
    ans = (ans + x) % MOD;
  }
  cout << ans << "\\n";
  return 0;
}
`;
    // (0+1000000005)%MOD=1000000005, (1000000005+5)%MOD=3
    const result = compileAndRun(source, "2\n1000000005 5");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n");
  });

  it("using vi + sort + const size", () => {
    const source = `
using vi = vector<int>;
const int K = 3;
int main() {
  vi v = {5, 1, 4, 2, 3};
  sort(v.begin(), v.end());
  for (int i = 0; i < K; i++) cout << v[i] << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n2\n3\n");
  });

  it("typical competitive: read into array and accumulate", () => {
    const source = `
using ll = long long;
const int MAXN = 100;
int a[MAXN];
int main() {
  int n;
  cin >> n;
  ll sum = 0;
  for (int i = 0; i < n; i++) cin >> a[i], sum += a[i];
  cout << sum << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "5\n10 20 30 40 50");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("150\n");
  });
});
