import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const chunks = readdirSync(".source")
  .filter((name) => /^chunk-\d+\.b64$/.test(name))
  .sort();

if (!chunks.length) {
  throw new Error("Bundled source chunks are missing.");
}

const base64 = chunks
  .map((name) => readFileSync(`.source/${name}`, "utf8").trim())
  .join("");

writeFileSync("source-full.tar.gz", Buffer.from(base64, "base64"));

console.log(`Reconstructing site source from ${chunks.length} chunks...`);
execFileSync("tar", ["-xzf", "source-full.tar.gz", "-C", "."], {
  stdio: "inherit",
});

console.log("Building Next.js app...");
execFileSync("pnpm", ["exec", "next", "build"], {
  stdio: "inherit",
});
