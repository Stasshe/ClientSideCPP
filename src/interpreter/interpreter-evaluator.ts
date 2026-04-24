import type { RuntimeValue } from "../runtime/value";
import type { BinaryExprNode, ExprNode, FunctionDeclNode } from "../types";
import { InterpreterRuntime } from "./interpreter-runtime";

export abstract class InterpreterEvaluator extends InterpreterRuntime {
  protected evaluateExpr(expr: ExprNode): RuntimeValue {
    this.step(expr.line, "expression");

    switch (expr.kind) {
      case "Literal":
        if (expr.valueType === "int") {
          return { kind: "int", value: expr.value as bigint };
        }
        if (expr.valueType === "bool") {
          return { kind: "bool", value: expr.value as boolean };
        }
        return { kind: "string", value: expr.value as string };
      case "Identifier":
        if (expr.name === "endl") {
          return { kind: "string", value: "\n" };
        }
        return this.resolve(expr.name, expr.line);
      case "CallExpr": {
        const fn = this.functions.get(expr.callee);
        if (fn === undefined) {
          this.fail(`'${expr.callee}' was not declared in this scope`, expr.line);
        }
        const argValues = expr.args.map((arg) => this.evaluateExpr(arg));
        return this.invokeFunction(fn, argValues);
      }
      case "MethodCallExpr":
        return this.evaluateMethodCall(expr.receiver, expr.method, expr.args, expr.line);
      case "IndexExpr":
        return this.getIndexedValue(expr.target, expr.index, expr.line);
      case "UnaryExpr": {
        if (expr.operator === "!") {
          const value = this.expectBool(this.evaluateExpr(expr.operand), expr.line);
          return { kind: "bool", value: !value.value };
        }
        if (expr.operator === "-") {
          const value = this.expectInt(this.evaluateExpr(expr.operand), expr.line);
          return { kind: "int", value: -value.value };
        }

        if (expr.operand.kind !== "Identifier" && expr.operand.kind !== "IndexExpr") {
          this.fail("increment/decrement target must be a variable", expr.line);
        }

        const current =
          expr.operand.kind === "Identifier"
            ? this.expectInt(this.resolve(expr.operand.name, expr.line), expr.line)
            : this.expectInt(
                this.getIndexedValue(expr.operand.target, expr.operand.index, expr.line),
                expr.line,
              );
        const delta = expr.operator === "++" ? 1n : -1n;
        const updated: RuntimeValue = { kind: "int", value: current.value + delta };

        if (expr.operand.kind === "Identifier") {
          this.assign(expr.operand.name, updated, expr.line);
        } else {
          this.setIndexedValue(expr.operand.target, expr.operand.index, updated, expr.line);
        }
        return expr.isPostfix ? current : updated;
      }
      case "BinaryExpr":
        return this.evaluateBinary(expr);
      case "AssignExpr": {
        const rightValue = this.ensureInitialized(this.evaluateExpr(expr.value), expr.line, "rhs");
        if (expr.target.kind === "Identifier") {
          const current = this.resolve(expr.target.name, expr.line);
          const assigned = this.resolveAssignedValue(expr.operator, current, rightValue, expr.line);
          this.assign(expr.target.name, assigned, expr.line);
          return assigned;
        }

        let assigned: RuntimeValue = rightValue;
        if (expr.operator !== "=") {
          const currentIndexValue = this.getIndexedValue(
            expr.target.target,
            expr.target.index,
            expr.line,
          );
          assigned = this.resolveAssignedValue(
            expr.operator,
            currentIndexValue,
            rightValue,
            expr.line,
          );
        }
        this.setIndexedValue(expr.target.target, expr.target.index, assigned, expr.line);
        return assigned;
      }
    }
  }

  protected abstract invokeFunction(fn: FunctionDeclNode, args: RuntimeValue[]): RuntimeValue;

