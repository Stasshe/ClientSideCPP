import type { RuntimeValue } from "@/runtime/value";
import type { EvalCtx } from "@/stdlib/eval-context";

export function cloneRuntimeValue(value: RuntimeValue, ctx: EvalCtx): RuntimeValue {
  if (value.kind === "object") {
    if (value.objectKind === "vector") {
      const orig = ctx.arrays.get(value.ref);
      if (orig === undefined) return value;
      return ctx.allocVector(value.type, orig.values.map((v) => cloneRuntimeValue(v, ctx)));
    }
    if (value.objectKind === "pair") {
      return {
        ...value,
        first: cloneRuntimeValue(value.first, ctx),
        second: cloneRuntimeValue(value.second, ctx),
      };
    }
    if (value.objectKind === "tuple") {
      return { ...value, values: value.values.map((v) => cloneRuntimeValue(v, ctx)) };
    }
  }
  return value;
}
