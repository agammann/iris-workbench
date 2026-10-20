import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifiedDemoService } from "../scripts/verify-demo-service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Controlled HTTP and Docker fixtures exercise the real setup subprocess. They
// do not claim to verify authentication against a live IRIS instance.
const serverInfo = { username: "_SYSTEM", serverVersion: "IRIS 2026.2", apiVersion: 2 };

test("screencast accepts only the pinned disposable service response", () => {
  const expected = '{"service":"Workbench demonstration","status":"ready"}';
  assert.deepEqual(verifiedDemoService(expected), { service: "Workbench demonstration", status: "ready" });
  for (const body of [
    '{"service":"Workbench demonstration","status":"ready","private":"unexpected"}',
    '{"service":"Workbench demonstration","status":"ready","status":"ready"}',
    '{"service":"Workbench demonstration","status":"ready"}\n',
    '{"service":"Workbench demonstration","status":"pending"}',
  ]) assert.throws(() => verifiedDemoService(body), /differs from the pinned demonstration/);
});

function setupFixture(adminResponse = { status: 200, body: serverInfo }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-setup-"));
  const state = path.join(directory, "state");
  const trace = path.join(directory, "trace.jsonl");
  const preload = path.join(directory, "setup-fixture.mjs");
  fs.writeFileSync(preload, `
import fs from "node:fs";
import path from "node:path";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const adminResponse = ${JSON.stringify(adminResponse)};
const record = (event) => fs.appendFileSync(process.env.SETUP_FIXTURE_TRACE, JSON.stringify({ event }) + "\\n");
// Mock the built-in inside the setup child instead of relying on executable
// fixture files, so the same checks work on Windows and POSIX hosts.
childProcess.spawnSync = (command, args, options = {}) => {
  const success = (stdout = "") => ({ status: 0, stdout, stderr: "" });
  if (command === "docker") {
    if (args[0] === "info") return success("linux\\n");
    if (args[0] === "container" && args[1] === "inspect") return { status: 1, stdout: "", stderr: "" };
    if (args[0] === "run") {
      record("create-container");
      return success("fixture-container\\n");
    }
    if (args[0] === "exec" && args.includes("-i") && options.input?.includes("CONFIGURED:")) {
      record("configure-account");
      return success("CONFIGURED:1\\n");
    }
  }
  if (command === process.execPath && args[0].endsWith(path.join("scripts", "install-iris.mjs"))) {
    record("install-extension");
    return success("Install status: 1\\n");
  }
  throw new Error("Unexpected controlled setup process");
};
syncBuiltinESMExports();
globalThis.fetch = async (url, options = {}) => {
  const target = new URL(url);
  const authorization = new Headers(options.headers).get("Authorization");
  const event = { endpoint: target.pathname, authenticated: Boolean(authorization) };
  if (authorization) {
    const credential = JSON.parse(fs.readFileSync(path.join(process.env.WORKBENCH_STATE_DIR, "credentials.json"), "utf8"));
    event.credentialsMatched = authorization === "Basic " + Buffer.from(credential.user + ":" + credential.password).toString("base64");
    event.hasTimeout = options.signal instanceof AbortSignal;
    event.rejectsRedirects = options.redirect === "error";
  }
  fs.appendFileSync(process.env.SETUP_FIXTURE_TRACE, JSON.stringify(event) + "\\n");
  if (target.pathname === "/api/admin/info") {
    if (!authorization) return new Response("Authentication required", { status: 401 });
    const body = adminResponse.emptyBody ? null : typeof adminResponse.body === "string" ? adminResponse.body : JSON.stringify(adminResponse.body);
    return new Response(body, { status: adminResponse.status, headers: { "Content-Type": adminResponse.contentType || "application/json" } });
  }
  if (target.pathname === "/api/workbench/logs") {
    return Response.json({ available: true, lines: ["Controlled fixture message"] });
  }
  throw new Error("Unexpected fixture endpoint");
};
`);
  try {
    const result = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, path.join(root, "scripts/setup-local.mjs")], {
      cwd: directory,
      env: {
        ...process.env,
        IRIS_CONTAINER: "fixture-container",
        IRIS_PORT: "52773",
        WORKBENCH_STATE_DIR: state,
        SETUP_FIXTURE_TRACE: trace,
      },
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(result.error, undefined);
    const events = fs.readFileSync(trace, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const credential = JSON.parse(fs.readFileSync(path.join(state, "credentials.json"), "utf8"));
    assert.ok(!(result.stdout + result.stderr).includes(credential.password), "setup must not log the generated password");
    return {
      ...result,
      events,
      connection: fs.existsSync(path.join(state, "connection.json"))
        ? JSON.parse(fs.readFileSync(path.join(state, "connection.json"), "utf8"))
        : null,
      credentialPath: path.join(state, "credentials.json"),
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function assertAdminPreflight(result) {
  const adminRequests = result.events.filter((event) => event.endpoint === "/api/admin/info");
  assert.equal(adminRequests.length, 2, "setup must check readiness and authenticated admin access");
  assert.equal(adminRequests[0].authenticated, false);
  assert.equal(adminRequests[1].credentialsMatched, true, "admin check must use the generated credential");
  assert.equal(adminRequests[1].hasTimeout, true);
  assert.equal(adminRequests[1].rejectsRedirects, true);
}

for (const [shape, body] of [["direct", serverInfo], ["enveloped", { result: serverInfo }]]) {
  test(`local setup verifies ${shape} server info before installing extension or writing connection`, () => {
    const result = setupFixture({ status: 200, body });
    assert.equal(result.status, 0, result.stderr);
    assertAdminPreflight(result);
    const adminIndex = result.events.findIndex((event) => event.endpoint === "/api/admin/info" && event.authenticated);
    const installIndex = result.events.findIndex((event) => event.event === "install-extension");
    const logIndex = result.events.findIndex((event) => event.endpoint === "/api/workbench/logs");
    assert.ok(adminIndex < installIndex && installIndex < logIndex, "admin sign-in must pass before extension verification");
    assert.equal(result.events[logIndex].credentialsMatched, true);
    assert.deepEqual(result.connection, {
      IRIS_URL: "http://127.0.0.1:52773",
      IRIS_CREDENTIALS_FILE: result.credentialPath,
    });
    assert.match(result.stdout, /Local setup verified/);
  });
}

for (const status of [401, 403, 404]) {
  test(`local setup fails on admin HTTP ${status} despite extension being available`, () => {
    const result = setupFixture({ status, body: "<html>IRIS request rejected</html>", contentType: "text/html" });
    assert.equal(result.status, 1);
    assertAdminPreflight(result);
    assert.match(result.stderr, new RegExp(String(status)));
    assert.match(result.stderr, /\/api\/admin/);
    assert.equal(result.connection, null, "failed sign-in must not create a connection file");
    assert.equal(result.events.some((event) => event.event === "install-extension"), false);
    assert.equal(result.events.some((event) => event.endpoint === "/api/workbench/logs"), false);
    assert.doesNotMatch(result.stdout, /Local setup verified/);
  });
}

test("local setup rejects an HTML admin success response before writing connection", () => {
  const result = setupFixture({ status: 200, body: "<html>Proxy sign-in page</html>", contentType: "text/html" });
  assert.equal(result.status, 1);
  assertAdminPreflight(result);
  assert.match(result.stderr, /JSON/);
  assert.equal(result.connection, null);
  assert.equal(result.events.some((event) => event.event === "install-extension"), false);
  assert.doesNotMatch(result.stdout, /Local setup verified/);
});

for (const [description, body] of [
  ["null", null],
  ["array", []],
  ["empty object", {}],
  ["null result envelope", { result: null }],
  ["empty result envelope", { result: {} }],
  ["status-only envelope", { status: { code: 200 } }],
  ["missing username", { serverVersion: "IRIS 2026.2" }],
  ["missing server version", { username: "_SYSTEM" }],
  ["non-string username", { ...serverInfo, username: {} }],
  ["non-string server version", { result: { ...serverInfo, serverVersion: 2026.2 } }],
  ["blank username", { ...serverInfo, username: " \t" }],
  ["blank server version", { ...serverInfo, serverVersion: " \n" }],
]) {
  test(`local setup rejects admin info ${description} JSON before writing connection`, () => {
    const result = setupFixture({ status: 200, body });
    assert.equal(result.status, 1);
    assertAdminPreflight(result);
    assert.match(result.stderr, /server information object/);
    assert.equal(result.connection, null);
    assert.equal(result.events.some((event) => event.event === "install-extension"), false);
    assert.equal(result.events.some((event) => event.endpoint === "/api/workbench/logs"), false);
    assert.doesNotMatch(result.stdout, /Local setup verified/);
  });
}

for (const [description, response] of [
  ["zero-byte HTTP 200", { status: 200, body: "" }],
  ["null-body HTTP 200", { status: 200, emptyBody: true }],
  ["HTTP 204", { status: 204, emptyBody: true }],
]) {
  test(`local setup rejects admin info ${description} response before writing connection`, () => {
    const result = setupFixture(response);
    assert.equal(result.status, 1);
    assertAdminPreflight(result);
    assert.match(result.stderr, /\/api\/admin/);
    assert.match(result.stderr, /web port|gateway routing|SysAdmin API/);
    assert.equal(result.connection, null);
    assert.equal(result.events.some((event) => event.event === "install-extension"), false);
    assert.equal(result.events.some((event) => event.endpoint === "/api/workbench/logs"), false);
    assert.doesNotMatch(result.stdout, /Local setup verified/);
  });
}

test("invalid setup names and ports fail before writing state or starting Docker", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-invalid-"));
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"),
    );
    const state = path.join(directory, "state");
    for (const input of [
      { IRIS_CONTAINER: "invalid/name" },
      { IRIS_CONTAINER: "invalid name" },
      { IRIS_PORT: "80" },
      { IRIS_PORT: "65536" },
      { IRIS_PORT: "not-a-port" },
    ]) {
      const result = spawnSync(process.execPath, [path.join(root, "scripts/setup-local.mjs")], {
        cwd: directory,
        env: { ...env, PATH: directory, IRIS_CONTAINER: "valid-name", IRIS_PORT: "52773", WORKBENCH_STATE_DIR: state, ...input },
        encoding: "utf8",
        timeout: 5000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Invalid container name or port/);
      assert.equal(fs.existsSync(state), false);
    }
  } finally {
    fs.rmdirSync(directory);
  }
});

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
