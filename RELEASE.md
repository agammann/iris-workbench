# Release 1.0.3

This patch rejects direct or enveloped null JSON results from ordinary management reads and asynchronous polling. Workbench returns a protocol error instead of reporting a successful empty result or an unrelated property-access error. Successful empty writes, asynchronous query acceptance and valid empty lists remain supported.

Use the v1.0.3 source ZIP linked from the README. Publication requires the Linux/Windows source-consumer matrix and the pinned live IRIS connection check.

## Historical 1.0.2 delivery

# Release 1.0.2

This patch fixes empty-response validation. Successful writes may return no representation; Workbench preserves their status and polling location without attempting to iterate a null stream. Read and sign-in responses must still contain valid JSON. Sign-in requires nonempty `username` and `serverVersion` strings, and explicit null or empty results cannot create a session or local connection.

Use the v1.0.2 source ZIP linked from the README; v1.0.1 does not contain this validation fix. Publication requires the Linux/Windows source-consumer matrix and the pinned live IRIS connection check.

## Historical 1.0.1 delivery

# Release 1.0.1

This patch release includes the IRIS authentication fixes and corrected setup directions. Empty or HTML authentication failures preserve their HTTP status, fresh setup checks `/api/admin/info` using the generated credential, and the README explains the separate authentication prerequisites for an existing instance.

The v1.0.0 source ZIP is immutable and does not contain these fixes. Use the v1.0.1 source ZIP linked from the README. Its source, extracted consumer and release checks run on Linux and Windows. A separate Linux CI job follows fresh setup against the pinned IRIS container and exercises configured backend sign-in, authenticated reads, runtime logs and signout before publication. This job checks that owned disposable instance; it does not certify every existing IRIS deployment.

## Historical 1.0.0 delivery

# Release 1.0.0

IRIS Workbench v1 is a local operator portal for the digest-pinned IRIS Community 2026.2 Linux container. Windows 11 x64, Node 24.19.0, pnpm 11.19.0 and desktop Chrome/Edge form the verified live configuration. See [installation](README.md), [operations](docs/operations.md) and the dated [verification record](VERIFICATION.md).

The release provides an exact source ZIP, its SHA256 file, a source/configuration manifest and combined checksums. Both Linux and Windows verification must pass before the main-commit publisher uploads and verifies the complete asset set, fixes the tag to that checked commit, then publishes. Published versions are left unchanged; subsequent changes need a new version. Static build output alone cannot operate this Node backend or reach a visitor's local IRIS instance.

The management implementation is retained from 0.1.0. This release adds pinned tooling, the available source-map-js maintenance update, versioned source delivery and explicit newcomer, upgrade, recovery and support instructions. Best-effort review conflict checks, in-memory sessions/history and bounded Linux log reads keep the boundaries described in the README. External provider OAuth authorization, all IRIS editions and remote production compatibility remain outside this release.

## Historical 0.1.0 delivery

# Release 0.1.0

## Delivery state

Version 0.1.0 is implemented and verified on IRIS Community 2026.2 in Linux Docker. The [MIT licensed source](https://github.com/agammann/iris-workbench) is public. Its initial remote source tree exactly matched the reviewed local tree, and [GitHub verification passed](https://github.com/agammann/iris-workbench/actions/runs/34926449233).

The Open Exchange application was saved as IRIS Workbench, version 0.1.0, and sent for approval on September 14, 2026. The account portal confirmed "Sent for approval." Publication is awaiting moderation. Contest registration remains pending participant declarations and competition terms acceptance.

## Release contents

1. React interface based on the selected charcoal and amber design.
2. Local Node backend with server held credentials, permission preserving reads, reviewed writes and stale review rejection.
3. ObjectScript extension for runtime files, log source discovery and system capacity, plus harmless task and REST service classes for verification.
4. Explicitly configured text logs, IRIS rotations, bounded gzip support and older event paging.
5. Pinned Community setup, installer, repeatable REST demonstration, Node tests and Linux log reader tests.
6. English installation and troubleshooting documentation, project rationale, exact log coverage and verification evidence.
7. MIT license and third party notices. The upstream API schema is fetched separately at a pinned commit and verified by checksum.

## Acceptance boundaries

The organizer decides whether the app satisfies the contest's usefulness and complexity criteria. This implementation covers all six named management areas with representative live operations. It does not claim every management endpoint, every optional subsystem or every operating system. OAuth setup is implemented; an external provider authorization flow is outside this management portal release.

The detailed walkthrough satisfies the documented choice of a video demo or detailed app description. No video has been fabricated. Open Exchange publication requires moderation, and contest application requires participant eligibility and agreement to the competition terms.
