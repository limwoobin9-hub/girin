import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const chunks = readdirSync(".source")
  .filter((name) => /^chunk-\d+\.b64$/.test(name))
  .sort();

if (chunks.length !== 8) {
  throw new Error(`Expected 8 bundled source chunks, found ${chunks.length}.`);
}

const base64 = chunks
  .map((name) => readFileSync(`.source/${name}`, "utf8").trim())
  .join("");

writeFileSync("source-full.tar.gz", Buffer.from(base64, "base64"));

console.log(`Reconstructing site source from ${chunks.length} chunks...`);
execFileSync("tar", ["-xzf", "source-full.tar.gz", "-C", "."], {
  stdio: "inherit",
});

const tsconfigPath = "tsconfig.json";
const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
if (Array.isArray(tsconfig.compilerOptions?.types)) {
  tsconfig.compilerOptions.types = tsconfig.compilerOptions.types.filter(
    (type) => type !== "@cloudflare/workers-types",
  );
}
writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");

console.log("Building Next.js app...");
execFileSync("pnpm", ["exec", "next", "build"], {
  stdio: "inherit",
});
