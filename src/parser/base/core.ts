import type { BlockStmtNode, CompileError, ExprNode, SourceRange, Token } from "@/types";

export abstract class BaseParserCore {
  protected readonly tokens: Token[];

  protected index = 0;

  protected readonly errors: CompileError[] = [];

  protected activeTypeParams: string[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  protected abstract parseExpression(): ExprNode;
  protected abstract parseShiftExprList(symbol: "<<" | ">>", message: string): ExprNode[] | null;
  protected abstract checkTypeStart(): boolean;

  protected consume(kind: Token["kind"], message: string): Token | null {
    if (this.match(kind)) {
      return this.previous();
    }
    this.errorAtCurrent(message);
    return null;
  }

  protected consumeIdentifier(message: string): Token | null {
    return this.consume("identifier", message);
  }

  protected consumeKeyword(keyword: string, message: string): boolean {
    if (this.matchKeyword(keyword)) {
      return true;
    }
    this.errorAtCurrent(message);
    return false;
  }

  protected consumeSymbol(symbol: string, message: string): boolean {
    if (this.matchSymbol(symbol)) {
      return true;
    }
    this.errorAtCurrent(message);
    return false;
  }

  protected match(kind: Token["kind"]): boolean {
    if (this.peek().kind !== kind) {
      return false;
    }
    this.advance();
    return true;
  }

  protected matchSymbol(symbol: string): boolean {
    if (!this.checkSymbol(symbol)) {
      return false;
    }
    this.advance();
    return true;
  }

  protected matchAnySymbol(symbols: string[]): boolean {
    for (const symbol of symbols) {
      if (this.checkSymbol(symbol)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  protected matchKeyword(keyword: string): boolean {
    if (!this.checkKeyword(keyword)) {
      return false;
    }
    this.advance();
    return true;
  }

  protected checkSymbol(symbol: string): boolean {
    const token = this.peek();
    return token.kind === "symbol" && token.text === symbol;
  }

  protected checkKeyword(keyword: string): boolean {
    const token = this.peek();
    return token.kind === "keyword" && token.text === keyword;
  }

  protected checkNextKeyword(keyword: string): boolean {
    const token = this.tokens[this.index + 1];
    return token?.kind === "keyword" && token.text === keyword;
  }

  protected advance(): Token {
    if (!this.isAtEnd()) {
      this.index += 1;
    }
    return this.previous();
  }

  protected previous(): Token {
    return this.tokens[Math.max(0, this.index - 1)] as Token;
  }

  protected rangeFrom(
    start: Pick<Token, "line" | "col">,
    end: Pick<Token, "endLine" | "endCol">,
  ): SourceRange {
    return {
      line: start.line,
      col: start.col,
      endLine: end.endLine,
      endCol: end.endCol,
    };
  }

  protected rangeToPrevious(start: Pick<Token, "line" | "col">): SourceRange {
    return this.rangeFrom(start, this.previous());
  }

  protected rangeFromNode(
    start: Pick<Token, "line" | "col">,
    end: Pick<SourceRange, "endLine" | "endCol">,
  ): SourceRange {
    return {
      line: start.line,
      col: start.col,
      endLine: end.endLine,
      endCol: end.endCol,
    };
  }

  protected peek(): Token {
    return this.tokens[this.index] as Token;
  }

  protected isAtEnd(): boolean {
    return this.peek().kind === "eof";
  }

  protected errorAtCurrent(message: string): void {
    this.errorAt(this.peek(), message);
  }

  protected errorAt(token: Token, message: string): void {
    this.errors.push({ line: token.line, col: token.col, message });
  }

  protected synchronizeTopLevel(): void {
    while (!this.isAtEnd()) {
      if (this.checkTypeStart() || this.checkKeyword("using")) {
        return;
      }
      this.advance();
    }
  }

  protected synchronizeStatement(): void {
    while (!this.isAtEnd()) {
      if (this.previous().kind === "symbol" && this.previous().text === ";") {
        return;
      }
      if (this.peek().kind === "symbol" && this.peek().text === "}") {
        return;
      }
      this.advance();
    }
  }

  protected parseRequiredBlock(errorMessage: string): BlockStmtNode | null {
    if (!this.consumeSymbol("{", errorMessage)) {
      return null;
    }

    const open = this.previous();
    const statements = [];
    while (!this.checkSymbol("}") && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt === null) {
        this.synchronizeStatement();
      } else {
        statements.push(stmt);
      }
    }

    if (!this.consumeSymbol("}", "expected '}' after block")) {
      return null;
    }

    return {
      kind: "BlockStmt",
      statements,
      ...this.rangeToPrevious(open),
    };
  }

  protected parseStmtOrBlock(): BlockStmtNode | null {
    if (this.checkSymbol("{")) {
      return this.parseRequiredBlock("expected block");
    }
    const stmt = this.parseStatement();
    if (stmt === null) {
      return null;
    }
    return {
      kind: "BlockStmt",
      statements: [stmt],
      ...this.rangeFromNode(stmt, stmt),
    };
  }

  protected abstract parseStatement(): import("@/types").StatementNode | null;
}
