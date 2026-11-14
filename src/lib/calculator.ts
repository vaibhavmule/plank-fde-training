type Operator = "+" | "-" | "*" | "/" | "%" | "^";

type Token =
  | { kind: "number"; value: number }
  | { kind: "operator"; value: Operator }
  | { kind: "left" }
  | { kind: "right" };

type Cursor = { tokens: Token[]; index: number };

const OPERATORS = "+-*/%^";

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const character = expression[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(character)) {
      const start = index;
      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        index += 1;
      }

      const literal = expression.slice(start, index);
      const value = Number(literal);
      if (!Number.isFinite(value)) {
        throw new Error(`"${literal}" is not a number I can use.`);
      }

      tokens.push({ kind: "number", value });
      continue;
    }

    if (OPERATORS.includes(character)) {
      tokens.push({ kind: "operator", value: character as Operator });
      index += 1;
      continue;
    }

    if (character === "(") {
      tokens.push({ kind: "left" });
      index += 1;
      continue;
    }

    if (character === ")") {
      tokens.push({ kind: "right" });
      index += 1;
      continue;
    }

    throw new Error(`Unexpected "${character}" in the expression.`);
  }

  return tokens;
}

function peek(cursor: Cursor) {
  return cursor.tokens[cursor.index];
}

function take(cursor: Cursor) {
  return cursor.tokens[cursor.index++];
}

function expression(cursor: Cursor): number {
  let value = term(cursor);

  for (;;) {
    const token = peek(cursor);
    if (
      token?.kind !== "operator" ||
      (token.value !== "+" && token.value !== "-")
    ) {
      return value;
    }

    take(cursor);
    const right = term(cursor);
    value = token.value === "+" ? value + right : value - right;
  }
}

function term(cursor: Cursor): number {
  let value = unary(cursor);

  for (;;) {
    const token = peek(cursor);
    if (
      token?.kind !== "operator" ||
      (token.value !== "*" && token.value !== "/" && token.value !== "%")
    ) {
      return value;
    }

    take(cursor);
    const right = unary(cursor);
    if (token.value === "*") value *= right;
    else if (token.value === "/") value /= right;
    else value %= right;
  }
}

function unary(cursor: Cursor): number {
  const token = peek(cursor);

  if (
    token?.kind === "operator" &&
    (token.value === "+" || token.value === "-")
  ) {
    take(cursor);
    const value = unary(cursor);
    return token.value === "-" ? -value : value;
  }

  return power(cursor);
}

function power(cursor: Cursor): number {
  const base = primary(cursor);
  const token = peek(cursor);

  if (token?.kind === "operator" && token.value === "^") {
    take(cursor);
    // The exponent recurses through unary, so 2 ^ 3 ^ 2 groups to the right
    // and 2 ^ -1 is allowed.
    return base ** unary(cursor);
  }

  return base;
}

function primary(cursor: Cursor): number {
  const token = take(cursor);

  if (!token) {
    throw new Error("The expression ends where a number was expected.");
  }

  if (token.kind === "number") return token.value;

  if (token.kind === "left") {
    const value = expression(cursor);
    const closing = take(cursor);
    if (!closing || closing.kind !== "right") {
      throw new Error("A closing parenthesis is missing.");
    }
    return value;
  }

  if (token.kind === "right") {
    throw new Error('Unexpected ")".');
  }

  throw new Error(`Expected a number but found "${token.value}".`);
}

function describe(token: Token) {
  if (token.kind === "number") return String(token.value);
  if (token.kind === "operator") return token.value;
  return token.kind === "left" ? "(" : ")";
}

/** Evaluates an arithmetic expression with +, -, *, /, %, ^ and parentheses. */
export function evaluate(source: string): number {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    throw new Error("The expression is empty.");
  }

  const cursor: Cursor = { tokens, index: 0 };
  const value = expression(cursor);

  const left = peek(cursor);
  if (left) {
    throw new Error(`Unexpected "${describe(left)}" after the expression.`);
  }

  if (!Number.isFinite(value)) {
    throw new Error("The result is not a finite number.");
  }

  return value;
}
