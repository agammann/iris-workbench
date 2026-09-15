import { createHash } from "node:crypto";
export const isSensitive = (key) =>
  /password|privatekey|secret|token|hotp|totp/i.test(key) &&
  !/NeverExpires|ChangePassword|PrivateKeyFile|SecretType|TokenTimeout/.test(
    key,
  );
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      isSensitive(k) && typeof v !== "boolean" ? "[hidden]" : redact(v),
    ]),
  );
}
export function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function safePath(path, spec, method = "get") {
  if (
    typeof path !== "string" ||
    path.length > 4096 ||
    !path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("#")
  )
    throw Error("Invalid API path");
  const u = new URL(path, "http://iris.invalid");
  if (u.origin !== "http://iris.invalid" || /\.{2}|%2f|%5c/i.test(u.pathname))
    throw Error("Invalid API path");
  if (!spec.paths[u.pathname]?.[method])
    throw Error("This operation is not in the supplied API specification");
  if (
    /\/secrets?$|\/password$|\/initial-access-token$|\/client\/secret$/.test(
      u.pathname,
    ) &&
    method === "get"
  )
    throw Error("Secret retrieval is intentionally unavailable");
  const rowLimit = u.searchParams.get("maxRows");
  if (
    rowLimit !== null &&
    (!/^\d+$/.test(rowLimit) || Number(rowLimit) > 500 || Number(rowLimit) < 1)
  )
    throw Error("maxRows must be between 1 and 500");
  return u.pathname + u.search;
}
export function errorsOf(d) {
  const e = d?.status?.errors || d?.status?.Errors || [];
  return Array.isArray(e) ? e : [];
}
export function messageOf(d) {
  return errorsOf(d)
    .map((e) =>
      typeof e === "string" ? e : e.error || e.message || String(e.code),
    )
    .join("; ");
}
