# Development and release checks

The React interface lives in `src/`. `server/index.mjs` serves the built client and forwards permitted management requests to one configured IRIS instance. `server/security.mjs` owns path validation, redaction and stale-review fingerprints. `iris/Workbench` and `iris/workbench_logs.py` supply the Linux extension. The generated `server/spec.json` is a verified local cache, not shipped source.

Use Node 24.19.0+ and pnpm 11.19.0. Install with the frozen lockfile and fetch the pinned schema before tests. The backend binds to loopback on port 3411 by default; `PORT` selects another port. `pnpm dev` runs Vite on 5173 and proxies to 3411, so update `vite.config.mjs` consistently if changing the development backend port. `pnpm build` prepares the client plus preserved static Worker packaging. The production Node server, rather than static hosting, is needed for live mode.

Existing Node tests cover redaction, documented path boundaries, wallet metadata, fingerprints, errors and Docker-unavailable setup. `pnpm test:sites` checks preserved Worker/static packaging after build. Python log tests use Linux directory file descriptors; `pnpm test:logs` runs them inside the explicitly selected Linux IRIS container. Synthetic text fixtures remain distinct from real runtime logs.

For a clean committed checkout, run `pnpm package:release` then `pnpm test:consumer`. The verifier checks archive safety, the complete tracked source bytes, commit/tree manifest and checksums, then installs and builds a fresh extracted consumer, fetches the pinned API specification and runs Node/static packaging tests. It never starts Docker or writes to IRIS. The default fresh output must not already exist; pass another path as `pnpm test:consumer -- "path with spaces"` for an additional run.

CI pins its Actions and pnpm version, runs source and extracted-consumer checks on Linux and Windows, and runs Python log tests on Linux. Only a successful main push can publish. The publisher verifies the current main head, tag, draft identity and every uploaded asset digest/size before publication. A published version is never rewritten. Change version and changelog for a subsequent release.

`WORKBENCH_PYTHON` can select a Python 3.12 executable for archive verification. `WORKBENCH_PNPM` can select the actual pnpm CLI path for the consumer runner. `WORKBENCH_SPEC_CACHE` is an optional offline input for test environments: it must contain the exact digest-pinned schema and is validated before copying into the fresh consumer. Ordinary installation and CI use the unchanged download script; an offline cache check is not a claim that the remote download succeeded.

Live acceptance remains separate: create a uniquely owned instance, connect through the ordinary browser, review one reversible disposable change, verify it independently at IRIS, restore it through the same review path and sign out. The design sample is fictional and never substitutes for that check.
