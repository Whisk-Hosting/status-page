// Bundles the app into dist/index.js and dist/migrate.js, each one file with its dependencies
// inside, so the image holds no node_modules and Node starts fast after a sleep. The fonts are
// copied beside them. The type check is `npm run typecheck`; this only builds.
import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

await build({
  entryPoints: ["src/index.ts", "src/migrate.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: "linked",
  legalComments: "none",
  logLevel: "warning",
  // Some dependencies are CommonJS and call require(); an ES module bundle has none of its own.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});

await mkdir("dist/fonts", { recursive: true });
await Promise.all(
  [
    ["@fontsource-variable/figtree", "figtree-latin-wght-normal.woff2"],
    ["@fontsource-variable/figtree", "figtree-latin-ext-wght-normal.woff2"],
    ["@fontsource/jetbrains-mono", "jetbrains-mono-latin-500-normal.woff2"],
  ].map(([pkg, file]) => copyFile(`node_modules/${pkg}/files/${file}`, `dist/fonts/${file}`)),
);
