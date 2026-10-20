# Changelog

## 1.0.4

- Reserve private setup state before starting Docker and publish complete credentials and connection files without replacing existing entries.
- Enforce private state directory permissions on Windows and POSIX, preserve recovery credentials after partial setup, and reject concurrent setup reservations.
- Read credential and connection JSON through bounded regular-file descriptors across startup, configured sign-in and local verification tools.
- Add setup, permission, publication and concurrent-file regressions while preserving manual sign-in and explicit existing-instance credential paths.

## 1.0.3

- Reject direct or enveloped null JSON results from ordinary reads and asynchronous polling with a protocol error.
- Preserve successful empty write responses, asynchronous acceptance and valid empty read lists.
- Add connection and request-handler regressions for null reads and polling results.

## 1.0.2

- Handle empty successful write responses, including HTTP 204 and asynchronous polling locations, without iterating a null response stream.
- Reject empty or malformed server-information responses before creating a session or saved connection; keep empty read responses as protocol errors.
- Add request-handler and setup regressions for empty bodies, null results and missing server-information fields.

## 1.0.1

- Preserve upstream authentication failures, including empty and HTML 401 responses, with connection and permission diagnostics.
- Verify the admin sign-in endpoint during fresh setup and document existing-instance authentication and web-origin prerequisites.
- Clarify tooling, shell-specific quick starts, local-only demonstration credentials and source-download instructions.
- Gate publication on a real fresh-instance connection smoke test alongside Linux and Windows source-consumer checks.

## 1.0.0

- Deliver versioned MIT source, frozen dependencies, SHA256 checksums and a manifest of the checked source and pinned upstream inputs.
- Add installation, upgrade, partial-setup recovery, private-state handling and support instructions for the verified local IRIS Community configuration.
- Apply the available source-map-js 1.2.2 update while retaining the management interface, backend, setup and extension implementation.
- Require Linux and Windows source consumer verification and guarded immutable publication.

## 0.1.0

Initial local management portal, reviewed writes, permission-preserving live reads, bounded log extension, digest-pinned setup and repeatable demonstration. Historical results remain in VERIFICATION.md and evidence/.
