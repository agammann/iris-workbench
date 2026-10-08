# Verification record

## October 8, 2026 v1 review

The supported live configuration remains Windows 11 x64, Node 24.19.0, pnpm 11.19.0 and IRIS Community `2026.2.0.221.0com` in the digest-pinned Linux container. Chrome 155.0.8059.12 and Edge 154.0.4258.62 each completed 19 live management/view checks without uncaught page errors. Layouts at 1440, 390 and 320 CSS pixels had no page-wide overflow. See the sanitized [current check record](evidence/v1-checks.json).

A fresh uniquely named Community instance completed the documented setup, extension install and actual runtime log read. The ordinary **Connect local instance** path connected the browser. A disposable disabled REST service returned HTTP 404; reviewing and enabling its one field in the browser produced independent HTTP 200 readback. Reload reconnected the live session. The same browser review flow restored the disabled state and independent HTTP 404, then ordinary Disconnect returned to the connection screen. Keyboard controls had visible focus.

Actual instance checks repeated stale-review rejection (409), restricted-account denial/grant/revoke (403/200/403), password and wallet redaction, wallet metadata/blocked secret retrieval, scheduled heartbeat execution, task control, identified disposable process suspension/resumption, bounded real logs and capacity. Disposable certificate, TLS and OAuth configuration lifecycles passed and were cleaned up. OAuth covered configuration, not identity-provider authorization.

Separate real-backend session checks used an **explicit controlled clock** to test the two-minute review and one-hour session limits. They checked rejection without an IRIS write, signout invalidation and rejection of a review by another session. This is an expiry fixture, not a claim that a browser was left running for an hour. No test-only clock hook is shipped.

The v1 source installed with the frozen lockfile on actual pnpm 11.19.0, built, passed eight Node tests and four preserved static packaging tests, and had no reported dependency advisories after the available source-map-js 1.2.2 update. The seven Python log tests passed inside the Linux IRIS container; their directory-file-descriptor operations are intentionally Linux-specific. Direct setup regressions also verify invalid names/ports and unavailable Docker fail before state creation. App, backend, setup and extension implementation bytes remain unchanged from the reviewed management release.

Exact source ZIP/checksum/manifest validation and fresh extracted consumer checks are required by the release workflow on both Linux and Windows. Those package checks do not create an instance; live operation is checked separately above. Database backup/restore instructions delegate to IRIS-owned procedures and are not a tested production restoration claim. The earlier sections and their first attempts remain historical records.

## October 2, 2026 review

A fresh disposable container using the pinned IRIS Community 2026.2 image completed setup, extension installation, and a real runtime log read. The production build and Node server ran on Windows with Node 24.19.0 and pnpm 11.19.0. Chrome 154.0.8037.95 and Edge 154.0.4258.48 exercised the running portal.

This review corrected two defects:

- The wallet names and types endpoint was incorrectly blocked by the secret retrieval filter. The portal now permits that metadata list while continuing to reject secret retrieval. A real wallet collection and secret were created and replaced; the returned list contained only `Name` and `Type`. The browser displayed the secret entry in both tested browsers.
- The Docker log test command returned success without running tests when the Docker executable was unavailable. Docker startup errors now fail explicitly, and setup verifies that the daemon runs Linux containers before writing state. A subprocess regression test verifies failure with Docker absent. Setup also refused an existing container without creating the requested state directory.

Vite was updated from 6.4.2 to 6.4.3. The dependency audit then reported no known advisories, and CI now runs the audit. This is dependency maintenance, not a claim of an exhaustive security audit.

Actual instance checks passed:

1. The demonstration service returned HTTP 404 while disabled. Enabling it through the browser's one-field review returned **Changed fields verified from IRIS**, and a separate request returned HTTP 200 with the expected service JSON. Session history recorded the change. Cleanup verified deletion and restored HTTP 404.
2. A concurrent configuration change caused the stale review to return HTTP 409.
3. A disposable restricted account received HTTP 403, then 200 after role assignment, then 403 after revocation for the same protected read. Password and wallet values were hidden in reviews.
4. A scheduled `Workbench.Heartbeat` task actually increased its counter. Task suspend and resume requests also succeeded. A separate identified disposable Workbench process changed to SUSP after suspension and HANG after resumption.
5. A disposable certificate was imported and its validity fields read. TLS and OAuth server/client configurations were created, read, updated, and removed. OAuth checks covered configuration only; no identity provider authorization was performed.
6. All management tabs, live runtime/audit/task logs, system capacity, and browser review/apply/readback flows passed in Chrome and Edge without uncaught page errors. Design sample layouts had no page-wide overflow at 1440, 390, and 320 CSS pixels. Tables and navigation retain their own horizontal scrolling on narrow screens.

