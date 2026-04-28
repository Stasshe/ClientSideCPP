import type { ExprNode, TypeNode } from "@/types";
import {
  isArrayType,
  isPointerType,
  isPrimitiveType,
  isReferenceType,
  isTemplateInstanceType,
} from "@/types";

export function isIntType(type: TypeNode): boolean {
  return (
    isPrimitiveType(type) &&
    (type.name === "int" || type.name === "long long" || type.name === "char")
  );
}

export function isDoubleType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "double";
}

export function isNumericType(type: TypeNode): boolean {
  return isIntType(type) || isDoubleType(type);
}

export function isBoolType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "bool";
}

export function isStringType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "string";
}

export function isNullPointerConstantExpr(expr: ExprNode): boolean {
  return expr.kind === "Literal" && expr.valueType === "int" && expr.value === 0n;
}

export function isNullPointerType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "int";
}

export function isInputTargetType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name !== "void";
}

export function containsVoid(type: TypeNode): boolean {
  if (isPrimitiveType(type)) {
    return type.name === "void";
  }
  if (isPointerType(type)) {
    return containsVoid(type.pointeeType);
  }
  if (isReferenceType(type)) {
    return containsVoid(type.referredType);
  }
  if (isTemplateInstanceType(type)) {
    return type.templateArgs.some((templateArg) => containsVoid(templateArg));
  }
  if (isArrayType(type)) {
    return containsVoid(type.elementType);
  }
  return false;
}

export function containsReferenceNested(type: TypeNode): boolean {
  if (isReferenceType(type)) {
    return true;
  }
  if (isPointerType(type)) {
    return containsReferenceNested(type.pointeeType);
  }
  if (isTemplateInstanceType(type)) {
    return type.templateArgs.some((templateArg) => containsReferenceNested(templateArg));
  }
  if (isArrayType(type)) {
    return containsReferenceNested(type.elementType);
  }
  return false;
}

export function containsReferenceBelowTopLevel(type: TypeNode): boolean {
  if (isReferenceType(type)) {
    return false;
  }
  return containsReferenceNested(type);
}

export function baseElementType(type: TypeNode): TypeNode {
  if (isArrayType(type)) {
    return baseElementType(type.elementType);
  }
  return type;
}

export function unwrapReference(type: TypeNode | null): TypeNode | null {
  if (type === null) {
    return null;
  }
  return isReferenceType(type) ? type.referredType : type;
}
