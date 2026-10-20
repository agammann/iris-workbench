import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readConnection, readPrivateJson } from "../server/private-state.mjs";
import { verifiedDemoService } from "./verify-demo-service.mjs";

// Exercise the real setup/start path against a disposable IRIS instance. Keep
// credentials in setup's private files and never print server logs or responses.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = process.argv[2] || process.env.WORKBENCH_STATE_DIR;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let stage = "read the private setup state";
let child;
let childExited = false;
let childFailed = false;
let exited;
const interrupted = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    interrupted.abort();
    child?.kill("SIGTERM");
  });

function check(condition, message) {
  if (!condition) throw Error(message);
}

try {
  check(directory, "Pass the private state directory created by setup-local.mjs.");
  const state = path.resolve(directory);
  const config = readConnection(state);
  const iris = new URL(config.IRIS_URL);
  check(
    iris.protocol === "http:" && ["127.0.0.1", "localhost"].includes(iris.hostname),
    "This check requires the local IRIS instance created by setup-local.mjs.",
  );

  stage = "start the configured Workbench backend";
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const selected = socket.address().port;
      socket.close((error) => error ? reject(error) : resolve(selected));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(root, "scripts/start-local.mjs"), state], {
    cwd: root,
    env: { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1" },
    stdio: "ignore",
  });
  exited = new Promise((resolve) => {
    child.once("error", () => { childFailed = true; childExited = true; resolve(); });
    child.once("exit", () => { childExited = true; resolve(); });
  });

  async function request(endpoint, method = "GET", body, cookie, timeout = 20000) {
    const response = await fetch(origin + endpoint, {
      method,
      headers: {
        Host: `127.0.0.1:${port}`,
        "x-workbench": "1",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([AbortSignal.timeout(timeout), interrupted.signal]),
      redirect: "error",
    });
    return { status: response.status, cookie: response.headers.get("set-cookie"), data: await response.json() };
  }
  function status(response, expected) {
    check(response.status === expected, `Expected HTTP ${expected}; received HTTP ${response.status}.`);
  }

  let initial;
  for (let attempt = 0; attempt < 100; attempt++) {
    check(!childExited && !childFailed && !interrupted.signal.aborted, "Workbench did not stay running.");
    try {
      initial = await request("/api/session", "GET", undefined, undefined, 500);
      break;
    } catch {
      await delay(100);
    }
  }
  check(initial, "Workbench did not become ready within the startup window.");
  status(initial, 200);
  check(initial.data.connected === false && initial.data.configured === true, "Configured disconnected session was not reported.");

  stage = "reject unauthenticated access";
  status(await request("/api/schema"), 401);

  stage = "reject an unknown fixture account without creating a session";
  const rejected = await request("/api/session", "POST", {
    user: `workbench-missing-${randomBytes(16).toString("hex")}`,
    password: "workbench-invalid-account-fixture",
  });
  status(rejected, 401);
  check(!rejected.cookie, "Rejected sign-in created a session cookie.");
  check(/\/api\/admin returned HTTP 401/.test(rejected.data.error || ""), "The IRIS authentication rejection was not preserved.");
  check((await request("/api/session")).data.connected === false, "Rejected sign-in left a connected session.");

  stage = "sign in with the generated credentials through the configured backend";
  const login = await request("/api/session", "POST", { configured: true });
  status(login, 200);
  check(login.data.connected === true && login.data.configured === true, "Configured sign-in did not connect.");
  check(login.data.user === "_SYSTEM" && login.data.instance === iris.host, "Configured sign-in used a different account or instance.");
  check(login.data.info && typeof login.data.info === "object" && !Array.isArray(login.data.info), "IRIS server information was not returned.");
  check(/^workbench=[a-f0-9]{64};/.test(login.cookie || ""), "Sign-in did not issue the expected session cookie.");
  check(/HttpOnly/.test(login.cookie) && /SameSite=Strict/.test(login.cookie), "Session cookie protections were not set.");
  const cookie = login.cookie.split(";")[0];
  const connected = await request("/api/session", "GET", undefined, cookie);
  status(connected, 200);
  check(connected.data.connected === true, "The session cookie did not retain the connection.");

  stage = "read the authenticated schema";
  const schema = await request("/api/schema", "GET", undefined, cookie);
  status(schema, 200);
  check(schema.data.paths?.["/v2/web-apps"]?.get && schema.data.components?.schemas, "The expected management schema was not returned.");

  stage = "read real IRIS web applications";
  const applications = await request("/api/read", "POST", { path: "/v2/web-apps" }, cookie);
  status(applications, 200);
  check(Array.isArray(applications.data.data), "IRIS did not return a web-application list.");
  const applicationNames = new Set(applications.data.data.map((application) => application.Name));
  check(applicationNames.has("/api/admin") && applicationNames.has("/api/workbench"), "The management API and installed extension were not listed.");

  stage = "verify the exact disposable demonstration response";
  const demoPath = "/v2/web-app?name=%2Fworkbench-demo";
  status(await request("/api/read", "POST", { path: demoPath }, cookie), 404);
  let demoCreated = false;
  try {
    const creation = await request("/api/prepare", "POST", {
      path: demoPath, method: "PUT", label: "Create disposable demonstration",
      payload: {
        NameSpace: "%SYS", Enabled: false, AutheEnabled: 32,
        DispatchClass: "Workbench.DemoREST", Description: "Disposable IRIS Workbench demonstration",
        Resource: "%Admin_Operate",
      },
    }, cookie);
    status(creation, 200);
    status(await request("/api/apply", "POST", { id: creation.data.id }, cookie), 200);
    demoCreated = true;
    const enable = await request("/api/prepare", "POST", {
      path: demoPath, method: "PUT", readPath: demoPath,
      payload: { Enabled: true }, label: "Enable disposable demonstration",
    }, cookie);
    status(enable, 200);
    status(await request("/api/apply", "POST", { id: enable.data.id }, cookie), 200);
    const credentials = readPrivateJson(config.IRIS_CREDENTIALS_FILE);
    const response = await fetch(new URL("/workbench-demo/status", iris), {
      headers: { Authorization: "Basic " + Buffer.from(credentials.user + ":" + credentials.password).toString("base64") },
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(10000), interrupted.signal]),
    });
    check(response.status === 200 && (response.headers.get("content-type") || "").includes("application/json"), "Disposable demonstration did not return JSON over HTTP 200.");
    verifiedDemoService(await response.text());
  } finally {
    if (demoCreated) {
      stage = "remove the disposable demonstration";
      const deletion = await request("/api/prepare", "POST", {
        path: demoPath, method: "DELETE", readPath: demoPath,
        label: "Remove disposable demonstration",
      }, cookie);
      status(deletion, 200);
      status(await request("/api/apply", "POST", { id: deletion.data.id }, cookie), 200);
      status(await request("/api/read", "POST", { path: demoPath }, cookie), 404);
    }
  }

  stage = "read real runtime message logs";
  const logs = await request("/api/logs", "POST", { source: "messages" }, cookie);
  status(logs, 200);
  check(logs.data.data?.available === true && Array.isArray(logs.data.data.lines), "The runtime message-log source was not available.");

  stage = "sign out and invalidate the session";
  const logout = await request("/api/session", "DELETE", undefined, cookie);
  status(logout, 200);
  check(logout.data.ok === true && /Max-Age=0/.test(logout.cookie || ""), "Sign-out did not expire the session cookie.");
  const disconnected = await request("/api/session", "GET", undefined, cookie);
  status(disconnected, 200);
  check(disconnected.data.connected === false, "Sign-out left the session connected.");
  status(await request("/api/schema", "GET", undefined, cookie), 401);
  console.log("Verified local IRIS: authentication rejection, configured sign-in, session cookie, schema, admin read, exact disposable demo response, runtime message logs, and sign-out.");
} catch {
  // Only emit the fixed stage name. Upstream bodies and private state can carry
  // credentials or instance details, so they must stay out of CI logs.
  console.error(`Local IRIS verification failed while attempting to ${stage}.`);
  process.exitCode = 1;
} finally {
  if (child && !childExited) {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(2000)]);
    if (!childExited) {
      child.kill("SIGKILL");
      await exited;
    }
  }
}
