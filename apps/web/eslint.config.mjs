import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { noFloatMoney } from "./eslint-rules/no-float-money.mjs";
import uteach from "./eslint-rules/no-raw-colors.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // All UI text goes through next-intl (04-rules §4): no string literals in JSX.
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    // /dev/ui is a developer-only page (404 in production); its section labels stay untranslated (05-ui.md §6b).
    ignores: ["src/components/ui/**", "**/dev/ui/**"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        { noStrings: true, ignoreProps: true, allowedStrings: ["·", "—", "/", ":", "(", ")"] },
      ],
    },
  },
  {
    // Colors come only from theme tokens in globals.css (05-ui.md §2); money is never a float (04-rules §2).
    files: ["src/**/*.{ts,tsx}"],
    plugins: { uteach: { rules: { ...uteach.rules, "no-float-money": noFloatMoney } } },
    rules: { "uteach/no-raw-colors": "error", "uteach/no-float-money": "error" },
  },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
