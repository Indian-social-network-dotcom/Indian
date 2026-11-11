import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)]
  .filter(match => /\\btype\\s*=\\s*["']module["']/i.test(match[1]))
  .map(match => match[2])
  .filter(source => source.trim());

if (!scripts.length) {
  throw new Error("No inline JavaScript module scripts were found in index.html.");
}

const tempDir = await mkdtemp(join(tmpdir(), "indian-js-check-"));
try {
  for (let i = 0; i < scripts.length; i++) {
    const file = join(tempDir, `inline-module-${i + 1}.mjs`);
    await writeFile(file, scripts[i], "utf8");
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) {
      process.stderr.write(`Syntax error in index.html inline module #${i + 1}\\n`);
      process.stderr.write(result.stderr || result.stdout || "Node syntax check failed.\\n");
      process.exitCode = result.status || 1;
      break;
    }
  }
  if (!process.exitCode) {
    console.log(`JavaScript syntax OK: ${scripts.length} inline module script(s).`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
