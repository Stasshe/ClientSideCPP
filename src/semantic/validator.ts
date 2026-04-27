import {
  describeBuiltinArity,
  getBuiltinFreeFunctionSpec,
  getBuiltinTemplateComparatorSpec,
} from "@/stdlib/registry";
import {
  mapKeyType,
  mapValueType,
  pairFirstType,
  pairSecondType,
  tupleElementTypes,
  vectorElementType,
} from "@/stdlib/template-types";
import type {
  CompileError,
  ExprNode,
  FunctionDeclNode,
  ProgramNode,
  RangeForStmtNode,
  StatementNode,
  TypeNode,
  VectorTypeNode,
} from "@/types";
import {
  isArrayType,
  isMapType,
  isPairType,
  isPointerType,
  isPrimitiveType,
  isReferenceType,
  isTupleType,
  isVectorType,
  pairType,
  tupleType,
  typeToString,
} from "@/types";

type ValidationContext = {
  errors: CompileError[];
  functions: Map<string, FunctionDeclNode>;
  scopes: Map<string, TypeNode>[];
  loopDepth: number;
  currentReturnType: TypeNode | null;
};

export function validateProgram(program: ProgramNode): CompileError[] {
  const { functions, errors } = collectFunctions(program);
  const context: ValidationContext = {
    errors,
    functions,
    scopes: [new Map()],
    loopDepth: 0,
    currentReturnType: null,
  };

  validateMainSignature(functions, context);

  for (const decl of program.globals) {
    validateDecl(decl, context);
  }

  for (const fn of program.functions) {
    validateFunction(fn, context);
  }

  return context.errors;
}

function collectFunctions(program: ProgramNode): {
  functions: Map<string, FunctionDeclNode>;
  errors: CompileError[];
} {
  const functions = new Map<string, FunctionDeclNode>();
  const errors: CompileError[] = [];

  for (const fn of program.functions) {
    if (functions.has(fn.name)) {
      errors.push({
        line: fn.line,
        col: fn.col,
        message: `redefinition of function '${fn.name}'`,
      });
      continue;
    }
    functions.set(fn.name, fn);
  }

  return { functions, errors };
}

function validateMainSignature(
  functions: Map<string, FunctionDeclNode>,
  context: ValidationContext,
): void {
  const main = functions.get("main");
  if (main === undefined) {
    return;
  }
  if (!isPrimitiveType(main.returnType) || main.returnType.name !== "int") {
    pushError(context, main.line, main.col, "'main' must return 'int'");
  }
  if (main.params.length !== 0) {
    pushError(context, main.line, main.col, "'main' must not take any arguments");
  }
}

function validateFunction(fn: FunctionDeclNode, context: ValidationContext): void {
  validateFunctionReturnType(fn, context);
  pushScope(context);
  const previousReturnType = context.currentReturnType;
  context.currentReturnType = fn.returnType;

  for (const param of fn.params) {
    validateParameterType(param.type, param.line, param.col, context);
    defineSymbol(param.name, param.type, param.line, param.col, context);
  }

  validateBlock(fn.body.statements, context);

  context.currentReturnType = previousReturnType;
  popScope(context);
}

function validateParameterType(
  type: TypeNode,
  line: number,
  col: number,
  context: ValidationContext,
): void {
  if (containsVoid(type)) {
    pushError(context, line, col, "parameter type cannot be void");
    return;
  }
  if (containsReferenceBelowTopLevel(type)) {
    pushError(context, line, col, "array/vector element type cannot be reference");
  }
}

function validateFunctionReturnType(fn: FunctionDeclNode, context: ValidationContext): void {
  if (fn.returnType.kind === "ArrayType" || fn.returnType.kind === "ReferenceType") {
    pushError(
      context,
      fn.line,
      fn.col,
      `function return type cannot be ${fn.returnType.kind === "ArrayType" ? "array" : "reference"}`,
    );
  }
}

function validateBlock(statements: StatementNode[], context: ValidationContext): void {
  pushScope(context);
  for (const stmt of statements) {
    validateStatement(stmt, context);
  }
  popScope(context);
}

