import { isTupleGetTemplateCall } from "@/stdlib/template-exprs";
import type { BinaryExprNode, ExprNode, TypeNode } from "@/types";
import {
  isArrayType,
  isPairType,
  isPointerType,
  isPrimitiveType,
  isReferenceType,
  isTemplateInstanceType,
  isTupleType,
  typeToString,
} from "@/types";
import {
  isDoubleType,
  isIntType,
  isNullPointerType,
  isNumericType,
  isStringType,
} from "./type-utils";

export type PushErrorFn = (line: number, col: number, message: string) => void;

export function sameType(left: TypeNode, right: TypeNode): boolean {
  if (isPrimitiveType(left) || isPrimitiveType(right)) {
    return isPrimitiveType(left) && isPrimitiveType(right) && left.name === right.name;
  }
  if (isArrayType(left) || isArrayType(right)) {
    return isArrayType(left) && isArrayType(right) && sameType(left.elementType, right.elementType);
  }
  if (isTemplateInstanceType(left) || isTemplateInstanceType(right)) {
    return (
      isTemplateInstanceType(left) &&
      isTemplateInstanceType(right) &&
      left.template.name === right.template.name &&
      left.templateArgs.length === right.templateArgs.length &&
      left.templateArgs.every((arg, index) => {
        const rightArg = right.templateArgs[index];
        return rightArg !== undefined && sameType(arg, rightArg);
      })
    );
  }
  if (isPointerType(left) || isPointerType(right)) {
    return (
      isPointerType(left) && isPointerType(right) && sameType(left.pointeeType, right.pointeeType)
    );
  }
  if (isReferenceType(left) || isReferenceType(right)) {
    return (
      isReferenceType(left) &&
      isReferenceType(right) &&
      sameType(left.referredType, right.referredType)
    );
  }
  return false;
}

export function isAssignable(source: TypeNode, target: TypeNode): boolean {
  if (sameType(source, target)) {
    return true;
  }
  if (isTemplateInstanceType(source) && isTemplateInstanceType(target)) {
    return (
      source.template.name === target.template.name &&
      source.templateArgs.length === target.templateArgs.length &&
      source.templateArgs.every((templateArg, index) => {
        const targetArg = target.templateArgs[index];
        return targetArg !== undefined && isAssignable(templateArg, targetArg);
      })
    );
  }
  return (
    isPrimitiveType(source) &&
    isPrimitiveType(target) &&
    ((source.name === "char" && target.name === "string") ||
      (source.name === "string" && target.name === "char") ||
      ((source.name === "int" || source.name === "long long" || source.name === "char") &&
        (target.name === "int" || target.name === "long long" || target.name === "char")) ||
      ((source.name === "int" || source.name === "long long" || source.name === "char") &&
        target.name === "double") ||
      (source.name === "double" &&
        (target.name === "int" || target.name === "long long" || target.name === "char")))
  );
}

export function isAssignableExpr(expr: ExprNode): boolean {
  return (
    expr.kind === "Identifier" ||
    expr.kind === "IndexExpr" ||
    expr.kind === "DerefExpr" ||
    expr.kind === "MemberAccessExpr" ||
    isTupleGetTemplateCall(expr)
  );
}

