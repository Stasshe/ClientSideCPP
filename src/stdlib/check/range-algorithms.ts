import type { CheckCtx } from "@/stdlib/check-context";
import { registerFreeCall } from "@/stdlib/check-registry";
import {
  describeBuiltinArity,
  getBuiltinRangeAlgorithmSpec,
} from "@/stdlib/metadata";
import { isValidBuiltinTemplateComparatorCall } from "@/stdlib/template-exprs";
import { iteratorContainerType, vectorElementType } from "@/stdlib/template-types";
import type { ExprNode, TypeNode, VectorTypeNode } from "@/types";
import { isIteratorType, isVectorType } from "@/types";

export function checkSort(args: ExprNode[], line: number, col: number, ctx: CheckCtx): TypeNode {
  const spec = getBuiltinRangeAlgorithmSpec("sort");
  if (spec === null) {
    ctx.pushError(line, col, "sort: internal error");
    return { kind: "PrimitiveType", name: "void" };
  }
  if (args.length < spec.minArgs || args.length > spec.maxArgs) {
    ctx.pushError(line, col, `sort requires ${describeBuiltinArity(spec)} arguments`);
  }
  validateVectorRangeArgs(args[0], args[1], "sort", line, col, ctx);
  if (args[2] !== undefined) {
    const comparator = args[2];
    if (!isValidBuiltinTemplateComparatorCall(comparator)) {
      ctx.pushError(comparator.line, comparator.col, "unsupported sort comparator");
    }
  }
  return { kind: "PrimitiveType", name: "void" };
}

export function checkReverse(args: ExprNode[], line: number, col: number, ctx: CheckCtx): TypeNode {
  const spec = getBuiltinRangeAlgorithmSpec("reverse");
  if (spec === null) {
    ctx.pushError(line, col, "reverse: internal error");
    return { kind: "PrimitiveType", name: "void" };
  }
  if (args.length < spec.minArgs || args.length > spec.maxArgs) {
    ctx.pushError(line, col, `reverse requires ${describeBuiltinArity(spec)} arguments`);
  }
  validateVectorRangeArgs(args[0], args[1], "reverse", line, col, ctx);
  return { kind: "PrimitiveType", name: "void" };
}

export function checkFill(args: ExprNode[], line: number, col: number, ctx: CheckCtx): TypeNode {
  const spec = getBuiltinRangeAlgorithmSpec("fill");
  if (spec === null) {
    ctx.pushError(line, col, "fill: internal error");
    return { kind: "PrimitiveType", name: "void" };
  }
  if (args.length < spec.minArgs || args.length > spec.maxArgs) {
    ctx.pushError(line, col, `fill requires ${describeBuiltinArity(spec)} arguments`);
  }
  const rangeType = validateVectorRangeArgs(args[0], args[1], "fill", line, col, ctx);
  ctx.validateExpr(args[2] ?? null, rangeType === null ? undefined : vectorElementType(rangeType));
  return { kind: "PrimitiveType", name: "void" };
}

function validateVectorRangeArgs(
  beginExpr: ExprNode | undefined,
  endExpr: ExprNode | undefined,
  callee: string,
  line: number,
  col: number,
  ctx: CheckCtx,
): VectorTypeNode | null {
  const beginType = beginExpr === undefined ? null : ctx.inferExprType(beginExpr);
  const endType = endExpr === undefined ? null : ctx.inferExprType(endExpr);
  if (beginType === null || endType === null) {
    if (beginExpr === undefined || endExpr === undefined) {
      ctx.pushError(line, col, `${callee} requires exactly 2 iterator arguments`);
    }
    return null;
  }
  if (!isIteratorType(beginType) || !isIteratorType(endType)) {
    ctx.pushError(line, col, `${callee} requires vector iterators`);
    return null;
  }
  const beginContainerType = iteratorContainerType(beginType);
  const endContainerType = iteratorContainerType(endType);
  if (
    !ctx.isAssignable(beginContainerType, endContainerType) ||
    !ctx.isAssignable(endContainerType, beginContainerType)
  ) {
    ctx.pushError(line, col, `${callee} requires iterators from the same vector`);
    return null;
  }
  if (!isVectorType(beginContainerType)) {
    ctx.pushError(line, col, `${callee} requires a vector range`);
    return null;
  }
  if (isDistinctVectorRange(beginExpr as ExprNode, endExpr as ExprNode)) {
    ctx.pushError(line, col, `${callee} requires iterators from the same vector`);
    return null;
  }
  if (!isFullVectorRange(beginExpr as ExprNode, endExpr as ExprNode)) {
    ctx.pushError(line, col, `${callee} currently requires the full vector range`);
    return null;
  }
  return beginContainerType;
}

