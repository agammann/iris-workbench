# Operations, upgrade and recovery

Use this portal as a local operator for one configured IRIS instance. Keep Node bound to loopback. Start an existing local configuration with `node scripts/start-local.mjs "C:/your/private/workbench-state"`; its connection file points to the credential file created by setup. Never move the private state directory into the repository, source ZIP, a public share or a support attachment.

Setup protects a newly created Windows state directory with a non-inherited DACL allowing only your account, SYSTEM and Administrators. Existing state directories must already have those permissions and be owned by your account; setup and restart reject unsafe permissions rather than silently changing them. Use Windows Security settings to repair an older directory, or choose a new private directory. On POSIX, the state directory must be owned by your account with mode 0700. Links and junctions cannot be used as the state directory. Setup uses exclusive hard-link publication and requires a filesystem that supports hard links.

Explicit `IRIS_CREDENTIALS_FILE` paths for an existing instance remain supported. Credential and connection JSON must be regular files of at most 64 KiB. Reads use one bounded file descriptor; permissions on an explicitly supplied credential directory remain the operator's responsibility. These controls do not isolate state from a hostile process running as the same account.

## Stop and restart

Use Ctrl+C in the terminal that owns Workbench's Node server. This stops the portal, clears server-held sessions, pending reviews and session history, and leaves the IRIS container intact. Restart from the same source directory and private state path, then reconnect. Reloading the browser within an active session was checked; signing out invalidates the session. Start a new review after a restart or signout.

## Connection diagnostics

Workbench reads `IRIS_URL` when its Node backend starts. Set it in that terminal to the IRIS web server's HTTP(S) origin, including its web port, and restart Node after changing it. For example, use `http://127.0.0.1:52773`, without `/api/admin`, `/csp/sys`, credentials, query parameters or fragments. The IRIS superserver port (commonly 1972) is not the web port. Remote instances require HTTPS. A reverse proxy must expose `/api/admin/*` at those absolute paths on the configured origin and pass the Authorization header without substituting another authentication scheme. If you install the extension, it must also expose `/api/workbench/*`. Hosting these APIs under an extra path prefix is not supported.

The sign-in request is `GET /api/admin/info` with the username and password supplied using HTTP Basic authentication. The supported instance must expose the sysadmin REST API; IRIS Community 2026.2 is the verified target. The supplied extension creates or updates only `/api/workbench` and does not configure `/api/admin` or add the sysadmin APIs to an older instance.

Test the same origin and account outside Workbench. In PowerShell, set `IRIS_URL` to the origin used by the backend and run:

```powershell
curl.exe --user YOUR_USERNAME --include "${env:IRIS_URL}/api/admin/info"
```

`curl.exe` avoids PowerShell's `curl` alias. On macOS or Linux use `curl --user YOUR_USERNAME --include "$IRIS_URL/api/admin/info"`. The command prompts for the password, keeping it out of command history. Inspect the status locally; the response may include private instance details and should not be attached to support reports.

| Result | What to check |
| :--- | :--- |
| HTTP 200 with the expected instance information | The sign-in endpoint works for this origin and account. If Workbench still fails, check the environment in the Node process, restart it and reconnect with the same credentials. This does not prove permission for every management operation. |
| HTTP 401 | In Management Portal, open **System Administration → Security → Applications → Web Applications → `/api/admin`**. Confirm Enabled and Password authentication, then check the account is enabled and the password is valid. If Password is unavailable, check the [system-wide authentication options](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ROARS_iam_instanceauthn). For a proxied connection, check that the gateway receives the Authorization header. |
| HTTP 403 | Inspect the application's required resource and the user's permission for the requested operation. Authentication and authorization are separate checks. |
| HTTP 404 or an unexpected HTML page | Verify the web port, proxy routing and `/api/admin` availability on the IRIS version. Check that the URL reaches the intended instance. |
| Connection refused, timeout or TLS error | Check the web server, published container port, firewall and certificate trust. Fix the connection or trust configuration before testing authentication. |

When changing `/api/admin`, preserve its dispatch class, namespace, required resource and other authentication methods. `%ALL` privileges do not override a disabled application, an authentication method that is not allowed, or invalid credentials. Follow InterSystems' [web application authentication settings](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GSA_manage_applications) and [user account settings](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GSA_config_user_accounts); do not remove access restrictions just to make the test succeed.

A Workbench request can also return HTTP 401 because its own one hour session expired, was signed out or was cleared by a backend restart. Reconnect in that case. An upstream IRIS HTTP 401 during sign-in or a live read requires checking IRIS authentication as above. A report that `%ALL` still receives HTTP 401 does not by itself establish which authentication setting, credential or gateway caused it.

After the direct sign-in check passes, connect and select **Live data**, then follow [DEMO.md](../DEMO.md) on an instance where you may create a disposable application. The walkthrough creates a real REST service, checks HTTP 404 while disabled, applies a reviewed Enabled change and verifies HTTP 200 with JSON. This gives reviewers a live write and independent service response beyond log inspection. The design sample is fictional and does not test the instance.

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

Missing Docker, a non-Linux daemon, invalid name/port and an existing named container stop setup. Existing credentials and connection information are not replaced. Setup reserves private staging before starting Docker and publishes complete credentials before changing the account, so later failures retain the recovery credential. The final connection file is published only after authentication, installation and log verification pass. A failed setup can leave its container and complete credentials for diagnosis; a second invocation refuses to reuse them. Read the error, inspect only the exact container name you selected and preserve any needed data before removal. Choose a new unique container name, unused port and empty private state directory for another clean attempt; never delete an unrelated container to make setup pass.

Concurrent setup is rejected by `.setup-lock`. Normal exit removes only that invocation's staging and reservation. If setup is interrupted abruptly, inspect the selected container, final credentials and any `.setup-*` staging before manually removing a stale lock or private staging. Do not remove another running setup's reservation. Setup never removes an existing final credential or connection file as cleanup.

If `server/spec.json` is absent, rerun `node scripts/fetch-spec.mjs`; the download must match the pinned SHA256. A checksum mismatch stops before replacing the cache. If an instance is unavailable, restart that owned instance or correct the port and reconnect. The portal reports upstream failures; they are not evidence that a review was applied. If permission is denied, use an identity with the intended IRIS permission instead of broadening the portal's own access.

For stale reviews or expired sessions, reconnect if needed, reload the resource and prepare a new review. There is no automatic rollback and the read-before-write conflict check is best effort. Verify a reported write through returned field readback or the instance; do not retry a write blindly.

## Removal

To remove only the portal, stop its owned Node process and keep the instance and backup data. To retire an extension on an instance you manage, first export or back up its configuration. Confirm `/api/workbench` is the Workbench application and that no other application uses the imported `Workbench.Runtime`, `Workbench.Heartbeat` or `Workbench.DemoREST` classes. Remove that application and those classes through IRIS administration only when their identity and use are clear; remove the associated manager `workbench/workbench_logs.py` helper afterward. This is a manual operator procedure, not an automatic uninstaller or a tested production cleanup claim.

For a disposable quick-start container, record its unique name, verify it with `docker container inspect <exact-name>`, stop it and remove only that exact container after confirming its data is disposable or backed up. Remove only that instance's private state directory through your normal file manager. The project does not issue a bulk Docker or recursive filesystem cleanup command.
