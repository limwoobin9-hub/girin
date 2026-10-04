import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

console.log("Extracting site source...");
execFileSync("tar", ["-xzf", "source.tar.gz", "-C", "."], { stdio: "inherit" });

const ocrFile = "lib/browser-answer-ocr.ts";
if (existsSync(ocrFile)) {
  let source = readFileSync(ocrFile, "utf8");
  source = source
    .replace('workerPath: "/ocr/worker.min.js"', 'workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js"')
    .replace('corePath: "/ocr/core"', 'corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0"')
    .replace('langPath: "/ocr/lang"', 'langPath: "https://tessdata.projectnaptha.com/4.0.0"');
  writeFileSync(ocrFile, source);
}

console.log("Building Next.js app...");
execFileSync("pnpm", ["exec", "next", "build"], { stdio: "inherit" });
