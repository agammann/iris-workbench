import React, { useEffect, useState } from "react";
import { api } from "./api";
import { Button, Details, Table, ErrorBox } from "./components";
export default function Workspace({ session, onNavigate }) {
  const [history, setHistory] = useState([]),
    [error, setError] = useState(null);
  useEffect(() => {
    api("history").then(setHistory).catch(setError);
  }, []);
  return (
    <>
      <div className="workspace-main">
        <div className="workspace-intro">
          <h2>Start with the context.</h2>
          <p>
            Inspect an application, follow its evidence, and review the settings
            you want to change.
          </p>
          <Button primary onClick={() => onNavigate("Apps")}>
            Inspect applications
          </Button>
          <Button onClick={() => onNavigate("Logs")}>Open logs</Button>
        </div>
        <h3>Changes in this session</h3>
        <ErrorBox error={error} />
        <Table
          rows={history}
          columns={["at", "label", "verification"]}
          idKey="at"
          empty="No changes applied in this session."
          footer="Session history is held in memory. IRIS audit policy determines the durable audit trail."
        />
      </div>
      <aside className="inspector">
        <h2>Connected instance</h2>
        <p className="muted">{session.instance}</p>
        <Details data={session.info} />
        <div className="inspector-section">
          <h3>Review. Apply. Verify.</h3>
          <p className="muted">
            A review lists the exact fields changing. The result reports whether
            the new values were read back from IRIS.
          </p>
        </div>
      </aside>
    </>
  );
}
