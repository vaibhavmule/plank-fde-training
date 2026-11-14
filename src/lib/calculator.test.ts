import { describe, expect, test } from "vitest";

import { evaluate } from "@/lib/calculator";

describe("precedence", () => {
  test.each([
    ["2 + 3 * 4", 14],
    ["(2 + 3) * 4", 20],
    ["2 * 3 + 4", 10],
    ["10 - 2 - 3", 5],
    ["8 / 2 / 2", 2],
    ["10 % 4", 2],
    ["2 * 3 % 4", 2],
    ["2 ^ 3 ^ 2", 512],
    ["2 ^ 3 * 2", 16],
    ["1 + 2 * 3 ^ 2", 19],
    ["-2 ^ 2", -4],
    ["(-2) ^ 2", 4],
    ["2 ^ -2", 0.25],
    ["+7", 7],
    ["--7", 7],
    ["1.5 * 2", 3],
    ["  (  1 + 2 ) / 3  ", 1],
  ])("%s is %d", (source, expected) => {
    expect(evaluate(source)).toBe(expected);
  });
});

describe("errors", () => {
  test.each([
    ["", /empty/i],
    ["   ", /empty/i],
    ["2 +", /ends where a number was expected/i],
    ["2 + * 3", /Expected a number/i],
    ["(1 + 2", /closing parenthesis/i],
    ["1 + 2)", /Unexpected "\)"/i],
    ["1 2", /Unexpected "2" after the expression/i],
    ["two + 2", /Unexpected "t"/i],
    ["1.2.3", /not a number/i],
    [".", /not a number/i],
    ["1 / 0", /finite/i],
    ["0 / 0", /finite/i],
    ["2 ^ 1024", /finite/i],
  ])("rejects %j", (source, message) => {
    expect(() => evaluate(source)).toThrow(message);
  });
});
