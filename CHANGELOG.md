# Changelog

## 1.0.8

- Restore fresh local setup with the verified InterSystems IRIS Community 2026.2 Build 221 image digest. The source manifest records the same pin.
- Update the versioned source download and checksum instructions.

## 1.0.7

- Identify fictional-only static previews explicitly, show their design sample without a bootstrap error, and omit IRIS credential forms and live management controls in that mode.
- Reject static credential and management requests without reading their bodies or forwarding them to assets. Preserve the independent local Node connection and permission checks.
- Patch Vite to 6.4.6 for the upstream exposed-development-server advisory while preserving loopback defaults.
- Correct current release and setup descriptions and repository instructions. Record the November 19 audit recheck in the verification notes.

## 1.0.6

- Require operator confirmation when starting a configured session and restrict plaintext connections to numeric loopback.
- Preserve manual sign-in and existing private connection files, with updated local recovery guidance.

## 1.0.5

- Require the pinned disposable demonstration service's exact response before recording it or saving screencast QA evidence.
- Store only checked demonstration facts in QA, and verify the real service response and cleanup in disposable IRIS CI.
- Retain the 1.0.4 private-state protections and local operator behavior.

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
