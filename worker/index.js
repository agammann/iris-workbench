export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/session" && request.method === "GET") {
      return Response.json({ connected: false, configured: false, sampleOnly: true }, {
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "This static preview supports fictional sample data only. Run the local Node portal for live management." }, {
        status: url.pathname === "/api/session" ? 405 : 404,
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(url.pathname === "/api/session" ? { Allow: "GET" } : {}) },
      });
    }
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
