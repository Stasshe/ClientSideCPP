import type { RuntimeValue } from "@/runtime/value";
import { compareSortableValues } from "@/stdlib/builtins/compare";
import type { EvalCtx } from "@/stdlib/eval-context";
import { registerFreeCall } from "@/stdlib/eval-registry";
import { cloneRuntimeValue } from "@/stdlib/runtime-values";
import { isValidBuiltinTemplateComparatorCall } from "@/stdlib/template-exprs";
import { vectorElementType } from "@/stdlib/template-types";
import type { ExprNode, VectorTypeNode } from "@/types";
import { isVectorType } from "@/types";

export function evalSort(args: ExprNode[], line: number, ctx: EvalCtx): void {
  const store = expectVectorRange(args, "sort", line, ctx);
  const descending = isDescendingSortComparator(args[2], line, ctx);
  store.values.sort((left, right) =>
    compareSortableValues(left, right, descending, line, ctx.fail.bind(ctx)),
  );
}

export function evalReverse(args: ExprNode[], line: number, ctx: EvalCtx): void {
  const store = expectVectorRange(args, "reverse", line, ctx);
  store.values.reverse();
}

export function evalFill(args: ExprNode[], line: number, ctx: EvalCtx): void {
  const store = expectVectorRange(args, "fill", line, ctx);
  const fillArg = args[2];
  if (fillArg === undefined) ctx.fail("fill requires exactly 3 arguments", line);
  const fillValue = ctx.castToElementType(
    ctx.evaluateExpr(fillArg),
    vectorElementType(store.type),
    line,
  );
  store.values = store.values.map(() => cloneRuntimeValue(fillValue, ctx));
}

function expectVectorRange(
  args: ExprNode[],
  callee: "sort" | "reverse" | "fill",
  line: number,
  ctx: EvalCtx,
): { values: RuntimeValue[]; type: VectorTypeNode } {
  const beginExpr = args[0];
  const endExpr = args[1];
  if (beginExpr === undefined || endExpr === undefined) {
    ctx.fail(`${callee} requires exactly 2 iterator arguments`, line);
  }
  const beginValue = ctx.ensureInitialized(ctx.evaluateExpr(beginExpr), line, "iterator");
  const endValue = ctx.ensureInitialized(ctx.evaluateExpr(endExpr), line, "iterator");
  if (
    beginValue.kind !== "object" ||
    beginValue.objectKind !== "iterator" ||
    endValue.kind !== "object" ||
    endValue.objectKind !== "iterator"
  ) {
    ctx.fail(`${callee} requires vector iterators`, line);
  }
  if (beginValue.ref !== endValue.ref) {
    ctx.fail(`${callee} requires iterators from the same vector`, line);
  }
  const store = ctx.arrays.get(beginValue.ref);
  if (store === undefined) ctx.fail("invalid array reference", line);
  if (!isVectorType(store.type)) ctx.fail(`${callee} requires a vector range`, line);
  if (beginValue.index !== 0 || endValue.index !== store.values.length) {
    ctx.fail(`${callee} currently requires the full vector range`, line);
  }
  return store as { values: RuntimeValue[]; type: VectorTypeNode };
}

function isDescendingSortComparator(
  expr: ExprNode | undefined,
  line: number,
  ctx: EvalCtx,
): boolean {
  if (expr === undefined) return false;
  if (isValidBuiltinTemplateComparatorCall(expr)) {
    return true;
  }
  ctx.fail("unsupported sort comparator", line);
}

registerFreeCall("sort", (args, line, ctx) => {
  evalSort(args, line, ctx);
  return { kind: "void" };
});
registerFreeCall("reverse", (args, line, ctx) => {
  evalReverse(args, line, ctx);
  return { kind: "void" };
});
registerFreeCall("fill", (args, line, ctx) => {
  evalFill(args, line, ctx);
  return { kind: "void" };
});
