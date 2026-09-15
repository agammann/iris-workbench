import React, { useEffect, useState, useRef } from "react";
import { api, logRows, read, rowsOf } from "./api";
import { sampleEvents } from "./resources";
import {
  Button,
  Details,
  ErrorBox,
  Search,
  Table,
  Status,
  IconRefresh,
  IconExternalLink,
} from "./components";
import { IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";
export default function Logs({
  sample,
  onNavigate,
  initialFilter = "",
  initialSource = "messages",
}) {
  const [source, setSource] = useState(initialSource),
    [query, setQuery] = useState(initialFilter),
    [rows, setRows] = useState([]),
    [selected, setSelected] = useState(null),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [at, setAt] = useState(""),
    [auto, setAuto] = useState(false),
    [range, setRange] = useState(""),
    [files, setFiles] = useState([]),
    [file, setFile] = useState(""),
    [catalogue, setCatalogue] = useState([]),
    [catalogueError, setCatalogueError] = useState(null),
    [cursor, setCursor] = useState(""),
    [nextCursor, setNextCursor] = useState(null),
    [page, setPage] = useState(1),
    [note, setNote] = useState("");
  const requestNumber = useRef(0);
  const runtime = !["audit", "tasks", "journal"].includes(source);
  async function loadCatalogue() {
    try {
      setCatalogueError(null);
      const result = await api("log-sources");
      setCatalogue(result.data.sources);
    } catch (e) {
      setCatalogueError(e);
    }
  }
  useEffect(() => {
    if (!sample) loadCatalogue();
  }, [sample]);
  function changeSource(value) {
    setSource(value);
    setFile("");
    setCursor("");
    setNextCursor(null);
    setPage(1);
    setQuery("");
    setRange("");
  }
  async function refresh() {
    const request = ++requestNumber.current;
    setError(null);
    setBusy(true);
    setAt("");
    setNote("");
    setNextCursor(null);
    try {
      if (sample) {
        setRows(sampleEvents);
        setSelected(sampleEvents[0]);
        setAt("");
        return;
      }
      if (source === "journal" && !file) {
        setRows([]);
        return;
      }
      const r = await api("logs", {
        source,
        file,
        cursor,
        start: range
          ? new Date(Date.now() - Number(range) * 60000)
              .toISOString()
              .replace("T", " ")
              .slice(0, 19)
          : undefined,
      });
      const next = logRows(r.data, source);
      if (request !== requestNumber.current) return;
      setRows(next);
      setSelected(next[0] || null);
      setAt(r.at);
      setNextCursor(r.data?.nextCursor || null);
      setNote(
        r.data?.note ||
          (r.data?.truncated
            ? "Showing the latest 200 lines from a bounded file tail."
            : ""),
      );
    } catch (e) {
      if (request !== requestNumber.current) return;
      setError(e);
      setRows([]);
      setSelected(null);
    } finally {
      if (request === requestNumber.current) setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
    return () => {
      requestNumber.current++;
    };
  }, [sample, source, range, file, cursor]);
  useEffect(() => {
    if (source === "journal" && !sample)
      read("/v2/journal/files")
        .then((r) => setFiles(rowsOf(r.data)))
        .catch(setError);
  }, [source, sample]);
  useEffect(() => {
    if (!auto || sample || busy || cursor) return;
    const id = setTimeout(refresh, 10000);
    return () => clearTimeout(id);
  }, [auto, sample, busy, at, source, file, range, cursor]);
  useEffect(() => {
    setQuery(initialFilter);
    if (initialFilter) {
      setSource(initialSource);
      setFile("");
      setCursor("");
      setPage(1);
    }
  }, [initialFilter, initialSource]);
  const filtered = rows.filter(
    (r) =>
      JSON.stringify(r).toLowerCase().includes(query.toLowerCase()) &&
      (!sample || range !== "5" || r.Time >= "18:37:00"),
  );
  const app = selected?.sample
    ? "/api/orders"
    : String(
        selected?.raw?.EventData ||
          selected?.raw?.Description ||
          selected?.raw?.Message ||
          "",
      ).match(/(?:application|app)(?: name)?\s*[:=]\s*(\/[^\s,]+)/i)?.[1];
  return (
    <>
      <div className="workspace-main">
        <div className="toolbar log-toolbar">
          <Search
            value={query}
            onChange={setQuery}
            placeholder="Filter events"
          />
          {sample ? (
            <select
              aria-label="Time range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="">Last 30 minutes</option>
              <option value="5">Last 5 minutes</option>
            </select>
          ) : (
            <select
              aria-label="Log source"
              value={source}
              onChange={(e) => changeSource(e.target.value)}
            >
              <option value="messages">Runtime messages</option>
              <option value="audit">Audit events</option>
              <option value="tasks">Task history</option>
              <option value="journal">Journal records</option>
              <option value="alerts">Alerts</option>
              <option value="system-monitor">System Monitor</option>
              {catalogue
                .filter(
                  (s) =>
                    !["messages", "alerts", "system-monitor"].includes(s.id),
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </select>
          )}
          <button
            aria-label={
              auto ? "Pause automatic refresh" : "Start automatic refresh"
            }
            className="live-toggle"
            disabled={sample || !!cursor}
            onClick={() => setAuto(!auto)}
          >
            {auto ? (
              <IconPlayerPause size={20} />
            ) : (
              <IconPlayerPlay size={20} />
            )}
            <span>{auto ? "Updates every 10s" : "Live updates paused"}</span>
          </button>
          <Button icon={IconRefresh} disabled={busy} onClick={refresh}>
            Refresh
          </Button>
        </div>
        {runtime && !sample && (
          <>
            <div className="sub-toolbar log-pages">
              <label>
                Log file
                <select
                  aria-label="Runtime log file"
                  value={file}
                  onChange={(e) => {
                    setFile(e.target.value);
                    setCursor("");
                    setPage(1);
                  }}
                >
                  <option value="">Current log</option>
                  {(catalogue.find((s) => s.id === source)?.files || [])
                    .filter((f) => !f.current)
                    .map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name}
                        {f.compressed ? " (gzip)" : ""}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                disabled={busy || !nextCursor}
                onClick={() => {
                  setCursor(nextCursor);
                  setPage(page + 1);
                }}
              >
                Older events
              </Button>
              <Button
                disabled={busy || !cursor}
                onClick={() => {
                  setCursor("");
                  setPage(1);
                }}
              >
                Latest events
              </Button>
              <Button disabled={busy} onClick={loadCatalogue}>
                Reload sources
              </Button>
              <span>Page {page}</span>
            </div>
            {catalogue.find((s) => s.id === source)?.limited && (
              <p className="muted">
                The source catalogue reached its scan limit. Narrow the
                configured log directory.
              </p>
            )}
            <ErrorBox error={catalogueError} />
          </>
        )}
        {source === "audit" && !sample && (
          <div className="sub-toolbar">
            <label>
              Time range (UTC)
              <select
                aria-label="Audit time range"
                value={range}
                onChange={(e) => setRange(e.target.value)}
              >
                <option value="">Latest 200 records</option>
                <option value="30">Last 30 minutes</option>
                <option value="1440">Last 24 hours</option>
              </select>
            </label>
            <span>
              Server timestamps must use UTC for time range filtering.
            </span>
          </div>
        )}
        {source === "journal" && !sample && (
          <label className="field">
            Journal file
            <select value={file} onChange={(e) => setFile(e.target.value)}>
              <option value="">Select a journal file</option>
              {files.map((r) => (
                <option key={r.Name}>{r.Name}</option>
              ))}
            </select>
          </label>
        )}
        <ErrorBox error={error} />
        <Table
          rows={filtered}
          columns={["Time", "Source", "Event", "State"]}
          selected={selected?.id}
          onSelect={setSelected}
          empty={
            busy
              ? "Reading events from IRIS…"
              : source === "journal" && !file
                ? "Select a journal file to read its records."
                : "No events match this view."
          }
          footer={
            sample
              ? `Showing ${filtered.length} sample events`
              : `${filtered.length} events${at ? " · Updated " + new Date(at).toLocaleTimeString() : ""}${note ? " · " + note : ""}`
          }
        />
      </div>
      <aside className="inspector">
        <h2>
          {selected?.sample
            ? "Application disabled"
            : selected
              ? selected.raw.Event || selected.raw.Name || "Event details"
              : "Event details"}
        </h2>
        <p className="muted">
          {selected?.sample
            ? "September 14, 2026  18:42:11"
            : selected?.raw.TimeStamp ||
              selected?.raw.LogDatetime ||
              selected?.Time ||
              (selected
                ? "Timestamp not supplied by this source."
                : "Select an event to inspect its source.")}
        </p>
        {selected &&
          (selected.sample ? (
            <>
              <div className="inspector-section">
                <dl className="details">
                  <dt>Application</dt>
                  <dd>
                    <code>/api/orders</code>
                  </dd>
                  <dt>Namespace</dt>
                  <dd>
                    <code>USER</code>
                  </dd>
                  <dt>Source</dt>
                  <dd>Web application</dd>
                  <dt>Current state</dt>
                  <dd>
                    <Status value="Disabled" />
                  </dd>
                </dl>
              </div>
              <div className="inspector-section">
                <p>
                  Requests cannot reach this application while it is disabled.
                </p>
                <Button
                  primary
                  icon={IconExternalLink}
                  onClick={() => onNavigate("Apps", "/api/orders")}
                >
                  Inspect application
                </Button>
              </div>
              <div className="inspector-section">
                <h3>Next step</h3>
                <p className="muted">
                  Review configuration before changing the enabled state.
                </p>
                <p className="muted">
                  Connect to live data to review actual configuration changes.
                </p>
              </div>
            </>
          ) : (
            <>
              <Details data={selected.raw} />
              {app && (
                <div className="inspector-section">
                  <Button
                    primary
                    icon={IconExternalLink}
                    onClick={() => onNavigate("Apps", app)}
                  >
                    Inspect application
                  </Button>
                </div>
              )}
              <div className="inspector-section">
                <h3>Keep the context</h3>
                <p className="muted">
                  This view preserves the original source fields. Refresh to
                  retrieve the latest evidence.
                </p>
              </div>
            </>
          ))}
      </aside>
    </>
  );
}
