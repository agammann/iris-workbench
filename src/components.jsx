import React, { useEffect, useRef } from "react";
import {
  IconSearch,
  IconRefresh,
  IconX,
  IconCircleFilled,
  IconChevronRight,
  IconExternalLink,
  IconPlus,
} from "@tabler/icons-react";
import { display } from "./api";
export function Button({ children, primary = false, icon: Icon, ...props }) {
  return (
    <button className={primary ? "button primary" : "button"} {...props}>
      {Icon && <Icon size={20} stroke={1.7} />} {children}
    </button>
  );
}
export function Status({ value }) {
  const text =
    typeof value === "boolean"
      ? value
        ? "Enabled"
        : "Disabled"
      : String(value || "Info");
  return (
    <span className={"status " + text.toLowerCase().replaceAll(" ", "-")}>
      <IconCircleFilled size={11} />
      {text}
    </span>
  );
}
export function ErrorBox({ error }) {
  return error ? (
    <div className="error" role="alert">
      {error.message || error}
    </div>
  ) : null;
}
export function Search({
  value,
  onChange,
  placeholder = "Filter results",
  label = placeholder,
}) {
  return (
    <label className="search">
      <IconSearch size={21} stroke={1.7} />
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function Table({
  rows,
  columns,
  idKey = "id",
  selected,
  onSelect,
  empty = "No results in this view.",
  footer,
}) {
  return (
    <div className="table-shell">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((k) => (
                <th key={k}>{k.replace(/([a-z])([A-Z])/g, "$1 $2")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={String(row[idKey] ?? i)}
                className={
                  String(row[idKey]) === String(selected) ? "selected" : ""
                }
                onClick={() => onSelect?.(row)}
              >
                {columns.map((k, j) => (
                  <td key={k}>
                    {j === 0 && onSelect ? (
                      <button
                        className="row-select"
                        aria-label={
                          row[k] === ""
                            ? `Inspect ${String(row.Event || "row " + (i + 1)).slice(0, 120)}`
                            : undefined
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(row);
                        }}
                      >
                        {display(row[k])}
                      </button>
                    ) : ["State", "Enabled", "Suspended"].includes(k) ? (
                      <Status
                        value={
                          k === "Suspended"
                            ? row[k]
                              ? "Suspended"
                              : "Scheduled"
                            : row[k]
                        }
                      />
                    ) : (
                      <span
                        className={
                          ["Event", "DispatchClass", "Pid", "Time"].includes(k)
                            ? "mono"
                            : ""
                        }
                      >
                        {display(row[k])}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">{empty}</div>}
      </div>
      <div className="table-foot">{footer || `${rows.length} results`}</div>
    </div>
  );
}
export function Details({ data, limit = 30 }) {
  return (
    <dl className="details">
      {Object.entries(data || {})
        .slice(0, limit)
        .map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt>
            <dd>
              {typeof v === "boolean" ? (
                <Status value={v} />
              ) : typeof v === "object" ? (
                <pre>{JSON.stringify(v, null, 2)}</pre>
              ) : (
                <span
                  className={
                    k.match(
                      /NameSpace|Namespace|Application|Class|Resource|Id|Name/,
                    )
                      ? "identifier"
                      : ""
                  }
                >
                  {display(v)}
                </span>
              )}
            </dd>
          </React.Fragment>
        ))}
    </dl>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <IconX size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export { IconRefresh, IconChevronRight, IconExternalLink, IconPlus };
