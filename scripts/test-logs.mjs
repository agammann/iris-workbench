import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const container = process.env.IRIS_CONTAINER || "iris-workbench-dev";
if (!/^[a-zA-Z0-9_.-]+$/.test(container)) throw Error("Invalid container name");
function run(args) {
  const r = spawnSync("docker", args, { stdio: "inherit" });
  if (r.error) throw Error("Could not start Docker: " + r.error.message);
  if (r.status !== 0) process.exit(r.status || 1);
}
run([
  "exec",
  container,
  "mkdir",
  "-p",
  "/tmp/workbench-verification/tests",
  "/tmp/workbench-verification/iris",
]);
for (const file of ["tests/test_logs.py", "iris/workbench_logs.py"])
  run([
    "cp",
    path.join(root, file),
    container + ":/tmp/workbench-verification/" + file,
  ]);
run([
  "exec",
  container,
  "python3",
  "-m",
  "unittest",
  "discover",
  "-s",
  "/tmp/workbench-verification/tests",
  "-p",
  "test_logs.py",
  "-v",
]);
