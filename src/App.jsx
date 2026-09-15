import React, { useEffect, useState } from "react";
import {
  IconDatabase,
  IconInfoCircle,
  IconLogout,
  IconPlugConnected,
  IconChevronDown,
} from "@tabler/icons-react";
import { api } from "./api";
import { titles } from "./resources";
import { Button, ErrorBox, Search, Modal } from "./components";
import ResourceView from "./ResourceView";
import Logs from "./Logs";
import Explorer from "./Explorer";
import Workspace from "./Workspace";
const sections = Object.keys(titles);
export function App() {
  const [session, setSession] = useState(null),
    [schema, setSchema] = useState(null),
    [section, setSection] = useState("Logs"),
    [sample, setSample] = useState(false),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [focus, setFocus] = useState(""),
    [logSource, setLogSource] = useState("messages"),
    [search, setSearch] = useState(""),
    [connection, setConnection] = useState(false),
    [now, setNow] = useState(new Date());
  useEffect(() => {
    api("session")
      .then((s) => {
        setSession(s);
        if (s.connected) api("schema").then(setSchema).catch(setError);
      })
      .catch(setError);
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  async function connect(e, configured = false) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const values = e ? Object.fromEntries(new FormData(e.target)) : {};
      const s = await api(
        "session",
        configured ? { configured: true } : values,
      );
      setSession(s);
      setSchema(await api("schema"));
      setSample(false);
      setConnection(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    await api("session", undefined, "DELETE");
    setSession({ ...session, connected: false });
    setSchema(null);
    setConnection(false);
  }
  function navigate(next, name = "", source = "audit") {
    if (sample && next !== "Logs") setSample(false);
    setSection(next);
    setFocus(name);
    setLogSource(source);
    setSearch("");
  }
  const [heading, subtitle] = titles[section];
  const ready = session?.connected;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Workspace");
          }}
        >
          IRIS <span>Workbench</span>
        </a>
        <nav aria-label="Main navigation">
          {sections.map((s) => (
            <button
              key={s}
              className={section === s ? "active" : ""}
              onClick={() => navigate(s)}
            >
              {s}
            </button>
          ))}
        </nav>
        <time>
          {now.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}{" "}
          {now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </time>
        <button className="account" onClick={() => setConnection(true)}>
          <span>{session?.user?.[0] || "U"}</span>
          {session?.user || "Connect"}
          <IconChevronDown size={15} />
        </button>
      </header>
      <div className="contextbar">
        <button className="instance" onClick={() => setConnection(true)}>
          <IconDatabase size={20} />
          {sample
            ? "Local IRIS / USER"
            : ready
              ? "IRIS / " + session.instance
              : "IRIS connection"}
          <IconChevronDown size={14} />
        </button>
        <select
          aria-label="Data mode"
          value={sample ? "sample" : "live"}
          onChange={(e) => {
            setSample(e.target.value === "sample");
            setSection("Logs");
            setFocus("");
          }}
        >
          <option value="live">{ready ? "Live data" : "Disconnected"}</option>
          <option value="sample">Design sample</option>
        </select>
        <div className="global-search">
          <Search
            value={search}
            onChange={setSearch}
            placeholder="Search workspace"
          />
          {search && (
            <div className="search-results">
              {sections
                .filter((s) =>
                  (s + " " + titles[s].join(" "))
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((s) => (
                  <button key={s} onClick={() => navigate(s)}>
                    {s}
                  </button>
                ))}
              <button onClick={() => navigate("Logs", search, "audit")}>
                Find “{search}” in audit events
              </button>
            </div>
          )}
        </div>
      </div>
      {ready || sample ? (
        <>
          <div className="content-heading">
            <h1>{heading}</h1>
            <p>{subtitle}</p>
          </div>
          <main className="workspace">
            {section === "Logs" ? (
              <Logs
                sample={sample}
                onNavigate={navigate}
                initialFilter={focus}
                initialSource={logSource}
              />
            ) : section === "Workspace" ? (
              <Workspace session={session} onNavigate={navigate} />
            ) : section === "API explorer" ? (
              <Explorer schema={schema} />
            ) : (
              <ResourceView
                key={section}
                section={section}
                schema={schema}
                user={session.user}
                onNavigate={navigate}
                focusName={focus}
              />
            )}
          </main>
        </>
      ) : (
        <main className="connection-page">
          <div>
            <IconPlugConnected size={36} stroke={1.5} />
            <h1>Keep your instance in hand.</h1>
            <p>
              Connect to IRIS to inspect applications, follow events, and review
              changes.
            </p>
            <ErrorBox error={error} />
            {session?.configured ? (
              <>
                <p className="muted">
                  A local connection is configured for {session.instance}.
                  Credentials stay on this server.
                </p>
                <Button
                  primary
                  disabled={busy}
                  onClick={() => connect(null, true)}
                >
                  {busy ? "Connecting…" : "Connect local instance"}
                </Button>
                <Button onClick={() => setConnection(true)}>
                  Use another account
                </Button>
              </>
            ) : (
              <Button primary onClick={() => setConnection(true)}>
                Connect to IRIS
              </Button>
            )}
          </div>
          <div className="connection-note">
            <h2>
              A clear timeline.
              <br />
              The context to act.
            </h2>
            <p>
              Read the state, review the change, then verify it from the
              instance.
            </p>
            <Button onClick={() => setSample(true)}>
              Explore the design sample
            </Button>
          </div>
        </main>
      )}
      <footer className="statusbar">
        <span>
          {sample
            ? "Design study / Sample data"
            : ready
              ? `Connected as ${session.user}`
              : "Local management workspace"}
        </span>
        <span>
          <IconInfoCircle size={19} />
          {sample
            ? "No live instance data shown"
            : ready
              ? "Changes require review before applying"
              : "Credentials stay on your local server"}
        </span>
      </footer>
      {connection && (
        <Modal
          title={ready ? "Your connection" : "Connect to IRIS"}
          onClose={() => setConnection(false)}
        >
          <p className="muted">
            Instance: {session?.instance || "configured IRIS server"}
          </p>
          <ErrorBox error={error} />
          {ready ? (
            <>
              <p>
                Connected as <strong>{session.user}</strong>. This session
                expires after one hour.
              </p>
              <Button icon={IconLogout} onClick={disconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <form onSubmit={connect}>
              <label className="field">
                Username
                <input name="user" required autoComplete="username" />
              </label>
              <label className="field">
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <p className="muted">
                Your credentials are held in server memory for this session.
              </p>
              <div className="modal-actions">
                <Button primary disabled={busy}>
                  {busy ? "Connecting…" : "Connect"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
