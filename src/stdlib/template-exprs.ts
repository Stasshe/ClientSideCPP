import type {
  ExprNode,
  IntTemplateArgNode,
  TemplateArgNode,
  TemplateCallExprNode,
  TemplateIdExprNode,
  TypeTemplateArgNode,
} from "@/types";
import { getBuiltinTemplateComparatorSpec } from "./metadata";

export function isTypeTemplateArg(arg: TemplateArgNode): arg is TypeTemplateArgNode {
  return arg.kind === "TypeTemplateArg";
}

export function isIntTemplateArg(arg: TemplateArgNode): arg is IntTemplateArgNode {
  return arg.kind === "IntTemplateArg";
}

export function templateTypeArgCount(expr: TemplateIdExprNode): number {
  return expr.templateArgs.length;
}

export function isTemplateNamed(expr: TemplateIdExprNode, name: string): boolean {
  return expr.template === name;
}

export function getSingleTypeTemplateArg(expr: TemplateIdExprNode) {
  const arg = expr.templateArgs[0];
  return arg !== undefined && isTypeTemplateArg(arg) ? arg.type : null;
}

export function getSingleIntTemplateArg(expr: TemplateIdExprNode) {
  const arg = expr.templateArgs[0];
  return arg !== undefined && isIntTemplateArg(arg) ? arg.value : null;
}

export function isTupleGetTemplateCall(expr: ExprNode): expr is TemplateCallExprNode {
  return (
    expr.kind === "TemplateCallExpr" &&
    expr.callee.template === "get" &&
    expr.callee.templateArgs.length === 1 &&
    isIntTemplateArg(expr.callee.templateArgs[0] as TemplateArgNode) &&
    expr.args.length === 1
  );
}

export function isValidBuiltinTemplateComparatorCall(expr: ExprNode): expr is TemplateCallExprNode {
  if (expr.kind !== "TemplateCallExpr") {
    return false;
  }
  const spec = getBuiltinTemplateComparatorSpec(expr.callee.template);
  if (spec === null || expr.args.length !== spec.callArgs) {
    return false;
  }
  const argCount = expr.callee.templateArgs.length;
  return argCount >= spec.minTypeArgs && argCount <= spec.maxTypeArgs;
}
