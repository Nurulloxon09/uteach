/**
 * uteach/no-float-money: money is bigint minor units, never a float (04-rules §2, 30-milestones M3).
 * Flags `parseFloat` anywhere, and `Number(…)`, `parseInt(…)` or unary `+…` applied to anything whose source
 * looks like money (amount, price, balance, debt, discount, paid, override). Amounts reach the database through
 * `toDbAmount()` in src/lib/money.ts, the one place that turns validated minor units into a JSON number.
 */
export const MONEY_TEXT = /amount|price|balance|debt|discount|paid|override|money/i;

/** Why this call or unary expression handles money as a float, or null. `callee` is e.g. "Number". */
export function floatMoneyIn(callee, argumentText) {
  if (callee === "parseFloat" || callee === "Number.parseFloat") return "float";
  if (
    (callee === "Number" ||
      callee === "parseInt" ||
      callee === "Number.parseInt" ||
      callee === "+") &&
    MONEY_TEXT.test(argumentText ?? "")
  ) {
    return "number";
  }
  return null;
}

const MESSAGES = {
  float:
    "No parseFloat: money is bigint minor units (parseMajorUnits / parseMinorUnits in @uteach/core).",
  number:
    "Don't turn money into a JS number: keep it bigint or a decimal string; use toDbAmount() for RPC args.",
};

function calleeName(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && node.object.type === "Identifier" && !node.computed) {
    return `${node.object.name}.${node.property.name}`;
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
export const noFloatMoney = {
  meta: {
    type: "problem",
    docs: { description: "Disallow float handling of money" },
    messages: MESSAGES,
    schema: [],
  },
  create(context) {
    const source = context.sourceCode;
    return {
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (!name) return;
        const arg = node.arguments[0];
        const kind = floatMoneyIn(name, arg ? source.getText(arg) : "");
        if (kind) context.report({ node, messageId: kind });
      },
      UnaryExpression(node) {
        if (node.operator !== "+") return;
        const kind = floatMoneyIn("+", source.getText(node.argument));
        if (kind) context.report({ node, messageId: kind });
      },
    };
  },
};
