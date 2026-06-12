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

function propName(prop: ts.ObjectLiteralElementLike): string | undefined {
  if (!prop.name) return undefined;
  if (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)) return prop.name.text;
  return undefined;
}

function callHasQueryKey(call: ts.CallExpression, key: string): boolean {
  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
  return arg.properties.some(
    (prop) =>
      ts.isPropertyAssignment(prop) &&
      propName(prop) === "queryKey" &&
      ts.isArrayLiteralExpression(prop.initializer) &&
      prop.initializer.elements.some((el) => ts.isStringLiteralLike(el) && el.text === key)
  );
}

/**
 * True when the useMutation bound to `mutationName` refreshes the given
 * query — an onSuccess/onSettled handler (any function form: arrow, async,
 * method shorthand, function expression) that calls invalidateQueries or
 * refetchQueries with the queryKey, regardless of quoting or formatting.
 */
export function mutationRefreshesQuery(
  file: string,
  mutationName: string,
  queryKey: string
): boolean {
  const decl = declarationBody(file, mutationName);
  if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer) return false;
  const init = decl.initializer;
  if (!ts.isCallExpression(init) || calleeName(init) !== "useMutation") return false;
  let found = false;
  walk(init, (node) => {
    if (found || !ts.isCallExpression(node) || calleeName(node) !== "useMutation") return;
    for (const arg of node.arguments) {
      if (!ts.isObjectLiteralExpression(arg)) continue;
      for (const prop of arg.properties) {
        const name = propName(prop);
        if (name !== "onSuccess" && name !== "onSettled") continue;
        walk(prop, (inner) => {
          if (
            ts.isCallExpression(inner) &&
            (calleeName(inner) === "invalidateQueries" || calleeName(inner) === "refetchQueries") &&
            callHasQueryKey(inner, queryKey)
          ) {
            found = true;
          }
        });
      }
    }
  });
  return found;
}

/**
 * True when a useForm config wires `resolver:` to a call that receives the
 * named schema — accepts zodResolver or any resolver wrapper, any formatting.
 */
export function useFormUsesResolver(file: string, schemaName: string): boolean {
  const sf = parse(file);
  let found = false;
  walk(sf, (node) => {
    if (found || !ts.isCallExpression(node) || calleeName(node) !== "useForm") return;
    const arg = node.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return;
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop) || propName(prop) !== "resolver") continue;
      const init = prop.initializer;
      if (
        ts.isCallExpression(init) &&
        init.arguments.some((a) => ts.isIdentifier(a) && a.text === schemaName)
      ) {
        found = true;
      }
    }
  });
  return found;
}

/**
 * True when an object property (e.g. a route `loader`) contains a call to the
 * named function anywhere in its value — property assignment, method
 * shorthand, or `{ loader }` shorthand resolving to a top-level declaration.
 */
export function propertyContainsCall(file: string, property: string, callee: string): boolean {
  const sf = parse(file);
  const containsCall = (node: ts.Node): boolean => {
    let found = false;
    walk(node, (inner) => {
      if (ts.isCallExpression(inner) && calleeName(inner) === callee) found = true;
    });
    return found;
  };
  let found = false;
  walk(sf, (node) => {
    if (found) return;
    if (
      (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) &&
      node.name.text === property
    ) {
      found = containsCall(node);
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === property) {
      const decl = declarationBody(file, property);
      found = decl !== undefined && containsCall(decl);
    }
  });
  return found;
}

/** True when the component is rendered with the prop (or a spread). */
export function jsxPassesProp(file: string, component: string, prop: string): boolean {
  const sf = parse(file);
  let found = false;
  walk(sf, (node) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return;
    if (node.tagName.getText() !== component) return;
    for (const attr of node.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attr)) found = true;
      else if (ts.isJsxAttribute(attr) && attr.name.getText() === prop) found = true;
    }
  });
  return found;
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
