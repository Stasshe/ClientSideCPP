import type { CompileError } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type ObjectMacro = {
  kind: "object";
  name: string;
  body: string;
};

type FunctionMacro = {
  kind: "function";
  name: string;
  params: string[];
  variadic: boolean;
  body: string;
};

type MacroDefinition = ObjectMacro | FunctionMacro;

type LogicalLine = { text: string; line: number; span: number };

export type PreprocessResult = { ok: true; source: string } | { ok: false; errors: CompileError[] };

// ── Patterns ──────────────────────────────────────────────────────────────────

const RE_INCLUDE = /^\s*#\s*include\s*[<"]([^>"]+)[>"]\s*$/;
const RE_DEFINE = /^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)(\(([^)]*)\))?\s*(.*)/;
const RE_ANY_DIRECTIVE = /^\s*#/;
const RE_USING_NS_STD = /^\s*using\s+namespace\s+std\s*;\s*$/;
const RE_USING_ALIAS = /^\s*using\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*;\s*$/;
const RE_CONST_DECL =
  /^\s*const\s+(int|long\s+long|double|bool|char|string)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*;\s*$/;
const RE_STRIP_CONST =
  /^\s*const\s+(?=(int|long\s+long|double|bool|char|string|vector|map|pair|tuple)\b)/;

// ── Public API ────────────────────────────────────────────────────────────────

export function preprocess(source: string): PreprocessResult {
  const macros = new Map<string, MacroDefinition>();
  const errors: CompileError[] = [];
  const logical = joinContinuationLines(source.split("\n"));
  const output: string[] = [];

  for (const { text, line, span } of logical) {
    const blank = () => {
      for (let i = 0; i < span; i++) output.push("");
    };

    if (text.trimStart().startsWith("#")) {
      processDirective(text, line, macros, errors);
      blank();
      continue;
    }

    let expanded = expandLine(text, macros, line, errors);
    expanded = normalizeCompatibility(expanded);

    if (RE_USING_NS_STD.test(expanded)) {
      blank();
      continue;
    }

    const aliasMatch = expanded.match(RE_USING_ALIAS);
    if (aliasMatch?.[1] !== undefined && aliasMatch[2] !== undefined) {
      macros.set(aliasMatch[1], { kind: "object", name: aliasMatch[1], body: aliasMatch[2] });
      blank();
      continue;
    }

    const constMatch = expanded.match(RE_CONST_DECL);
    if (constMatch?.[2] !== undefined && constMatch[3] !== undefined) {
      macros.set(constMatch[2], { kind: "object", name: constMatch[2], body: constMatch[3] });
      blank();
      continue;
    }

    output.push(expanded.replace(RE_STRIP_CONST, ""));
    for (let i = 1; i < span; i++) output.push("");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, source: output.join("\n") };
}

// ── Directive processing ──────────────────────────────────────────────────────

function processDirective(
  text: string,
  lineNo: number,
  macros: Map<string, MacroDefinition>,
  errors: CompileError[],
): void {
  if (RE_INCLUDE.test(text)) return;

  const defMatch = text.match(RE_DEFINE);
  if (defMatch !== null) {
    const name = defMatch[1] ?? "";
    const paramsGroup = defMatch[3];
    const body = (defMatch[4] ?? "").trim();

    if (paramsGroup === undefined) {
      macros.set(name, { kind: "object", name, body });
      return;
    }

    const rawParams = paramsGroup
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const variadic = rawParams.length > 0 && rawParams[rawParams.length - 1] === "...";
    const params = variadic ? rawParams.slice(0, -1) : rawParams;
    macros.set(name, { kind: "function", name, params, variadic, body });
    return;
  }

  if (RE_ANY_DIRECTIVE.test(text)) {
    errors.push({ line: lineNo, col: 1, message: "unsupported preprocessor directive" });
  }
}

// ── Macro expansion ───────────────────────────────────────────────────────────

const MAX_DEPTH = 32;

