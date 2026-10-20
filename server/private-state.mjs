import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Windows modes do not configure DACLs. Pass paths through the environment to
// this fixed script, and inspect identities as SIDs rather than localized names.
const windowsDirectoryAcl = `
$ErrorActionPreference = 'Stop'
$directory = $env:WORKBENCH_PRIVATE_DIRECTORY
$current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$allowed = @($current.Value, 'S-1-5-18', 'S-1-5-32-544')
$entry = [System.IO.DirectoryInfo]::new($directory)
if ($env:WORKBENCH_PRIVATE_CREATE -eq '1') {
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($current)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($value in $allowed) {
    $identity = [System.Security.Principal.SecurityIdentifier]::new($value)
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  $entry.SetAccessControl($acl)
}
$acl = $entry.GetAccessControl()
if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $current.Value -or -not $acl.AreAccessRulesProtected) {
  throw 'Private directory must be owned by the current account with inheritance disabled.'
}
foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed) {
    throw 'Private directory grants access to another account.'
  }
}
`;

function checkDirectory(directory, created) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error(
      "Private state must be a regular directory, not a link or junction.",
    );
  if (process.platform === "win32") {
    try {
      const powershell = path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      execFileSync(
        powershell,
        ["-NoProfile", "-NonInteractive", "-Command", windowsDirectoryAcl],
        {
          env: {
            ...process.env,
            WORKBENCH_PRIVATE_DIRECTORY: directory,
            WORKBENCH_PRIVATE_CREATE: created ? "1" : "0",
          },
          stdio: "pipe",
          windowsHide: true,
          timeout: 15000,
        },
      );
    } catch {
      throw Error(
        "Private state Windows permissions are unsafe or could not be verified. Choose a new directory, or use Windows Security settings to disable inheritance and allow only your account, SYSTEM and Administrators.",
      );
    }
  } else if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
    throw Error(
      "Private state must be owned by your account with mode 0700. Choose a new private directory or repair its permissions.",
    );
  }
}

// Explicit external credential paths are supported. This pins and bounds one
// regular file; its enclosing directory/ACL remains the operator's choice.
export function readPrivateJson(filename, maximum = 64 * 1024) {
  const expected = fs.lstatSync(filename, { bigint: true });
  if (!expected.isFile() || expected.isSymbolicLink())
    throw Error(
      "Private JSON must be a regular file, not a link or directory.",
    );
  const flags =
    fs.constants.O_RDONLY |
    (process.platform === "win32"
      ? 0
      : fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  const descriptor = fs.openSync(filename, flags);
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile() ||
      before.dev !== expected.dev ||
      before.ino !== expected.ino
    )
      throw Error("Private JSON changed before it could be opened.");
    if (before.size > BigInt(maximum))
      throw Error("Private JSON exceeds its size limit.");
    const bytes = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(
        descriptor,
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (count === 0) break;
      length += count;
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (length > maximum) throw Error("Private JSON exceeds its size limit.");
    if (
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      BigInt(length) !== before.size
    )
      throw Error("Private JSON changed while being read.");
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, length),
        ),
      );
    } catch {
      throw Error("Private JSON is not valid UTF-8 JSON.");
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

export function readConnection(directory) {
  const resolved = path.resolve(directory);
  checkDirectory(resolved, false);
  return readPrivateJson(path.join(resolved, "connection.json"));
}

export function reserveSetupState(directory) {
  const resolved = path.resolve(directory);
  const created =
    fs.mkdirSync(resolved, { recursive: true, mode: 0o700 }) !== undefined;
  let locked = false;
  let staging;
  const descriptors = new Map();
  const names = ["credentials.json", "connection.json"];
  const lock = path.join(resolved, ".setup-lock");
  const close = () => {
    for (const descriptor of descriptors.values()) fs.closeSync(descriptor);
    descriptors.clear();
    if (staging) {
      // Only our unique staging directory is removed; final shared names are
      // never unlinked, including credentials needed after partial setup.
      for (const name of names) {
        try {
          fs.unlinkSync(path.join(staging, name));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      fs.rmdirSync(staging);
      staging = undefined;
    }
    if (locked) {
      fs.rmdirSync(lock);
      locked = false;
    }
    if (created) {
      try {
        fs.rmdirSync(resolved);
      } catch (error) {
        if (error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error;
      }
    }
  };
  try {
    checkDirectory(resolved, created);
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      locked = true;
    } catch (error) {
      if (error.code === "EEXIST")
        throw Error(
          "A setup reservation already exists. Do not run setup concurrently. If a previous setup stopped, inspect its container and private state before manually removing .setup-lock.",
        );
      throw error;
    }
    for (const name of names) {
      try {
        fs.lstatSync(path.join(resolved, name));
        throw Error(
          "The state directory already contains credentials or connection information. Choose an empty private directory.",
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    staging = fs.mkdtempSync(path.join(resolved, ".setup-"));
    for (const name of names)
      descriptors.set(name, fs.openSync(path.join(staging, name), "wx", 0o600));
    return {
      directory: resolved,
      publish(name, value) {
        const descriptor = descriptors.get(name);
        if (descriptor === undefined)
          throw Error("Private state output is not reserved.");
        fs.writeFileSync(descriptor, JSON.stringify(value, null, 2));
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptors.delete(name);
        // Exclusive hard-link publication exposes only complete bytes and fails
        // if any entry (including a dangling link) appeared at the final name.
        fs.linkSync(path.join(staging, name), path.join(resolved, name));
        fs.unlinkSync(path.join(staging, name));
      },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}
