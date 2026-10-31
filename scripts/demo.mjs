import { readConnection, readPrivateJson } from "../server/private-state.mjs";
import { irisOrigin, isLiteralLoopback } from "../server/connection.mjs";
const action = process.argv[2] || "check";
const stateDir = process.argv[3];
const connection = stateDir
  ? readConnection(stateDir)
  : process.env;
const instance = irisOrigin(connection.IRIS_URL || "http://127.0.0.1:52773");
if (!isLiteralLoopback(instance.hostname))
  throw Error("Demo operations are limited to a local IRIS instance");
const portalUrl = irisOrigin(process.env.WORKBENCH_URL || "http://127.0.0.1:3411");
if (!isLiteralLoopback(portalUrl.hostname))
  throw Error("Demo portal must be local");
const portal = portalUrl.origin;
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
if (!connection.IRIS_CREDENTIALS_FILE)
  throw Error("Supply the private state directory or IRIS_CREDENTIALS_FILE to run the demonstration");
const credentials = readPrivateJson(connection.IRIS_CREDENTIALS_FILE);
await api("session", { configured: true, password: credentials.password });
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
  const r = await fetch(new URL("/workbench-demo/status", instance), {
    headers: {
      Authorization:
        "Basic " + Buffer.from(credentials.user + ":" + credentials.password).toString("base64"),
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
