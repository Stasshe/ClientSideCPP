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
  return beginContainerType;
}

registerFreeCall("sort", checkSort);
registerFreeCall("reverse", checkReverse);
registerFreeCall("fill", checkFill);
