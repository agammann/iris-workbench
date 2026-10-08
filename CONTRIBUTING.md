# Contributing

Start with the [README](README.md) on the verified local configuration. Use a disposable Community container with a unique name, unused loopback port and private state directory outside the source tree. Keep your backend, frontend and IRIS versions in the report. Do not connect a test script to a production instance or include private state, credentials, raw logs or personal data in a patch.

Run `pnpm install --frozen-lockfile`, `node scripts/fetch-spec.mjs`, `pnpm build`, `pnpm test`, `pnpm test:sites` and `pnpm audit`. Live log-reader tests require `IRIS_CONTAINER` to name the disposable Linux container, then `pnpm test:logs`. See [development](docs/development.md) for source structure and release checks.

Keep fixes focused. Preserve IRIS permissions, the two-minute review boundary, readback distinctions, redaction and loopback binding. Add a direct regression when a change fixes concrete behavior. Use a short pull request description with the problem, resulting behavior and checks actually run. A design sample or accepted request alone does not prove a live operation succeeded.

The project is MIT licensed. Preserve the license and [third-party notices](THIRD-PARTY-NOTICES.md). Source publication and Open Exchange or contest acceptance are separate processes.
