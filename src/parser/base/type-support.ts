import type { ArrayDeclNode, PrimitiveTypeNode, Token, TypeNode, VectorDeclNode } from "@/types";
import {
  arrayType,
  isPrimitiveType,
  pairType,
  pointerType,
  primitiveType,
  referenceType,
  tupleType,
  vectorType,
} from "@/types";
import { BaseParserCore } from "./core";

const TYPE_KEYWORDS = new Set<string>(["int", "long", "double", "bool", "char", "string", "void"]);

export abstract class BaseParserTypeSupport extends BaseParserCore {
  protected parseType(): TypeNode | null {
    if (this.checkKeyword("vector")) {
      return this.parseVectorType();
    }
    if (this.isPairTypeStart()) {
      return this.parsePairType();
    }
    if (this.isTupleTypeStart()) {
      return this.parseTupleType();
    }
    return this.parsePrimitiveType();
  }

  protected parseTypeSpecifier(): TypeNode | null {
    return this.parseType();
  }

  protected parseVectorType(): VectorDeclNode["type"] | null {
    if (!this.consumeKeyword("vector", "expected 'vector'")) {
      return null;
    }
    if (!this.consumeSymbol("<", "expected '<' after vector")) {
      return null;
    }
    const elementType = this.parseType();
    if (elementType === null) {
      return null;
    }
    if (this.isVoidTypeNode(elementType)) {
      this.errorAtCurrent("vector element type cannot be void");
      return null;
    }
    if (!this.consumeTypeClose("expected '>' after vector element type")) {
      return null;
    }
    return vectorType(elementType);
  }

  protected parsePrimitiveType(): PrimitiveTypeNode | null {
    if (this.matchKeyword("int")) {
      return primitiveType("int");
    }
    if (this.matchKeyword("bool")) {
      return primitiveType("bool");
    }
    if (this.matchKeyword("char")) {
      return primitiveType("char");
    }
    if (this.matchKeyword("double")) {
      return primitiveType("double");
    }
    if (this.matchKeyword("string")) {
      return primitiveType("string");
    }
    if (this.matchKeyword("void")) {
      return primitiveType("void");
    }
    if (this.matchKeyword("long")) {
      if (this.matchKeyword("long")) {
        return primitiveType("long long");
      }
      this.errorAtCurrent("expected 'long' after 'long'");
      return null;
    }
    this.errorAtCurrent("expected type name");
    return null;
  }

  protected peekPrimitiveTypeKeyword(): boolean {
    const token = this.peek();
    return token.kind === "keyword" && TYPE_KEYWORDS.has(token.text);
  }

  protected override checkTypeStart(): boolean {
    return (
      this.peekPrimitiveTypeKeyword() ||
      this.checkKeyword("vector") ||
      this.isPairTypeStart() ||
      this.isTupleTypeStart()
    );
  }

  protected wrapArrayDimensions(type: TypeNode, dimensions: number): ArrayDeclNode["type"] {
    let wrapped: TypeNode = type;
    for (let i = 0; i < dimensions; i += 1) {
      wrapped = arrayType(wrapped);
    }
    return wrapped as ArrayDeclNode["type"];
  }

  protected isVoidTypeNode(type: TypeNode): boolean {
    if (isPrimitiveType(type)) {
      return type.name === "void";
    }
    if (type.kind === "PointerType") {
      return this.isVoidTypeNode(type.pointeeType);
    }
    if (type.kind === "ReferenceType") {
      return this.isVoidTypeNode(type.referredType);
    }
    if (type.kind === "PairType") {
      return this.isVoidTypeNode(type.firstType) || this.isVoidTypeNode(type.secondType);
    }
    if (type.kind === "TupleType") {
      return type.elementTypes.some((elementType) => this.isVoidTypeNode(elementType));
    }
    return this.isVoidTypeNode(type.elementType);
  }

  protected consumeTypeClose(message: string): boolean {
    this.splitShiftCloseToken();
    return this.consumeSymbol(">", message);
  }

  protected splitShiftCloseToken(): void {
    const token = this.peek();
    if (token.kind !== "symbol" || token.text !== ">>") {
      return;
    }
    (this.tokens as Token[]).splice(
      this.index,
      1,
      { ...token, text: ">", endCol: token.col + 1 },
      { ...token, col: token.col + 1, endCol: token.endCol, text: ">" },
    );
  }

