export async function api(
  path,
  body,
  method = body === undefined ? "GET" : "POST",
) {
  const response = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Workbench": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(Error(data.error || "Request failed"), {
      status: response.status,
    });
  return data;
}
export const read = (path) => api("read", { path });
export const queryPath = (base, key, value) =>
  base +
  (value === undefined
    ? ""
    : "?" + new URLSearchParams({ [key]: String(value) }));
export const display = (v) =>
  v === null || v === undefined || v === ""
    ? "Not set"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
export const rowsOf = (d) =>
  Array.isArray(d)
    ? d
    : d && typeof d === "object"
      ? Object.entries(d).map(([Name, Value]) => ({ Name, Value }))
      : [];
export function resolve(s, schema) {
  if (!schema) return {};
  if (schema.$ref)
    return resolve(
      s,
      schema.$ref.split("/").reduce((v, k) => (k === "#" ? v : v?.[k]), s),
    );
  if (schema.allOf)
    return schema.allOf.reduce(
      (r, v) => ({
        ...r,
        ...resolve(s, v),
        properties: { ...r.properties, ...resolve(s, v).properties },
      }),
      {},
    );
  return schema;
}
export function bodySchema(s, path, method) {
  return resolve(
    s,
    s?.paths[path]?.[method.toLowerCase()]?.requestBody?.content?.[
      "application/json"
    ]?.schema,
  );
}
export function logRows(data, source) {
  if (data?.lines)
    return data.lines.map((text, i) => {
      const m = text.match(
        /^(\d{2}\/\d{2}\/\d{2})-(\d{2}:\d{2}:\d{2}):\d+ \((\d+)\) (\d) (.*)$/,
      );
      return {
        id: String(i),
        Time: m?.[2] || "",
        Source: data.file || source,
        Event: m?.[5] || text,
        State: m?.[4] === "2" ? "Error" : m?.[4] === "1" ? "Warning" : "Info",
        raw: { Message: text, File: data.file, Process: m?.[3] || "" },
      };
    });
  return rowsOf(data).map((r, i) => ({
    id: String(i),
    Time: String(
      r.TimeStamp || r.LogDatetime || r.LastStart || r.DateTime || r.Time || "",
    )
      .replace("T", " ")
      .slice(11, 19),
    Source:
      source === "audit"
        ? r.EventType || "Audit"
        : source === "tasks"
          ? "Task"
          : "Journal",
    Event:
      source === "audit"
        ? r.Description || r.Event
        : source === "tasks"
          ? `${r.Name}: ${r.Result || r.Status}`
          : r.Type || r.Global || JSON.stringify(r),
    State:
      source === "tasks"
        ? Number(r.ErrNumber) > 0
          ? "Error"
          : "Info"
        : "Info",
    raw: r,
  }));
}
