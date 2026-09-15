# Log coverage and configuration

Workbench combines IRIS management APIs with a bounded extension for text files. The source selector contains runtime messages, audit events, task history, journal records, alerts and System Monitor. Administrators can add application or subsystem text logs explicitly.

## Runtime files and rotations

The extension obtains `ConsoleFile` from `Config.config` for the active messages log. If unset, it uses the manager directory. IRIS documents this setting in the [console reference](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=RACS_ConsoleFile). Alerts and System Monitor default to files in the manager directory.

The Log file selector lists the current file and matching rotations. It recognizes `messages.old_Date`, the convention documented by [MaxConsoleLogSize](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=RACS_MaxConsoleLogSize), as well as numeric or date suffix rotations such as `messages.log.1` and gzip variants.

Older events loads the preceding page. Latest events returns to the current tail. If the file changes, an older page cursor is rejected so records from different file versions are not silently mixed. Pause automatic refresh while inspecting older pages.

## Add an application or subsystem log

On the IRIS server, create `workbench-logs.json` in the active manager directory. This file is local operator configuration and is never editable through the portal. Use absolute paths on that server:

```json
[
  {
    "id": "orders",
    "label": "Orders service",
    "path": "/var/log/my-application/orders.log"
  }
]
```

The extension reads this file on each catalogue or log request. Select Reload sources to refresh the browser catalogue. The IRIS service account must be able to read the directory and file. On Docker, mount or copy the configuration and intended log directory into the IRIS container. Do not put credentials into this configuration.

Only the configured file and its matching rotations can be selected. The browser sends source IDs and listed filenames, never arbitrary filesystem paths. Keep this configuration writable only by the operator. Operators who can use `%Admin_Operate` can read these configured sources, so configure only files appropriate for that role.

## Limits and source semantics

| Source | Bound and behavior |
| :--- | :--- |
| Uncompressed runtime files | Up to 200 complete lines from a 256 KiB byte window per page. Older pages use an unchanged file snapshot. Oversized partial lines are omitted with an explicit message. |
| Gzip archives | At most 1 MiB compressed input and 1 MiB expanded data, showing the latest 200 lines. Larger archives are rejected. Use an uncompressed rotation for paging. |
| Source catalogue | Three built in sources plus up to 16 configured sources. Each directory scan examines at most 2,000 entries and returns at most 64 matching files. The UI reports a reached limit. |
| Audit | Bounded asynchronous API query, with optional UTC time window. Requires the user's IRIS audit privileges. |
| Journal | Select a journal file and run the bounded asynchronous journal record query. Records are distinct from human readable runtime events. |
| Tasks | Recent task history from the management API. A queued run and actual execution are different states. |

Symlinks, special files and unlisted filenames are rejected. The text reader targets Linux IRIS and uses directory file descriptors and `O_NOFOLLOW` at the actual file open. It does not recursively scan disks. Direct permissions and the extension's `%Admin_Operate` check still apply.

Structured secret fields are redacted by the Node backend. Free text in logs is not automatically sanitized. The original line is available in the inspector; unknown timestamps remain visibly unset rather than fabricated.

This covers the core management sources and explicitly configured text logs. It does not claim universal access to every optional subsystem's proprietary or binary log format, Windows event logs, external hosts or interoperability message bodies. Those require their own source adapters and privileges.

## Verify the reader

Run the pure Python tests inside the Linux IRIS container:

```powershell
$env:IRIS_CONTAINER = 'your-iris-container'
node scripts/test-logs.mjs
```

Tests cover pagination continuity, Unicode, stale cursors, rotations, custom and console paths, gzip expansion bounds, oversized lines and symlink rejection.
