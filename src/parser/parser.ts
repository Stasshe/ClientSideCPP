import type { CompileResult, GlobalDeclNode, ProgramNode, Token } from "../types";
import { ExpressionParser } from "./expression-parser";
import { tokensStart } from "./base-parser";

export function parse(tokens: Token[]): CompileResult {
  const parser = new Parser(tokens);
  return parser.parseProgram();
}

class Parser extends ExpressionParser {
  parseProgram(): CompileResult {
    const globals: GlobalDeclNode[] = [];
    const functions: ProgramNode["functions"] = [];

    while (!this.isAtEnd()) {
      if (!this.checkTypeStart()) {
        this.errorAtCurrent("expected type specifier");
        this.synchronizeTopLevel();
        continue;
      }

      const type = this.parseType();
      if (type === null) {
        this.synchronizeTopLevel();
        continue;
      }

      const nameToken = this.consumeIdentifier("expected identifier");
      if (nameToken === null) {
        this.synchronizeTopLevel();
        continue;
      }

      if (this.matchSymbol("(")) {
        const params = this.parseParams();
        const body = this.parseRequiredBlock("expected block after function signature");
        if (body === null) {
          this.synchronizeTopLevel();
          continue;
        }
        functions.push({
          kind: "FunctionDecl",
          returnType: type,
          name: nameToken.text,
          params,
          body,
          line: nameToken.line,
          col: nameToken.col,
        });
        continue;
      }

      if (this.matchSymbol("[")) {
        const arrayDecl = this.finishArrayDecl(type, nameToken);
        if (arrayDecl !== null) {
          globals.push(arrayDecl);
        } else {
          this.synchronizeTopLevel();
        }
        continue;
      }

      if (type.kind === "VectorType") {
        const decl = this.finishVectorDecl(type, nameToken);
        if (decl !== null) {
          globals.push(decl);
        } else {
          this.synchronizeTopLevel();
        }
        continue;
      }

      const initializer = this.matchSymbol("=") ? this.parseExpression() : null;
      if (!this.consumeSymbol(";", "expected ';' after declaration")) {
        this.synchronizeTopLevel();
        continue;
      }
      globals.push({
        kind: "VarDecl",
        type,
        name: nameToken.text,
        initializer,
        line: nameToken.line,
        col: nameToken.col,
      });
    }

    if (!functions.some((f) => f.name === "main")) {
      this.errors.push({ line: 1, col: 1, message: "'main' function is required" });
    }

    if (this.errors.length > 0) {
      return { ok: false, errors: this.errors };
    }

    const start = tokensStart(this.tokens);
    const program: ProgramNode = {
      kind: "Program",
      globals,
      functions,
      line: start.line,
      col: start.col,
    };

    return { ok: true, program };
  }
}
