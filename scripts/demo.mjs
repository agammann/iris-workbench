import fs from "node:fs";
import path from "node:path";
const action = process.argv[2] || "check";
const stateDir = process.argv[3];
const connection = stateDir
  ? JSON.parse(fs.readFileSync(path.join(stateDir, "connection.json"), "utf8"))
  : process.env;
const instance = new URL(connection.IRIS_URL || "http://127.0.0.1:52773");
if (!["127.0.0.1", "localhost", "[::1]"].includes(instance.hostname))
  throw Error("Demo operations are limited to a local IRIS instance");
const portal = process.env.WORKBENCH_URL || "http://127.0.0.1:3411";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(portal).hostname))
  throw Error("Demo portal must be local");
let cookie = "";
async function api(endpoint, body) {
  const r = await fetch(portal + "/api/" + endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Workbench": "1",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  cookie = r.headers.get("set-cookie")?.split(";")[0] || cookie;
  const result = await r.json();
  if (!r.ok) throw Object.assign(Error(result.error), { status: r.status });
  return result;
}
async function change(method, payload) {
  const p = "/v2/web-app?name=%2Fworkbench-demo";
  const review = await api("prepare", {
    path: p,
    method,
    payload,
    readPath: action === "setup" ? undefined : p,
    label: "Workbench demonstration " + action,
  });
  return api("apply", { id: review.id });
}
if (!["setup", "check", "cleanup"].includes(action))
  throw Error("Use setup, check or cleanup");
await api("session", { configured: true });
const p = "/v2/web-app?name=%2Fworkbench-demo";
let existing;
try {
  existing = (await api("read", { path: p })).data;
} catch (e) {
  if (e.status !== 404) throw e;
}
if (action === "setup") {
  if (existing)
    throw Error("/workbench-demo already exists. Refusing to overwrite it.");
  await change("PUT", {
    NameSpace: "%SYS",
    Enabled: false,
    AutheEnabled: 32,
    DispatchClass: "Workbench.DemoREST",
    Description: "Disposable IRIS Workbench demonstration",
    Resource: "%Admin_Operate",
  });
  console.log(
    "Created /workbench-demo disabled. Open Apps in Workbench, select it, enable it and review the change.",
  );
} else if (action === "cleanup") {
  if (!existing) {
    console.log("Demonstration application is already absent.");
  } else {
    if (
      existing.DispatchClass !== "Workbench.DemoREST" ||
      existing.Description !== "Disposable IRIS Workbench demonstration"
    )
      throw Error("Application identity differs; refusing cleanup");
    console.log((await change("DELETE")).verification);
  }
} else {
  if (!connection.IRIS_CREDENTIALS_FILE)
    throw Error(
      "Supply the private state directory or IRIS_CREDENTIALS_FILE to check the actual endpoint",
    );
  const c = JSON.parse(
    fs.readFileSync(connection.IRIS_CREDENTIALS_FILE, "utf8"),
  );
  const r = await fetch(new URL("/workbench-demo/status", instance), {
    headers: {
      Authorization:
        "Basic " + Buffer.from(c.user + ":" + c.password).toString("base64"),
    },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  const contentType = r.headers.get("content-type") || "";
  const result = contentType.includes("json")
    ? await r.json()
    : { message: "IRIS did not return the demonstration service" };
  console.log(
    JSON.stringify(
      {
        url: new URL("/workbench-demo/status", instance).href,
        httpStatus: r.status,
        configurationEnabled: existing?.Enabled ?? null,
        result,
      },
      null,
      2,
    ),
  );
}
