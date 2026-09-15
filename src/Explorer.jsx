import React, { useState } from "react";
import { read, resolve } from "./api";
import { Button, ErrorBox, Search } from "./components";
export default function Explorer({ schema }) {
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState("/info"),
    [params, setParams] = useState({}),
    [result, setResult] = useState(null),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  const operation = schema?.paths[selected];
  const parameters = [
    ...(operation?.parameters || []),
    ...(operation?.get?.parameters || []),
  ].map((p) => resolve(schema, p));
  async function run(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== ""),
      );
      setResult((await read(selected + (q.size ? "?" + q : ""))).data);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="workspace-main">
        <Search
          value={query}
          onChange={setQuery}
          placeholder="Find a documented endpoint"
        />
        <div className="endpoint-list">
          {Object.entries(schema?.paths || {})
            .filter(([p, v]) => v.get && p.includes(query))
            .map(([p, v]) => (
              <button
                className={selected === p ? "active" : ""}
                key={p}
                onClick={() => {
                  setSelected(p);
                  setParams({});
                  setResult(null);
                  setError(null);
                }}
              >
                <code>GET</code>
                <span>{p}</span>
                <small>{v.get.summary}</small>
              </button>
            ))}
        </div>
      </div>
      <aside className="inspector">
        <h2>Request details</h2>
        <code className="endpoint-name">{selected}</code>
        <p className="muted">{operation?.get?.summary}</p>
        <form onSubmit={run}>
          {parameters
            .filter((p) => p.in === "query")
            .map((p) => (
              <label className="field" key={p.name}>
                {p.name}
                {p.required ? " (required)" : ""}
                <input
                  required={p.required}
                  value={params[p.name] || ""}
                  onChange={(e) =>
                    setParams({ ...params, [p.name]: e.target.value })
                  }
                />
                <small>{p.description?.replace(/<[^>]*>/g, " ")}</small>
              </label>
            ))}
          <Button primary disabled={busy}>
            {busy ? "Reading…" : "Send read request"}
          </Button>
        </form>
        <ErrorBox error={error} />
        {result !== null && (
          <pre className="code-result">{JSON.stringify(result, null, 2)}</pre>
        )}
        <p className="muted">
          Reads use your IRIS permissions. Use the management views to review
          and apply writes.
        </p>
      </aside>
    </>
  );
}
