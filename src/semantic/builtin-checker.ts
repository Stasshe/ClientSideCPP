import {
  dispatchFreeCall,
  dispatchMethodCall,
  dispatchTemplateCall,
  type CheckCtx,
} from "@/stdlib/check";
import { getBuiltinTemplateComparatorSpec } from "@/stdlib/metadata";
import type {
  CompileError,
  ExprNode,
  FunctionDeclNode,
  TemplateCallExprNode,
  TemplateFunctionDeclNode,
  TypeNode,
} from "@/types";
import { inferTypeArgs, instantiateFunction, instantiationKey } from "./template-instantiator";
import { isAssignable, isAssignableExpr } from "./type-compat";

export type ValidationContext = {
  errors: CompileError[];
  functions: Map<string, import("@/types").FunctionDeclNode>;
  templateFunctions: Map<string, import("@/types").TemplateFunctionDeclNode>;
  scopes: Map<string, TypeNode>[];
  loopDepth: number;
  currentReturnType: TypeNode | null;
  instantiatingTemplates: Set<string>;
};

export type ValidateExprFn = (
  expr: ExprNode | null,
  context: ValidationContext,
  expected?: TypeNode | "bool" | "int",
) => TypeNode | null;

export type InferExprTypeFn = (expr: ExprNode, context: ValidationContext) => TypeNode | null;

function makeCheckCtx(
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
): CheckCtx {
  return {
    pushError: (line, col, message) => context.errors.push({ line, col, message }),
    validateExpr: (expr, expected) => validateExpr(expr, context, expected),
    inferExprType: (expr) => inferExprType(expr, context),
    isAssignableExpr,
    isAssignable,
  };
}

export function validateBuiltinCall(
  callee: string,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
): TypeNode | null | undefined {
  const ctx = makeCheckCtx(context, validateExpr, inferExprType);
  const result = dispatchFreeCall(callee, args, line, col, ctx);
  return result === "not_registered" ? undefined : result;
}

export function validateTemplateCall(
  expr: TemplateCallExprNode,
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
): TypeNode | null {
  const ctx = makeCheckCtx(context, validateExpr, inferExprType);

  if (getBuiltinTemplateComparatorSpec(expr.callee.template) !== null) return null;

  const result = dispatchTemplateCall(expr, ctx);
  if (result !== "not_registered") return result;

  context.errors.push({
    line: expr.line,
    col: expr.col,
    message: `unsupported template call '${expr.callee.template}'`,
  });
  for (const arg of expr.args) validateExpr(arg, context);
  return null;
}

export function validateMethodCall(
  receiver: ExprNode,
  method: string,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
): TypeNode | null {
  const receiverType = inferExprType(receiver, context);
  if (receiverType === null) {
    for (const arg of args) validateExpr(arg, context);
    return null;
  }

  const ctx = makeCheckCtx(context, validateExpr, inferExprType);
  const result = dispatchMethodCall(receiverType, method, args, line, col, ctx);
  if (result === "not_matched") {
    context.errors.push({ line, col, message: "type mismatch: expected array/vector/pair/map" });
    for (const arg of args) validateExpr(arg, context);
    return null;
  }
  return result;
}

export function validateTemplateFunctionCall(
  templateFn: TemplateFunctionDeclNode,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
  validateExpr: ValidateExprFn,
  inferExprType: InferExprTypeFn,
  validateArgumentAgainstParam: (
    arg: ExprNode,
    paramType: TypeNode | undefined,
    context: ValidationContext,
  ) => void,
  validateInstantiatedFn: (fn: FunctionDeclNode, context: ValidationContext) => void,
): TypeNode | null {
  if (args.length !== templateFn.params.length) {
    context.errors.push({
      line,
      col,
      message: `'${templateFn.name}' requires ${templateFn.params.length.toString()} argument${templateFn.params.length === 1 ? "" : "s"}`,
    });
    for (const arg of args) validateExpr(arg, context);
    return null;
  }

  const argTypes = args.map((arg) => inferExprType(arg, context));
  const map = inferTypeArgs(templateFn.typeParams, templateFn.params, argTypes);
  if (map === null) {
    context.errors.push({
      line,
      col,
      message: `cannot deduce template arguments for '${templateFn.name}'`,
    });
    for (const arg of args) validateExpr(arg, context);
    return null;
  }

  const key = instantiationKey(templateFn.name, map, templateFn.typeParams);
  if (context.instantiatingTemplates.has(key)) return null;

  context.instantiatingTemplates.add(key);
  const instantiated = instantiateFunction(templateFn, map);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const param = instantiated.params[i];
    if (arg !== undefined && param !== undefined) {
      validateArgumentAgainstParam(arg, param.type, context);
    }
  }
  validateInstantiatedFn(instantiated, context);
  context.instantiatingTemplates.delete(key);

  return instantiated.returnType;
}
