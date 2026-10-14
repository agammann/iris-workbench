import { errorsOf, messageOf } from "./security.mjs";

export function irisOrigin(value) {
  const upstream = new URL(value);
  if (
    !["http:", "https:"].includes(upstream.protocol) ||
    upstream.username ||
    upstream.password ||
    upstream.pathname !== "/" ||
    upstream.search ||
    upstream.hash
  )
    throw Error("IRIS_URL must be an HTTP(S) origin without credentials, a path, query or fragment. Use the IRIS web port; do not append /api/admin.");
  if (
    upstream.protocol === "http:" &&
    !["localhost", "127.0.0.1", "[::1]", "iris"].includes(upstream.hostname)
  )
    throw Error("Remote IRIS connections require HTTPS");
  return upstream;
}

function httpError(status) {
  const hint = {
    401: "Check the username/password, that the account is enabled, and Password authentication on /api/admin. %ALL does not bypass authentication.",
    403: "The account needs the IRIS management privileges for this operation. Check its roles and the application's required resource.",
    404: "Check the IRIS web port, that /api/admin is enabled, and compatibility with the SysAdmin APIs verified on IRIS 2026.2.",
  }[status];
  return Object.assign(
    Error(`IRIS /api/admin returned HTTP ${status}.${hint ? " " + hint : ""}`),
    { upstreamStatus: status, status: [401, 403, 404].includes(status) ? status : 400 },
  );
}

export async function adminRequest(upstream, credentials, apiPath, method = "GET", payload) {
  let response;
  try {
    response = await fetch(new URL("/api/admin" + apiPath, upstream), {
      method,
      headers: {
        Authorization: "Basic " + Buffer.from(credentials.user + ":" + credentials.password).toString("base64"),
        "Content-Type": "application/json",
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch (cause) {
    throw Object.assign(
      Error("Could not reach IRIS /api/admin. Check IRIS_URL, the IRIS web port and TLS trust. Redirects are not supported."),
      { status: cause.name === "TimeoutError" ? 504 : 502 },
    );
  }
  // IRIS and Web Gateway may return an empty or HTML authentication error.
  // Preserve that status before attempting JSON parsing or reflecting a body.
  if (!response.ok && [401, 403, 404].includes(response.status)) {
    await response.body?.cancel().catch(() => {});
    throw httpError(response.status);
  }
  const chunks = [];
  let bytes = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 8 * 1024 * 1024) throw Error("IRIS response is too large");
      chunks.push(Buffer.from(chunk));
    }
  }
  const location = response.headers.get("location");
  const infoRequest = apiPath.split("?")[0] === "/info";
  if (bytes === 0) {
    if (!response.ok) throw httpError(response.status);
    // Successful writes may carry no representation, including HTTP 204 and
    // asynchronous acceptance with a polling Location. Reads still need JSON.
    if (!infoRequest && ["PUT", "POST", "DELETE"].includes(method))
      return { status: response.status, data: null, location };
    throw Object.assign(Error(`IRIS /api/admin${apiPath.split("?")[0]} returned HTTP ${response.status} without JSON data. Check the IRIS web port and gateway routing.`), { status: 502 });
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    if (!response.ok) throw httpError(response.status);
    throw Object.assign(Error(`IRIS /api/admin returned HTTP ${response.status} without valid JSON. Check the IRIS web port and gateway routing.`), { status: 502 });
  }
  if (!response.ok || errorsOf(data).length) {
    const error = httpError(response.status);
    error.message = messageOf(data) || error.message;
    throw error;
  }
  data = data && typeof data === "object" && Object.hasOwn(data, "result") ? data.result : data;
  if (infoRequest && (
    !data || typeof data !== "object" || Array.isArray(data) ||
    typeof data.username !== "string" || !data.username.trim() ||
    typeof data.serverVersion !== "string" || !data.serverVersion.trim()
  ))
    throw Object.assign(Error("IRIS /api/admin/info did not return a valid server information object with username and serverVersion. Check the IRIS web port and SysAdmin API compatibility."), { status: 502 });
  if (method === "GET" && data === null)
    throw Object.assign(Error(`IRIS /api/admin${apiPath.split("?")[0]} returned null JSON data. Check the IRIS web port and gateway routing.`), { status: 502 });
  return { status: response.status, data, location };
}
