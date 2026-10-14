import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Readable } from "node:stream";

// Exercise the actual request handler with controlled upstream responses.
// No listening socket or live IRIS instance is used by these fixtures.
async function portal(t) {
  let handler;
  t.mock.method(http, "createServer", (callback) => {
    handler = callback;
    return { listen() {} };
  });
  const url = new URL("../server/index.mjs", import.meta.url);
  url.searchParams.set("fixture", t.name);
  const originalUrl = process.env.IRIS_URL;
  const originalPort = process.env.PORT;
  process.env.IRIS_URL = "http://127.0.0.1:52773";
  process.env.PORT = "3411";
  try { await import(url.href); }
  finally {
    if (originalUrl === undefined) delete process.env.IRIS_URL;
    else process.env.IRIS_URL = originalUrl;
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  }
  return async (url, method, body, cookie) => {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(request, {
      url, method,
      headers: { host: "127.0.0.1:3411", "x-workbench": "1", ...(cookie ? { cookie } : {}) },
    });
    const result = { headers: {} };
    const response = {
      setHeader(key, value) { result.headers[key] = value; },
      writeHead(status, headers) { result.status = status; Object.assign(result.headers, headers); },
      end(text) { result.body = JSON.parse(text); },
    };
    await handler(request, response);
    return result;
  };
}

test("sign-in preserves an empty upstream 401 and creates no session", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  const request = await portal(t);
  const result = await request("/api/session", "POST", { user: "operator", password: "fixture-password" });
  assert.equal(result.status, 401);
  assert.match(result.body.error, /\/api\/admin returned HTTP 401.*Password authentication/);
  assert.doesNotMatch(result.body.error, /fixture-password/);
  assert.equal(result.headers["Set-Cookie"], undefined);
  const session = await request("/api/session", "GET");
  assert.equal(session.body.connected, false);
  const disconnected = await request("/api/schema", "GET");
  assert.equal(disconnected.status, 401);
  assert.equal(disconnected.body.error, "Connect to IRIS to continue.");
});

const serverInfo = { username: "operator", serverVersion: "IRIS 2026.2", apiVersion: 2 };

for (const [shape, body] of [["direct", serverInfo], ["enveloped", { result: serverInfo }]]) {
  test(`a valid ${shape} login establishes a session and live reads retain upstream rejection status`, async (t) => {
    t.mock.method(globalThis, "fetch", async (url) => url.pathname === "/api/admin/info"
      ? Response.json(body)
      : new Response("<html>Authentication rejected</html>", { status: 401 }));
    const request = await portal(t);
    const login = await request("/api/session", "POST", { user: "operator", password: "fixture-password" });
    assert.equal(login.status, 200);
    assert.equal(login.body.connected, true);
    assert.equal(login.body.user, "operator");
    assert.deepEqual(login.body.info, serverInfo);
    assert.equal(login.body.password, undefined);
    const cookie = login.headers["Set-Cookie"].split(";")[0];
    const session = await request("/api/session", "GET", undefined, cookie);
    assert.equal(session.body.connected, true);
    const read = await request("/api/read", "POST", { path: "/v2/web-apps" }, cookie);
    assert.equal(read.status, 401);
    assert.match(read.body.error, /IRIS \/api\/admin returned HTTP 401/);
    const logout = await request("/api/session", "DELETE", undefined, cookie);
    assert.equal(logout.status, 200);
    assert.equal((await request("/api/session", "GET", undefined, cookie)).body.connected, false);
  });
}

for (const [description, response] of [
  ["empty HTTP 200 body", () => new Response("")],
  ["null HTTP 200 body", () => new Response(null)],
  ["HTTP 204 response", () => new Response(null, { status: 204 })],
  ["empty JSON object", () => Response.json({})],
  ["null result envelope", () => Response.json({ result: null })],
  ["empty result envelope", () => Response.json({ result: {} })],
  ["status-only envelope", () => Response.json({ status: { code: 200 } })],
  ["missing server version", () => Response.json({ username: "operator" })],
  ["missing username", () => Response.json({ serverVersion: "IRIS 2026.2" })],
  ["non-string username", () => Response.json({ ...serverInfo, username: {} })],
  ["non-string server version", () => Response.json({ result: { ...serverInfo, serverVersion: 2026.2 } })],
  ["blank username", () => Response.json({ ...serverInfo, username: " \t" })],
  ["blank server version", () => Response.json({ ...serverInfo, serverVersion: " \n" })],
]) {
  test(`sign-in rejects ${description} and creates no session`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => response());
    const request = await portal(t);
    const result = await request("/api/session", "POST", { user: "operator", password: "fixture-password" });
    assert.equal(result.status, 502);
    assert.match(result.body.error, /\/api\/admin/);
    assert.match(result.body.error, /web port|gateway routing|SysAdmin API/);
    assert.doesNotMatch(result.body.error, /fixture-password/);
    assert.equal(result.headers["Set-Cookie"], undefined);
    assert.equal((await request("/api/session", "GET")).body.connected, false);
    assert.equal((await request("/api/schema", "GET")).status, 401);
  });
}

