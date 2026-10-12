import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const repoRoot = path.join(__dirname, "../..");

// cacheComponents stays off: every staff page depends on the signed-in user's cookies.
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  transpilePackages: [
    "@uteach/adapters",
    "@uteach/core",
    "@uteach/db",
    "@uteach/i18n",
    "@uteach/receipts",
  ],
  // Excel import reads and writes .xlsx on the server with Node streams; receipts render PDFs with
  // @react-pdf/renderer (fonts read from disk). Both stay out of the bundle.
  serverExternalPackages: ["exceljs", "@react-pdf/renderer"],
  turbopack: {
    root: repoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
