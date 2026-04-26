import { describe, expect, it } from "vitest";
import { compile, compileAndRun } from "./test-helper";

describe("Basics", () => {
  it("compile minimal main", () => {
    const source = `
int main() {
  return 0;
}
`;
    const result = compile(source);
    expect(result.ok).toBe(true);
  });

  it("arithmetic and cout", () => {
    const source = `
int main() {
  int a = 10;
  int b = 3;
  cout << a + b << "\\n";
  cout << a / b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("13\n3\n");
  });

  it("cin reads integers", () => {
    const source = `
int main() {
  int a;
  int b;
  cin >> a >> b;
  cout << a * b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "6 7");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("42\n");
  });

  it("variable declaration and initialization", () => {
    const source = `
int main() {
  int x = 5;
  int y = 10;
  cout << x + y << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("15\n");
  });

  it("multiple arithmetic operations", () => {
    const source = `
int main() {
  int a = 20;
  int b = 4;
  cout << a - b << "\\n";
  cout << a * b << "\\n";
  cout << a / b << "\\n";
  cout << a % b << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("16\n80\n5\n0\n");
  });

  it("bitwise operators and precedence", () => {
    const source = `
int main() {
  int a = 6;
  int b = 3;
  cout << (a & b) << "\\n";
  cout << (a | b) << "\\n";
  cout << (a ^ b) << "\\n";
  cout << (~a) << "\\n";
  cout << (1 << 2 + 1) << "\\n";
  cout << (32 >> 2 + 1) << "\\n";
  cout << ((1 | 2) == 3 && false) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2\n7\n5\n-7\n8\n4\n0\n");
  });

  it("bitwise edge precedence and associativity", () => {
    const source = `
int main() {
  cout << (8 >> 1 >> 1) << "\\n";
  cout << (1 | 2 & 4) << "\\n";
  cout << ((1 | 2) & 4) << "\\n";
  cout << (~(-1)) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2\n1\n0\n0\n");
  });

  it("cout with multiple expressions", () => {
    const source = `
int main() {
  int x = 100;
  cout << "x=" << x << " " << x + 50 << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("x=100 150\n");
  });

  it("using namespace std is accepted", () => {
    const source = `
using namespace std;

int main() {
  cout << "ok\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("ok\n");
  });

  it("endl works as a reserved word", () => {
    const source = `
int main() {
  cout << "a" << endl;
  cout << "b" << endl;
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("a\nb\n");
  });

  it("accepts include bits stdc++ header", () => {
    const source = `
#include <bits/stdc++.h>
using namespace std;

int main() {
  cout << "ok\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("ok\n");
  });

  it("expands object-like defines", () => {
    const source = `
#define N 5

int main() {
  int sum = 0;
  for (int i = 0; i < N; i++) {
    sum += i;
  }
  cout << sum << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });

  it("expands function-like defines", () => {
    const source = `
#define SQR(x) ((x) * (x))

int main() {
  cout << SQR(1 + 2) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("9\n");
  });

  it("accepts vector return types in function declarations", () => {
    const source = `
#include <bits/stdc++.h>
#define int long long
#define vi vector<int>

using namespace std;

vi sieve(int n) {
  vi a(n + 1, 1);
  return a;
}

signed main() {
  return 0;
}
`;
    const result = compile(source);
    expect(result.ok).toBe(true);
  });

  it("supports ternary operator with arithmetic precedence", () => {
    const source = `
int main() {
  int a = 3;
  int b = 7;
  cout << (true ? a : b) << "\\n";
  cout << (false ? a : b) << "\\n";
  cout << (false ? 10 : 1 + 2 * 3) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n7\n7\n");
  });

  it("short-circuits ternary branches", () => {
    const source = `
int main() {
  int x = 0;
  cout << (true ? 1 : x / 0) << "\\n";
  cout << (false ? x / 0 : 2) << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n2\n");
  });

  it("coerces ternary result to pointer common type", () => {
    const source = `
int main() {
  int a[2] = {10, 20};
  int *p = true ? &a[0] : 0;
  cout << *p << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10\n");
  });

  it("string and chars in ternary operator", () => {
    const source = `
int main() {
  char c = true ? 'a' : 'b';
  string s = false ? "x" : "y";
  cout << c << " " << s << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("a y\n");
  });

  it("supports char literals arithmetic and cin", () => {
    const source = `
int main() {
  char c = '7';
  char input;
  cin >> input;
  cout << c << "\\n";
  cout << (c - '0') << "\\n";
  cout << input << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source, "z");
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7\n7\nz\n");
  });

  it("allows char and single-character string conversions", () => {
    const source = `
int main() {
  char c = "A";
  string s = c;
  cout << s << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("A\n");
  });

  it("treats string indexing as char", () => {
    const source = `
int main() {
  string s = "abc";
  char c = s[1];
  s[2] = 'z';
  cout << c << "\\n";
  cout << s << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("b\nabz\n");
  });

  it("rejects multi-character char literal", () => {
    const source = `
int main() {
  char c = 'ab';
  return 0;
}
`;
    const result = compile(source);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.message).toBe("character literal must contain exactly one character");
  });
});