function validateStatement(stmt: StatementNode, context: ValidationContext): void {
  switch (stmt.kind) {
    case "BlockStmt":
      validateBlock(stmt.statements, context);
      return;
    case "DeclGroupStmt":
      for (const decl of stmt.declarations) {
        validateDecl(decl, context);
      }
      return;
    case "VarDecl":
    case "ArrayDecl":
    case "VectorDecl":
      validateDecl(stmt, context);
      return;
    case "RangeForStmt":
      validateRangeFor(stmt, context);
      return;
    case "IfStmt":
      for (const branch of stmt.branches) {
        validateConditionExpr(branch.condition, context);
        validateBlock(branch.thenBlock.statements, context);
      }
      if (stmt.elseBlock !== null) {
        validateBlock(stmt.elseBlock.statements, context);
      }
      return;
    case "WhileStmt":
      validateConditionExpr(stmt.condition, context);
      validateLoopBody(stmt.body.statements, context);
      return;
    case "ForStmt":
      pushScope(context);
      if (stmt.init.kind === "varDecl") {
        validateDecl(stmt.init.value, context);
      } else if (stmt.init.kind === "declGroup") {
        for (const decl of stmt.init.value) {
          validateDecl(decl, context);
        }
      } else if (stmt.init.kind === "expr") {
        validateExpr(stmt.init.value, context);
      }
      if (stmt.condition !== null) {
        validateConditionExpr(stmt.condition, context);
      }
      if (stmt.update !== null) {
        validateExpr(stmt.update, context);
      }
      validateLoopBody(stmt.body.statements, context);
      popScope(context);
      return;
    case "ReturnStmt":
      validateReturn(stmt, context);
      return;
    case "BreakStmt":
      if (context.loopDepth === 0) {
        pushError(context, stmt.line, stmt.col, "break statement not within a loop");
      }
      return;
    case "ContinueStmt":
      if (context.loopDepth === 0) {
        pushError(context, stmt.line, stmt.col, "continue statement not within a loop");
      }
      return;
    case "ExprStmt":
      validateExpr(stmt.expression, context);
      return;
    case "CoutStmt":
    case "CerrStmt":
      for (const value of stmt.values) {
        validateExpr(value, context);
      }
      return;
    case "CinStmt":
      for (const target of stmt.targets) {
        const type = validateExpr(target, context);
        if (type === null || !isInputTargetType(type)) {
          pushError(context, target.line, target.col, "invalid cin target");
        }
      }
      return;
  }
}

function validateDecl(
  stmt:
    | Extract<StatementNode, { kind: "VarDecl" | "ArrayDecl" | "VectorDecl" }>
    | ProgramNode["globals"][number],
  context: ValidationContext,
): void {
  switch (stmt.kind) {
    case "VarDecl":
      if (isArrayType(stmt.type) || isVectorType(stmt.type)) {
        pushError(
          context,
          stmt.line,
          stmt.col,
          `variable type cannot be '${typeToString(stmt.type)}'`,
        );
      } else if (containsVoid(stmt.type)) {
        pushError(context, stmt.line, stmt.col, "variable type cannot be void");
      }
      if (isReferenceType(stmt.type)) {
        if (stmt.initializer === null) {
          pushError(context, stmt.line, stmt.col, "reference variable must be initialized");
        } else {
          validateReferenceBinding(stmt.initializer, stmt.type.referredType, context);
        }
      } else if (stmt.initializer !== null) {
        validateExpr(stmt.initializer, context, stmt.type);
      }
      defineSymbol(stmt.name, stmt.type, stmt.line, stmt.col, context);
      return;
    case "ArrayDecl":
      if (containsVoid(stmt.type)) {
        pushError(context, stmt.line, stmt.col, "array element type cannot be void");
      }
      if (containsReferenceBelowTopLevel(stmt.type.elementType)) {
        pushError(context, stmt.line, stmt.col, "array element type cannot be reference");
      }
      for (const init of stmt.initializers) {
        validateExpr(init, context, baseElementType(stmt.type));
      }
      defineSymbol(stmt.name, stmt.type, stmt.line, stmt.col, context);
      return;
    case "VectorDecl":
      if (containsVoid(stmt.type)) {
        pushError(context, stmt.line, stmt.col, "vector element type cannot be void");
      }
      if (containsReferenceBelowTopLevel(vectorElementType(stmt.type))) {
        pushError(context, stmt.line, stmt.col, "vector element type cannot be reference");
      }
      if (stmt.constructorArgs.length >= 1) {
        validateExpr(stmt.constructorArgs[0] ?? null, context, "int");
      }
      if (stmt.constructorArgs.length >= 2) {
        validateExpr(stmt.constructorArgs[1] ?? null, context, vectorElementType(stmt.type));
      }
      defineSymbol(stmt.name, stmt.type, stmt.line, stmt.col, context);
      return;
  }
}

function validateRangeFor(stmt: RangeForStmtNode, context: ValidationContext): void {
  const sourceType = validateExpr(stmt.source, context);
  const elementType =
    sourceType === null
      ? null
      : getIterableElementType(sourceType, stmt.source.line, stmt.source.col, context);
  const itemType = stmt.itemType ?? elementType;

  if (itemType === null) {
    pushScope(context);
    validateBlock(stmt.body.statements, context);
    popScope(context);
    return;
  }

  if (!isAssignable(elementType ?? itemType, itemType)) {
    pushError(
      context,
      stmt.line,
      stmt.col,
      `cannot convert '${typeToString(elementType ?? itemType)}' to '${typeToString(itemType)}'`,
    );
  }

  pushScope(context);
  defineSymbol(
    stmt.itemName,
    stmt.itemByReference ? { kind: "ReferenceType", referredType: itemType } : itemType,
    stmt.line,
    stmt.col,
    context,
  );
  validateBlock(stmt.body.statements, context);
  popScope(context);
}