Seven Node tests, seven Python log tests inside the actual IRIS container, four packaging tests, the production build, and the dependency audit passed. Temporary accounts, roles, wallet entries, tasks, and security configurations were removed. Raw credentials and instance logs are not included in this report. The results below remain historical records; neither review establishes compatibility with every IRIS version, browser, or deployment environment.

## September 14, 2026 verification

Verified September 14, 2026 in America/Los_Angeles. Evidence timestamps use UTC and therefore include September 15. This record describes a working local build, not a published or submitted contest entry.

## Environment

Windows host, Node.js 24.19.0, pnpm 11.19.0, Docker Linux containers, IRIS Community `2026.2.0.221.0com`. The container image is pinned to `sha256:87c8b9062530093d30384d66caa9933b8399bfbace7ddb7f1bdb983c0bfdb85b`. The production client and Node backend were tested together at `http://127.0.0.1:3411`.

## Functional results

| Area | Observed result | Evidence |
| :--- | :--- | :--- |
| Application changes | Created a disposable disabled application, enabled it, verified the changed field from IRIS, and removed it. A separate browser exercise completed the form, one field review and apply flow. | [API lifecycle](evidence/lifecycle.json), [browser result](evidence/browser-app-verified.png) |
| Concurrent changes | Modified the object after preparing a review. Applying the stale review returned HTTP 409. | [Lifecycle](evidence/lifecycle.json) |
| Actual permissions | A restricted test user received HTTP 403 before role assignment, HTTP 200 after assignment, and HTTP 403 after revocation for the same protected read. Temporary user and role were removed. | [Lifecycle](evidence/lifecycle.json) |
| Wallet | Created a collection and secret, replaced the secret, checked redaction in review, and cleaned up. | [Lifecycle](evidence/lifecycle.json) |
| Certificates, TLS and OAuth | Imported a disposable certificate, created a TLS configuration and OAuth server definition, created and updated a client configuration, then removed all four. The client update reported matching fields on readback. | [Security lifecycle](evidence/security-lifecycle.json) |
| Task execution | Created and controlled a harmless task. A separate execution check observed the Workbench heartbeat counter increase from 0 to 1 after the IRIS scheduler ran it. The task was removed. | [Controls](evidence/lifecycle.json), [actual execution](evidence/task-execution.json) |
| Processes | Identified a disposable Workbench process before acting. Suspend returned HTTP 200 and state SUSP; resume returned HTTP 200 and state HANG. The temporary process then ended naturally. | [Process control](evidence/process-control.json) |
| System capacity | Read CPU load, CPU count, host and container memory, disk totals and free space. The UI labels memory and storage units and retains exact bytes in details. | [Fresh install](evidence/fresh-install.json) |
| Logs | Read 200 runtime messages, 200 audit records, 42 task history records, 100 journal records and 2 System Monitor lines. The alerts file was absent and correctly reported unavailable. These are point in time counts. | [Lifecycle](evidence/lifecycle.json) |
| Fresh setup | The setup script created a second clean container, installed the extension and read live logs. A second backend connected successfully and read applications, roles, tasks, processes and capacity. The test backend and second container were stopped afterward. | [Fresh install](evidence/fresh-install.json) |
| Request boundaries | Unauthenticated read returned 401. Cross origin and missing custom header requests returned 403. Protected application edits and secret retrieval through the explorer were rejected. | [Fresh install](evidence/fresh-install.json) |
| Final smoke check | A Unicode description containing accented and Japanese characters survived write and readback. The browser test application was deleted, with absence verified. Runtime log reads still returned 200 lines. | [Final smoke](evidence/final-smoke.json) |

## Browser and build checks

