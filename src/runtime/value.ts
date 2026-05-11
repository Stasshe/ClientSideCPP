import type {
  IteratorTypeNode,
  MapTypeNode,
  PairTypeNode,
  PrimitiveTypeNode,
  ReferenceTypeNode,
  TemplateInstanceTypeNode,
  TupleTypeNode,
  TypeNode,
  VectorTypeNode,
} from "@/types";

export type RuntimeLocation =
  | { kind: "binding"; scope: Map<string, RuntimeValue>; name: string; type: TypeNode }
  | { kind: "array"; ref: number; index: number; type: TypeNode }
  | {
      kind: "object";
      parent: RuntimeLocation;
      objectKind: "map";
      entryIndex: number;
      type: TypeNode;
      access: "entry" | "value";
    }
  | {
      kind: "object";
      parent: RuntimeLocation;
      objectKind: "pair";
      member: "first" | "second";
      type: TypeNode;
    }
  | { kind: "object"; parent: RuntimeLocation; objectKind: "tuple"; index: number; type: TypeNode }
  | { kind: "string"; parent: RuntimeLocation; index: number };

export type RuntimeObjectValue =
  | { kind: "object"; objectKind: "vector"; type: VectorTypeNode; ref: number }
  | {
      kind: "object";
      objectKind: "map";
      type: MapTypeNode;
      entries: Array<{ key: RuntimeValue; value: RuntimeValue }>;
    }
  | {
      kind: "object";
      objectKind: "pair";
      type: PairTypeNode;
      first: RuntimeValue;
      second: RuntimeValue;
    }
  | { kind: "object"; objectKind: "tuple"; type: TupleTypeNode; values: RuntimeValue[] }
  | { kind: "object"; objectKind: "iterator"; type: IteratorTypeNode; ref: number; index: number };

export type RuntimeValue =
  | { kind: "int"; value: bigint }
  | { kind: "double"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "char"; value: string }
  | { kind: "string"; value: string }
  | RuntimeObjectValue
  | {
      kind: "array";
      ref: number;
      type: Exclude<TypeNode, PrimitiveTypeNode | TemplateInstanceTypeNode>;
    }
  | { kind: "pointer"; pointeeType: TypeNode; target: RuntimeLocation | null }
  | { kind: "reference"; type: ReferenceTypeNode; target: RuntimeLocation }
  | { kind: "void" }
  | { kind: "uninitialized"; expectedType: TypeNode };

export function defaultValueForType(type: PrimitiveTypeNode): RuntimeValue {
  switch (type.name) {
    case "int":
    case "long long":
      return { kind: "int", value: 0n };
    case "bool":
      return { kind: "bool", value: false };
    case "double":
      return { kind: "double", value: 0 };
    case "char":
      return { kind: "char", value: "\0" };
    case "string":
      return { kind: "string", value: "" };
    case "void":
      return { kind: "void" };
  }
}

export function uninitializedForType(type: PrimitiveTypeNode): RuntimeValue {
  return { kind: "uninitialized", expectedType: type };
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
      if (left.objectKind === "pair") {
        return (
          right.objectKind === "pair" &&
          left.member === right.member &&
          sameLocation(left.parent, right.parent)
        );
      }
      if (left.objectKind === "tuple") {
        return (
          right.objectKind === "tuple" &&
          left.index === right.index &&
          sameLocation(left.parent, right.parent)
        );
      }
      if (left.objectKind === "map") {
        return (
          right.objectKind === "map" &&
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

export type OutputFormat = {
  fixed: boolean;
  precision: number | null;
};

export function formatDouble(value: number, format?: OutputFormat): string {
  if (format !== undefined && format.precision !== null) {
    return format.fixed ? value.toFixed(format.precision) : value.toPrecision(format.precision);
  }
  return Number.isInteger(value) ? value.toFixed(1).replace(/\.0$/, "") : value.toString();
}

export function stringifyValue(value: RuntimeValue, format?: OutputFormat): string {
  switch (value.kind) {
    case "int":
      return value.value.toString();
    case "bool":
      return value.value ? "1" : "0";
    case "double":
      return formatDouble(value.value, format);
    case "char":
      return value.value;
    case "string":
      return value.value;
    case "object":
      switch (value.objectKind) {
        case "pair":
          return `(${stringifyValue(value.first, format)}, ${stringifyValue(value.second, format)})`;
        case "map":
          return `{${value.entries
            .map(
              (entry) =>
                `${stringifyValue(entry.key, format)}: ${stringifyValue(entry.value, format)}`,
            )
            .join(", ")}}`;
        case "tuple":
          return `(${value.values.map((element) => stringifyValue(element, format)).join(", ")})`;
        case "vector":
          return "<vector>";
        case "iterator":
          return "<iterator>";
      }
    case "void":
      return "";
    case "array":
      return "<array>";
    case "pointer":
      return value.target === null ? "nullptr" : "<pointer>";
    case "reference":
      return "<reference>";
    case "uninitialized":
      return "<uninitialized>";
  }
}
