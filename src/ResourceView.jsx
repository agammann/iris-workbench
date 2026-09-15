import React, { useEffect, useState, useRef } from "react";
import { api, read, rowsOf, queryPath } from "./api";
import { resources, groups } from "./resources";
import {
  Button,
  Details,
  ErrorBox,
  Table,
  Search,
  IconRefresh,
  IconPlus,
} from "./components";
import { Editor, Review } from "./Editor";
export default function ResourceView({
  section,
  schema,
  user,
  onNavigate,
  focusName,
}) {
  const [kind, setKind] = useState(groups[section][0]),
    [data, setData] = useState([]),
    [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [at, setAt] = useState(""),
    [editing, setEditing] = useState(false),
    [creating, setCreating] = useState(false),
    [review, setReview] = useState(null),
    [scope, setScope] = useState(""),
    [scopeOptions, setScopeOptions] = useState([]);
  const config = resources[kind];
  const listRequest = useRef(0),
    detailRequest = useRef(0);
  useEffect(() => {
    if (kind === "secrets" || kind === "clients")
      read(
        kind === "secrets"
          ? "/v2/wallet/collections"
          : "/v2/security/oauth2/client/server-definitions",
      )
        .then((r) => setScopeOptions(rowsOf(r.data)))
        .catch(setError);
    else setScopeOptions([]);
  }, [kind]);
  const context =
    kind === "secrets" && scope
      ? new URLSearchParams({ collection: scope }).toString()
      : kind === "clients" && scope
        ? new URLSearchParams({ serverId: scope }).toString()
        : "";
  async function load() {
    const request = ++listRequest.current;
    detailRequest.current++;
    setBusy(true);
    setError(null);
    setAt("");
    setSelected(null);
    setDetail(null);
    try {
      if (["secrets", "clients"].includes(kind) && !scope) {
        setData([]);
        return;
      }
      const r =
        config.list === "extension:system"
          ? await api("system")
          : await read(config.list + (context ? "?" + context : ""));
      if (request !== listRequest.current) return;
      setData(
        rowsOf(r.data).map((row) =>
          kind === "capacity" && row.Name.endsWith("(bytes)")
            ? {
                Name: row.Name.replace("(bytes)", "(GiB)"),
                Value: (Number(row.Value) / 1073741824).toFixed(2),
                ExactBytes: row.Value,
              }
            : kind === "capacity" && row.Name.includes("load average")
              ? { ...row, Value: Number(row.Value).toFixed(2) }
              : row,
        ),
      );
      setAt(r.at);
    } catch (e) {
      if (request !== listRequest.current) return;
      setError(e);
      setData([]);
    } finally {
      if (request === listRequest.current) setBusy(false);
    }
  }
  useEffect(() => {
    load();
    return () => {
      listRequest.current++;
      detailRequest.current++;
    };
  }, [kind, scope]);
  async function select(row) {
    const request = ++detailRequest.current;
    setSelected(row);
    setDetail(null);
    setError(null);
    if (config.item && !config.noRead)
      try {
        const p = queryPath(config.item, config.key, row[config.id]) + "";
        const d = (await read(p)).data;
        if (kind === "certificates") {
          const cert = (
            await read(
              "/v2/security/x509-credential/certificate?alias=" +
                encodeURIComponent(row.Alias),
            )
          ).data;
          if (request === detailRequest.current) setDetail({ ...d, ...cert });
        } else if (request === detailRequest.current) setDetail(d);
      } catch (e) {
        if (request === detailRequest.current) setError(e);
      }
    else setDetail(row);
  }
  useEffect(() => {
    if (focusName && kind === "apps") {
      const row = data.find((r) => r.Name === focusName);
      if (row) select(row);
    }
  }, [data, focusName]);
  async function action(actionName) {
    try {
      const targetPath = queryPath(
        config.item,
        config.key,
        selected[config.id],
      );
      const readPath = config.noRead ? undefined : targetPath;
      const path =
        actionName === "delete"
          ? targetPath
          : queryPath(
              config.item + "/" + actionName,
              config.key,
              selected[config.id],
            );
      setReview(
        await api("prepare", {
          path,
          readPath,
          method: actionName === "delete" ? "DELETE" : "POST",
          payload:
            actionName === "run"
              ? { RunNow: true }
              : actionName === "suspend" && kind === "tasks"
                ? { LeaveInQueue: true }
                : undefined,
          label: `${actionName[0].toUpperCase() + actionName.slice(1)} ${selected.Name || selected.Pid}`,
        }),
      );
    } catch (e) {
      setError(e);
    }
  }
  const filtered = data.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="workspace-main">
        <div
          className="resource-tabs"
          role="tablist"
          aria-label={section + " sections"}
        >
          {groups[section].map((k) => (
            <button
              role="tab"
              aria-selected={k === kind}
              className={k === kind ? "active" : ""}
              key={k}
              onClick={() => {
                setKind(k);
                setScope("");
                setQuery("");
              }}
            >
              {resources[k].title}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <Search
            value={query}
            onChange={setQuery}
            placeholder={"Filter " + config.title.toLowerCase()}
          />
          {["secrets", "clients"].includes(kind) && (
            <select
              aria-label={kind === "secrets" ? "Collection" : "OAuth server"}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="">
                Select {kind === "secrets" ? "collection" : "server"}
              </option>
              {scopeOptions.map((s, i) => (
                <option key={i} value={s.Name || s.Id || s.ID}>
                  {s.Name || s.IssuerEndpoint || s.Id}
                </option>
              ))}
            </select>
          )}
          <Button icon={IconRefresh} disabled={busy} onClick={load}>
            Refresh
          </Button>
          {!config.readonly && (
            <Button
              primary
              icon={IconPlus}
              disabled={
                !schema || (["secrets", "clients"].includes(kind) && !scope)
              }
              onClick={() => {
                setCreating(true);
                setEditing(true);
              }}
            >
              Create
            </Button>
          )}
        </div>
        <ErrorBox error={error} />
        <Table
          rows={filtered}
          columns={config.columns}
          idKey={config.id}
          selected={selected?.[config.id]}
          onSelect={select}
          empty={
            busy
              ? "Loading from IRIS…"
              : ["secrets", "clients"].includes(kind) && !scope
                ? "Select a parent to load this view."
                : "No results in this view."
          }
          footer={`${filtered.length} ${config.title.toLowerCase()}${at ? " · Updated " + new Date(at).toLocaleTimeString() : ""}`}
        />
      </div>
      <aside className="inspector">
        <h2>
          {selected
            ? selected.Name ||
              selected.Alias ||
              selected.ApplicationName ||
              `Process ${selected.Pid || selected.Id}`
            : config.title}
        </h2>
        <p className="muted">
          {selected
            ? "Configuration from your connected instance."
            : "Select a row to inspect its configuration."}
        </p>
        {selected && (
          <>
            <div className="inspector-actions">
              {!config.readonly && (
                <Button
                  primary
                  disabled={!detail && !config.noRead}
                  onClick={() => {
                    setCreating(false);
                    setEditing(true);
                  }}
                >
                  Edit configuration
                </Button>
              )}
              {kind === "apps" && (
                <Button onClick={() => onNavigate("Logs", selected.Name)}>
                  Find related audit events
                </Button>
              )}
              {kind === "tasks" && (
                <>
                  <Button primary onClick={() => action("run")}>
                    Run task
                  </Button>
                  <Button
                    onClick={() =>
                      action(selected.Suspended ? "resume" : "suspend")
                    }
                  >
                    {selected.Suspended ? "Resume" : "Suspend"}
                  </Button>
                  <Button
                    onClick={() => onNavigate("Logs", selected.Name, "tasks")}
                  >
                    Run history
                  </Button>
                </>
              )}
              {kind === "processes" && selected.CanBeSuspended && (
                <Button onClick={() => action("suspend")}>
                  Suspend process
                </Button>
              )}
              {kind === "processes" && selected.State === "SUSP" && (
                <Button onClick={() => action("resume")}>Resume process</Button>
              )}
            </div>
            <Details data={detail || selected} />
            {!config.readonly && (
              <div className="inspector-section">
                <h3>Remove configuration</h3>
                <p className="muted">
                  Review the target before deleting it from IRIS.
                </p>
                <Button onClick={() => action("delete")}>
                  Review deletion
                </Button>
              </div>
            )}
          </>
        )}
      </aside>
      {editing && (
        <Editor
          config={config}
          entity={creating ? null : selected}
          detail={creating ? {} : detail || selected}
          schema={schema}
          user={user}
          context={context}
          onClose={() => setEditing(false)}
          onReview={(r) => {
            setEditing(false);
            setReview(r);
          }}
        />
      )}
      {review && (
        <Review
          review={review}
          onClose={() => setReview(null)}
          onApplied={() => load()}
        />
      )}
    </>
  );
}
