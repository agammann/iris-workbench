import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import {
  redact,
  fingerprint,
  safePath,
  errorsOf,
  messageOf,
} from "./security.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(
  fs.readFileSync(path.join(root, "server/spec.json"), "utf8"),
);
// The verified 2026.2 implementation names this field ServerDefinition.
const oauthFields = spec.components.schemas.OAuth2Client.properties;
oauthFields.ServerDefinition = oauthFields.OAuth2ServerDefinition;
delete oauthFields.OAuth2ServerDefinition;
const upstream = new URL(process.env.IRIS_URL || "http://127.0.0.1:52773");
if (
  !["http:", "https:"].includes(upstream.protocol) ||
  upstream.username ||
  upstream.password
)
  throw Error("IRIS_URL must be an HTTP(S) origin without credentials");
if (
  upstream.protocol === "http:" &&
  !["localhost", "127.0.0.1", "[::1]", "iris"].includes(upstream.hostname)
)
  throw Error("Remote IRIS connections require HTTPS");
const port = Number(process.env.PORT || 3411),
  sessions = new Map(),
  pending = new Map();
const allowedOrigins = new Set([
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
};
async function body(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.byteLength;
    if (bytes > 128 * 1024) throw Error("Request exceeds 128 KB");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
async function iris(s, p, method = "GET", payload) {
  const r = await fetch(new URL("/api/admin" + p, upstream), {
    method,
    headers: {
      Authorization:
        "Basic " + Buffer.from(s.user + ":" + s.password).toString("base64"),
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const chunks = [];
  let bytes = 0;
  for await (const chunk of r.body) {
    bytes += chunk.byteLength;
    if (bytes > 8 * 1024 * 1024) throw Error("IRIS response is too large");
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    throw Error(`IRIS returned HTTP ${r.status} without JSON`);
  }
  if (!r.ok || errorsOf(d).length) {
    const err = Error(messageOf(d) || `IRIS returned HTTP ${r.status}`);
    err.upstreamStatus = r.status;
    err.status = [401, 403, 404].includes(r.status) ? r.status : 400;
    throw err;
  }
  return {
    status: r.status,
    data: d.result ?? d,
    location: r.headers.get("location"),
  };
}
async function asyncQuery(s, p) {
  const start = await iris(s, p, "POST");
  if (start.status !== 202) return start.data;
  const u = new URL(start.location, upstream);
  if (
    u.origin !== upstream.origin ||
    !/^\/api\/admin\/v[12]\/async-result$/.test(u.pathname)
  )
    throw Error("IRIS supplied an invalid polling location");
  for (let i = 0; i < 35; i++) {
    const next = await iris(s, u.pathname.replace("/api/admin", "") + u.search);
    const d = next.data;
    if (d.State === "Finished") {
      if (d.FailureReason) throw Error(String(d.FailureReason));
      return d.Result ?? [];
    }
    if (["Failed", "Cancelled", "Error"].includes(d.State))
      throw Error(d.FailureReason || "IRIS operation failed");
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("The query is still running. Narrow the time range and retry.");
}
async function extension(s, path, params = {}) {
  const r = await fetch(
    new URL(
      "/api/workbench/" + path + "?" + new URLSearchParams(params),
      upstream,
    ),
    {
      headers: {
        Authorization:
          "Basic " + Buffer.from(s.user + ":" + s.password).toString("base64"),
      },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!r.ok) {
    const error = Error(
      `Runtime extension returned HTTP ${r.status}. Check the installation and your IRIS permissions.`,
    );
    error.status = [401, 403].includes(r.status) ? r.status : 400;
    throw error;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of r.body) {
    bytes += chunk.byteLength;
    if (bytes > 8 * 1024 * 1024) throw Error("Runtime response is too large");
    chunks.push(Buffer.from(chunk));
  }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (data.error) throw Error(data.error);
  return data;
}
function session(req) {
  const id = (req.headers.cookie || "").match(
    /(?:^|; )workbench=([a-f0-9]{64})(?:;|$)/,
  )?.[1];
  const s = sessions.get(id);
  if (!s || s.expires < Date.now()) {
    if (id) sessions.delete(id);
    return null;
  }
  return { ...s, id };
}
function routeAllowed(req) {
  let h;
  try {
    h = new URL("http://" + req.headers.host).hostname;
  } catch {
    return false;
  }
  return (
    ["127.0.0.1", "localhost", "[::1]"].includes(h) &&
    (!req.headers.origin || allowedOrigins.has(req.headers.origin)) &&
    (!req.headers["sec-fetch-site"] ||
      ["same-origin", "none"].includes(req.headers["sec-fetch-site"])) &&
    req.headers["x-workbench"] === "1"
  );
}
const writePaths = new Set([
  "/v2/web-app",
  "/v2/security/user",
  "/v2/security/role",
  "/v2/security/resource",
  "/v2/wallet/collection",
  "/v2/wallet/secret",
  "/v2/security/x509-credential",
  "/v2/security/ssl-configuration",
  "/v2/security/oauth2/client/server-definition",
  "/v2/security/oauth2/client/client-configuration",
  "/v2/task",
  "/v2/task/run",
  "/v2/task/resume",
  "/v2/task/suspend",
  "/v2/process/resume",
  "/v2/process/suspend",
]);
function checkWrite(p, method, s) {
  safePath(p, spec, method.toLowerCase());
  const u = new URL(p, "http://iris.invalid");
  if (!writePaths.has(u.pathname))
    throw Error("This operation is not enabled for writes");
  if (
    u.pathname === "/v2/web-app" &&
    ["/api/admin", "/api/workbench", "/csp/sys"].some((x) =>
      (u.searchParams.get("name") || "").startsWith(x),
    )
  )
    throw Error("The portal protects its own management applications");
  if (
    u.pathname === "/v2/security/user" &&
    u.searchParams.get("name")?.toLowerCase() === s.user.toLowerCase()
  )
    throw Error("Use another administrator to change the connected account");
}
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    if (!u.pathname.startsWith("/api/")) {
      let rel = decodeURIComponent(u.pathname);
      let f = path.resolve(root, "dist/client", "." + rel);
      if (
        !f.startsWith(path.join(root, "dist/client") + path.sep) ||
        !fs.existsSync(f) ||
        fs.statSync(f).isDirectory()
      )
        f = path.join(root, "dist/client/index.html");
      if (!fs.existsSync(f)) {
        res.writeHead(404);
        res.end("Build the client first.");
        return;
      }
      const ext = path.extname(f);
      res.writeHead(200, {
        "Content-Type":
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".woff2": "font/woff2",
            ".png": "image/png",
          }[ext] || "application/octet-stream",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      });
      fs.createReadStream(f).pipe(res);
      return;
    }
    if (!routeAllowed(req)) {
      json(res, 403, {
        error:
          "Open this portal on its local address. Cross origin requests are not allowed.",
      });
      return;
    }
    if (u.pathname === "/api/session" && req.method === "GET") {
      const s = session(req);
      json(res, 200, {
        connected: !!s,
        user: s?.user,
        info: s?.info,
        configured: !!process.env.IRIS_CREDENTIALS_FILE,
        instance: upstream.host,
      });
      return;
    }
    if (u.pathname === "/api/session" && req.method === "POST") {
      if (sessions.size > 50)
        throw Error("Too many sessions. Restart the local server.");
      const input = await body(req);
      let c = input;
      if (input.configured) {
        if (!process.env.IRIS_CREDENTIALS_FILE)
          throw Error("No local credential file configured");
        c = JSON.parse(
          fs.readFileSync(process.env.IRIS_CREDENTIALS_FILE, "utf8"),
        );
      }
      if (!c.user || !c.password) throw Error("Enter a username and password");
      const info = await iris(c, "/info");
      const id = randomBytes(32).toString("hex");
      sessions.set(id, {
        user: c.user,
        password: c.password,
        info: info.data,
        expires: Date.now() + 3600000,
        history: [],
      });
      res.setHeader(
        "Set-Cookie",
        `workbench=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
      );
      json(res, 200, {
        connected: true,
        user: c.user,
        info: info.data,
        instance: upstream.host,
        configured: !!process.env.IRIS_CREDENTIALS_FILE,
      });
      return;
    }
    const s = session(req);
    if (!s) {
      json(res, 401, { error: "Connect to IRIS to continue." });
      return;
    }
    if (u.pathname === "/api/session" && req.method === "DELETE") {
      sessions.delete(s.id);
      for (const [id, p] of pending) if (p.session === s.id) pending.delete(id);
      res.setHeader(
        "Set-Cookie",
        "workbench=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      );
      json(res, 200, { ok: true });
      return;
    }
    if (u.pathname === "/api/schema") {
      json(res, 200, { paths: spec.paths, components: spec.components });
      return;
    }
    if (
      ["/api/system", "/api/log-sources"].includes(u.pathname) &&
      req.method === "GET"
    ) {
      const data = await extension(
        s,
        u.pathname === "/api/system" ? "system" : "log-sources",
      );
      json(res, 200, { data, at: new Date().toISOString() });
      return;
    }
    if (u.pathname === "/api/history") {
      json(res, 200, s.history);
      return;
    }
    if (u.pathname === "/api/read" && req.method === "POST") {
      const { path: p } = await body(req);
      const result = await iris(s, safePath(p, spec));
      json(res, 200, {
        data: redact(result.data),
        at: new Date().toISOString(),
      });
      return;
    }
    if (u.pathname === "/api/logs" && req.method === "POST") {
      const b = await body(req);
      let data;
      if (b.source === "audit") {
        const params = new URLSearchParams({ maxRows: "200", ascending: "0" });
        if (b.start) params.set("startDateTime", b.start);
        if (b.end) params.set("endDateTime", b.end);
        data = await asyncQuery(s, "/v2/security/audit/records?" + params);
      } else if (b.source === "journal") {
        if (!b.file) throw Error("Select a journal file");
        data = await asyncQuery(
          s,
          "/v2/journal/file/records?" +
            new URLSearchParams({ file: b.file, maxRows: "200", reverse: "1" }),
        );
      } else if (b.source === "tasks") {
        data = (await iris(s, "/v2/task/history?maxRows=200")).data;
      } else {
        data = await extension(s, "logs", {
          source: b.source || "messages",
          file: b.file || "",
          cursor: b.cursor || "",
        });
      }
      json(res, 200, { data: redact(data), at: new Date().toISOString() });
      return;
    }
    if (u.pathname === "/api/prepare" && req.method === "POST") {
      const b = await body(req);
      const method = String(b.method || "PUT").toUpperCase();
      if (!["PUT", "POST", "DELETE"].includes(method))
        throw Error("Invalid write method");
      checkWrite(b.path, method, s);
      let before = null;
      if (b.readPath) {
        before = (await iris(s, safePath(b.readPath, spec))).data;
      }
      for (const [id, p] of pending)
        if (p.expires < Date.now()) pending.delete(id);
      if (pending.size > 100) throw Error("Too many pending changes");
      const id = randomBytes(24).toString("hex");
      const item = {
        session: s.id,
        path: b.path,
        method,
        payload: b.payload,
        readPath: b.readPath,
        before,
        hash: fingerprint(before),
        expires: Date.now() + 120000,
        label: String(b.label || "Configuration change").slice(0, 120),
      };
      pending.set(id, item);
      json(res, 200, {
        id,
        path: item.path,
        method,
        before: redact(before),
        proposed: redact(b.payload ?? {}),
        expires: item.expires,
        instance: upstream.host,
        label: item.label,
      });
      return;
    }
    if (u.pathname === "/api/apply" && req.method === "POST") {
      const { id } = await body(req);
      const p = pending.get(id);
      if (!p || p.session !== s.id || p.expires < Date.now())
        throw Error("This review expired. Review the change again.");
      pending.delete(id);
      checkWrite(p.path, p.method, s);
      if (p.readPath) {
        const now = (await iris(s, safePath(p.readPath, spec))).data;
        if (fingerprint(now) !== p.hash) {
          json(res, 409, {
            error:
              "The object changed since review. Refresh it and review again.",
          });
          return;
        }
      }
      const r = await iris(s, p.path, p.method, p.payload);
      let after = null,
        verification = "IRIS accepted the operation";
      if (p.readPath && p.method !== "DELETE") {
        try {
          after = (await iris(s, p.readPath)).data;
          const fields =
            p.payload && p.method === "PUT" ? Object.keys(p.payload) : [];
          verification =
            fields.length &&
            fields.every(
              (k) => JSON.stringify(after[k]) === JSON.stringify(p.payload[k]),
            )
              ? "Changed fields verified from IRIS"
              : "Read back from IRIS; inspect the resulting state";
        } catch {
          verification =
            "Accepted, but readback failed. Refresh to verify the result";
        }
      }
      if (p.method === "DELETE" && p.readPath) {
        try {
          await iris(s, p.readPath);
          verification = "Delete accepted; object still returned by IRIS";
        } catch (e) {
          verification =
            e.upstreamStatus === 404
              ? "Deletion verified: object no longer exists"
              : "Delete accepted; verification unavailable";
        }
      }
      const entry = {
        at: new Date().toISOString(),
        label: p.label,
        path: p.path,
        method: p.method,
        status: r.status,
        verification,
      };
      s.history.unshift(entry);
      s.history.splice(50);
      json(res, 200, { ...entry, after: redact(after), location: r.location });
      return;
    }
    json(res, 404, { error: "Unknown portal endpoint" });
  } catch (e) {
    json(res, e.status || 400, { error: e.message || "Request failed" });
  }
});
setInterval(() => {
  for (const [id, s] of sessions)
    if (s.expires < Date.now()) sessions.delete(id);
  for (const [id, p] of pending) if (p.expires < Date.now()) pending.delete(id);
}, 30000).unref();
server.listen(port, process.env.BIND_HOST || "127.0.0.1", () =>
  console.log(`IRIS Workbench server listening at http://127.0.0.1:${port}`),
);
