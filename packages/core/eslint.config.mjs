import base from "@uteach/config/eslint";

export default [
  ...base,
  {
    rules: {
      // Money must never pass through floating point (04-rules §2).
      "no-restricted-globals": ["error", "parseFloat"],
    },
  },
];
