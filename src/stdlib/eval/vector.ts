import type { RuntimeValue } from "@/runtime/value";
import type { EvalCtx } from "@/stdlib/eval-context";
import { registerMethodHandler, registerTemplateCall } from "@/stdlib/eval-registry";
import { cloneRuntimeValue } from "@/stdlib/runtime-values";
import { getSingleTypeTemplateArg } from "@/stdlib/template-exprs";
import { vectorElementType } from "@/stdlib/template-types";
import {
  describeVectorMethodArgs,
  getVectorMethodSpec,
  type VectorMethodName,
} from "@/stdlib/vector-methods";
import type { ExprNode, VectorTypeNode } from "@/types";
import { isVectorType, iteratorType, vectorType } from "@/types";

export function evalVectorConstructor(
  type: VectorTypeNode,
  args: RuntimeValue[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  let values: RuntimeValue[] = [];
  if (args.length === 1) {
    const size = ctx.expectInt(args[0] as RuntimeValue, line).value;
    if (size < 0n) ctx.fail("vector size must be non-negative", line);
    values = Array.from({ length: Number(size) }, () =>
      ctx.defaultValueForType(vectorElementType(type), line),
    );
  } else if (args.length === 2) {
    const size = ctx.expectInt(args[0] as RuntimeValue, line).value;
    if (size < 0n) ctx.fail("vector size must be non-negative", line);
    const proto = ctx.castToElementType(args[1] as RuntimeValue, vectorElementType(type), line);
    values = Array.from({ length: Number(size) }, () => cloneRuntimeValue(proto, ctx));
  } else if (args.length > 2) {
    ctx.fail("too many arguments for vector constructor", line);
  }
  return ctx.allocVector(type, values);
}

export function evalVectorMethod(
  receiver: Extract<RuntimeValue, { kind: "object"; objectKind: "vector" }>,
  method: string,
  args: ExprNode[],
  vStore: { type: VectorTypeNode; values: RuntimeValue[] },
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  const vecSpec = getVectorMethodSpec(method);
  if (vecSpec === null) ctx.fail(`unknown vector method '${method}'`, line);
  if (args.length < vecSpec.minArgs || args.length > vecSpec.maxArgs) {
    ctx.fail(`${method} requires ${describeVectorMethodArgs(vecSpec)}`, line);
  }
  return applyMethod(receiver, vecSpec.name, args, vStore, line, ctx);
}

registerTemplateCall("vector", (expr, ctx) => {
  const elementType = getSingleTypeTemplateArg(expr.callee);
  if (elementType === null) {
    return ctx.fail("vector constructor requires exactly 1 type argument", expr.line);
  }
  const args = expr.args.map((arg) => ctx.evaluateExpr(arg));
  return evalVectorConstructor(vectorType(elementType), args, expr.line, ctx);
});

registerMethodHandler({
  matches: (v) => v.kind === "object" && v.objectKind === "vector",
  handle: (receiver, method, args, line, ctx) => {
    const vectorValue = ctx.expectVector(receiver, line);
    const store = ctx.arrays.get(vectorValue.ref);
    if (store === undefined) {
      return ctx.fail("invalid array reference", line);
    }
    return evalVectorMethod(
      vectorValue,
      method,
      args,
      store as { type: VectorTypeNode; values: RuntimeValue[] },
      line,
      ctx,
    );
  },
});

function applyMethod(
  receiver: Extract<RuntimeValue, { kind: "object"; objectKind: "vector" }>,
  method: VectorMethodName,
  args: ExprNode[],
  vStore: { type: VectorTypeNode; values: RuntimeValue[] },
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  switch (method) {
    case "begin":
      return {
        kind: "object",
        objectKind: "iterator",
        type: iteratorType(vStore.type),
        ref: receiver.ref,
        index: 0,
      };
    case "end":
      return {
        kind: "object",
        objectKind: "iterator",
        type: iteratorType(vStore.type),
        ref: receiver.ref,
        index: vStore.values.length,
      };
    case "push_back": {
      const value = ctx.castToElementType(
        ctx.evaluateExpr(args[0] as ExprNode),
        vectorElementType(vStore.type),
        line,
      );
      vStore.values.push(value);
      return { kind: "void" };
    }
    case "pop_back":
      if (vStore.values.length === 0) ctx.fail("pop_back on empty vector", line);
      vStore.values.pop();
      return { kind: "void" };
    case "size":
      return { kind: "int", value: BigInt(vStore.values.length) };
    case "back": {
      const last = vStore.values[vStore.values.length - 1];
      if (last === undefined) ctx.fail("back on empty vector", line);
      return last;
    }
    case "empty":
      return { kind: "bool", value: vStore.values.length === 0 };
    case "clear":
      vStore.values = [];
      return { kind: "void" };
    case "resize": {
      const newSize = ctx.expectInt(ctx.evaluateExpr(args[0] as ExprNode), line).value;
      if (newSize < 0n) ctx.fail("resize size must be non-negative", line);
      const targetSize = Number(newSize);
      if (targetSize < vStore.values.length) {
        vStore.values = vStore.values.slice(0, targetSize);
      } else {
        const fillArg = args[1] as ExprNode | undefined;
        const fillProto =
          fillArg !== undefined
            ? ctx.castToElementType(
                ctx.evaluateExpr(fillArg),
                vectorElementType(vStore.type),
                line,
              )
            : null;
        while (vStore.values.length < targetSize) {
          vStore.values.push(
            fillProto !== null
              ? cloneRuntimeValue(fillProto, ctx)
              : ctx.defaultValueForType(vectorElementType(vStore.type), line),
          );
        }
      }
      return { kind: "void" };
    }
  }
}