function validateReturn(
  stmt: Extract<StatementNode, { kind: "ReturnStmt" }>,
  context: ValidationContext,
): void {
  const returnType = context.currentReturnType;
  if (returnType === null) {
    return;
  }

  if (isPrimitiveType(returnType) && returnType.name === "void") {
    if (stmt.value !== null) {
      pushError(
        context,
        stmt.line,
        stmt.col,
        "return-statement with a value, in function returning 'void'",
      );
    }
    return;
  }

  if (stmt.value === null) {
    pushError(
      context,
      stmt.line,
      stmt.col,
      "return-statement with no value, in function returning non-void",
    );
    return;
  }

  validateExpr(stmt.value, context, returnType);
}

function validateExpr(
  expr: ExprNode | null,
  context: ValidationContext,
  expected?: TypeNode | "bool" | "int",
): TypeNode | null {
  if (expr === null) {
    return null;
  }

  const type = inferExprType(expr, context);
  if (type !== null && expected !== undefined) {
    const expectedType = normalizeExpectedType(expected);
    if (expectedType.kind === "PointerType" && isNullPointerConstantExpr(expr)) {
      return type;
    }
    if (!isAssignable(type, expectedType)) {
      pushError(
        context,
        expr.line,
        expr.col,
        `cannot convert '${typeToString(type)}' to '${typeToString(expectedType)}'`,
      );
    }
  }
  return type;
}

function validateConditionExpr(expr: ExprNode, context: ValidationContext): void {
  const type = validateExpr(expr, context);
  if (type !== null && !isBoolType(type) && !isNumericType(type)) {
    pushError(context, expr.line, expr.col, `cannot convert '${typeToString(type)}' to 'bool'`);
  }
}

function inferExprType(expr: ExprNode, context: ValidationContext): TypeNode | null {
  switch (expr.kind) {
    case "Literal":
      if (expr.valueType === "int") {
        return { kind: "PrimitiveType", name: "int" };
      }
      if (expr.valueType === "double") {
        return { kind: "PrimitiveType", name: "double" };
      }
      if (expr.valueType === "bool") {
        return { kind: "PrimitiveType", name: "bool" };
      }
      if (expr.valueType === "char") {
        return { kind: "PrimitiveType", name: "char" };
      }
      return { kind: "PrimitiveType", name: "string" };
    case "Identifier":
      if (expr.name === "endl") {
        return { kind: "PrimitiveType", name: "string" };
      }
      return unwrapReference(resolveSymbol(expr.name, expr.line, expr.col, context));
    case "IndexExpr": {
      const targetType = inferExprType(expr.target, context);
      if (targetType === null) {
        return null;
      }
      if (isStringType(targetType)) {
        validateExpr(expr.index, context, "int");
        return { kind: "PrimitiveType", name: "char" };
      }
      if (isArrayType(targetType) || isVectorType(targetType)) {
        validateExpr(expr.index, context, "int");
        return isArrayType(targetType) ? targetType.elementType : vectorElementType(targetType);
      }
      if (isMapType(targetType)) {
        validateExpr(expr.index, context, mapKeyType(targetType));
        return mapValueType(targetType);
      }
      pushError(context, expr.line, expr.col, "type mismatch: expected array/vector/map/string");
      return null;
    }
    case "AddressOfExpr": {
      const targetType = inferLValueType(expr.target, context);
      return targetType === null ? null : { kind: "PointerType", pointeeType: targetType };
    }
    case "DerefExpr": {
      const pointerType = inferExprType(expr.pointer, context);
      if (pointerType === null) {
        return null;
      }
      if (pointerType.kind !== "PointerType") {
        pushError(context, expr.line, expr.col, "type mismatch: expected pointer");
        return null;
      }
      return pointerType.pointeeType;
    }
    case "VectorCtorExpr": {
      if (expr.args.length >= 1) {
        validateExpr(expr.args[0] ?? null, context, "int");
      }
      if (expr.args.length >= 2) {
        validateExpr(expr.args[1] ?? null, context, vectorElementType(expr.type));
      }
      if (expr.args.length > 2) {
        pushError(context, expr.line, expr.col, "too many arguments for vector constructor");
      }
      return expr.type;
    }
    case "AssignExpr": {
      const targetType = inferLValueType(expr.target, context);
      let valueType: TypeNode | null;
      if (expr.operator === "=") {
        valueType = validateExpr(expr.value, context, targetType ?? undefined);
      } else if (targetType !== null && isPointerType(targetType)) {
        valueType = validateExpr(expr.value, context, "int");
      } else {
        valueType = validateExpr(expr.value, context);
      }
      if (expr.operator !== "=") {
        if (targetType !== null && isPointerType(targetType)) {
          if (expr.operator !== "+=" && expr.operator !== "-=") {
            pushError(context, expr.line, expr.col, "type mismatch: expected numeric");
          }
          if (valueType !== null && !isIntType(valueType)) {
            pushError(context, expr.line, expr.col, "type mismatch: expected int");
          }
        } else {
          if (targetType !== null && !isNumericType(targetType)) {
            pushError(context, expr.line, expr.col, "type mismatch: expected numeric");
          }
          if (valueType !== null && !isNumericType(valueType)) {
            pushError(context, expr.line, expr.col, "type mismatch: expected numeric");
          }
        }
      }
      return targetType;
    }
    case "ConditionalExpr": {
      validateConditionExpr(expr.condition, context);
      const thenType = validateExpr(expr.thenExpr, context);
      const elseType = validateExpr(expr.elseExpr, context);
      const resultType = resolveConditionalType(thenType, elseType, expr.line, expr.col, context);
      expr.resolvedType = resultType;
      return resultType;
    }
    case "UnaryExpr": {
      const operandType = inferExprType(expr.operand, context);
      if (expr.operator === "!") {
        if (operandType !== null && !isBoolType(operandType)) {
          pushError(context, expr.line, expr.col, "type mismatch: expected bool");
        }
        return { kind: "PrimitiveType", name: "bool" };
      }
      if (expr.operator === "-") {
        if (operandType !== null && !isNumericType(operandType)) {
          pushError(context, expr.line, expr.col, "type mismatch: expected numeric");
        }
        return operandType !== null && isDoubleType(operandType)
          ? { kind: "PrimitiveType", name: "double" }
          : { kind: "PrimitiveType", name: "int" };
      }
      if (expr.operator === "~") {
        if (operandType !== null && !isIntType(operandType)) {
          pushError(context, expr.line, expr.col, "type mismatch: expected int");
        }
        return { kind: "PrimitiveType", name: "int" };
      }
      if (!isAssignableExpr(expr.operand)) {
        pushError(context, expr.line, expr.col, "increment/decrement target must be a variable");
      }
      if (operandType !== null && !isIntType(operandType) && !isPointerType(operandType)) {
        pushError(context, expr.line, expr.col, "type mismatch: expected int or pointer");
      }
      return operandType !== null && isPointerType(operandType)
        ? operandType
        : { kind: "PrimitiveType", name: "int" };
    }
    case "BinaryExpr": {
      const left = inferExprType(expr.left, context);
      const right = inferExprType(expr.right, context);
      return inferBinaryType(expr, left, right, context);
    }
    case "CallExpr":
      return validateCall(expr.callee, expr.args, expr.line, expr.col, context);
    case "TupleGetExpr": {
      const tupleType = inferExprType(expr.tuple, context);
      if (tupleType === null) {
        return null;
      }
      if (!isTupleType(tupleType)) {
        pushError(context, expr.line, expr.col, "type mismatch: expected tuple");
        return null;
      }
      const elementTypes = tupleElementTypes(tupleType);
      const elementType = elementTypes[expr.index];
      if (elementType === undefined) {
        pushError(
          context,
          expr.line,
          expr.col,
          `tuple index ${expr.index.toString()} out of range for tuple of size ${elementTypes.length}`,
        );
        return null;
      }
      return elementType;
    }
    case "MethodCallExpr":
      return validateMethodCall(
        expr.receiver,
        expr.method,
        expr.args,
        expr.line,
        expr.col,
        context,
      );
  }
}

