# Security reporting

For a suspected credential disclosure or access-control defect, use GitHub's private vulnerability reporting for this repository when available. If it is unavailable, open an issue requesting a private contact without credentials, exploit details or private instance data.

Describe the affected Workbench version, exact supported configuration, observed behavior and bounded impact. Workbench is a local operator tool; do not expose its Node server to the public Internet. It forwards permitted operations using the connected IRIS identity. Structured sensitive fields are redacted, but application log text is not universally scrubbed.

The v1 tested configuration is Windows 11 x64, Node 24.19.0, pnpm 11.19.0 and the pinned IRIS Community 2026.2 Linux image. New fixes are delivered as new versions; existing published packages are unchanged.
