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

test("a valid login establishes a session and live reads retain upstream rejection status", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => url.pathname === "/api/admin/info"
    ? Response.json({ result: { username: "operator", serverVersion: "IRIS 2026.2" } })
    : new Response("<html>Authentication rejected</html>", { status: 401 }));
  const request = await portal(t);
  const login = await request("/api/session", "POST", { user: "operator", password: "fixture-password" });
  assert.equal(login.status, 200);
  assert.equal(login.body.connected, true);
  assert.equal(login.body.user, "operator");
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