function inferBinaryType(
  expr: Extract<ExprNode, { kind: "BinaryExpr" }>,
  left: TypeNode | null,
  right: TypeNode | null,
  context: ValidationContext,
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
        pushError(context, expr.line, expr.col, "type mismatch in pointer subtraction");
      }
      return { kind: "PrimitiveType", name: "int" };
    }
  }

  if (expr.operator === "&&" || expr.operator === "||") {
    if (left !== null && !isBoolType(left)) {
      pushError(context, expr.left.line, expr.left.col, "type mismatch: expected bool");
    }
    if (right !== null && !isBoolType(right)) {
      pushError(context, expr.right.line, expr.right.col, "type mismatch: expected bool");
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
        pushError(context, expr.line, expr.col, "pointer comparison only supports == and !=");
      }
      if (
        left !== null &&
        right !== null &&
        !sameType(left, right) &&
        !(isPointerType(left) && isNullPointerType(right)) &&
        !(isPointerType(right) && isNullPointerType(left))
      ) {
        pushError(context, expr.line, expr.col, "type mismatch in comparison");
      }
      return { kind: "PrimitiveType", name: "bool" };
    }
    if (
      (left !== null && (isPairType(left) || isTupleType(left))) ||
      (right !== null && (isPairType(right) || isTupleType(right)))
    ) {
      pushError(context, expr.line, expr.col, "tuple/pair comparison is not supported");
      return { kind: "PrimitiveType", name: "bool" };
    }
    if (
      left !== null &&
      right !== null &&
      !sameType(left, right) &&
      !(isNumericType(left) && isNumericType(right))
    ) {
      pushError(context, expr.line, expr.col, "type mismatch in comparison");
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
      pushError(context, expr.left.line, expr.left.col, "type mismatch: expected int");
    }
    if (right !== null && !isIntType(right)) {
      pushError(context, expr.right.line, expr.right.col, "type mismatch: expected int");
    }
    return { kind: "PrimitiveType", name: "int" };
  }

  if (left !== null && !isNumericType(left)) {
    pushError(context, expr.left.line, expr.left.col, "type mismatch: expected numeric");
  }
  if (right !== null && !isNumericType(right)) {
    pushError(context, expr.right.line, expr.right.col, "type mismatch: expected numeric");
  }
  if (left !== null && isDoubleType(left)) {
    return { kind: "PrimitiveType", name: "double" };
  }
  if (right !== null && isDoubleType(right)) {
    return { kind: "PrimitiveType", name: "double" };
  }
  return { kind: "PrimitiveType", name: "int" };
}