  protected parseNamedDeclarator(
    baseType: TypeNode,
    options: { allowUnsizedArrays: boolean },
  ): { nameToken: Token; type: TypeNode; dimensions: bigint[] } | null {
    let declaredType: TypeNode = baseType;
    while (this.matchSymbol("*")) {
      declaredType = pointerType(declaredType);
    }
    if (this.matchSymbol("&")) {
      declaredType = referenceType(declaredType);
    }
    const nameToken = this.consumeIdentifier("expected variable name");
    if (nameToken === null) {
      return null;
    }
    const dimensions = this.checkSymbol("[")
      ? this.parseArrayDimensions(
          options.allowUnsizedArrays ? "parameter" : "array",
          !options.allowUnsizedArrays,
        )
      : [];
    if (dimensions === null) {
      return null;
    }
    return { nameToken, type: declaredType, dimensions };
  }

  protected isPairTypeStart(): boolean {
    const token = this.peek();
    const next = this.tokens[this.index + 1];
    return (
      token.kind === "identifier" &&
      token.text === "pair" &&
      next?.kind === "symbol" &&
      next.text === "<"
    );
  }

  protected isTupleTypeStart(): boolean {
    const token = this.peek();
    const next = this.tokens[this.index + 1];
    return (
      token.kind === "identifier" &&
      token.text === "tuple" &&
      next?.kind === "symbol" &&
      next.text === "<"
    );
  }

  protected parsePairType(): TypeNode | null {
    if (!(this.peek().kind === "identifier" && this.peek().text === "pair")) {
      this.errorAtCurrent("expected 'pair'");
      return null;
    }
    this.advance();
    if (!this.consumeSymbol("<", "expected '<' after pair")) {
      return null;
    }
    const firstType = this.parseType();
    if (firstType === null) {
      return null;
    }
    if (!this.consumeSymbol(",", "expected ',' in pair type")) {
      return null;
    }
    const secondType = this.parseType();
    if (secondType === null) {
      return null;
    }
    if (this.isVoidTypeNode(firstType) || this.isVoidTypeNode(secondType)) {
      this.errorAtCurrent("pair element type cannot be void");
      return null;
    }
    if (!this.consumeTypeClose("expected '>' after pair type")) {
      return null;
    }
    return pairType(firstType, secondType);
  }

  protected parseTupleType(): TypeNode | null {
    if (!(this.peek().kind === "identifier" && this.peek().text === "tuple")) {
      this.errorAtCurrent("expected 'tuple'");
      return null;
    }
    this.advance();
    if (!this.consumeSymbol("<", "expected '<' after tuple")) {
      return null;
    }

    const elementTypes: TypeNode[] = [];
    while (true) {
      const elementType = this.parseType();
      if (elementType === null) {
        return null;
      }
      if (this.isVoidTypeNode(elementType)) {
        this.errorAtCurrent("tuple element type cannot be void");
        return null;
      }
      elementTypes.push(elementType);

      this.splitShiftCloseToken();
      if (this.checkSymbol(">")) {
        break;
      }
      if (!this.consumeSymbol(",", "expected ',' in tuple type")) {
        return null;
      }
    }

    if (elementTypes.length === 0) {
      this.errorAtCurrent("tuple must have at least one element type");
      return null;
    }

    if (!this.consumeTypeClose("expected '>' after tuple type")) {
      return null;
    }
    return tupleType(elementTypes);
  }

  private parseArrayDimensions(
    contextName: "array" | "parameter",
    requireSize: boolean,
  ): bigint[] | null {
    const dimensions: bigint[] = [];

    while (this.matchSymbol("[")) {
      if (this.checkSymbol("]")) {
        if (requireSize) {
          this.errorAtCurrent(`expected ${contextName} size integer literal`);
          return null;
        }
        this.advance();
        dimensions.push(0n);
        continue;
      }

      const sizeToken = this.consume("number", `expected ${contextName} size integer literal`);
      if (sizeToken === null) {
        return null;
      }
      dimensions.push(BigInt(sizeToken.text));
      if (!this.consumeSymbol("]", "expected ']' after array size")) {
        return null;
      }
    }

    return dimensions;
  }
}
