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