function validateCall(
  callee: string,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  const fn = context.functions.get(callee);
  if (fn !== undefined) {
    if (args.length < fn.params.length) {
      pushError(context, line, col, `too few arguments to function '${callee}'`);
    } else if (args.length > fn.params.length) {
      pushError(context, line, col, `too many arguments to function '${callee}'`);
    }

    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      const param = fn.params[i];
      if (arg === undefined) {
        continue;
      }
      validateArgumentAgainstParam(arg, param?.type, context);
    }

    return fn.returnType;
  }

  const builtin = validateBuiltinCall(callee, args, line, col, context);
  if (builtin !== undefined) {
    return builtin;
  }

  pushError(context, line, col, `'${callee}' was not declared in this scope`);
  for (const arg of args) {
    validateExpr(arg, context);
  }
  return null;
}

function validateBuiltinCall(
  callee: string,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null | undefined {
  const builtin = getBuiltinFreeFunctionSpec(callee);
  if (builtin === null) {
    return undefined;
  }

  switch (builtin.kind) {
    case "value_function":
      switch (builtin.name) {
        case "abs":
          if (args.length !== builtin.maxArgs) {
            pushError(
              context,
              line,
              col,
              `${builtin.name} requires ${describeBuiltinArity(builtin)} argument`,
            );
          }
          validateExpr(args[0] ?? null, context, "int");
          return { kind: "PrimitiveType", name: "int" };
        case "max":
        case "min":
          if (args.length !== builtin.maxArgs) {
            pushError(
              context,
              line,
              col,
              `${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`,
            );
          }
          validateExpr(args[0] ?? null, context, "int");
          validateExpr(args[1] ?? null, context, "int");
          return { kind: "PrimitiveType", name: "int" };
        case "swap": {
          if (args.length !== builtin.maxArgs) {
            pushError(
              context,
              line,
              col,
              `${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`,
            );
          }
          const left = args[0];
          const right = args[1];
          if (left !== undefined) {
            const leftType = validateExpr(left, context);
            if (!isAssignableExpr(left)) {
              pushError(context, left.line, left.col, "swap arguments must be lvalues");
            }
            if (right !== undefined) {
              const rightType = validateExpr(right, context, leftType ?? undefined);
              if (!isAssignableExpr(right)) {
                pushError(context, right.line, right.col, "swap arguments must be lvalues");
              }
              if (leftType !== null && rightType !== null && !isAssignable(rightType, leftType)) {
                pushError(
                  context,
                  line,
                  col,
                  `cannot convert '${typeToString(rightType)}' to '${typeToString(leftType)}'`,
                );
              }
            }
          } else if (right !== undefined) {
            validateExpr(right, context);
          }
          return { kind: "PrimitiveType", name: "void" };
        }
      }
      break;
    case "template_factory":
      switch (builtin.name) {
        case "make_pair": {
          if (args.length !== builtin.maxArgs) {
            pushError(
              context,
              line,
              col,
              `${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`,
            );
          }
          const firstType = validateExpr(args[0] ?? null, context);
          const secondType = validateExpr(args[1] ?? null, context);
          if (firstType === null || secondType === null) {
            return null;
          }
          return pairType(firstType, secondType);
        }
        case "make_tuple": {
          if (args.length < builtin.minArgs) {
            pushError(
              context,
              line,
              col,
              `${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`,
            );
            return null;
          }
          const elementTypes: TypeNode[] = [];
          for (const arg of args) {
            const elementType = validateExpr(arg, context);
            if (elementType === null) {
              return null;
            }
            elementTypes.push(elementType);
          }
          return tupleType(elementTypes);
        }
      }
      break;
    case "range_algorithm":
      return validateRangeBuiltin(builtin, args, line, col, context);
    case "template_comparator":
      pushError(context, line, col, `'${builtin.name}' was not declared in this scope`);
      return null;
  }

  return undefined;
}

function validateRangeBuiltin(
  builtin: Extract<ReturnType<typeof getBuiltinFreeFunctionSpec>, { kind: "range_algorithm" }>,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  if (args.length < builtin.minArgs || args.length > builtin.maxArgs) {
    pushError(
      context,
      line,
      col,
      `${builtin.name} requires ${describeBuiltinArity(builtin)} arguments`,
    );
  }

  const rangeType = validateVectorRangeArgs(args[0], args[1], builtin.name, context, line, col);

  if (builtin.name === "fill") {
    validateExpr(args[2] ?? null, context, rangeType === null ? undefined : vectorElementType(rangeType));
  } else if (builtin.name === "sort" && args[2] !== undefined) {
    const comparator = args[2];
    if (
      !(comparator.kind === "CallExpr" &&
        getBuiltinTemplateComparatorSpec(comparator.callee) !== null &&
        comparator.args.length === 0)
    ) {
      pushError(context, comparator.line, comparator.col, "unsupported sort comparator");
    }
  }

  return { kind: "PrimitiveType", name: "void" };
}

function validateVectorRangeArgs(
  beginExpr: ExprNode | undefined,
  endExpr: ExprNode | undefined,
  callee: string,
  context: ValidationContext,
  line: number,
  col: number,
): VectorTypeNode | null {
  if (
    beginExpr === undefined ||
    endExpr === undefined ||
    beginExpr.kind !== "MethodCallExpr" ||
    endExpr.kind !== "MethodCallExpr" ||
    beginExpr.method !== "begin" ||
    endExpr.method !== "end" ||
    beginExpr.args.length !== 0 ||
    endExpr.args.length !== 0
  ) {
    pushError(context, line, col, `${callee} requires vector begin/end iterators`);
    if (beginExpr !== undefined) {
      validateExpr(beginExpr, context);
    }
    if (endExpr !== undefined) {
      validateExpr(endExpr, context);
    }
    return null;
  }

  if (!sameReceiver(beginExpr.receiver, endExpr.receiver)) {
    pushError(context, line, col, `${callee} requires iterators from the same vector`);
  }

  const receiverType = inferExprType(beginExpr.receiver, context);
  if (receiverType === null) {
    return null;
  }
  if (!isVectorType(receiverType)) {
    pushError(context, line, col, `${callee} requires a vector range`);
    return null;
  }
  return receiverType;
}

function validateMethodCall(
  receiver: ExprNode,
  method: string,
  args: ExprNode[],
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  const receiverType = inferExprType(receiver, context);
  if (receiverType === null) {
    for (const arg of args) {
      validateExpr(arg, context);
    }
    return null;
  }
  if (!isVectorType(receiverType)) {
    if (isPairType(receiverType)) {
      if (method !== "first" && method !== "second") {
        pushError(context, line, col, `unknown pair member '${method}'`);
        for (const arg of args) {
          validateExpr(arg, context);
        }
        return null;
      }
      if (args.length !== 0) {
        pushError(context, line, col, `${method} requires no arguments`);
      }
      return method === "first" ? pairFirstType(receiverType) : pairSecondType(receiverType);
    }
    pushError(context, line, col, "type mismatch: expected array/vector/pair");
    for (const arg of args) {
      validateExpr(arg, context);
    }
    return null;
  }

  switch (method) {
    case "begin":
    case "end":
      if (args.length !== 0) {
        pushError(context, line, col, `${method} requires no arguments`);
      }
      return receiverType;
    case "push_back":
      if (args.length !== 1) {
        pushError(context, line, col, "push_back requires exactly 1 argument");
      }
      validateExpr(args[0] ?? null, context, vectorElementType(receiverType));
      return { kind: "PrimitiveType", name: "void" };
    case "pop_back":
    case "clear":
      if (args.length !== 0) {
        pushError(context, line, col, `${method} requires no arguments`);
      }
      return { kind: "PrimitiveType", name: "void" };
    case "size":
      if (args.length !== 0) {
        pushError(context, line, col, "size requires no arguments");
      }
      return { kind: "PrimitiveType", name: "int" };
    case "back":
      if (args.length !== 0) {
        pushError(context, line, col, "back requires no arguments");
      }
      return vectorElementType(receiverType);
    case "empty":
      if (args.length !== 0) {
        pushError(context, line, col, "empty requires no arguments");
      }
      return { kind: "PrimitiveType", name: "bool" };
    case "resize":
      if (args.length !== 1) {
        pushError(context, line, col, "resize requires exactly 1 argument");
      }
      validateExpr(args[0] ?? null, context, "int");
      return { kind: "PrimitiveType", name: "void" };
    default:
      pushError(context, line, col, `unknown vector method '${method}'`);
      for (const arg of args) {
        validateExpr(arg, context);
      }
      return null;
  }
}

function resolveSymbol(
  name: string,
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  for (let i = context.scopes.length - 1; i >= 0; i -= 1) {
    const scope = context.scopes[i];
    if (scope?.has(name)) {
      return scope.get(name) ?? null;
    }
  }
  pushError(context, line, col, `'${name}' was not declared in this scope`);
  return null;
}

function defineSymbol(
  name: string,
  type: TypeNode,
  line: number,
  col: number,
  context: ValidationContext,
): void {
  const scope = context.scopes[context.scopes.length - 1];
  if (scope === undefined) {
    return;
  }
  if (scope.has(name)) {
    pushError(context, line, col, `redefinition of '${name}'`);
    return;
  }
  scope.set(name, type);
}

function pushScope(context: ValidationContext): void {
  context.scopes.push(new Map());
}

function popScope(context: ValidationContext): void {
  context.scopes.pop();
}

function validateLoopBody(statements: StatementNode[], context: ValidationContext): void {
  context.loopDepth += 1;
  validateBlock(statements, context);
  context.loopDepth -= 1;
}

function normalizeExpectedType(expected: TypeNode | "bool" | "int"): TypeNode {
  if (expected === "bool") {
    return { kind: "PrimitiveType", name: "bool" };
  }
  if (expected === "int") {
    return { kind: "PrimitiveType", name: "int" };
  }
  return expected;
}

function resolveConditionalType(
  thenType: TypeNode | null,
  elseType: TypeNode | null,
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  if (thenType === null || elseType === null) {
    return null;
  }

  if (sameType(thenType, elseType)) {
    return thenType;
  }

  if (isPairType(thenType) && isPairType(elseType)) {
    const firstType = resolveConditionalType(
      pairFirstType(thenType),
      pairFirstType(elseType),
      line,
      col,
      context,
    );
    const secondType = resolveConditionalType(
      pairSecondType(thenType),
      pairSecondType(elseType),
      line,
      col,
      context,
    );
    if (firstType === null || secondType === null) {
      return null;
    }
    return pairType(firstType, secondType);
  }

  if (isTupleType(thenType) && isTupleType(elseType)) {
    const thenElements = tupleElementTypes(thenType);
    const elseElements = tupleElementTypes(elseType);
    if (thenElements.length !== elseElements.length) {
      pushError(
        context,
        line,
        col,
        `incompatible operand types for ?: '${typeToString(thenType)}' and '${typeToString(elseType)}'`,
      );
      return null;
    }
    const elementTypes: TypeNode[] = [];
    for (let i = 0; i < thenElements.length; i += 1) {
      const leftElement = thenElements[i];
      const rightElement = elseElements[i];
      if (leftElement === undefined || rightElement === undefined) {
        return null;
      }
      const resolvedElementType = resolveConditionalType(
        leftElement,
        rightElement,
        line,
        col,
        context,
      );
      if (resolvedElementType === null) {
        return null;
      }
      elementTypes.push(resolvedElementType);
    }
    return tupleType(elementTypes);
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
    context,
    line,
    col,
    `incompatible operand types for ?: '${typeToString(thenType)}' and '${typeToString(elseType)}'`,
  );
  return null;
}

function sameType(left: TypeNode, right: TypeNode): boolean {
  if (isPrimitiveType(left) || isPrimitiveType(right)) {
    return isPrimitiveType(left) && isPrimitiveType(right) && left.name === right.name;
  }
  if (isArrayType(left) || isArrayType(right)) {
    return isArrayType(left) && isArrayType(right) && sameType(left.elementType, right.elementType);
  }
  if (isVectorType(left) || isVectorType(right)) {
    return (
      isVectorType(left) &&
      isVectorType(right) &&
      sameType(vectorElementType(left), vectorElementType(right))
    );
  }
  if (isMapType(left) || isMapType(right)) {
    return (
      isMapType(left) &&
      isMapType(right) &&
      sameType(mapKeyType(left), mapKeyType(right)) &&
      sameType(mapValueType(left), mapValueType(right))
    );
  }
  if (isPairType(left) || isPairType(right)) {
    return (
      isPairType(left) &&
      isPairType(right) &&
      sameType(pairFirstType(left), pairFirstType(right)) &&
      sameType(pairSecondType(left), pairSecondType(right))
    );
  }
  if (isTupleType(left) || isTupleType(right)) {
    const leftElements = isTupleType(left) ? tupleElementTypes(left) : [];
    const rightElements = isTupleType(right) ? tupleElementTypes(right) : [];
    return (
      isTupleType(left) &&
      isTupleType(right) &&
      leftElements.length === rightElements.length &&
      leftElements.every((elementType, index) => {
        const rightElementType = rightElements[index];
        return rightElementType !== undefined && sameType(elementType, rightElementType);
      })
    );
  }
  if (isPointerType(left) || isPointerType(right)) {
    return isPointerType(left) && isPointerType(right) && sameType(left.pointeeType, right.pointeeType);
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

function isAssignable(source: TypeNode, target: TypeNode): boolean {
  if (sameType(source, target)) {
    return true;
  }
  if (isPairType(source) && isPairType(target)) {
    return (
      isAssignable(pairFirstType(source), pairFirstType(target)) &&
      isAssignable(pairSecondType(source), pairSecondType(target))
    );
  }
  if (isMapType(source) && isMapType(target)) {
    return (
      isAssignable(mapKeyType(source), mapKeyType(target)) &&
      isAssignable(mapValueType(source), mapValueType(target))
    );
  }
  if (isTupleType(source) && isTupleType(target)) {
    const sourceElements = tupleElementTypes(source);
    const targetElements = tupleElementTypes(target);
    return (
      sourceElements.length === targetElements.length &&
      sourceElements.every((elementType, index) => {
        const targetElementType = targetElements[index];
        return targetElementType !== undefined && isAssignable(elementType, targetElementType);
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

function isAssignableExpr(expr: ExprNode): boolean {
  return (
    expr.kind === "Identifier" ||
    expr.kind === "IndexExpr" ||
    expr.kind === "DerefExpr" ||
    expr.kind === "TupleGetExpr"
  );
}

function isIntType(type: TypeNode): boolean {
  return (
    isPrimitiveType(type) &&
    (type.name === "int" || type.name === "long long" || type.name === "char")
  );
}

function isDoubleType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "double";
}

function isNumericType(type: TypeNode): boolean {
  return isIntType(type) || isDoubleType(type);
}

function isBoolType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "bool";
}

function isStringType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "string";
}

function isNullPointerConstantExpr(expr: ExprNode): boolean {
  return expr.kind === "Literal" && expr.valueType === "int" && expr.value === 0n;
}

function isNullPointerType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name === "int";
}

function isInputTargetType(type: TypeNode): boolean {
  return isPrimitiveType(type) && type.name !== "void";
}

function containsVoid(type: TypeNode): boolean {
  if (isPrimitiveType(type)) {
    return type.name === "void";
  }
  if (isPointerType(type)) {
    return containsVoid(type.pointeeType);
  }
  if (isReferenceType(type)) {
    return containsVoid(type.referredType);
  }
  if (isPairType(type)) {
    return containsVoid(pairFirstType(type)) || containsVoid(pairSecondType(type));
  }
  if (isMapType(type)) {
    return containsVoid(mapKeyType(type)) || containsVoid(mapValueType(type));
  }
  if (isTupleType(type)) {
    return tupleElementTypes(type).some((elementType) => containsVoid(elementType));
  }
  if (isArrayType(type) || isVectorType(type)) {
    return containsVoid(isArrayType(type) ? type.elementType : vectorElementType(type));
  }
  return false;
}

function baseElementType(type: TypeNode): TypeNode {
  if (isArrayType(type)) {
    return baseElementType(type.elementType);
  }
  return type;
}

function unwrapReference(type: TypeNode | null): TypeNode | null {
  if (type === null) {
    return null;
  }
  return isReferenceType(type) ? type.referredType : type;
}

function containsReferenceBelowTopLevel(type: TypeNode): boolean {
  if (isReferenceType(type)) {
    return false;
  }
  return containsReferenceNested(type);
}

function containsReferenceNested(type: TypeNode): boolean {
  if (isReferenceType(type)) {
    return true;
  }
  if (isPointerType(type)) {
    return containsReferenceNested(type.pointeeType);
  }
  if (isPairType(type)) {
    return (
      containsReferenceNested(pairFirstType(type)) ||
      containsReferenceNested(pairSecondType(type))
    );
  }
  if (isMapType(type)) {
    return (
      containsReferenceNested(mapKeyType(type)) ||
      containsReferenceNested(mapValueType(type))
    );
  }
  if (isTupleType(type)) {
    return tupleElementTypes(type).some((elementType) => containsReferenceNested(elementType));
  }
  if (isArrayType(type) || isVectorType(type)) {
    return containsReferenceNested(isArrayType(type) ? type.elementType : vectorElementType(type));
  }
  return false;
}

function inferLValueType(expr: ExprNode, context: ValidationContext): TypeNode | null {
  if (!isAssignableExpr(expr)) {
    pushError(context, expr.line, expr.col, "expression is not assignable");
    return null;
  }
  return inferExprType(expr, context);
}

function validateReferenceBinding(
  expr: ExprNode,
  expected: TypeNode,
  context: ValidationContext,
  message = "reference initializer must be an lvalue",
): void {
  const actual = validateExpr(expr, context);
  if (!isAssignableExpr(expr)) {
    pushError(context, expr.line, expr.col, message);
    return;
  }
  if (actual !== null && !isAssignable(actual, expected)) {
    pushError(
      context,
      expr.line,
      expr.col,
      `cannot convert '${typeToString(actual)}' to '${typeToString(expected)}'`,
    );
  }
}

function validateArgumentAgainstParam(
  arg: ExprNode,
  paramType: TypeNode | undefined,
  context: ValidationContext,
): void {
  if (paramType === undefined) {
    validateExpr(arg, context);
    return;
  }
  if (isReferenceType(paramType)) {
    validateReferenceBinding(
      arg,
      paramType.referredType,
      context,
      "reference argument must be an lvalue",
    );
    return;
  }
  if (
    isPointerType(paramType) &&
    arg.kind === "Literal" &&
    arg.valueType === "int" &&
    arg.value === 0n
  ) {
    return;
  }
  validateExpr(arg, context, paramType);
}

function getIterableElementType(
  sourceType: TypeNode,
  line: number,
  col: number,
  context: ValidationContext,
): TypeNode | null {
  if (isArrayType(sourceType) || isVectorType(sourceType)) {
    return isArrayType(sourceType) ? sourceType.elementType : vectorElementType(sourceType);
  }
  if (isMapType(sourceType)) {
    return pairType(mapKeyType(sourceType), mapValueType(sourceType));
  }
  if (isStringType(sourceType)) {
    return { kind: "PrimitiveType", name: "char" };
  }
  pushError(context, line, col, "range-based for requires array, vector, map, or string");
  return null;
}

function sameReceiver(left: ExprNode, right: ExprNode): boolean {
  return left.kind === "Identifier" && right.kind === "Identifier" && left.name === right.name;
}

function pushError(context: ValidationContext, line: number, col: number, message: string): void {
  context.errors.push({ line, col, message });
}
