import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const racingHtml = await readFile(new URL("../indian-racing.html", import.meta.url), "utf8");
const emulatorConfig = JSON.parse(await readFile(new URL("../firebase.emulator.json", import.meta.url), "utf8"));
if (emulatorConfig.firestore?.rules !== "firestore.rules.public-profiles-migration-DRAFT.txt") {
  throw new Error("Local Emulator must compile the migration Rules draft, not a production Rules file.");
}
if (emulatorConfig.emulators?.auth?.port !== 9099 || emulatorConfig.emulators?.firestore?.port !== 8080) {
  throw new Error("Local Auth/Firestore Emulator ports do not match the app connection settings.");
}
for (const required of [
  "demo-indian-public-profile-migration",
  "connectAuthEmulator",
  "connectFirestoreEmulator",
  "window.__indianFirebaseEmulatorMode",
  "External production service blocked during local Firebase Emulator testing."
]) {
  if (!html.includes(required)) throw new Error("Missing local Emulator safety check in index.html: " + required);
}

console.log("Local Emulator config and production-isolation checks OK.");
const racingScripts = [...racingHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => /\btype\s*=\s*["']module["']/i.test(match[1]))
  .map(match => match[2])
  .filter(source => source.trim());
if (racingScripts.length !== 1) throw new Error("Expected one inline module script in indian-racing.html.");
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => /\btype\s*=\s*["']module["']/i.test(match[1]))
  .map(match => match[2])
  .filter(source => source.trim());

if (!scripts.length) {
  throw new Error("No inline JavaScript module scripts were found in index.html.");
}

const tempDir = await mkdtemp(join(tmpdir(), "indian-js-check-"));
try {
  const allScripts = [...scripts, ...racingScripts];
  for (let i = 0; i < allScripts.length; i++) {
    const file = join(tempDir, "inline-module-" + (i + 1) + ".mjs");
    await writeFile(file, allScripts[i], "utf8");
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) {
      process.stderr.write("Syntax error in inline module #" + (i + 1) + "\n");
      process.stderr.write(result.stderr || result.stdout || "Node syntax check failed.\n");
      process.exitCode = result.status || 1;
      break;
    }
  }
  if (!process.exitCode) {
    console.log("JavaScript syntax OK: " + allScripts.length + " inline module script(s).");
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
