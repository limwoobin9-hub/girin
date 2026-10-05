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

function cleanPatchPath(value) {
  const path = value.split("\t", 1)[0].trim();
  return path.startsWith("a/") || path.startsWith("b/") ? path.slice(2) : path;
}

function applyUnifiedPatch(patchPath) {
  const lines = readFileSync(patchPath, "utf8").split("\n");
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith("--- ")) {
      i++;
      continue;
    }

    const oldPath = cleanPatchPath(lines[i].slice(4));
    i++;
    if (i >= lines.length || !lines[i].startsWith("+++ ")) {
      throw new Error(`Malformed patch ${patchPath}: missing +++ line`);
    }
    const newPath = cleanPatchPath(lines[i].slice(4));
    i++;

    const targetPath = newPath === "/dev/null" ? oldPath : newPath;
    if (targetPath === "/dev/null") {
      throw new Error(`Unsupported delete-only patch in ${patchPath}`);
    }

    const original = readFileSync(targetPath, "utf8");
    const hadFinalNewline = original.endsWith("\n");
    const source = original.split("\n");
    if (hadFinalNewline) source.pop();

    const output = [];
    let sourceIndex = 0;

    while (i < lines.length && !lines[i].startsWith("--- ")) {
      if (!lines[i].startsWith("@@ ")) {
        i++;
        continue;
      }

      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]);
      if (!match) throw new Error(`Malformed hunk header in ${patchPath}: ${lines[i]}`);

      const oldStart = Number(match[1]) - 1;
      while (sourceIndex < oldStart) output.push(source[sourceIndex++]);
      i++;

      while (i < lines.length && !lines[i].startsWith("@@ ") && !lines[i].startsWith("--- ")) {
        const line = lines[i];

        if (line === "\\ No newline at end of file") {
          i++;
          continue;
        }

        const prefix = line[0];
        const value = line.slice(1);

        if (prefix === " ") {
          if (source[sourceIndex] !== value) {
            throw new Error(`Patch context mismatch in ${targetPath} at source line ${sourceIndex + 1}`);
          }
          output.push(value);
          sourceIndex++;
        } else if (prefix === "-") {
          if (source[sourceIndex] !== value) {
            throw new Error(`Patch removal mismatch in ${targetPath} at source line ${sourceIndex + 1}`);
          }
          sourceIndex++;
        } else if (prefix === "+") {
          output.push(value);
        } else if (line !== "") {
          throw new Error(`Unexpected patch line in ${patchPath}: ${line}`);
        }
        i++;
      }
    }

    while (sourceIndex < source.length) output.push(source[sourceIndex++]);
    writeFileSync(targetPath, output.join("\n") + (hadFinalNewline ? "\n" : ""));
  }
}

console.log("Applying UI patch...");
applyUnifiedPatch(".patches/ui.patch");

console.log("Applying submit patch...");
applyUnifiedPatch(".patches/submit.patch");

console.log("Applying final mobile question layout...");
{
  const pagePath = "app/page.tsx";
  let page = readFileSync(pagePath, "utf8");
  page = page
    .replace(/\s*<small>\{q\.assessed - q\.wrong\}\/\{q\.assessed\}건<\/small>/g, "")
    .replace(/\s*<small>\{q\.wrong\}\/\{q\.assessed\}건<\/small>/g, "");
  writeFileSync(pagePath, page);

  const cssPath = "app/globals.css";
  const css = readFileSync(cssPath, "utf8") + `
/* FINAL_MOBILE_QUESTION_LAYOUT */
.question-choices {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 3px !important;
  width: 100% !important;
  min-width: 0 !important;
  flex-wrap: nowrap !important;
}
.choice-chip {
  box-sizing: border-box !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 34px !important;
  height: auto !important;
  aspect-ratio: 1 / 1 !important;
  justify-self: start !important;
}
.question-error-rate small { display: none !important; }

@media (max-width: 600px) {
  .question-line {
    grid-template-columns: 36px minmax(0, 1fr) 88px !important;
    gap: 6px !important;
    padding: 11px 8px !important;
  }
  .question-content { min-width: 0 !important; }
  .question-choices {
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    gap: 2px !important;
  }
  .choice-chip {
    max-width: 27px !important;
    font-size: clamp(.82rem, 3.8vw, 1rem) !important;
    border-radius: 7px !important;
  }
  .question-error-rate {
    padding: 7px 2px 7px 7px !important;
  }
  .question-error-rate span { font-size: .82rem !important; }
  .question-error-rate b { font-size: 1.25rem !important; }
}

@media (max-width: 360px) {
  .question-line {
    grid-template-columns: 32px minmax(0, 1fr) 76px !important;
    gap: 4px !important;
    padding: 10px 6px !important;
  }
  .choice-chip {
    max-width: 23px !important;
    font-size: .82rem !important;
  }
  .question-error-rate span { font-size: .74rem !important; }
  .question-error-rate b { font-size: 1.08rem !important; }
}
`;
  writeFileSync(cssPath, css);
}

const tsconfigPath = "tsconfig.json";
const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
if (Array.isArray(tsconfig.compilerOptions?.types)) {
  tsconfig.compilerOptions.types = tsconfig.compilerOptions.types.filter(
    (type) => type !== "@cloudflare/workers-types",
  );
}
writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");

console.log("Building Next.js app...");
execFileSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
});
