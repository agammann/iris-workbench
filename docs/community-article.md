# IRIS Workbench: review a change, apply it, and verify it on a real instance

A disabled REST service returns HTTP 404. In IRIS Workbench, I select that application's configuration, change `Enabled` from `false` to `true`, and review the proposed change before applying it. Workbench reads the configuration back from IRIS. A separate request to the service then returns HTTP 200:

```json
{"service":"Workbench demonstration","status":"ready"}
```

That is the project's central workflow: inspect a resource, review a specific change, and check the actual result. Watch the [2.5-minute captioned screencast](https://github.com/agammann/iris-workbench/releases/download/v1.0.3/iris-workbench_1.0.3_screencast.mp4) of the released 1.0.3 app on a real, disposable IRIS Community 2026.2 instance. The [verification summary](https://github.com/agammann/iris-workbench/blob/808d41c0e3dcab93872d0c6bed4bcaf2d8a7742a/evidence/screencast/qa-summary.json) records the checks; the [walkthrough](https://github.com/agammann/iris-workbench/blob/v1.0.3/DEMO.md) makes it repeatable.

## Why build another management interface?

When managing an instance, the next useful step often crosses several areas: an application's configuration, its access settings, the processes behind it, and the logs that explain what happened. Workbench brings these into one local interface and makes the transition from inspection to a change explicit.

I built [IRIS Workbench](https://github.com/agammann/iris-workbench) for the InterSystems management portal contest. It is an independent, MIT-licensed community project. Version [1.0.3](https://github.com/agammann/iris-workbench/releases/tag/v1.0.3) is available as a versioned source ZIP with checksums and a manifest identifying its source and pinned dependencies.

The interface has six management areas:

- **Apps:** web application inspection, creation, configuration editing and deletion.
- **Access:** users, roles and resources, including role assignment and revocation.
- **Security:** wallet collections and secrets, certificate metadata and import from file paths on the IRIS host, TLS configuration, and OAuth server/client configuration.
- **Tasks:** definitions, schedules, run requests, suspension, resumption and history.
- **System:** processes, devices, CPU load, memory and disk capacity.
- **Logs:** runtime messages, audit events, task history, journal records, alerts and System Monitor logs.

A read API explorer exposes documented endpoints. Workspace keeps the current session's applied-change history.

## The review is part of the operation

Here is the live demonstration's review screen:

![Live demonstration: review Enabled changing from false to true](https://raw.githubusercontent.com/agammann/iris-workbench/808d41c0e3dcab93872d0c6bed4bcaf2d8a7742a/evidence/screencast/02-review-enabled-change.png)

*Recorded live-instance demonstration: the proposed change is one field on `/workbench-demo`.*

The backend prepares a review tied to the connected session. Reviews expire after two minutes. Before writing an existing object with a configured read path, Workbench reads it again and compares its fingerprint with the reviewed version. If it changed, the operator must refresh and review again.

This is a best effort conflict check. The read and write are not an atomic transaction, and Workbench does not provide automatic rollback.

After applying the change, the result distinguishes an accepted operation from verified field readback:

![Live demonstration: changed fields verified from IRIS](https://raw.githubusercontent.com/agammann/iris-workbench/808d41c0e3dcab93872d0c6bed4bcaf2d8a7742a/evidence/screencast/03-verified-change-result.png)

*Recorded live-instance result. The separate HTTP service request confirms the endpoint responds; configuration readback alone does not establish service availability.*

## How it connects to IRIS

The React frontend talks to a local Node backend. That backend manages one configured IRIS instance and sends requests using the connected user's IRIS credentials. Reads and changes retain that user's permissions. The password stays in backend memory for a one-hour session and is removed on sign-out; it is not returned to the browser.

Management requests use `/api/admin` and the organizer's [SysAdmin API specification](https://github.com/intersystems-community/sysadmin-api-specification), pinned to a specific commit and checked by SHA256. A separate ObjectScript REST extension at `/api/workbench` uses Embedded Python for bounded Linux text-log access and system capacity. It requires `%Admin_Operate` access.

The portal runs locally and binds to loopback by default. Remote IRIS connections require HTTPS. The hosted design sample contains fictional data and cannot perform live management operations; use the local Node backend and select **Live data** to inspect your instance.

## Logs with explicit limits

Workbench supports the configured console path, matching rotations, small gzip archives and explicitly configured application text logs. An operator can add those application sources on the IRIS host. Browser requests select source IDs and listed filenames rather than arbitrary filesystem paths.

Uncompressed files page backward in windows of at most 256 KiB and 200 complete lines. Gzip reads allow at most 1 MiB compressed and 1 MiB expanded data. Backend IRIS responses are capped at 8 MiB. These bounds prevent a log view from becoming an unrestricted file download.

Audit and journal queries remain subject to the user's privileges. Missing files are reported as unavailable. Structured sensitive fields are redacted, but application-written log text can still contain sensitive information. Exact source behavior and limits are documented in [LOGS.md](https://github.com/agammann/iris-workbench/blob/v1.0.3/LOGS.md).

## Start with a disposable local demonstration

The [1.0.3 README](https://github.com/agammann/iris-workbench/blob/v1.0.3/README.md) provides shell-specific setup instructions. Node.js 24.19.0 or later and pnpm 11.19.0 are required. Fresh setup also needs Docker running Linux containers and uses a digest-pinned IRIS Community 2026.2 image.

For an existing instance, Workbench signs in through `GET /api/admin/info` with HTTP Basic authentication. `/api/admin` must be enabled and allow Password authentication, and the account must be enabled with a valid password. `%ALL` does not bypass authentication. Installing `/api/workbench` configures the separate extension; it does not change `/api/admin`.

Follow `DEMO.md` to create `/workbench-demo` disabled, confirm HTTP 404, enable it through review/apply, and confirm the JSON response above. The script refuses to overwrite an existing application and checks its identity before cleanup.

## What 1.0.3 fixes, and what has been verified

The current release includes clearer authentication diagnostics and checks the sign-in endpoint during fresh setup. Version 1.0.3 also rejects empty or incomplete server-information responses before creating a session. Successful empty write responses, including HTTP 204, are handled without crashing. A read or polling response that resolves to null is now reported as a protocol error.

[Release CI](https://github.com/agammann/iris-workbench/actions/runs/38507236290) passed Linux and Windows source-consumer checks and a fresh pinned-IRIS live connection check. The [verification record](https://github.com/agammann/iris-workbench/blob/v1.0.3/VERIFICATION.md) documents representative management operations. Other IRIS versions remain unverified; OAuth configuration checks do not prove an external identity-provider authorization flow.

Try the disposable demonstration and share your IRIS version, the workflow you tested and any sanitized error in the [issue tracker](https://github.com/agammann/iris-workbench/issues). I would welcome feedback on which daily administration workflow Workbench should make easier next.
