import { readFileSync } from "node:fs";
import ts from "typescript";

function parse(file: string): ts.SourceFile {
  const source = readFileSync(file, "utf-8");
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

export function importsOf(file: string): string[] {
  const sf = parse(file);
  const specifiers: string[] = [];
  walk(sf, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
  });
  return specifiers;
}

function calleeName(node: ts.CallExpression): string | undefined {
  const expr = node.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return undefined;
}

export function fileCalls(file: string, callee: string): boolean {
  const sf = parse(file);
  let found = false;
  walk(sf, (node) => {
    if (ts.isCallExpression(node) && calleeName(node) === callee) found = true;
  });
  return found;
}

function declarationName(node: ts.Node): string | undefined {
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
    node.name &&
    ts.isIdentifier(node.name)
  ) {
    return node.name.text;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return undefined;
}

function declarationBody(file: string, name: string): ts.Node | undefined {
  const sf = parse(file);
  let body: ts.Node | undefined;
  walk(sf, (node) => {
    if (body) return;
    if (declarationName(node) === name) body = node;
  });
  return body;
}

export function componentUsesHook(file: string, componentName: string, hookName: string): boolean {
  const decl = declarationBody(file, componentName);
  if (!decl) return false;
  let found = false;
  walk(decl, (node) => {
    if (ts.isCallExpression(node) && calleeName(node) === hookName) found = true;
  });
  return found;
}

export function functionOwner(file: string, fnName: string): string | undefined {
  const sf = parse(file);
  let owner: string | undefined;
  const stack: string[] = [];
  const recurse = (node: ts.Node): void => {
    if (owner) return;
    const name = declarationName(node);
    if (name === fnName && stack.length > 0) {
      owner = stack[stack.length - 1];
      return;
    }
    const pushed = name !== undefined;
    if (pushed && name) stack.push(name);
    node.forEachChild(recurse);
    if (pushed) stack.pop();
  };
  recurse(sf);
  return owner;
}

/**
 * The leading module directive (`"use client"` / `"use server"`) if the first
 * statement is a bare string-literal expression, else undefined. Robust to
 * surrounding comments and whitespace in a way an anchored regex is not.
 */
export function firstDirective(file: string): string | undefined {
  const sf = parse(file);
  const first = sf.statements[0];
  if (first && ts.isExpressionStatement(first) && ts.isStringLiteralLike(first.expression)) {
    return first.expression.text;
  }
  return undefined;
}
