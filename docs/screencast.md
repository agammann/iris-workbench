# IRIS Workbench screencast

The [verified 149.96-second MP4](https://github.com/agammann/iris-workbench/releases/download/v1.0.3/iris-workbench_1.0.3_screencast.mp4) is ready to hand to the Developer Community team. It shows the released local app connected to a real, disposable IRIS instance. The hosted design sample uses fictional data and is a separate experience.

## Storyboard

1. Introduce Workbench's inspection, review and verification workflow on the live Workspace.
2. Verify the disposable `/workbench-demo` service returns HTTP 404 before recording. The video shows its disabled configuration and captions this independent precheck.
3. Open Apps, filter for the service and inspect its configuration.
4. Edit `Enabled` to `true`, review the single changed field, and apply it.
5. Show the result's field readback. Make a separate request to the service and show HTTP 200 with `{"service":"Workbench demonstration","status":"ready"}`.
6. Inspect bounded runtime message logs and system capacity from the actual instance.
7. Return to Workspace to show this session's applied-change history. End with the release and installation links.

The demonstration changes only the disposable service. It does not modify existing users, roles, secrets, certificates, tasks or processes. There is no automatic rollback. The review's conflict check is best effort rather than an atomic read/write transaction.

## Recording and handoff

The `Record IRIS Workbench live screencast` GitHub Actions workflow records the exact v1.0.3 release, using a separate checkout, a pinned IRIS Community 2026.2 Linux image and Playwright Chromium. Browser plugin not available is the reason for using Playwright. It installs the recording dependency outside the app checkout; product dependencies and the frozen lockfile remain unchanged.

The recording begins after authentication. It must never contain a password, private connection state, browser storage, request headers or traces. Captions and the HTTP status/result presentation are recording annotations, not new Workbench features. The service response must come from a separate, real IRIS request.

The successful [recording run](https://github.com/agammann/iris-workbench/actions/runs/38512946139) produced a silent, captioned MP4, screenshots and a machine-readable verification summary as an Actions artifact. The verified MP4 is also a public v1.0.3 release asset; [screenshots and QA](https://github.com/agammann/iris-workbench/tree/808d41c0e3dcab93872d0c6bed4bcaf2d8a7742a/evidence/screencast) are preserved at an exact evidence commit. Send the MP4 to Iryna's team for the InterSystems Developers YouTube channel. Add the actual YouTube URL to the Open Exchange description and Developer Community article after the team publishes it.

Publication saves the sanitized evidence and verifies the source release before uploading the MP4, then checks the source and media again afterward. A published video is immutable: another capture cannot replace it. If an upload succeeds but a later check or job output fails, retry only the publishing job with the same captured artifact so the exact-hash reuse check can recognize it. A changed source release still requires investigation before retrying.

An Actions artifact is a handoff file, not evidence that the video is on YouTube. The Developer Community article in [community-article.md](community-article.md) is a publication draft until a real Community URL exists.

Release: https://github.com/agammann/iris-workbench/releases/tag/v1.0.3

Installation: https://github.com/agammann/iris-workbench/blob/v1.0.3/README.md

Repeatable demonstration: https://github.com/agammann/iris-workbench/blob/v1.0.3/DEMO.md
