import type { RuntimeValue } from "@/runtime/value";
import { sameLocation } from "@/runtime/value";
import {
  compareSortableValues,
  compareValues,
  toNumericOperands,
} from "@/stdlib/builtins/compare";
import {
  dispatchFreeCall,
  dispatchMethodCall,
  dispatchMemberAccess as dispatchStdlibMemberAccess,
  dispatchTemplateCall,
  type EvalCtx,
} from "@/stdlib/eval";
import { getBuiltinTemplateComparatorSpec } from "@/stdlib/metadata";
import { isTupleGetTemplateCall } from "@/stdlib/template-exprs";
import type { ExprNode, TemplateCallExprNode } from "@/types";

export type { FailFn } from "@/stdlib/builtins/compare";
export type { EvalCtx } from "@/stdlib/eval";

export function tryEvaluateBuiltinCall(
  callee: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue | null {
  return dispatchFreeCall(callee, args, line, ctx);
}

export function evaluateTemplateCall(expr: TemplateCallExprNode, ctx: EvalCtx): RuntimeValue {
  if (getBuiltinTemplateComparatorSpec(expr.callee.template) !== null) {
    return ctx.fail(`'${expr.callee.template}' was not declared in this scope`, expr.line);
  }

  return (
    dispatchTemplateCall(expr, ctx) ??
    ctx.fail(`unsupported template call '${expr.callee.template}'`, expr.line)
  );
}

export function evaluateMethodCall(
  receiverExpr: ExprNode,
  method: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  const receiver = ctx.evaluateExpr(receiverExpr);
  return (
    dispatchMethodCall(receiver, method, args, line, ctx) ??
    ctx.fail("type mismatch: expected array/vector/pair/map", line)
  );
}

export function evaluateMemberAccess(
  receiverExpr: ExprNode,
  member: string,
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  const receiver = ctx.evaluateExpr(receiverExpr);
  return (
    dispatchStdlibMemberAccess(receiver, member, line, ctx) ??
    ctx.fail("type mismatch: expected pair", line)
  );
}

export {
  compareSortableValues,
  compareValues,
  isTupleGetTemplateCall,
  sameLocation,
  toNumericOperands,
};
