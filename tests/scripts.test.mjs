import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Docker scripts fail when Docker cannot start", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-no-docker-"));
  try {
    for (const script of ["test-logs.mjs", "setup-local.mjs"]) {
      const state = path.join(directory, "state");
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"),
      );
      const result = spawnSync(process.execPath, [path.join(root, "scripts", script)], {
        cwd: directory,
        env: { ...env, PATH: directory, WORKBENCH_STATE_DIR: state },
        encoding: "utf8",
        timeout: 5000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /Could not start Docker:.*ENOENT/);
      assert.equal(fs.existsSync(state), false, "setup must not write state without Docker");
    }
  } finally {
    fs.rmdirSync(directory);
  }
});
