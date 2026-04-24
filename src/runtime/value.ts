import type { PrimitiveTypeName, PrimitiveTypeNode } from "../types";

export type RuntimeValue =
  | { kind: "int"; value: bigint }
  | { kind: "bool"; value: boolean }
  | { kind: "string"; value: string }
  | { kind: "array"; ref: number; elementType: "int" | "bool" | "string"; dynamic: boolean }
  | { kind: "void" }
  | { kind: "uninitialized"; expected: "int" | "bool" | "string" };

export function defaultValueForType(typeName: PrimitiveTypeName | PrimitiveTypeNode): RuntimeValue {
  const normalizedType = typeof typeName === "string" ? typeName : typeName.name;
  switch (normalizedType) {
    case "int":
    case "long long":
      return { kind: "int", value: 0n };
    case "bool":
      return { kind: "bool", value: false };
    case "string":
      return { kind: "string", value: "" };
    case "void":
      return { kind: "void" };
  }
}

export function uninitializedForType(typeName: PrimitiveTypeName | PrimitiveTypeNode): RuntimeValue {
  const normalizedType = typeof typeName === "string" ? typeName : typeName.name;
  if (normalizedType === "void") {
    return { kind: "void" };
  }
  if (normalizedType === "long long") {
    return { kind: "uninitialized", expected: "int" };
  }
  return { kind: "uninitialized", expected: normalizedType };
}

export function stringifyValue(value: RuntimeValue): string {
  switch (value.kind) {
    case "int":
      return value.value.toString();
    case "bool":
      return value.value ? "1" : "0";
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