function expandLine(
  line: string,
  macros: Map<string, MacroDefinition>,
  lineNo: number,
  errors: CompileError[],
  depth = 0,
): string {
  if (depth > MAX_DEPTH) {
    errors.push({ line: lineNo, col: 1, message: "macro expansion depth exceeded" });
    return line;
  }

  let result = "";
  let i = 0;

  while (i < line.length) {
    const ch = line[i] ?? "";

    if (ch === '"' || ch === "'") {
      const lit = readQuotedLiteral(line, i, ch);
      result += lit.text;
      i = lit.end;
      continue;
    }

    if (ch === "/" && line[i + 1] === "/") {
      result += line.slice(i);
      break;
    }

    if (ch === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      if (end === -1) {
        result += line.slice(i);
        break;
      }
      result += line.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    if (isIdStart(ch)) {
      let j = i + 1;
      while (j < line.length && isIdPart(line[j] ?? "")) j++;
      const name = line.slice(i, j);
      const macro = macros.get(name);

      if (macro === undefined) {
        result += name;
        i = j;
        continue;
      }

      if (macro.kind === "object") {
        result += expandLine(macro.body, macros, lineNo, errors, depth + 1);
        i = j;
        continue;
      }

      const inv = readFunctionMacroInvocation(line, j);
      if (inv === null) {
        result += name;
        i = j;
        continue;
      }

      const expanded = applyFunctionMacro(macro, inv.args, macros, lineNo, errors, depth);
      if (expanded === null) {
        const minArgs = macro.params.length;
        const qualifier = macro.variadic ? `at least ${minArgs}` : `${minArgs}`;
        errors.push({
          line: lineNo,
          col: i + 1,
          message: `macro '${macro.name}' expects ${qualifier} argument(s)`,
        });
        result += line.slice(i, inv.end);
        i = inv.end;
        continue;
      }

      result += expanded;
      i = inv.end;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

function applyFunctionMacro(
  macro: FunctionMacro,
  rawArgs: string[],
  macros: Map<string, MacroDefinition>,
  lineNo: number,
  errors: CompileError[],
  depth: number,
): string | null {
  const minArgs = macro.params.length;
  if (macro.variadic ? rawArgs.length < minArgs : rawArgs.length !== minArgs) {
    return null;
  }

  let body = macro.body;
  for (let k = 0; k < macro.params.length; k++) {
    body = replaceIdentifier(body, macro.params[k] ?? "", rawArgs[k]?.trim() ?? "");
  }

  if (macro.variadic) {
    const varArgs = rawArgs
      .slice(minArgs)
      .map((a) => a.trim())
      .join(", ");
    body = replaceIdentifier(body, "__VA_ARGS__", varArgs);
  }

  return expandLine(body, macros, lineNo, errors, depth + 1);
}

// ── Compatibility normalization ───────────────────────────────────────────────

function normalizeCompatibility(line: string): string {
  if (/^\s*((ios|ios_base)::sync_with_stdio|(cin|cout|cerr)\.tie)\s*\(/.test(line)) return "";

  let s = line;
  s = s.replace(/\bios_base::/g, "");
  s = s.replace(/\bios::/g, "");
  s = s.replace(/\bsigned\s+main\s*\(/, "int main(");
  s = s.replace(/(\b[A-Za-z_][A-Za-z0-9_]*\b)\s*>>=(.*);/g, "$1 = $1 >> ($2);");
  s = s.replace(/(\b[A-Za-z_][A-Za-z0-9_]*\b)\s*<<=(.*);/g, "$1 = $1 << ($2);");
  s = s.replace(/\b(\d+)[eE]\+?(\d+)\b/g, (_m, base: string, exp: string) => {
    const e = Number(exp);
    return Number.isInteger(e) && e >= 0 && e <= 18 ? `${base}${"0".repeat(e)}` : _m;
  });
  s = s.replace(/\b(\d+)(ULL|ull|UL|ul|LU|lu|LL|ll|L|l|U|u)\b/g, "$1");
  return s;
}

// ── Lexer helpers ─────────────────────────────────────────────────────────────

function joinContinuationLines(rawLines: string[]): LogicalLine[] {
  const result: LogicalLine[] = [];
  let i = 0;
  while (i < rawLines.length) {
    let text = rawLines[i] ?? "";
    const startLine = i + 1;
    let span = 1;
    while (text.endsWith("\\")) {
      text = text.slice(0, -1);
      i++;
      span++;
      if (i < rawLines.length) {
        text += (rawLines[i] ?? "").trimStart();
      }
    }
    result.push({ text, line: startLine, span });
    i++;
  }
  return result;
}

function readQuotedLiteral(
  line: string,
  start: number,
  quote: string,
): { text: string; end: number } {
  let i = start + 1;
  while (i < line.length) {
    const ch = line[i] ?? "";
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      i++;
      break;
    }
    i++;
  }
  return { text: line.slice(start, i), end: i };
}

function readFunctionMacroInvocation(
  line: string,
  start: number,
): { args: string[]; end: number } | null {
  let i = start;
  while (i < line.length && /\s/.test(line[i] ?? "")) i++;
  if (line[i] !== "(") return null;
  i++;

  const args: string[] = [];
  let depth = 0;
  let current = "";

  while (i < line.length) {
    const ch = line[i] ?? "";
    if (ch === '"' || ch === "'") {
      const lit = readQuotedLiteral(line, i, ch);
      current += lit.text;
      i = lit.end;
      continue;
    }
    if (ch === "(") {
      depth++;
      current += ch;
      i++;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) {
        if (current.trim().length > 0 || args.length > 0) args.push(current);
        return { args, end: i + 1 };
      }
      depth--;
      current += ch;
      i++;
      continue;
    }
    if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }

  return null;
}

function replaceIdentifier(source: string, id: string, replacement: string): string {
  let result = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (isIdStart(ch)) {
      let j = i + 1;
      while (j < source.length && isIdPart(source[j] ?? "")) j++;
      result += source.slice(i, j) === id ? replacement : source.slice(i, j);
      i = j;
      continue;
    }
    result += ch;
    i++;
  }
  return result;
}

function isIdStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}
