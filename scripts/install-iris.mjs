import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const container = process.env.IRIS_CONTAINER || "iris-workbench-dev";
if (!/^[a-zA-Z0-9_.-]+$/.test(container)) throw Error("Invalid container name");
const location = spawnSync(
  "docker",
  ["exec", "-i", container, "iris", "session", "IRIS", "-U", "%SYS"],
  {
    input: 'write !,"WORKBENCH_ROOT:",$zu(12),!\nhalt\n',
    encoding: "utf8",
  },
);
const manager = location.stdout?.match(/WORKBENCH_ROOT:(\/[^\r\n]+)/)?.[1];
if (location.status || !manager || !/^\/[A-Za-z0-9_./-]+$/.test(manager))
  throw Error("Could not resolve the IRIS manager directory");
const helperDirectory = manager.replace(/\/$/, "") + "/workbench";
const mkdir = spawnSync(
  "docker",
  ["exec", container, "mkdir", "-p", helperDirectory],
  { encoding: "utf8" },
);
if (mkdir.status) throw Error(mkdir.stderr);
const helper = spawnSync(
  "docker",
  [
    "cp",
    path.join(root, "iris/workbench_logs.py"),
    container + ":" + helperDirectory + "/workbench_logs.py",
  ],
  { encoding: "utf8" },
);
if (helper.status) throw Error(helper.stderr);
spawnSync("docker", [
  "exec",
  container,
  "mkdir",
  "-p",
  "/tmp/workbench-classes/Workbench",
]);
for (const file of ["Runtime.cls", "Heartbeat.cls", "DemoREST.cls"]) {
  const cp = spawnSync(
    "docker",
    [
      "cp",
      path.join(root, "iris", "Workbench", file),
      container + ":/tmp/workbench-classes/Workbench/" + file,
    ],
    { encoding: "utf8" },
  );
  if (cp.status) throw Error(cp.stderr);
}
const code =
  'zn "%SYS"\ndo $SYSTEM.OBJ.LoadDir("/tmp/workbench-classes/Workbench","ck",,1)\nset p("NameSpace")="%SYS",p("DispatchClass")="Workbench.Runtime",p("AutheEnabled")=32,p("Enabled")=1,p("Resource")="%Admin_Operate"\nif ##class(Security.Applications).Exists("/api/workbench") { set st=##class(Security.Applications).Modify("/api/workbench",.p) } else { set st=##class(Security.Applications).Create("/api/workbench",.p) }\nwrite !,"Install status: ",st,!\nhalt\n';
const r = spawnSync(
  "docker",
  ["exec", "-i", container, "iris", "session", "IRIS", "-U", "%SYS"],
  { input: code, encoding: "utf8" },
);
console.log(r.stdout);
if (r.status) throw Error(r.stderr);
if (
  !r.stdout.includes("Install status: 1") ||
  /ERROR #|<SYNTAX>|<CLASS DOES NOT EXIST>/.test(r.stdout)
)
  throw Error("IRIS class installation did not complete successfully");
