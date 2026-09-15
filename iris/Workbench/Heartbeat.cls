Class Workbench.Heartbeat Extends %SYS.Task.Definition
{
Parameter TaskName = "Workbench verification";
Method OnTask() As %Status
{
 Set ^WorkbenchVerification($Increment(^WorkbenchVerification))=$ZDateTime($Horolog,3)
 Quit 1
}
ClassMethod ProcessProbe()
{
 Set ^WorkbenchProcessProbe=$Job
 Hang 120
 If $Get(^WorkbenchProcessProbe)=$Job Kill ^WorkbenchProcessProbe
 Quit
}
}
