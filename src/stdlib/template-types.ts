import type {
  MapTypeNode,
  PairTypeNode,
  TemplateInstanceTypeNode,
  TupleTypeNode,
  TypeNode,
  VectorTypeNode,
} from "@/types";

export function templateInstanceName(type: TemplateInstanceTypeNode): string {
  return type.template.name;
}

export function vectorElementType(type: VectorTypeNode): TypeNode {
  return type.templateArgs[0] as TypeNode;
}

export function mapKeyType(type: MapTypeNode): TypeNode {
  return type.templateArgs[0] as TypeNode;
}

export function mapValueType(type: MapTypeNode): TypeNode {
  return type.templateArgs[1] as TypeNode;
}

export function pairFirstType(type: PairTypeNode): TypeNode {
  return type.templateArgs[0] as TypeNode;
}

export function pairSecondType(type: PairTypeNode): TypeNode {
  return type.templateArgs[1] as TypeNode;
}

export function tupleElementTypes(type: TupleTypeNode): TypeNode[] {
  return type.templateArgs;
}
