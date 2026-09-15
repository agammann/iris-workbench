Class Workbench.DemoREST Extends %CSP.REST
{
Parameter HandleCorsRequest = 0;
XData UrlMap
{
<Routes><Route Url="/status" Method="GET" Call="Status" /></Routes>
}
ClassMethod Status() As %Status
{
 Set %response.ContentType="application/json"
 Write "{""service"":""Workbench demonstration"",""status"":""ready""}"
 Quit 1
}
}
