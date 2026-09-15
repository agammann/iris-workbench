"""Bounded, explicitly configured IRIS text log access. No browser supplied paths."""
import base64
import gzip
import itertools
import json
import os
from pathlib import Path
import re
import stat

WINDOW = 262144
MAX_LINES = 200
MAX_FILES = 64
MAX_SCAN = 2000
MAX_GZIP = 1048576


def sources(root, console=""):
    root = Path(root).resolve()
    messages = Path(console) if console else root / "messages.log"
    if not messages.is_absolute():
        messages = root / messages
    result = [
        {"id": "messages", "label": "Runtime messages", "path": messages},
        {"id": "alerts", "label": "Alerts", "path": root / "alerts.log"},
        {"id": "system-monitor", "label": "System Monitor", "path": root / "SystemMonitor.log"},
    ]
    config = root / "workbench-logs.json"
    if config.exists():
        with config.open("rb") as stream:
            raw = stream.read(32769)
        if len(raw) > 32768:
            raise ValueError("Log configuration exceeds 32 KiB")
        extra = json.loads(raw)
        if not isinstance(extra, list) or len(extra) > 16:
            raise ValueError("Log configuration must contain at most 16 sources")
        ids = {r["id"] for r in result} | {"audit", "journal", "tasks"}
        for entry in extra:
            sid, label, filename = entry.get("id"), entry.get("label"), entry.get("path")
            if not isinstance(sid, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,39}", sid) or sid in ids:
                raise ValueError("Invalid or duplicate configured source ID")
            if not isinstance(label, str) or not 1 <= len(label) <= 80:
                raise ValueError("Invalid configured source label")
            if not isinstance(filename, str) or not Path(filename).is_absolute():
                raise ValueError("Configured log paths must be absolute paths on the IRIS server")
            ids.add(sid)
            result.append({"id": sid, "label": label, "path": Path(filename)})
    return result


def matches(name, current):
    # IRIS uses messages.old_Date; also accept common numeric/date rotations.
    stem = current[:-4] if current.endswith(".log") else current
    return name == current or bool(re.fullmatch(
        rf"(?:{re.escape(current)}\.[0-9][0-9_.-]*|{re.escape(stem)}\.old_[A-Za-z0-9_.-]+)(?:\.gz)?", name
    ))


def files_for(source):
    path = source["path"]
    folder = path.parent.resolve()
    found = []
    limited = False
    try:
        with os.scandir(folder) as entries:
            for i, entry in enumerate(itertools.islice(entries, MAX_SCAN + 1)):
                if i == MAX_SCAN:
                    limited = True
                    break
                if not matches(entry.name, path.name) or not entry.is_file(follow_symlinks=False):
                    continue
                s = entry.stat(follow_symlinks=False)
                found.append({"name": entry.name, "bytes": s.st_size, "modified": s.st_mtime,
                              "current": entry.name == path.name, "compressed": entry.name.endswith(".gz")})
    except FileNotFoundError:
        pass
    found.sort(key=lambda x: (not x["current"], -x["modified"], x["name"]))
    return found[:MAX_FILES], limited or len(found) > MAX_FILES


def catalogue(root, console=""):
    result = []
    for source in sources(root, console):
        files, limited = files_for(source)
        result.append({"id": source["id"], "label": source["label"], "files": files,
                       "available": bool(files), "limited": limited})
    return {"sources": result, "note": "Configured text logs and available rotations. Reads are bounded; binary subsystem records use their dedicated views."}


def encode_cursor(before, stamp):
    return base64.urlsafe_b64encode(json.dumps({"before": before, "stamp": stamp}).encode()).decode()


def read_log(root, sid, filename="", cursor="", console=""):
    source = next((s for s in sources(root, console) if s["id"] == sid), None)
    if source is None:
        raise ValueError("Unknown runtime log source")
    listed, limited = files_for(source)
    filename = filename or source["path"].name
    if filename != Path(filename).name or "/" in filename or "\\" in filename:
        raise ValueError("Select a listed log file")
    if not any(f["name"] == filename for f in listed):
        if filename == source["path"].name and not listed:
            return {"source": sid, "file": filename, "lines": [], "available": False,
                    "note": "This source has no readable log files on this instance."}
        raise ValueError("The file is not in this source catalogue. Refresh the source list.")
    folder = source["path"].parent.resolve()
    # Open the directory once and refuse symlinks and special files at the actual read.
    directory = os.open(folder, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        fd = os.open(filename, os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0), dir_fd=directory)
    finally:
        os.close(directory)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise ValueError("Only regular text log files can be read")
        stamp = [sid, filename, info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns]
        before = info.st_size
        if cursor:
            if len(cursor) > 2048:
                raise ValueError("Invalid log cursor")
            try:
                value = json.loads(base64.urlsafe_b64decode(cursor))
                before = value["before"]
                if value["stamp"] != stamp:
                    raise ValueError("This log changed. Return to the latest events.")
            except (KeyError, TypeError, json.JSONDecodeError) as exc:
                raise ValueError("Invalid log cursor") from exc
            if isinstance(before, bool) or not isinstance(before, int) or not 0 <= before <= info.st_size:
                raise ValueError("Invalid log offset")
        if filename.endswith(".gz"):
            if cursor or info.st_size > MAX_GZIP:
                raise ValueError("Compressed archive exceeds the 1 MiB read limit or does not support paging")
            with gzip.GzipFile(fileobj=stream) as archive:
                raw = archive.read(MAX_GZIP + 1)
            if len(raw) > MAX_GZIP:
                raise ValueError("Expanded archive exceeds 1 MiB. Use an uncompressed rotation to page through it.")
            lines = raw.decode("utf-8", errors="replace").splitlines()
            return {"source": sid, "file": filename, "lines": lines[-MAX_LINES:][::-1], "available": True,
                    "truncated": len(lines) > MAX_LINES, "limit": MAX_LINES,
                    "note": "Compressed archive: latest 200 lines, at most 1 MiB expanded."}
        offset = max(0, before - WINDOW)
        stream.seek(offset)
        raw = stream.read(before - offset)
        if offset:
            stream.seek(offset - 1)
            if stream.read(1) != b"\n":
                boundary = raw.find(b"\n")
                if boundary < 0:
                    return {"source": sid, "file": filename, "lines": [], "available": True,
                            "nextCursor": encode_cursor(offset, stamp), "note": "An oversized line was omitted. Load older events to continue."}
                offset += boundary + 1
                raw = raw[boundary + 1:]
        chunks = raw.splitlines(keepends=True)
        chosen = chunks[-MAX_LINES:]
        first = offset + sum(len(x) for x in chunks[:-MAX_LINES])
        return {"source": sid, "file": filename,
                "lines": [x.decode("utf-8", errors="replace").rstrip("\r\n") for x in chosen][::-1],
                "available": True, "limit": MAX_LINES, "truncated": first > 0,
                "nextCursor": encode_cursor(first, stamp) if first > 0 else None,
                "note": "Up to 200 lines per page from a 256 KiB window. Older pages require an unchanged file."}


def dispatch(root, action, sid="messages", filename="", cursor="", console=""):
    try:
        return catalogue(root, console) if action == "catalogue" else read_log(root, sid, filename, cursor, console)
    except (OSError, ValueError, TypeError) as exc:
        # Paths and exception details can contain operator configuration; return actionable categories only.
        if isinstance(exc, ValueError):
            return {"error": str(exc)[:200]}
        return {"error": "The configured log could not be read. Check its file permissions and configuration."}
