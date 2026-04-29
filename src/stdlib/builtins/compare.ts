import type { RuntimeLocation, RuntimeValue } from "@/runtime/value";

export type FailFn = (message: string, line: number) => never;

export function compareValues(
  left: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  right: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
  line: number,
  fail: FailFn,
): boolean {
  if (isNumericRuntimeValue(left) && isNumericRuntimeValue(right)) {
    const operands = toNumericOperands(left, right, line, fail);
    return comparePrimitive(operands.left, operands.right, operator);
  }

  if (left.kind !== right.kind) {
    fail("type mismatch in comparison", line);
  }

  switch (left.kind) {
    case "int":
      return comparePrimitive(
        left.value,
        (right as { kind: "int"; value: bigint }).value,
        operator,
      );
    case "double":
      return comparePrimitive(
        left.value,
        (right as { kind: "double"; value: number }).value,
        operator,
      );
    case "bool":
      return comparePrimitive(
        left.value,
        (right as { kind: "bool"; value: boolean }).value,
        operator,
      );
    case "char":
      return comparePrimitive(
        left.value,
        (right as { kind: "char"; value: string }).value,
        operator,
      );
    case "string":
      return comparePrimitive(
        left.value,
        (right as { kind: "string"; value: string }).value,
        operator,
      );
    case "pointer":
      return comparePrimitive(
        left.target,
        (right as { kind: "pointer"; target: RuntimeLocation | null }).target,
        operator,
      );
    case "array":
      return fail("array comparison is not supported", line);
    case "object":
      return fail(`${left.objectKind} comparison is not supported`, line);
    case "reference":
      return fail("reference comparison is not supported", line);
  }
}

export function compareSortableValues(
  left: RuntimeValue,
  right: RuntimeValue,
  descending: boolean,
  line: number,
  fail: FailFn,
): number {
  const result = compareSortable(left, right, line, fail);
  return descending ? -result : result;
}

function compareSortable(
  left: RuntimeValue,
  right: RuntimeValue,
  line: number,
  fail: FailFn,
): number {
  if (left.kind === "object" && left.objectKind === "pair") {
    if (right.kind !== "object" || right.objectKind !== "pair") {
      fail("type mismatch in pair sort", line);
    }
    const firstCmp = compareSortable(left.first, right.first, line, fail);
    if (firstCmp !== 0) return firstCmp;
    return compareSortable(left.second, right.second, line, fail);
  }
  if (left.kind === "object" && left.objectKind === "tuple") {
    if (right.kind !== "object" || right.objectKind !== "tuple") {
      fail("type mismatch in tuple sort", line);
    }
    for (let i = 0; i < left.values.length; i++) {
      const lv = left.values[i];
      const rv = right.values[i];
      if (lv === undefined || rv === undefined) break;
      const cmp = compareSortable(lv, rv, line, fail);
      if (cmp !== 0) return cmp;
    }
    return 0;
  }
  const leftValue = sortablePrimitive(left, line, fail);
  const rightValue = sortablePrimitive(right, line, fail);
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

export function sameLocation(left: RuntimeLocation | null, right: RuntimeLocation | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "binding":
      return right.kind === "binding" && left.scope === right.scope && left.name === right.name;
    case "array":
      return right.kind === "array" && left.ref === right.ref && left.index === right.index;
    case "object":
      if (right.kind !== "object" || left.objectKind !== right.objectKind) {
        return false;
      }
      if (left.objectKind === "tuple") {
        if (right.objectKind !== "tuple") {
          return false;
        }
        return left.index === right.index && sameLocation(left.parent, right.parent);
      }
      if (left.objectKind === "map") {
        if (right.objectKind !== "map") {
          return false;
        }
        return (
          left.entryIndex === right.entryIndex &&
          left.access === right.access &&
          sameLocation(left.parent, right.parent)
        );
      }
      return false;
    case "string":
      return (
        right.kind === "string" &&
        left.index === right.index &&
        sameLocation(left.parent, right.parent)
      );
  }
}

export function isNumericRuntimeValue(
  value: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
): value is Extract<RuntimeValue, { kind: "int" | "double" | "char" }> {
  return value.kind === "int" || value.kind === "double" || value.kind === "char";
}

export function toNumericOperands(
  left: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  right: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  line: number,
  fail: FailFn,
): { mode: "int"; left: bigint; right: bigint } | { mode: "double"; left: number; right: number } {
  if (!isNumericRuntimeValue(left) || !isNumericRuntimeValue(right)) {
    fail("type mismatch: expected numeric", line);
  }
  if (left.kind === "double" || right.kind === "double") {
    return {
      mode: "double",
      left: left.kind === "double" ? left.value : Number(toIntegerValue(left)),
      right: right.kind === "double" ? right.value : Number(toIntegerValue(right)),
    };
  }
  return { mode: "int", left: toIntegerValue(left), right: toIntegerValue(right) };
}

function toIntegerValue(value: Extract<RuntimeValue, { kind: "int" | "double" | "char" }>): bigint {
  if (value.kind === "int") {
    return value.value;
  }
  return BigInt(value.kind === "char" ? (value.value.codePointAt(0) ?? 0) : value.value);
}

function comparePrimitive<T extends bigint | number | boolean | string>(
  left: T,
  right: T,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
): boolean;
function comparePrimitive(
  left: RuntimeLocation | null,
  right: RuntimeLocation | null,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
): boolean;
function comparePrimitive<T extends bigint | number | boolean | string>(
  left: T | RuntimeLocation | null,
  right: T | RuntimeLocation | null,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
): boolean {
  if (left === null || right === null || typeof left === "object" || typeof right === "object") {
    const equal = sameLocation(left as RuntimeLocation | null, right as RuntimeLocation | null);
    switch (operator) {
      case "==":
        return equal;
      case "!=":
        return !equal;
      default:
        return false;
    }
  }
  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
  }
}

function sortablePrimitive(
  value: RuntimeValue,
  line: number,
  fail: FailFn,
): bigint | number | boolean | string {
  if (
    value.kind === "int" ||
    value.kind === "double" ||
    value.kind === "bool" ||
    value.kind === "string"
  ) {
    return value.value;
  }
  fail("sort supports only primitive, pair, and tuple vector values", line);
}