  private resolveAssignedValue(
    operator: "=" | "+=" | "-=" | "*=" | "/=" | "%=",
    current: RuntimeValue,
    rightValue: RuntimeValue,
    line: number,
  ): RuntimeValue {
    if (operator === "=") {
      return this.assignWithCurrentType(current, rightValue, line);
    }
    const left = this.expectInt(current, line);
    const right = this.expectInt(rightValue, line);
    return this.applyCompoundAssign(operator, left.value, right.value, line);
  }

  private evaluateMethodCall(
    receiverExpr: ExprNode,
    method: string,
    args: ExprNode[],
    line: number,
  ): RuntimeValue {
    const receiver = this.evaluateExpr(receiverExpr);
    const arrayValue = this.expectArray(receiver, line);
    const store = this.arrays.get(arrayValue.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    if (!store.dynamic) {
      this.fail(`method '${method}' is not supported for fixed array`, line);
    }

    if (method === "push_back") {
      if (args.length !== 1) {
        this.fail("push_back requires exactly 1 argument", line);
      }
      const value = this.castToElementType(
        this.evaluateExpr(args[0] as ExprNode),
        store.elementType,
        line,
      );
      store.values.push(value);
      return { kind: "void" };
    }

    if (method === "pop_back") {
      if (args.length !== 0) {
        this.fail("pop_back requires no arguments", line);
      }
      if (store.values.length === 0) {
        this.fail("pop_back on empty vector", line);
      }
      store.values.pop();
      return { kind: "void" };
    }

    if (method === "size") {
      if (args.length !== 0) {
        this.fail("size requires no arguments", line);
      }
      return { kind: "int", value: BigInt(store.values.length) };
    }

    if (method === "back") {
      if (args.length !== 0) {
        this.fail("back requires no arguments", line);
      }
      const last = store.values[store.values.length - 1];
      if (last === undefined) {
        this.fail("back on empty vector", line);
      }
      return last;
    }

    if (method === "empty") {
      if (args.length !== 0) {
        this.fail("empty requires no arguments", line);
      }
      return { kind: "bool", value: store.values.length === 0 };
    }

    if (method === "clear") {
      if (args.length !== 0) {
        this.fail("clear requires no arguments", line);
      }
      store.values = [];
      return { kind: "void" };
    }

    if (method === "resize") {
      if (args.length !== 1) {
        this.fail("resize requires exactly 1 argument", line);
      }
      const newSize = this.expectInt(this.evaluateExpr(args[0] as ExprNode), line).value;
      if (newSize < 0n) {
        this.fail("resize size must be non-negative", line);
      }
      const targetSize = Number(newSize);
      if (targetSize < store.values.length) {
        store.values = store.values.slice(0, targetSize);
      } else {
        while (store.values.length < targetSize) {
          store.values.push(this.defaultPrimitiveValue(store.elementType));
        }
      }
      return { kind: "void" };
    }

    this.fail(`unknown vector method '${method}'`, line);
  }

  protected getIndexedValue(targetExpr: ExprNode, indexExpr: ExprNode, line: number): RuntimeValue {
    const target = this.expectArray(this.evaluateExpr(targetExpr), line);
    const index = this.expectInt(this.evaluateExpr(indexExpr), line).value;
    const store = this.arrays.get(target.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    if (index < 0n || index >= BigInt(store.values.length)) {
      this.fail(
        `index ${index.toString()} out of range for array of size ${store.values.length}`,
        line,
      );
    }
    const value = store.values[Number(index)];
    if (value === undefined) {
      this.fail("invalid index access", line);
    }
    return this.ensureInitialized(value, line, "array element");
  }

  protected setIndexedValue(
    targetExpr: ExprNode,
    indexExpr: ExprNode,
    value: RuntimeValue,
    line: number,
  ): void {
    const target = this.expectArray(this.evaluateExpr(targetExpr), line);
    const index = this.expectInt(this.evaluateExpr(indexExpr), line).value;
    const store = this.arrays.get(target.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    if (index < 0n || index >= BigInt(store.values.length)) {
      this.fail(
        `index ${index.toString()} out of range for array of size ${store.values.length}`,
        line,
      );
    }
    const assigned = this.castToElementType(value, store.elementType, line);
    store.values[Number(index)] = assigned;
  }

  private evaluateBinary(expr: BinaryExprNode): RuntimeValue {
    if (expr.operator === "&&") {
      const left = this.expectBool(this.evaluateExpr(expr.left), expr.line);
      if (!left.value) {
        return { kind: "bool", value: false };
      }
      const right = this.expectBool(this.evaluateExpr(expr.right), expr.line);
      return { kind: "bool", value: right.value };
    }

    if (expr.operator === "||") {
      const left = this.expectBool(this.evaluateExpr(expr.left), expr.line);
      if (left.value) {
        return { kind: "bool", value: true };
      }
      const right = this.expectBool(this.evaluateExpr(expr.right), expr.line);
      return { kind: "bool", value: right.value };
    }

    const left = this.ensureNotVoid(
      this.ensureInitialized(this.evaluateExpr(expr.left), expr.line, "left operand"),
      expr.line,
    );
    const right = this.ensureNotVoid(
      this.ensureInitialized(this.evaluateExpr(expr.right), expr.line, "right operand"),
      expr.line,
    );

    if (expr.operator === "+" && left.kind === "string" && right.kind === "string") {
      return { kind: "string", value: left.value + right.value };
    }

    if (
      expr.operator === "==" ||
      expr.operator === "!=" ||
      expr.operator === "<" ||
      expr.operator === "<=" ||
      expr.operator === ">" ||
      expr.operator === ">="
    ) {
      return {
        kind: "bool",
        value: compareValues(left, right, expr.operator, expr.line, this.fail.bind(this)),
      };
    }

    const leftInt = this.expectInt(left, expr.line);
    const rightInt = this.expectInt(right, expr.line);

    switch (expr.operator) {
      case "+":
        return { kind: "int", value: leftInt.value + rightInt.value };
      case "-":
        return { kind: "int", value: leftInt.value - rightInt.value };
      case "*":
        return { kind: "int", value: leftInt.value * rightInt.value };
      case "/":
        if (rightInt.value === 0n) {
          this.fail("division by zero", expr.line);
        }
        return { kind: "int", value: leftInt.value / rightInt.value };
      case "%":
        if (rightInt.value === 0n) {
          this.fail("division by zero", expr.line);
        }
        return { kind: "int", value: leftInt.value % rightInt.value };
      default:
        this.fail(`unsupported binary operator '${expr.operator}'`, expr.line);
    }
  }

  private applyCompoundAssign(
    operator: "+=" | "-=" | "*=" | "/=" | "%=",
    left: bigint,
    right: bigint,
    line: number,
  ): RuntimeValue {
    switch (operator) {
      case "+=":
        return { kind: "int", value: left + right };
      case "-=":
        return { kind: "int", value: left - right };
      case "*=":
        return { kind: "int", value: left * right };
      case "/=":
        if (right === 0n) {
          this.fail("division by zero", line);
        }
        return { kind: "int", value: left / right };
      case "%=":
        if (right === 0n) {
          this.fail("division by zero", line);
        }
        return { kind: "int", value: left % right };
    }
  }
}

function compareValues(
  left: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  right: Exclude<RuntimeValue, { kind: "void" | "uninitialized" }>,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
  line: number,
  fail: (message: string, line: number) => never,
): boolean {
  if (left.kind !== right.kind) {
    fail("type mismatch in comparison", line);
  }

  switch (left.kind) {
    case "int":
      return comparePrimitive(left.value, (right as { kind: "int"; value: bigint }).value, operator);
    case "bool":
      return comparePrimitive(
        left.value,
        (right as { kind: "bool"; value: boolean }).value,
        operator,
      );
    case "string":
      return comparePrimitive(
        left.value,
        (right as { kind: "string"; value: string }).value,
        operator,
      );
    case "array":
      fail("array comparison is not supported", line);
  }
}

function comparePrimitive<T extends bigint | boolean | string>(
  left: T,
  right: T,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=",
): boolean {
  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
  }
}
