import test from "node:test";
import assert from "node:assert/strict";
import { adminRequest, irisOrigin } from "../server/connection.mjs";

const origin = irisOrigin("http://127.0.0.1:52773");
const credentials = { user: "operator", password: "controlled-test-password" };

test("IRIS_URL rejects silently discarded paths and invalid connection origins", () => {
  for (const value of [
    "http://127.0.0.1:52773/api/admin",
    "https://iris.example/iris/",
    "https://iris.example/?namespace=USER",
    "https://iris.example/#instance",
    "https://user:password@iris.example",
    "file:///tmp/iris",
  ]) assert.throws(() => irisOrigin(value), /HTTP\(S\) origin/);
  assert.throws(() => irisOrigin("http://iris.example:52773"), /require HTTPS/);
  assert.equal(irisOrigin("https://iris.example:52773/").origin, "https://iris.example:52773");
  assert.equal(irisOrigin("http://[::1]:52773").origin, "http://[::1]:52773");
});

test("sign-in checks the actual admin endpoint with Basic auth and rejects redirects", async (t) => {
  const info = { username: "operator", serverVersion: "IRIS 2026.2", apiVersion: 2 };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.href, "http://127.0.0.1:52773/api/admin/info");
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Basic " + Buffer.from("operator:controlled-test-password").toString("base64"));
    assert.equal(options.signal.aborted, false);
    return Response.json({ result: info });
  });
  const response = await adminRequest(origin, credentials, "/info");
  assert.equal(response.status, 200);
  assert.deepEqual(response.data, info);
});

test("empty, HTML and JSON auth failures retain the upstream status and actionable diagnostics", async (t) => {
  for (const status of [401, 403, 404]) {
    for (const body of ["", "<html>controlled sensitive body</html>", '{"status":{"errors":["controlled sensitive body"]}}']) {
      const mocked = t.mock.method(globalThis, "fetch", async () => new Response(body, { status }));
      try {
        await assert.rejects(adminRequest(origin, credentials, "/info"), (error) => {
          assert.equal(error.status, status);
          assert.equal(error.upstreamStatus, status);
          assert.match(error.message, new RegExp(`HTTP ${status}`));
          assert.match(error.message, /\/api\/admin/);
          if (status === 401) assert.match(error.message, /Password authentication/);
          assert.doesNotMatch(error.message, /controlled sensitive body|controlled-test-password|Basic /);
          return true;
        });
      } finally { mocked.mock.restore(); }
    }
  }
});

test("JSON validation errors preserve existing behavior", async (t) => {
  const mocked = t.mock.method(globalThis, "fetch", async () => Response.json({ status: { errors: [{ message: "Invalid task configuration" }] } }, { status: 400 }));
  await assert.rejects(adminRequest(origin, credentials, "/v2/task", "PUT", {}), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.upstreamStatus, 400);
    assert.equal(error.message, "Invalid task configuration");
    return true;
  });
  mocked.mock.restore();
});

test("a rejected error-body cancellation cannot hide the upstream auth status", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    cancel() { throw Error("controlled cancellation error"); },
  }), { status: 401 }));
  await assert.rejects(adminRequest(origin, credentials, "/info"), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.upstreamStatus, 401);
    return true;
  });
});

test("successful non-JSON or malformed info cannot establish a connection", async (t) => {
  for (const body of [
    "", "   ", "<html>wrong web server</html>", "null", "[]", "{}",
    '{"result":[]}', '{"result":null}', '{"result":{}}', '{"status":{"errors":[]}}',
    '{"username":"operator"}', '{"serverVersion":"IRIS 2026.2"}',
    '{"username":" ","serverVersion":"IRIS 2026.2"}',
    '{"username":"operator","serverVersion":null}',
    '{"username":17,"serverVersion":"IRIS 2026.2"}',
  ]) {
    const mocked = t.mock.method(globalThis, "fetch", async () => new Response(body));
    try {
      await assert.rejects(adminRequest(origin, credentials, "/info"), (error) => {
        assert.equal(error.status, 502);
        assert.match(error.message, /JSON|server information object/);
        return true;
      });
    } finally { mocked.mock.restore(); }
  }
});

test("no-content sign-in and read responses reject with a protocol error", async (t) => {
  for (const apiPath of ["/info", "/info?probe=1", "/v2/web-apps"]) {
    const mocked = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
    try {
      await assert.rejects(adminRequest(origin, credentials, apiPath), (error) => {
        assert.equal(error.status, 502);
        assert.match(error.message, /without JSON data/);
        assert.doesNotMatch(error.message, /Symbol|asyncIterator/);
        return true;
      });
    } finally { mocked.mock.restore(); }
  }
});

test("valid direct and enveloped server information is accepted", async (t) => {
  const info = { username: "operator", serverVersion: "IRIS 2026.2", apiVersion: 2 };
  for (const body of [info, { result: info }]) {
    const mocked = t.mock.method(globalThis, "fetch", async () => Response.json(body));
    try { assert.deepEqual((await adminRequest(origin, credentials, "/info")).data, info); }
    finally { mocked.mock.restore(); }
  }
});

test("empty successful writes preserve status and async polling location", async (t) => {
  for (const method of ["PUT", "POST", "DELETE"]) {
    for (const status of [200, 202, 204, 205]) {
      const location = "/api/admin/v2/async-result?id=empty-response";
      const mocked = t.mock.method(globalThis, "fetch", async () => new Response(null, { status, headers: { Location: location } }));
      try {
        const response = await adminRequest(origin, credentials, "/v2/web-app?name=%2Ffixture", method);
        assert.equal(response.status, status);
        assert.equal(response.data, null);
        assert.equal(response.location, location);
      } finally { mocked.mock.restore(); }
    }
  }
});

test("empty HTTP failures and malformed nonempty write responses are not accepted", async (t) => {
  for (const [status, body, expected] of [[400, null, 400], [500, null, 400], [200, "<html>wrong server</html>", 502], [200, " ", 502]]) {
    const mocked = t.mock.method(globalThis, "fetch", async () => new Response(body, { status }));
    try {
      await assert.rejects(adminRequest(origin, credentials, "/v2/web-app?name=%2Ffixture", "DELETE"), (error) => {
        assert.equal(error.status, expected);
        return true;
      });
    } finally { mocked.mock.restore(); }
  }
});

test("network and redirect failures return a connection diagnostic without credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw Error("controlled-test-password"); });
  await assert.rejects(adminRequest(origin, credentials, "/info"), (error) => {
    assert.equal(error.status, 502);
    assert.match(error.message, /IRIS_URL.*web port.*TLS trust.*Redirects/);
    assert.doesNotMatch(error.message, /controlled-test-password/);
    return true;
  });
});

test("management reads still accept lists and retain async polling locations", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ result: [] }, { status: 202, headers: { Location: "/api/admin/v2/async-result?id=example" } }));
  const response = await adminRequest(origin, credentials, "/v2/security/audit/records", "POST");
  assert.equal(response.status, 202);
  assert.deepEqual(response.data, []);
  assert.equal(response.location, "/api/admin/v2/async-result?id=example");
});
