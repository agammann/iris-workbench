import React, { useMemo, useState } from "react";
import { api, bodySchema, resolve, display } from "./api";
import { Button, ErrorBox, Modal, Status } from "./components";
function defaultsForTask(schema, user) {
  const d = {};
  for (const [k, v] of Object.entries(schema.properties || {}))
    d[k] =
      v.type === "boolean"
        ? false
        : v.type === "integer"
          ? 0
          : v.type === "array"
            ? []
            : v.type === "object"
              ? {}
              : v.enum?.[0] || "";
  return {
    ...d,
    Name: "Workbench verification",
    TaskClass: "Workbench.Heartbeat",
    RunAsUser: user,
    NameSpace: "%SYS",
    TimePeriod: "On Demand",
    DailyFrequency: "Once",
    DailyFrequencyTime: "Hourly",
    DailyStartTime: "00:00:00",
    DailyEndTime: "23:59:59",
    DailyIncrement: "1",
    StartDate: new Date().toISOString().slice(0, 10),
    EndDate: "",
    Priority: "Normal",
    MirrorStatus: "Any",
    SuspendOnError: true,
    Settings: {},
  };
}
export function Editor({
  config,
  entity,
  detail,
  schema,
  user,
  onClose,
  onReview,
  context = "",
}) {
  const create = !entity,
    method = create ? config.create : "PUT";
  const shape = bodySchema(schema, config.item, method);
  const initial = create
    ? config.defaults === null
      ? defaultsForTask(shape, user)
      : config.item.includes("client-configuration")
        ? {
            ...config.defaults,
            ServerDefinition:
              new URLSearchParams(context).get("serverId") || "",
          }
        : config.defaults || {}
    : config.noRead
      ? config.defaults
      : Object.fromEntries(
          (config.featured || Object.keys(shape.properties || {}))
            .filter((k) => detail[k] !== undefined)
            .map((k) => [k, detail[k]]),
        );
  const [name, setName] = useState(""),
    [values, setValues] = useState(initial),
    [fields, setFields] = useState(Object.keys(initial)),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  function update(k, v) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }
  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {};
      for (const k of fields) {
        const f = resolve(schema, shape.properties?.[k] || {});
        let v = values[k];
        if (["object", "array"].includes(f.type) && typeof v === "string")
          v = JSON.parse(v);
        if (f.type === "integer") {
          if (v === "") throw Error(`${k} needs a number`);
          v = Number(v);
          if (!Number.isInteger(v)) throw Error(`${k} needs a whole number`);
        }
        if (create || JSON.stringify(v) !== JSON.stringify(detail[k]))
          payload[k] = v;
      }
      if (!Object.keys(payload).length)
        throw Error("Change a field before reviewing.");
      let key = create
        ? config.bodyId
          ? values.Alias
          : name
        : entity[config.id];
      const parent = new URLSearchParams(context).get("collection");
      if (
        create &&
        config.item === "/v2/wallet/secret" &&
        parent &&
        !key.startsWith(parent + ".")
      )
        key = parent + "." + key;
      const params = new URLSearchParams();
      if (!(create && config.autoId)) {
        if (!String(key).trim()) throw Error("Enter an identifier");
        params.set(config.key, key);
      }
      const path = config.item + (params.size ? "?" + params : "");
      if (create && config.bodyId && config.id === "Alias")
        payload.Alias = values.Alias || name;
      const readPath = !create && !config.noRead ? path : undefined;
      const prepared = await api("prepare", {
        path,
        method,
        payload,
        readPath,
        label: `${create ? "Create" : "Update"} ${config.title.toLowerCase()}: ${key || payload.Name || payload.Alias || "new definition"}`,
      });
      onReview(prepared);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={(create ? "Create " : "Edit ") + config.title.toLowerCase()}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <p className="muted">
          Only changed fields will be submitted. Review the change before
          applying it to IRIS.
        </p>
        <ErrorBox error={error} />
        {create && !config.autoId && !config.bodyId && (
          <label className="field">
            {config.key === "alias" ? "Alias" : "Name"}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                config.item === "/v2/web-app" ? "/api/example" : "Unique name"
              }
            />
          </label>
        )}
        <div className="fields">
          {fields.map((k) => {
            const f = resolve(schema, shape.properties?.[k] || {}),
              complex =
                ["array", "object"].includes(f.type) ||
                typeof values[k] === "object",
              sensitive = /password|secret/i.test(k);
            return (
              <label className={"field " + (complex ? "full" : "")} key={k}>
                <span>{k.replace(/([a-z])([A-Z])/g, "$1 $2")}</span>
                {f.type === "boolean" ? (
                  <select
                    value={String(values[k])}
                    onChange={(e) => update(k, e.target.value === "true")}
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : f.enum ? (
                  <select
                    value={values[k]}
                    onChange={(e) => update(k, e.target.value)}
                  >
                    {f.enum.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                ) : complex ? (
                  <textarea
                    spellCheck={false}
                    rows={Math.min(
                      10,
                      Math.max(
                        3,
                        JSON.stringify(values[k], null, 2).split("\n").length,
                      ),
                    )}
                    value={
                      typeof values[k] === "string"
                        ? values[k]
                        : JSON.stringify(values[k], null, 2)
                    }
                    onChange={(e) => update(k, e.target.value)}
                  />
                ) : (
                  <input
                    type={
                      sensitive
                        ? "password"
                        : f.type === "integer"
                          ? "number"
                          : "text"
                    }
                    autoComplete={sensitive ? "new-password" : "off"}
                    value={values[k] ?? ""}
                    onChange={(e) => update(k, e.target.value)}
                  />
                )}
                <small>
                  {(f.description || "").replace(/<[^>]*>/g, " ").slice(0, 220)}
                  {complex ? " Enter valid JSON." : ""}
                </small>
              </label>
            );
          })}
        </div>
        <label className="field">
          Add another field
          <select
            value=""
            onChange={(e) => {
              const k = e.target.value;
              if (!k) return;
              const f = resolve(schema, shape.properties[k]);
              setFields((v) => [...v, k]);
              update(
                k,
                detail?.[k] ??
                  (f.type === "boolean"
                    ? false
                    : f.type === "array"
                      ? []
                      : f.type === "object"
                        ? {}
                        : f.enum?.[0] || ""),
              );
            }}
          >
            <option value="">Choose a documented property</option>
            {Object.keys(shape.properties || {})
              .filter((k) => !fields.includes(k))
              .map((k) => (
                <option key={k}>{k}</option>
              ))}
          </select>
        </label>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button primary disabled={busy}>
            {busy ? "Preparing review…" : "Review changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Review({ review, onClose, onApplied }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [result, setResult] = useState(null);
  const keys = Object.keys(review.proposed || {});
  async function apply() {
    setBusy(true);
    try {
      const r = await api("apply", { id: review.id });
      setResult(r);
      onApplied(r);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={result ? "Change result" : "Review changes"}
      onClose={onClose}
    >
      <p className="review-label">{review.label}</p>
      <p className="muted">
        You are changing <strong>{review.instance}</strong>.
      </p>
      <ErrorBox error={error} />
      {result ? (
        <>
          <div className="success" role="status">
            {result.verification}
          </div>
          {result.after && (
            <pre className="code-result">
              {JSON.stringify(result.after, null, 2)}
            </pre>
          )}
          <div className="modal-actions">
            <Button primary onClick={onClose}>
              Done
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="change-method">
            <code>{review.method}</code>
            <span className="mono">{review.path}</span>
          </div>
          {keys.length ? (
            <div className="diff-table">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Current</th>
                    <th>Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>
                        <pre>{display(review.before?.[k])}</pre>
                      </td>
                      <td className="proposed">
                        <pre>{display(review.proposed[k])}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              {review.method === "DELETE"
                ? "This removes the selected object from IRIS."
                : "This invokes the selected operation on IRIS."}
            </p>
          )}
          <p className="muted">
            The review expires after two minutes. Existing configuration is
            checked again before applying. Secret values are hidden.
          </p>
          <div className="modal-actions">
            <Button onClick={onClose}>Back</Button>
            <Button primary disabled={busy} onClick={apply}>
              {busy ? "Applying…" : "Apply change"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
