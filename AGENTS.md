# Repository instructions

The supported product is a local Node operator portal for the pinned IRIS Community Linux image. Preserve the distinction between the fictional design sample and actual live mode. Keep credentials, private state and downloaded server/spec.json outside committed source. Use pnpm 11.19.0 with the frozen lockfile. Preserve historical evidence and label controlled fixtures separately from real instance checks. Release packaging requires a clean committed tree; validate its extracted consumer before publication.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable project-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` compatible with static packaging. The static Worker must identify its fictional-only mode and reject credentials and management operations; the local Node backend remains separate. Before a Sites handoff to an identified project, run `pnpm build` and `pnpm test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
