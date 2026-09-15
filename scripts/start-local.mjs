import fs from "node:fs";
import path from "node:path";
const directory = process.argv[2] || process.env.WORKBENCH_STATE_DIR;
if (!directory)
  throw Error("Pass the private state directory created by setup-local.mjs.");
const config = JSON.parse(
  fs.readFileSync(path.resolve(directory, "connection.json"), "utf8"),
);
process.env.IRIS_URL = config.IRIS_URL;
process.env.IRIS_CREDENTIALS_FILE = config.IRIS_CREDENTIALS_FILE;
await import("../server/index.mjs");
