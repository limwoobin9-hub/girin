import { cpSync, mkdirSync, renameSync, rmSync } from "node:fs";

// The bundled source is reconstructed on every build; install the auth routes afterwards.
rmSync("app/(private)", { recursive: true, force: true });
mkdirSync("app/(private)", { recursive: true });
for (const name of ["page.tsx", "ranking", "scores", "answers", "submit"]) {
  renameSync(`app/${name}`, `app/(private)/${name}`);
}
cpSync("admin-overrides", ".", { recursive: true });