export function inferBinaryType(
  expr: BinaryExprNode,
  left: TypeNode | null,
  right: TypeNode | null,
  pushError: PushErrorFn,
): TypeNode | null {
  if (expr.operator === "+") {
    if (left !== null && right !== null && isPointerType(left) && isIntType(right)) {
      return left;
    }
    if (left !== null && right !== null && isIntType(left) && isPointerType(right)) {
      return right;
    }
  }

  if (expr.operator === "-") {
    if (left !== null && right !== null && isPointerType(left) && isIntType(right)) {
      return left;
    }
    if (left !== null && right !== null && isPointerType(left) && isPointerType(right)) {
      if (!sameType(left, right)) {
        pushError(expr.line, expr.col, "type mismatch in pointer subtraction");
      }
      return { kind: "PrimitiveType", name: "int" };
    }
  }

  if (expr.operator === "&&" || expr.operator === "||") {
    if (left !== null && !(isPrimitiveType(left) && left.name === "bool")) {
      pushError(expr.left.line, expr.left.col, "type mismatch: expected bool");
    }
    if (right !== null && !(isPrimitiveType(right) && right.name === "bool")) {
      pushError(expr.right.line, expr.right.col, "type mismatch: expected bool");
    }
    return { kind: "PrimitiveType", name: "bool" };
  }

  if (
    expr.operator === "==" ||
    expr.operator === "!=" ||
    expr.operator === "<" ||
    expr.operator === "<=" ||
    expr.operator === ">" ||
    expr.operator === ">="
  ) {
    if ((left !== null && isPointerType(left)) || (right !== null && isPointerType(right))) {
      if (expr.operator !== "==" && expr.operator !== "!=") {
        pushError(expr.line, expr.col, "pointer comparison only supports == and !=");
      }
      if (
        left !== null &&
        right !== null &&
        !sameType(left, right) &&
        !(isPointerType(left) && isNullPointerType(right)) &&
        !(isPointerType(right) && isNullPointerType(left))
      ) {
        pushError(expr.line, expr.col, "type mismatch in comparison");
      }
      return { kind: "PrimitiveType", name: "bool" };
    }
    if (
      (left !== null && (isPairType(left) || isTupleType(left))) ||
      (right !== null && (isPairType(right) || isTupleType(right)))
    ) {
      pushError(expr.line, expr.col, "tuple/pair comparison is not supported");
      return { kind: "PrimitiveType", name: "bool" };
    }
    if (
      left !== null &&
      right !== null &&
      !sameType(left, right) &&
      !(isNumericType(left) && isNumericType(right))
    ) {
      pushError(expr.line, expr.col, "type mismatch in comparison");
    }
    return { kind: "PrimitiveType", name: "bool" };
  }

  if (
    expr.operator === "+" &&
    left !== null &&
    right !== null &&
    isStringType(left) &&
    isStringType(right)
  ) {
    return { kind: "PrimitiveType", name: "string" };
  }

  if (
    expr.operator === "<<" ||
    expr.operator === ">>" ||
    expr.operator === "&" ||
    expr.operator === "^" ||
    expr.operator === "|"
  ) {
    if (left !== null && !isIntType(left)) {
      pushError(expr.left.line, expr.left.col, "type mismatch: expected int");
    }
    if (right !== null && !isIntType(right)) {
      pushError(expr.right.line, expr.right.col, "type mismatch: expected int");
    }
    return { kind: "PrimitiveType", name: "int" };
  }

  if (left !== null && !isNumericType(left)) {
    pushError(expr.left.line, expr.left.col, "type mismatch: expected numeric");
  }
  if (right !== null && !isNumericType(right)) {
    pushError(expr.right.line, expr.right.col, "type mismatch: expected numeric");
  }
  if (left !== null && isDoubleType(left)) {
    return { kind: "PrimitiveType", name: "double" };
  }
  if (right !== null && isDoubleType(right)) {
    return { kind: "PrimitiveType", name: "double" };
  }
  return { kind: "PrimitiveType", name: "int" };
}

export function resolveConditionalType(
  thenType: TypeNode | null,
  elseType: TypeNode | null,
  line: number,
  col: number,
  pushError: PushErrorFn,
): TypeNode | null {
  if (thenType === null || elseType === null) {
    return null;
  }

  if (sameType(thenType, elseType)) {
    return thenType;
  }

  if (isTemplateInstanceType(thenType) && isTemplateInstanceType(elseType)) {
    if (
      thenType.template.name !== elseType.template.name ||
      thenType.templateArgs.length !== elseType.templateArgs.length
    ) {
      pushError(
        line,
        col,
        `incompatible operand types for ?: '${typeToString(thenType)}' and '${typeToString(elseType)}'`,
      );
      return null;
    }
    const resolvedArgs: TypeNode[] = [];
    for (let i = 0; i < thenType.templateArgs.length; i += 1) {
      const l = thenType.templateArgs[i];
      const r = elseType.templateArgs[i];
      if (l === undefined || r === undefined) {
        return null;
      }
      const resolved = resolveConditionalType(l, r, line, col, pushError);
      if (resolved === null) {
        return null;
      }
      resolvedArgs.push(resolved);
    }
    return {
      kind: "TemplateInstanceType",
      template: thenType.template,
      templateArgs: resolvedArgs,
    };
  }

  if (isPointerType(thenType) && isNullPointerType(elseType)) {
    return thenType;
  }
  if (isPointerType(elseType) && isNullPointerType(thenType)) {
    return elseType;
  }

  if (isNumericType(thenType) && isNumericType(elseType)) {
    if (isDoubleType(thenType) || isDoubleType(elseType)) {
      return { kind: "PrimitiveType", name: "double" };
    }
    return { kind: "PrimitiveType", name: "int" };
  }

  if (isAssignable(thenType, elseType) && !isAssignable(elseType, thenType)) {
    return elseType;
  }
  if (isAssignable(elseType, thenType) && !isAssignable(thenType, elseType)) {
    return thenType;
  }

  pushError(
    line,
    col,
    `incompatible operand types for ?: '${typeToString(thenType)}' and '${typeToString(elseType)}'`,
  );
  return null;
}