function isDistinctVectorRange(beginExpr: ExprNode, endExpr: ExprNode): boolean {
  return (
    beginExpr.kind === "MethodCallExpr" &&
    beginExpr.method === "begin" &&
    beginExpr.args.length === 0 &&
    endExpr.kind === "MethodCallExpr" &&
    endExpr.method === "end" &&
    endExpr.args.length === 0 &&
    !sameExpr(beginExpr.receiver, endExpr.receiver)
  );
}

function isFullVectorRange(beginExpr: ExprNode, endExpr: ExprNode): boolean {
  return (
    beginExpr.kind === "MethodCallExpr" &&
    beginExpr.method === "begin" &&
    beginExpr.args.length === 0 &&
    endExpr.kind === "MethodCallExpr" &&
    endExpr.method === "end" &&
    endExpr.args.length === 0 &&
    sameExpr(beginExpr.receiver, endExpr.receiver)
  );
}

function sameExpr(left: ExprNode, right: ExprNode): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "Identifier":
      return right.kind === "Identifier" && left.name === right.name;
    case "Literal":
      return (
        right.kind === "Literal" &&
        left.valueType === right.valueType &&
        left.value === right.value
      );
    case "TemplateIdExpr":
      return (
        right.kind === "TemplateIdExpr" &&
        left.template === right.template &&
        JSON.stringify(left.templateArgs) === JSON.stringify(right.templateArgs)
      );
    case "CallExpr":
      return (
        right.kind === "CallExpr" &&
        left.callee === right.callee &&
        sameExprList(left.args, right.args)
      );
    case "TemplateCallExpr":
      return (
        right.kind === "TemplateCallExpr" &&
        sameExpr(left.callee, right.callee) &&
        sameExprList(left.args, right.args)
      );
    case "MemberAccessExpr":
      return (
        right.kind === "MemberAccessExpr" &&
        left.member === right.member &&
        sameExpr(left.receiver, right.receiver)
      );
    case "MethodCallExpr":
      return (
        right.kind === "MethodCallExpr" &&
        left.method === right.method &&
        sameExpr(left.receiver, right.receiver) &&
        sameExprList(left.args, right.args)
      );
    case "IndexExpr":
      return (
        right.kind === "IndexExpr" &&
        sameExpr(left.target, right.target) &&
        sameExpr(left.index, right.index)
      );
    case "UnaryExpr":
      return (
        right.kind === "UnaryExpr" &&
        left.operator === right.operator &&
        left.isPostfix === right.isPostfix &&
        sameExpr(left.operand, right.operand)
      );
    case "AddressOfExpr":
      return right.kind === "AddressOfExpr" && sameExpr(left.target, right.target);
    case "DerefExpr":
      return right.kind === "DerefExpr" && sameExpr(left.pointer, right.pointer);
    case "BinaryExpr":
      return (
        right.kind === "BinaryExpr" &&
        left.operator === right.operator &&
        sameExpr(left.left, right.left) &&
        sameExpr(left.right, right.right)
      );
    case "ConditionalExpr":
      return (
        right.kind === "ConditionalExpr" &&
        sameExpr(left.condition, right.condition) &&
        sameExpr(left.thenExpr, right.thenExpr) &&
        sameExpr(left.elseExpr, right.elseExpr)
      );
    case "AssignExpr":
      return (
        right.kind === "AssignExpr" &&
        left.operator === right.operator &&
        sameExpr(left.target, right.target) &&
        sameExpr(left.value, right.value)
      );
  }
}

function sameExprList(left: ExprNode[], right: ExprNode[]): boolean {
  return left.length === right.length && left.every((expr, index) => sameExpr(expr, right[index] as ExprNode));
}

registerFreeCall("sort", checkSort);
registerFreeCall("reverse", checkReverse);
registerFreeCall("fill", checkFill);
