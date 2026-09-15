import * as esbuild from "esbuild";
import { mkdirSync, copyFileSync, readdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
mkdirSync("dist/icons", { recursive: true });

await esbuild.build({
  entryPoints: ["src/popup.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outfile: "dist/popup.js",
  legalComments: "none",
  logLevel: "info",
});

for (const f of ["popup.html", "manifest.json"]) {
  copyFileSync(`src/${f}`, `dist/${f}`);
}
for (const f of readdirSync("src/icons")) {
  copyFileSync(`src/icons/${f}`, `dist/icons/${f}`);
}

console.log("✓ extension built -> packages/extension/dist (load this folder unpacked)");
