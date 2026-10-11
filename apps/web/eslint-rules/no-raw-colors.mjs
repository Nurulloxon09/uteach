/**
 * uteach/no-raw-colors: components use theme tokens only (CLAUDE.md, 05-ui.md §2).
 * Flags Tailwind palette classes (bg-blue-500, text-white), arbitrary colors (bg-[#fff], text-[oklch(...)])
 * and raw color values (#1f2937, rgb(...), hsl(...), oklch(...)) in string literals and templates.
 * Colors are defined once, as CSS variables in src/app/globals.css.
 */
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITY =
  "bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|fill|stroke|from|via|to|shadow|accent|caret|divide|decoration|placeholder";

const PALETTE_CLASS = new RegExp(
  String.raw`(?:^|[\s:!])(?:${UTILITY})-(?:(?:${PALETTE})-\d{2,3}|white|black)(?:/\d+)?(?=$|[\s"'])`,
);
const ARBITRARY_COLOR = new RegExp(
  String.raw`(?:^|[\s:!])(?:${UTILITY})-\[(?:#|rgba?\(|hsla?\(|oklch\(|oklab\(|color\()`,
);
const RAW_VALUE = /^\s*(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\([^)]*\))\s*$/;
const COLOR_FN_IN_TEXT = /(?:^|[\s:;,(])(?:rgba?|hsla?|oklch|oklab)\(\s*[\d.]/;

/** Returns why `text` contains a raw color, or null. */
export function rawColorIn(text) {
  if (PALETTE_CLASS.test(text)) return "palette";
  if (ARBITRARY_COLOR.test(text)) return "arbitrary";
  if (RAW_VALUE.test(text) || COLOR_FN_IN_TEXT.test(text)) return "value";
  return null;
}

const MESSAGES = {
  palette:
    "Tailwind palette color: use a theme token class (bg-primary, text-muted-foreground, ...).",
  arbitrary: "Arbitrary color value: add a token to globals.css and use its class.",
  value: "Raw color value: colors live only in globals.css as CSS variables.",
};

/** @type {import("eslint").Rule.RuleModule} */
export const noRawColors = {
  meta: {
    type: "problem",
    docs: { description: "Disallow raw colors outside globals.css" },
    messages: MESSAGES,
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      const kind = typeof text === "string" ? rawColorIn(text) : null;
      if (kind) context.report({ node, messageId: kind });
    };
    return {
      Literal: (node) => check(node, node.value),
      TemplateElement: (node) => check(node, node.value.cooked),
      JSXText: (node) => check(node, node.value),
    };
  },
};

const plugin = { rules: { "no-raw-colors": noRawColors } };
export default plugin;
