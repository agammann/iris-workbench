import { readConnection } from "../server/private-state.mjs";
const directory = process.argv[2] || process.env.WORKBENCH_STATE_DIR;
if (!directory)
  throw Error("Pass the private state directory created by setup-local.mjs.");
const config = readConnection(directory);
process.env.IRIS_URL = config.IRIS_URL;
process.env.IRIS_CREDENTIALS_FILE = config.IRIS_CREDENTIALS_FILE;
await import("../server/index.mjs");
