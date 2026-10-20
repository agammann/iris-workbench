import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readConnection,
  readPrivateJson,
  reserveSetupState,
} from "../server/private-state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function fixture(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "workbench-private-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const credential = {
  user: "operator",
  password: "controlled-fixture-password",
};

test("reserved private state publishes complete files exclusively and remains readable", (t) => {
  const state = path.join(fixture(t), "state");
  const reservation = reserveSetupState(state);
  assert.equal(fs.existsSync(path.join(state, "credentials.json")), false);
  assert.equal(fs.existsSync(path.join(state, "connection.json")), false);
  reservation.publish("credentials.json", credential);
  const config = {
    IRIS_URL: "http://127.0.0.1:52773",
    IRIS_CREDENTIALS_FILE: path.join(state, "credentials.json"),
  };
  reservation.publish("connection.json", config);
  reservation.close();
  assert.deepEqual(fs.readdirSync(state).sort(), [
    "connection.json",
    "credentials.json",
  ]);
  assert.deepEqual(readConnection(state), config);
  assert.deepEqual(readPrivateJson(config.IRIS_CREDENTIALS_FILE), credential);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(state).mode & 0o777, 0o700);
    assert.equal(fs.statSync(config.IRIS_CREDENTIALS_FILE).mode & 0o777, 0o600);
  }
});

test("a competing setup cannot acquire or clean an existing reservation", (t) => {
  const state = path.join(fixture(t), "state");
  const first = reserveSetupState(state);
  try {
    const competing = spawnSync(
      process.execPath,
      [path.join(root, "scripts/setup-local.mjs")],
      {
        env: { ...process.env, WORKBENCH_STATE_DIR: state },
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.equal(competing.status, 1);
    assert.match(competing.stderr, /setup reservation already exists/);
    assert.ok(fs.statSync(path.join(state, ".setup-lock")).isDirectory());
    first.publish("credentials.json", credential);
  } finally {
    first.close();
  }
  assert.deepEqual(
    readPrivateJson(path.join(state, "credentials.json")),
    credential,
  );
  assert.equal(fs.existsSync(path.join(state, "connection.json")), false);
});

test("existing credentials stop the actual setup before any Docker process", (t) => {
  const directory = fixture(t),
    state = path.join(directory, "state");
  const reservation = reserveSetupState(state);
  reservation.publish("credentials.json", credential);
  reservation.close();
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts/setup-local.mjs")],
    {
      env: { ...process.env, PATH: directory, WORKBENCH_STATE_DIR: state },
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /already contains credentials or connection information/,
  );
  assert.doesNotMatch(result.stderr, /Could not start Docker/);
  assert.deepEqual(
    readPrivateJson(path.join(state, "credentials.json")),
    credential,
  );
  assert.deepEqual(fs.readdirSync(state), ["credentials.json"]);
});

test("publication refuses a final file that appeared after reservation without deleting it", (t) => {
  const state = path.join(fixture(t), "state"),
    reservation = reserveSetupState(state);
  const file = path.join(state, "credentials.json");
  fs.writeFileSync(file, "competing credentials");
  try {
    assert.throws(() => reservation.publish("credentials.json", credential), {
      code: "EEXIST",
    });
  } finally {
    reservation.close();
  }
  assert.equal(fs.readFileSync(file, "utf8"), "competing credentials");
  assert.deepEqual(fs.readdirSync(state), ["credentials.json"]);
});

test("unused reservations leave no newly created state directory", (t) => {
  const state = path.join(fixture(t), "state");
  reserveSetupState(state).close();
  assert.equal(fs.existsSync(state), false);
});

test("existing insecure private directories fail with repair guidance", (t) => {
  const state = path.join(fixture(t), "state");
  const reservation = reserveSetupState(state);
  reservation.publish("credentials.json", credential);
  reservation.close();
  if (process.platform === "win32") {
    const powershell = path.join(
      process.env.SystemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    execFileSync(
      powershell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `
$entry = [System.IO.DirectoryInfo]::new($env:WORKBENCH_TEST_STATE)
$acl = $entry.GetAccessControl()
$everyone = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0')
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($everyone, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
$entry.SetAccessControl($acl)
`,
      ],
      {
        env: { ...process.env, WORKBENCH_TEST_STATE: state },
        windowsHide: true,
      },
    );
  } else fs.chmodSync(state, 0o755);
  assert.throws(() => reserveSetupState(state), /permissions|mode 0700/);
  assert.deepEqual(
    readPrivateJson(path.join(state, "credentials.json")),
    credential,
  );
  assert.deepEqual(fs.readdirSync(state), ["credentials.json"]);
});

test("private-state directory links and junctions are rejected without changing the target", (t) => {
  const directory = fixture(t),
    target = path.join(directory, "target"),
    alias = path.join(directory, "alias");
  const reservation = reserveSetupState(target);
  reservation.publish("credentials.json", credential);
  reservation.close();
  fs.symlinkSync(
    target,
    alias,
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(() => reserveSetupState(alias), /not a link or junction/);
  assert.deepEqual(fs.readdirSync(target), ["credentials.json"]);
});

test("external explicit regular credential files remain supported", (t) => {
  const file = path.join(fixture(t), "custom credentials.json");
  fs.writeFileSync(file, JSON.stringify(credential));
  assert.deepEqual(readPrivateJson(file), credential);
});

test("private JSON readers reject nonregular, oversized and invalid data without quoting secrets", (t) => {
  const directory = fixture(t),
    file = path.join(directory, "input.json");
  assert.throws(() => readPrivateJson(directory), /regular file/);
  fs.writeFileSync(file, " ".repeat(65537));
  assert.throws(() => readPrivateJson(file), /size limit/);
  fs.writeFileSync(file, '{"password":"never-echo-this-private-value",');
  assert.throws(
    () => readPrivateJson(file),
    (error) =>
      /not valid/.test(error.message) && !error.message.includes("never-echo"),
  );
});

test("private JSON is read from its admitted descriptor after a pathname replacement", (t) => {
  const directory = fixture(t),
    file = path.join(directory, "input.json");
  fs.writeFileSync(file, JSON.stringify(credential));
  const open = fs.openSync;
  t.mock.method(fs, "openSync", (...args) => {
    const descriptor = open(...args);
    fs.renameSync(file, path.join(directory, "original.json"));
    fs.writeFileSync(file, '{"replacement":true}');
    return descriptor;
  });
  assert.deepEqual(readPrivateJson(file), credential);
});

test("private JSON rejects a different object substituted before open", (t) => {
  const directory = fixture(t),
    file = path.join(directory, "input.json");
  fs.writeFileSync(file, JSON.stringify(credential));
  const open = fs.openSync;
  let changed = false;
  t.mock.method(fs, "openSync", (...args) => {
    if (!changed) {
      changed = true;
      fs.renameSync(file, path.join(directory, "original.json"));
      fs.writeFileSync(file, '{"replacement":true}');
    }
    return open(...args);
  });
  assert.throws(() => readPrivateJson(file), /changed before/);
});

test("private JSON remains bounded when a file grows while it is read", (t) => {
  const file = path.join(fixture(t), "input.json");
  fs.writeFileSync(file, "{}");
  const read = fs.readSync;
  let changed = false,
    total = 0;
  t.mock.method(fs, "readSync", (...args) => {
    const count = read(...args);
    total += count;
    if (!changed) {
      changed = true;
      fs.writeFileSync(file, " ".repeat(100000));
    }
    return count;
  });
  assert.throws(() => readPrivateJson(file, 1024), /size limit|changed while/);
  assert.ok(total <= 1025);
});