The Codex in app browser exercised local connection, sample/live switching, sample time filtering, application creation and editing, the review and result dialogs, system capacity, a real API explorer request, and the empty OAuth parent selection state. Create is disabled until a required parent is selected. Keyboard Tab navigation to the time filter showed a visible focus outline. The final browser console check returned no warnings or errors.

The selected design was compared against rendered screenshots at its native 1487 by 1058 frame. Tablet, compact desktop and mobile layouts were also inspected. See [design QA](design-qa.md) for findings and fixes. These checks are not an exhaustive screen reader or assistive technology audit.

`node --test tests/core.test.mjs`: 5 tests passed, 0 failed. Tests cover nested credential redaction without hiding security flags, path and traversal rejection, secret read blocking, stale configuration fingerprints and both observed error envelope formats.

`pnpm run build`: passed on the final source. The final production JavaScript bundle is approximately 237 kB before compression and 74 kB with gzip. The supplied schema fetch passed its pinned SHA256 check.

## Earlier failures retained

[Initial lifecycle](evidence/lifecycle-initial.json) records a rejected attempt to give a user and role the same name. [Second lifecycle](evidence/lifecycle-second.json) records a privilege choice that did not provide the intended permission probe. The final test uses distinct names and a protected security read. These earlier reports are preserved as development history, not passing verification.

An accepted task run request did not establish actual execution, so the separate heartbeat check above was required. The organizer schema also named the OAuth client server field differently from the running 2026.2 implementation. The adapter uses the observed `ServerDefinition` field. Installation now copies the two ObjectScript files explicitly, avoiding nested directory behavior on repeated Docker copies.

## Practical limits

1. Coverage was verified on the pinned Linux Community image. Other IRIS versions and operating systems remain unverified.
2. OAuth tests cover configuration lifecycle only. No real identity provider authorization flow was performed. Certificate import uses paths on the IRIS host; it is not a browser upload flow.
3. Runtime logs now support the configured console path, rotations, bounded gzip archives and explicitly configured application text logs. The remaining boundary is optional binary or proprietary subsystem formats, Windows event logs, external hosts and interoperability message bodies. See LOGS.md.
4. Reviews perform a best effort stale check, not an atomic transaction or rollback. An accepted operation and a verified result are reported separately.
5. Session history is in memory. Durable audit coverage depends on IRIS audit settings. Log text may contain application supplied sensitive information.
6. Lifecycle tests exercise the backend used by the UI. Every schema field and every possible browser action combination has not been exhaustively tested.
7. The app runs locally. The MIT license and repeatable demonstration are complete. Publication, moderation and contest status are tracked in RELEASE.md; participant declarations must come from the participant.

## Version 0.1.0 completion pass

The expanded log reader passed all 7 Python tests inside the Linux IRIS container. The Windows host test attempt exposed the intentional Linux dependency on directory file descriptors; the shipped test command therefore runs inside the Linux container. The 5 Node core tests and 4 preserved packaging tests also passed, for 16 passing automated checks. The production build passed.

[Expanded log coverage](evidence/log-coverage.json) records 701 demonstration entries retrieved through the real IRIS extension and Node endpoint, without loss or duplicates, plus an IRIS style rotation and a gzip archive. These custom log entries are explicitly demonstration fixtures. The normal messages and System Monitor sources still returned real instance data; absent alerts were reported unavailable.

[REST service demonstration](evidence/demo-service.json) records the actual endpoint changing from HTTP 404 while disabled to HTTP 200 with the expected service JSON after the browser review and apply flow. [Review screenshot](evidence/demo-review.png) and [result screenshot](evidence/demo-result.png) show the one field change and verified readback. Cleanup subsequently confirmed the disposable app no longer existed.

[Release installation](evidence/release-install.json) records another new Community container created by the release setup, including the Python helper and all three ObjectScript classes. The separate backend read live management data, runtime messages, audit and capacity. Request boundary checks again passed. This is fresh installation evidence for the expanded release, separate from the earlier build.

[Archived log browser view](evidence/rotation-browser.png) records source and rotation selection. Browser paging showed Page 2 beginning with demonstration Activity 500 after Page 1 began with Activity 700. Timestamp free log records are explicitly labeled, and row inspection has a unique accessible name derived from the event text.
