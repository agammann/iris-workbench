import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const container = process.env.IRIS_CONTAINER || "iris-workbench-local";
const port = Number(process.env.IRIS_PORT || 52773);
const state = process.env.WORKBENCH_STATE_DIR;
if (!state)
  throw Error(
    "Set WORKBENCH_STATE_DIR to a private directory outside the source repository.",
  );
if (
  !/^[a-zA-Z0-9_.-]+$/.test(container) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw Error("Invalid container name or port");
const image =
  "containers.intersystems.com/intersystems/iris-community@sha256:87c8b9062530093d30384d66caa9933b8399bfbace7ddb7f1bdb983c0bfdb85b";
const run = (args, input) => {
  const r = spawnSync("docker", args, { input, encoding: "utf8" });
  if (r.error) throw Error("Could not start Docker: " + r.error.message);
  if (r.status !== 0) throw Error(r.stderr || "Docker operation failed");
  return r.stdout;
};
if (run(["info", "--format", "{{.OSType}}"]).trim() !== "linux")
  throw Error("IRIS setup requires Docker running Linux containers");
const existing = spawnSync("docker", ["container", "inspect", container], {
  encoding: "utf8",
});
if (existing.status === 0)
  throw Error(
    "The named container already exists. This setup only initializes a new container.",
  );
fs.mkdirSync(state, { recursive: true, mode: 0o700 });
const credentialsPath = path.resolve(state, "credentials.json");
if (fs.existsSync(credentialsPath))
  throw Error(
    "The state directory already contains credentials. Choose an empty private directory.",
  );
console.log("Creating local IRIS Community instance…");
run([
  "run",
  "-d",
  "--name",
  container,
  "--publish",
  `127.0.0.1:${port}:52773`,
  "--memory",
  "3g",
  "--shm-size",
  "1g",
  image,
]);
for (let i = 0; i < 90; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/admin/info`, {
      signal: AbortSignal.timeout(1000),
    });
    if (r.status === 401 || r.status === 200) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
  if (i === 89) throw Error("IRIS did not become ready within 90 seconds");
}
const credentials = {
  user: "_SYSTEM",
  password: randomBytes(32).toString("base64url"),
};
const code = `zn "%SYS"\nset p("Password")="${credentials.password}",p("ChangePassword")=0\nwrite !,"CONFIGURED:",##class(Security.Users).Modify("_SYSTEM",.p),!\nhalt\n`;
const result = run(
  ["exec", "-i", container, "iris", "session", "IRIS", "-U", "%SYS"],
  code,
);
if (!result.includes("CONFIGURED:1"))
  throw Error("Could not initialize the local account");
fs.writeFileSync(credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
const install = spawnSync(
  process.execPath,
  [path.join(root, "scripts/install-iris.mjs")],
  { env: { ...process.env, IRIS_CONTAINER: container }, encoding: "utf8" },
);
if (install.status || !install.stdout.includes("Install status: 1"))
  throw Error("Extension installation failed");
const r = await fetch(
  `http://127.0.0.1:${port}/api/workbench/logs?source=messages`,
  {
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(credentials.user + ":" + credentials.password).toString(
          "base64",
        ),
    },
  },
);
if (!r.ok) throw Error("Extension read verification failed");
const logResult = await r.json();
if (logResult.error || !Array.isArray(logResult.lines) || !logResult.available) throw Error("Runtime log reader did not return an available source");
fs.writeFileSync(
  path.resolve(state, "connection.json"),
  JSON.stringify(
    {
      IRIS_URL: `http://127.0.0.1:${port}`,
      IRIS_CREDENTIALS_FILE: credentialsPath,
    },
    null,
    2,
  ),
);
console.log(
  "Local setup verified. Start with: node scripts/start-local.mjs " +
    JSON.stringify(path.resolve(state)),
);