for (const [description, response] of [
  ["empty HTTP 204 response", () => new Response(null, { status: 204 })],
  ["null JSON body", () => Response.json(null)],
  ["null result envelope", () => Response.json({ result: null })],
]) test(`a connected live read rejects ${description}`, async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => url.pathname === "/api/admin/info"
    ? Response.json(serverInfo)
    : response());
  const request = await portal(t);
  const login = await request("/api/session", "POST", { user: "operator", password: "fixture-password" });
  assert.equal(login.status, 200);
  const cookie = login.headers["Set-Cookie"].split(";")[0];
  const read = await request("/api/read", "POST", { path: "/v2/web-apps" }, cookie);
  assert.equal(read.status, 502);
  assert.match(read.body.error, /\/api\/admin/);
  assert.match(read.body.error, /web port|gateway routing|SysAdmin API/);
});

test("audit and journal queries reject empty HTTP 200 results", async (t) => {
  const queries = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.pathname === "/api/admin/info") return Response.json(serverInfo);
    queries.push({ path: url.pathname, method: options.method });
    return new Response(null);
  });
  const request = await portal(t);
  const login = await request("/api/session", "POST", { user: "operator", password: "fixture-password" });
  assert.equal(login.status, 200);
  const cookie = login.headers["Set-Cookie"].split(";")[0];
  for (const body of [{ source: "audit" }, { source: "journal", file: "fixture.jrn" }]) {
    const logs = await request("/api/logs", "POST", body, cookie);
    assert.equal(logs.status, 502);
    assert.match(logs.body.error, /empty query result.*polling response/);
    assert.equal(logs.body.data, undefined);
  }
  assert.deepEqual(queries, [
    { path: "/api/admin/v2/security/audit/records", method: "POST" },
    { path: "/api/admin/v2/journal/file/records", method: "POST" },
  ]);
});

test("an empty HTTP 202 query acceptance polls for a completed empty result", async (t) => {
  const queries = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.pathname === "/api/admin/info") return Response.json(serverInfo);
    queries.push({ path: url.pathname, method: options.method });
    if (url.pathname === "/api/admin/v2/security/audit/records")
      return new Response(null, { status: 202, headers: { Location: "/api/admin/v2/async-result?id=fixture" } });
    assert.equal(url.pathname, "/api/admin/v2/async-result");
    assert.equal(url.search, "?id=fixture");
    return Response.json({ result: { State: "Finished", Result: [] } });
  });
  const request = await portal(t);
  const login = await request("/api/session", "POST", { user: "operator", password: "fixture-password" });
  assert.equal(login.status, 200);
  const cookie = login.headers["Set-Cookie"].split(";")[0];
  const logs = await request("/api/logs", "POST", { source: "audit" }, cookie);
  assert.equal(logs.status, 200);
  assert.deepEqual(logs.body.data, []);
  assert.deepEqual(queries, [
    { path: "/api/admin/v2/security/audit/records", method: "POST" },
    { path: "/api/admin/v2/async-result", method: "GET" },
  ]);
});

test("a null polling result is a protocol error rather than a property-access error", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.pathname === "/api/admin/info") return Response.json(serverInfo);
    if (url.pathname === "/api/admin/v2/security/audit/records")
      return new Response(null, { status: 202, headers: { Location: "/api/admin/v2/async-result?id=fixture" } });
    return Response.json({ result: null });
  });
  const request = await portal(t);
  const login = await request("/api/session", "POST", { user: "operator", password: "fixture-password" });
  const cookie = login.headers["Set-Cookie"].split(";")[0];
  const logs = await request("/api/logs", "POST", { source: "audit" }, cookie);
  assert.equal(logs.status, 502);
  assert.match(logs.body.error, /null JSON data/);
  assert.doesNotMatch(logs.body.error, /Cannot read properties|State/);
});
