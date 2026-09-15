Class Workbench.Runtime Extends %CSP.REST
{
Parameter HandleCorsRequest = 0;
XData UrlMap
{
<Routes><Route Url="/log-sources" Method="GET" Call="LogSources" /><Route Url="/logs" Method="GET" Call="Logs" /><Route Url="/system" Method="GET" Call="System" /></Routes>
}
ClassMethod Logs() As %Status
{
 Set %response.ContentType="application/json"
 If '$SYSTEM.Security.Check("%Admin_Operate","U") { Set %response.Status="403 Forbidden" Write "{}" Quit 1 }
 Do ..EmitLogs($zu(12),"read",$Get(%request.Data("source",1),"messages"),$Get(%request.Data("file",1)), $Get(%request.Data("cursor",1)),..ConsoleFile())
 Quit 1
}
ClassMethod ConsoleFile() As %String
{
 Set st=##class(Config.config).Get(.p)
 Quit $Get(p("ConsoleFile"))
}
ClassMethod LogSources() As %Status
{
 Set %response.ContentType="application/json"
 If '$SYSTEM.Security.Check("%Admin_Operate","U") { Set %response.Status="403 Forbidden" Write "{}" Quit 1 }
 Do ..EmitLogs($zu(12),"catalogue","","","",..ConsoleFile())
 Quit 1
}
ClassMethod System() As %Status
{
 Set %response.ContentType="application/json"
 If '$SYSTEM.Security.Check("%Admin_Operate","U") { Set %response.Status="403 Forbidden" Write "{}" Quit 1 }
 Do ..EmitSystem($zu(12))
 Quit 1
}
ClassMethod EmitSystem(root As %String) [ Language = python ]
{
 import json, os, pathlib, shutil, time
 memory = {}
 for line in pathlib.Path('/proc/meminfo').read_text().splitlines():
     parts = line.split()
     memory[parts[0].rstrip(':')] = int(parts[1]) * 1024
 ticks = [int(x) for x in pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:]]
 disk = shutil.disk_usage(root)
 result = {"CPU logical cores": os.cpu_count(), "CPU load average (1 minute)": os.getloadavg()[0], "Host memory total (bytes)": memory.get('MemTotal'), "Host memory available (bytes)": memory.get('MemAvailable'), "IRIS disk total (bytes)": disk.total, "IRIS disk free (bytes)": disk.free, "Measured at (UTC)": time.strftime('%Y-%m-%d %H:%M:%S',time.gmtime()), "CPU total ticks": sum(ticks[:8]), "CPU idle ticks": ticks[3] + ticks[4]}
 for name, filename in [("Container memory used (bytes)","memory.current"),("Container memory limit (bytes)","memory.max")]:
     f = pathlib.Path('/sys/fs/cgroup') / filename
     if f.exists():
         value = f.read_text().strip()
         result[name] = int(value) if value.isdigit() else value
 print(json.dumps(result))
}
ClassMethod EmitLogs(root As %String, action As %String, source As %String, filename As %String, cursor As %String, console As %String) [ Language = python ]
{
 import json, pathlib, runpy
 helper = pathlib.Path(root) / "workbench" / "workbench_logs.py"
 module = runpy.run_path(str(helper))
 print(json.dumps(module["dispatch"](root, action, source, filename, cursor, console)))
}
}
