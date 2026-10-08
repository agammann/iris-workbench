# Operations, upgrade and recovery

Use this portal as a local operator for one configured IRIS instance. Keep Node bound to loopback. Start an existing local configuration with `node scripts/start-local.mjs "C:/your/private/workbench-state"`; its connection file points to the credential file created by setup. Never move the private state directory into the repository, source ZIP, a public share or a support attachment. On Windows, restrict access using the directory's Windows permissions; POSIX mode arguments do not configure Windows ACLs for you.

## Stop and restart

Use Ctrl+C in the terminal that owns Workbench's Node server. This stops the portal, clears server-held sessions, pending reviews and session history, and leaves the IRIS container intact. Restart from the same source directory and private state path, then reconnect. Reloading the browser within an active session was checked; signing out invalidates the session. Start a new review after a restart or signout.

## Upgrade Workbench

1. Keep the prior source directory and its version. Check the new release ZIP against SHA256SUMS and extract to a different directory.
2. Stop the owned Node server. Preserve the private state directory and IRIS container. Install the new source with its frozen lockfile, fetch the pinned schema and build it as in the README.
3. For a portal-only update, start the new backend using the same private connection file. Do not run setup-local.mjs against the existing instance; setup initializes new containers only.
4. If the extension changed, first record or export your existing `/api/workbench` configuration and Workbench classes and make an IRIS-owned backup appropriate to the instance. Select the intended container with `IRIS_CONTAINER` and run `node scripts/install-iris.mjs`. This loads or replaces the three supplied classes in `%SYS`, copies the Linux helper into the IRIS manager's `workbench` directory and creates or updates only `/api/workbench` with password authentication and `%Admin_Operate` access. It does not preserve a custom configuration of that application automatically.
5. Reconnect and read the expected resources and runtime source. Use a disposable object to check a reviewed change and its independent readback before relying on the updated portal. Returning to the old portal directory does not undo writes already applied to IRIS or restore an overwritten extension.

## Database backup and restore

The quick-start private directory contains generated credentials and connection information. It is **not a database backup**. Quick-start databases and configuration are held in the container; deleting it discards that storage. Ordinary portal stop/restart does not delete the container.

Use the instance's own backup procedure, with the needed database, configuration and journal files. Restore to a separate test instance and validate the result before depending on a backup. Follow InterSystems' [Backup and Restore](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GCDI_backup) and [backup verification](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GOPS_verify_integrity) instructions for your chosen backup method. Workbench does not perform or certify that restore.

For durable data beyond a disposable quick start, configure IRIS storage according to the official [container guide](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ADOCK), including durable `%SYS` or explicitly managed external database volumes. The supplied quick-start script has no volume or backup automation. Updating the portal and upgrading the IRIS image are separate operations; do not replace the pinned image during a portal upgrade.

## Failed or partial setup

Missing Docker, a non-Linux daemon, invalid name/port and an existing named container stop setup. Existing credentials are not replaced. If setup fails after creating its new container, it can leave that container and generated private files for diagnosis. A second invocation refuses to reuse them. Read the error, inspect only the exact container name you selected and preserve any needed data before removal. Choose a new unique container name, unused port and empty private state directory for another clean attempt; never delete an unrelated container to make setup pass.

If `server/spec.json` is absent, rerun `node scripts/fetch-spec.mjs`; the download must match the pinned SHA256. A checksum mismatch stops before replacing the cache. If an instance is unavailable, restart that owned instance or correct the port and reconnect. The portal reports upstream failures; they are not evidence that a review was applied. If permission is denied, use an identity with the intended IRIS permission instead of broadening the portal's own access.

For stale reviews or expired sessions, reconnect if needed, reload the resource and prepare a new review. There is no automatic rollback and the read-before-write conflict check is best effort. Verify a reported write through returned field readback or the instance; do not retry a write blindly.

## Removal

To remove only the portal, stop its owned Node process and keep the instance and backup data. To retire an extension on an instance you manage, first export or back up its configuration. Confirm `/api/workbench` is the Workbench application and that no other application uses the imported `Workbench.Runtime`, `Workbench.Heartbeat` or `Workbench.DemoREST` classes. Remove that application and those classes through IRIS administration only when their identity and use are clear; remove the associated manager `workbench/workbench_logs.py` helper afterward. This is a manual operator procedure, not an automatic uninstaller or a tested production cleanup claim.

For a disposable quick-start container, record its unique name, verify it with `docker container inspect <exact-name>`, stop it and remove only that exact container after confirming its data is disposable or backed up. Remove only that instance's private state directory through your normal file manager. The project does not issue a bulk Docker or recursive filesystem cleanup command.
