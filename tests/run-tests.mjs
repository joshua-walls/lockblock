import { spawn } from "node:child_process";
import { readdir, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const testEntries = (await readdir(testsDirectory))
  .filter((file) => file.endsWith(".test.ts"))
  .sort()
  .map((file) => join(testsDirectory, file));

if (testEntries.length === 0) {
  throw new Error("No test files found.");
}

const outputDirectory = await mkdtemp(join(tmpdir(), "lockblock-tests-"));

try {
  await esbuild.build({
    bundle: true,
    entryNames: "[name]",
    entryPoints: testEntries,
    format: "cjs",
    logLevel: "warning",
    outdir: outputDirectory,
    platform: "node",
    sourcemap: "inline",
    target: "node20",
  });

  const compiledTests = testEntries.map((entry) => join(outputDirectory, `${basename(entry, ".ts")}.js`));
  const exitCode = await runNodeTests(compiledTests);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
} finally {
  await rm(outputDirectory, { recursive: true });
}

function runNodeTests(files) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", ...files], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
