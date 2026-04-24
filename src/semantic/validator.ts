import type {
  CompileError,
  ExprNode,
  PrimitiveTypeNode,
  ProgramNode,
  StatementNode,
  TypeNode,
} from "../types";
import { isPrimitiveType } from "../types";

type ValidationContext = {
  errors: CompileError[];
  loopDepth: number;
};

export function validateProgram(program: ProgramNode): CompileError[] {
  const context: ValidationContext = {
    errors: [],
    loopDepth: 0,
  };

  for (const decl of program.globals) {
    validateStatementLikeDecl(decl, context);
  }

  for (const fn of program.functions) {
    if (!isPrimitiveType(fn.returnType)) {
      pushError(
        context,
        fn.line,
        fn.col,
        `function return type must be primitive, got '${typeToMessage(fn.returnType)}'`,
      );
    } else {
      validatePrimitiveType(fn.returnType, fn.line, fn.col, context, {
        allowVoid: true,
        description: "function return type",
      });
    }

    for (const param of fn.params) {
      validateParameterType(param.type, param.line, param.col, context);
    }

    validateBlock(fn.body.statements, context);
  }

  return context.errors;
}

function validateBlock(statements: StatementNode[], context: ValidationContext): void {
  for (const stmt of statements) {
    validateStatement(stmt, context);
  }
}

function validateStatement(stmt: StatementNode, context: ValidationContext): void {
  switch (stmt.kind) {
    case "BlockStmt":
      validateBlock(stmt.statements, context);
      return;
    case "VarDecl":
    case "ArrayDecl":
    case "VectorDecl":
      validateStatementLikeDecl(stmt, context);
      return;
    case "IfStmt":
      for (const branch of stmt.branches) {
        validateExpr(branch.condition, context);
        validateBlock(branch.thenBlock.statements, context);
      }
      if (stmt.elseBlock !== null) {
        validateBlock(stmt.elseBlock.statements, context);
      }
      return;
    case "WhileStmt":
      validateExpr(stmt.condition, context);
      validateLoopBlock(stmt.body.statements, context);
      return;
    case "ForStmt":
      if (stmt.init.kind === "varDecl") {
        validateStatementLikeDecl(stmt.init.value, context);
      } else if (stmt.init.kind === "expr") {
        validateExpr(stmt.init.value, context);
      }
      if (stmt.condition !== null) {
        validateExpr(stmt.condition, context);
      }
      if (stmt.update !== null) {
        validateExpr(stmt.update, context);
      }
      validateLoopBlock(stmt.body.statements, context);
      return;
    case "ReturnStmt":
      if (stmt.value !== null) {
        validateExpr(stmt.value, context);
      }
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
        validateExpr(target, context);
      }
      return;
  }
}

function validateStatementLikeDecl(
  stmt: Extract<StatementNode, { kind: "VarDecl" | "ArrayDecl" | "VectorDecl" }> | ProgramNode["globals"][number],
  context: ValidationContext,
): void {
  switch (stmt.kind) {
    case "VarDecl":
      if (!isPrimitiveType(stmt.type)) {
        pushError(
          context,
          stmt.line,
          stmt.col,
          `variable type must be primitive, got '${typeToMessage(stmt.type)}'`,
        );
      } else {
        validatePrimitiveType(stmt.type, stmt.line, stmt.col, context, {
          allowVoid: false,
          description: "variable type",
        });
      }
      if (stmt.initializer !== null) {
        validateExpr(stmt.initializer, context);
      }
      return;
    case "ArrayDecl":
      validatePrimitiveType(stmt.type.elementType, stmt.line, stmt.col, context, {
        allowVoid: false,
        description: "array element type",
      });
      for (const init of stmt.initializers) {
        validateExpr(init, context);
      }
      return;
    case "VectorDecl":
      validatePrimitiveType(stmt.type.elementType, stmt.line, stmt.col, context, {
        allowVoid: false,
        description: "vector element type",
      });
      for (const arg of stmt.constructorArgs) {
        validateExpr(arg, context);
      }
      return;
  }
}

function validateParameterType(
  type: TypeNode,
  line: number,
  col: number,
  context: ValidationContext,
): void {
  switch (type.kind) {
    case "PrimitiveType":
      validatePrimitiveType(type, line, col, context, {
        allowVoid: false,
        description: "parameter type",
      });
      return;
    case "ArrayType":
      validatePrimitiveType(type.elementType, line, col, context, {
        allowVoid: false,
        description: "array parameter element type",
      });
      return;
    case "VectorType":
      validatePrimitiveType(type.elementType, line, col, context, {
        allowVoid: false,
        description: "vector parameter element type",
      });
      return;
  }
}

function validatePrimitiveType(
  type: PrimitiveTypeNode,
  line: number,
  col: number,
  context: ValidationContext,
  options: { allowVoid: boolean; description: string },
): void {
  if (!options.allowVoid && type.name === "void") {
    pushError(context, line, col, `${options.description} cannot be void`);
  }
}

function validateLoopBlock(statements: StatementNode[], context: ValidationContext): void {
  const nested: ValidationContext = {
    errors: context.errors,
    loopDepth: context.loopDepth + 1,
  };
  validateBlock(statements, nested);
}

function validateExpr(expr: ExprNode, context: ValidationContext): void {
  switch (expr.kind) {
    case "AssignExpr":
      validateExpr(expr.target, context);
      validateExpr(expr.value, context);
      return;
    case "BinaryExpr":
      validateExpr(expr.left, context);
      validateExpr(expr.right, context);
      return;
    case "UnaryExpr":
      validateExpr(expr.operand, context);
      if ((expr.operator === "++" || expr.operator === "--") && !isAssignableExpr(expr.operand)) {
        pushError(context, expr.line, expr.col, "increment/decrement target must be a variable");
      }
      return;
    case "CallExpr":
      for (const arg of expr.args) {
        validateExpr(arg, context);
      }
      return;
    case "MethodCallExpr":
      validateExpr(expr.receiver, context);
      for (const arg of expr.args) {
        validateExpr(arg, context);
      }
      return;
    case "IndexExpr":
      validateExpr(expr.target, context);
      validateExpr(expr.index, context);
      return;
    case "Identifier":
    case "Literal":
      return;
  }
}

function isAssignableExpr(expr: ExprNode): boolean {
  return expr.kind === "Identifier" || expr.kind === "IndexExpr";
}

function typeToMessage(type: TypeNode): string {
  switch (type.kind) {
    case "PrimitiveType":
      return type.name;
    case "ArrayType":
      return `${type.elementType.name}[]`;
    case "VectorType":
      return `vector<${type.elementType.name}>`;
  }
}

function pushError(context: ValidationContext, line: number, col: number, message: string): void {
  context.errors.push({ line, col, message });
}
