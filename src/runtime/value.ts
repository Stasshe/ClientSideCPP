import type { PrimitiveTypeNode, TypeNode, VectorTypeNode } from "../types";

export type RuntimeValue =
  | { kind: "int"; value: bigint }
  | { kind: "double"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "string"; value: string }
  | { kind: "array"; ref: number; type: VectorTypeNode | Exclude<TypeNode, PrimitiveTypeNode> }
  | { kind: "void" }
  | { kind: "uninitialized"; expected: "int" | "double" | "bool" | "string" };

export function defaultValueForType(type: PrimitiveTypeNode): RuntimeValue {
  switch (type.name) {
    case "int":
    case "long long":
      return { kind: "int", value: 0n };
    case "bool":
      return { kind: "bool", value: false };
    case "double":
      return { kind: "double", value: 0 };
    case "string":
      return { kind: "string", value: "" };
    case "void":
      return { kind: "void" };
  }
}

export function uninitializedForType(type: PrimitiveTypeNode): RuntimeValue {
  if (type.name === "void") {
    return { kind: "void" };
  }
  if (type.name === "long long") {
    return { kind: "uninitialized", expected: "int" };
  }
  if (type.name === "double") {
    return { kind: "uninitialized", expected: "double" };
  }
  return { kind: "uninitialized", expected: type.name };
}

export function stringifyValue(value: RuntimeValue): string {
  switch (value.kind) {
    case "int":
      return value.value.toString();
    case "bool":
      return value.value ? "1" : "0";
    case "double":
      return Number.isInteger(value.value)
        ? value.value.toFixed(1).replace(/\.0$/, "")
        : value.value.toString();
    case "string":
      return value.value;
    case "void":
      return "";
    case "array":
      return "<array>";
    case "uninitialized":
      return "<uninitialized>";
  }
}
