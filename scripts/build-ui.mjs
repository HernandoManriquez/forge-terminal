import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
await mkdir("src/ui/dist", { recursive: true });
await build({
  entryPoints: ["src/ui/app/main.js"],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020"],
  outfile: "src/ui/dist/app.js",
  legalComments: "eof",
});
await cp("src/ui/app/index.html", "src/ui/dist/index.html");
await cp("src/ui/app/icon.svg", "src/ui/dist/icon.svg");
console.log("UI built. All assets are local.");
