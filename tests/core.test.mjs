import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  redact,
  safePath,
  fingerprint,
  errorsOf,
} from "../server/security.mjs";
const spec = JSON.parse(
  fs.readFileSync(new URL("../server/spec.json", import.meta.url)),
);
test("review redacts nested credentials but preserves security flags", () => {
  const result = redact({
    Password: "private",
    Enabled: true,
    CSRFToken: true,
    Metadata: { client_secret: "private", issuer: "https://example.invalid" },
    HasPrivateKey: true,
  });
  assert.equal(result.Password, "[hidden]");
  assert.equal(result.Metadata.client_secret, "[hidden]");
  assert.equal(result.Metadata.issuer, "https://example.invalid");
  assert.equal(result.CSRFToken, true);
  assert.equal(result.HasPrivateKey, true);
});
test("API path validation rejects origin escape, traversal and undocumented paths", () => {
  for (const p of [
    "//evil.invalid/v2/web-apps",
    "https://evil.invalid",
    "/v2/%2fweb-apps",
    "/v2/../../secrets",
    "/v2/missing",
    "/v2/web-apps#ignored",
  ])
    assert.throws(() => safePath(p, spec));
  assert.equal(
    safePath("/v2/web-app?name=%2Fapi%2Fsample", spec),
    "/v2/web-app?name=%2Fapi%2Fsample",
  );
});
test("secret read endpoints stay inaccessible through explorer", () => {
  for (const p of [
    "/v2/security/oauth2/client/client-configuration/secrets",
    "/v2/security/oauth2/server/client/secret",
  ])
    assert.throws(() => safePath(p, spec));
});
test("wallet names and types can be listed without retrieving secret values", () => {
  assert.equal(
    safePath("/v2/wallet/secrets?collection=Example", spec),
    "/v2/wallet/secrets?collection=Example",
  );
  const fields = spec.components.schemas.WalletSecretList.items.properties;
  assert.deepEqual(Object.keys(fields).sort(), ["Name", "Type"]);
});
test("fingerprint catches a concurrent configuration change", () => {
  assert.notEqual(
    fingerprint({ Enabled: false }),
    fingerprint({ Enabled: true }),
  );
  assert.equal(fingerprint({ Enabled: true }), fingerprint({ Enabled: true }));
});
test("both observed and documented error envelopes normalize", () => {
  assert.equal(errorsOf({ status: { errors: [{ code: 40300 }] } }).length, 1);
  assert.equal(errorsOf({ status: { Errors: ["Denied"] } }).length, 1);
  assert.deepEqual(errorsOf({ result: [] }), []);
});
