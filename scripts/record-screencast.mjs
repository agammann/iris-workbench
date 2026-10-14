import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Browser plugin not available: use a temporary Playwright installation. The
// released app stays unchanged, and recording begins after configured UI login.
const version = "1.0.3";
const releaseCommit = "369a35815dded2c012ea0e753023525035741887";
const state = path.resolve(process.env.WORKBENCH_STATE_DIR || "");
const app = path.resolve(process.env.WORKBENCH_APP_ROOT || "");
const output = path.resolve(process.env.WORKBENCH_SCREENCAST_DIR || "");
const tools = path.resolve(process.env.WORKBENCH_PLAYWRIGHT_DIR || "");
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const stopped = new AbortController();
let stage = "validate the disposable recording configuration";
let backend;
let backendExited = false;
let backendExit;
let browser;
let loginContext;
let context;
let demoCreated = false;
let portal;
let consoleErrors = 0;
let consoleWarnings = 0;
let pageErrors = 0;
let recordedAt;
let video;
const scenes = [];
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => { stopped.abort(); backend?.kill("SIGTERM"); });

function check(condition) {
  if (!condition) throw Error("Recording verification failed");
}
async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: app, stdio: "ignore", ...options });
    child.once("error", () => reject(Error("Recording subprocess could not start")));
    child.once("exit", (code) => code === 0 ? resolve() : reject(Error("Recording subprocess failed")));
  });
}
async function durationOf(filename) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filename], { stdio: ["ignore", "pipe", "ignore"] });
    let result = "";
    child.stdout.on("data", (chunk) => { result += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 && Number(result) > 0 ? resolve(Number(result)) : reject(Error("Video duration unavailable")));
  });
}
async function sourceCommit() {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "HEAD"], { cwd: app, stdio: ["ignore", "pipe", "ignore"] });
    let result = "";
    child.stdout.on("data", (chunk) => { result += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(result.trim()) : reject(Error("Released source identity unavailable")));
  });
}
function timestamp(milliseconds, separator = ".") {
  const value = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(value / 3600000);
  const minutes = Math.floor(value / 60000) % 60;
  const seconds = Math.floor(value / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(value % 1000).padStart(3, "0")}`;
}

try {
  for (const key of ["WORKBENCH_STATE_DIR", "WORKBENCH_APP_ROOT", "WORKBENCH_SCREENCAST_DIR", "WORKBENCH_PLAYWRIGHT_DIR"])
    check(process.env[key]);
  check(process.env.WORKBENCH_DISPOSABLE_INSTANCE === "1");
  check(/^iris-workbench-screencast-\d+-\d+$/.test(process.env.IRIS_CONTAINER || ""));
  check(JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8")).version === version);
  check(await sourceCommit() === releaseCommit);
  const config = JSON.parse(fs.readFileSync(path.join(state, "connection.json"), "utf8"));
  const instance = new URL(config.IRIS_URL);
  check(instance.protocol === "http:" && instance.hostname === "127.0.0.1");
  check(path.resolve(config.IRIS_CREDENTIALS_FILE) === path.join(state, "credentials.json"));
  const credentials = JSON.parse(fs.readFileSync(config.IRIS_CREDENTIALS_FILE, "utf8"));
  check(credentials.user === "_SYSTEM" && typeof credentials.password === "string" && credentials.password.length >= 40);
  const authorization = "Basic " + Buffer.from(credentials.user + ":" + credentials.password).toString("base64");
  const privateVideo = path.join(state, "private-video");
  fs.mkdirSync(privateVideo, { mode: 0o700 });
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });

  stage = "start the exact released local backend";
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const selected = socket.address().port;
      socket.close((error) => error ? reject(error) : resolve(selected));
    });
  });
  portal = `http://127.0.0.1:${port}`;
  const childEnv = { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", WORKBENCH_URL: portal };
  backend = spawn(process.execPath, [path.join(app, "scripts/start-local.mjs"), state], { cwd: app, env: childEnv, stdio: "ignore" });
  backendExit = new Promise((resolve) => {
    backend.once("error", () => { backendExited = true; resolve(); });
    backend.once("exit", () => { backendExited = true; resolve(); });
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    check(!backendExited && !stopped.signal.aborted);
    try {
      const response = await fetch(portal + "/api/session", {
        headers: { "X-Workbench": "1" },
        signal: AbortSignal.any([AbortSignal.timeout(500), stopped.signal]),
      });
      const session = await response.json();
      ready = response.ok && session.configured === true && session.connected === false;
      if (ready) break;
    } catch {}
    await pause(100);
  }
  check(ready);

  stage = "create only the disposable disabled demonstration application";
  await run(process.execPath, [path.join(app, "scripts/demo.mjs"), "setup", state], { env: childEnv });
  demoCreated = true;
  const disabled = await fetch(new URL("/workbench-demo/status", instance), {
    headers: { Authorization: authorization }, redirect: "error",
    signal: AbortSignal.any([AbortSignal.timeout(10000), stopped.signal]),
  });
  check(disabled.status === 404);
  await disabled.body?.cancel();

  stage = "authenticate through the configured connection before recording";
  const { chromium, expect } = await import(pathToFileURL(path.join(tools, "node_modules/@playwright/test/index.mjs")).href);
  browser = await chromium.launch({ headless: true });
  const appearance = { viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", locale: "en-US" };
  loginContext = await browser.newContext(appearance);
  const login = await loginContext.newPage();
  await login.goto(portal);
  await expect(login).toHaveTitle("IRIS Workbench");
  await login.getByRole("button", { name: "Connect local instance", exact: true }).click();
  await expect(login.getByLabel("Data mode")).toHaveValue("live");
  await expect(login.locator(".statusbar")).toContainText("Connected as _SYSTEM");
  // Transfer the authenticated cookie in memory, never into a storage-state file.
  const storageState = await loginContext.storageState();
  await loginContext.close();
  loginContext = undefined;

  stage = "record the real released frontend";
  context = await browser.newContext({
    ...appearance, storageState,
    recordVideo: { dir: privateVideo, size: appearance.viewport },
  });
  await context.addInitScript(({ secrets }) => {
    const guard = { leaked: false };
    Object.defineProperty(window, "__workbenchVideoSecretGuard", { value: guard });
    const scan = () => {
      const text = document.body?.innerText || "";
      if (secrets.some((secret) => text.includes(secret))) guard.leaked = true;
    };
    new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true });
  }, { secrets: [credentials.password, authorization.slice(6)] });
  recordedAt = Date.now();
  const page = await context.newPage();
  video = page.video();
  function monitor(target) {
    target.on("pageerror", () => { pageErrors++; });
    target.on("console", (message) => {
      if (message.type() === "error") consoleErrors++;
      if (message.type() === "warning") consoleWarnings++;
    });
  }
  monitor(page);
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const enabledStatus = page.locator(".inspector .details dt").filter({ hasText: /^Enabled$/ }).locator("xpath=following-sibling::dd[1]");
  async function safeScreen(target = page) {
    check(!stopped.signal.aborted);
    const visible = await target.locator("body").innerText();
    check(!visible.includes(credentials.password) && !visible.includes(authorization.slice(6)));
    check(await target.evaluate(() => window.__workbenchVideoSecretGuard?.leaked === false));
    check(await target.locator('input[type="password"], .connection-page').count() === 0);
    check(await target.locator("vite-error-overlay, nextjs-portal").count() === 0);
  }
  async function scene(text, seconds, target = page) {
    await safeScreen(target);
    const start = Date.now() - recordedAt;
    if (scenes.length) scenes.at(-1).end = start;
    scenes.push({ start, end: start, text });
    await pause(seconds * 1000);
    await safeScreen(target);
    scenes.at(-1).end = Date.now() - recordedAt;
  }
  async function screenshot(filename, target = page) {
    await safeScreen(target);
    await target.screenshot({ path: path.join(output, filename), fullPage: false });
  }
  async function navigate(name) {
    await navigation.getByRole("button", { name, exact: true }).click();
  }

  await page.goto(portal);
  await expect(page).toHaveTitle("IRIS Workbench");
  await expect(page.getByLabel("Data mode")).toHaveValue("live");
  await expect(page.locator(".statusbar")).toContainText("Connected as _SYSTEM");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scene("IRIS Workbench 1.0.3 | A live IRIS Community instance. No sample data.", 8);

  stage = "load the connected Workspace overview";
  await navigate("Workspace");
  await expect(page.getByRole("heading", { name: "Start with the context.", exact: true })).toBeVisible();
  await scene("Inspect the instance, follow its evidence, and review changes before applying them.", 10);

  stage = "load and filter the live Apps list";
  await navigate("Apps");
  await expect(page.getByRole("button", { name: "/workbench-demo", exact: true })).toBeVisible();
  await scene("Apps lists real web applications and their current configuration.", 9);
  await page.getByLabel("Filter web applications").pressSequentially("/workbench-demo", { delay: 80 });
  await page.getByRole("button", { name: "/workbench-demo", exact: true }).click();
  stage = "inspect the disabled demonstration application";
  await expect(page.getByRole("button", { name: "Edit configuration", exact: true })).toBeEnabled();
  await expect(enabledStatus).toHaveText("Disabled");
  await scene("This disposable service is disabled. An independent IRIS request returned HTTP 404.", 10);
  await screenshot("01-disabled-application.png");

  stage = "edit only the demonstration Enabled field";
  await page.getByRole("button", { name: "Edit configuration", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Edit web applications", exact: true })).toBeVisible();
  await dialog.getByRole("combobox", { name: /^Enabled\b/ }).selectOption("true");
  await scene("Change Enabled to True. The editor submits only changed fields.", 9);
  stage = "verify the exact Enabled false-to-true review diff";
  await dialog.getByRole("button", { name: "Review changes", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Review changes", exact: true })).toBeVisible();
  const changedRow = dialog.locator(".diff-table tbody tr");
  await expect(changedRow).toHaveCount(1);
  await expect(changedRow.getByRole("cell")).toHaveText(["Enabled", "false", "true"]);
  await scene("Review the exact target and the before-and-after value. Nothing has been applied yet.", 15);
  await screenshot("02-review-enabled-change.png");

  stage = "apply the change and verify the actual IRIS readback";
  await dialog.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Changed fields verified from IRIS", { timeout: 30000 });
  await expect(dialog.getByRole("heading", { name: "Change result", exact: true })).toBeVisible();
  const readback = JSON.parse(await dialog.locator(".code-result").innerText());
  check(readback.Enabled === true && readback.DispatchClass === "Workbench.DemoREST");
  await scene("Apply once. Workbench reads the changed field back from IRIS and verifies the result.", 14);
  await screenshot("03-verified-change-result.png");
  stage = "reinspect the refreshed Enabled application";
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "/workbench-demo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit configuration", exact: true })).toBeEnabled();
  await expect(enabledStatus).toHaveText("Enabled");
  await scene("Refresh and inspect: the live application configuration is now Enabled.", 9);

  stage = "open the independent service with explicitly scoped browser authentication";
  const serviceGapStart = Date.now() - recordedAt;
  const serviceRecordedAt = Date.now();
  const servicePage = await context.newPage();
  monitor(servicePage);
  const serviceVideo = servicePage.video();
  const serviceURL = new URL("/workbench-demo/status", instance).href;
  // IRIS may return its HTML login page without a WWW-Authenticate challenge.
  // Send Basic only to this exact real service URL; never replace its response.
  await servicePage.route((url) => url.href === serviceURL, (route) => route.continue({
    headers: { ...route.request().headers(), authorization },
  }));
  const service = await servicePage.goto(serviceURL);
  stage = "verify the independent browser service HTTP status";
  check(service);
  const serviceIsJSON = (service.headers()["content-type"] || "").includes("application/json");
  console.log(`Independent service check: HTTP ${service.status()}; JSON content type: ${serviceIsJSON}.`);
  check(service.status() === 200);
  stage = "verify the independent browser service JSON content type";
  check(serviceIsJSON);
  stage = "verify the actual independent service JSON result";
  const result = await service.json();
  check(result.service === "Workbench demonstration" && result.status === "ready");
  stage = "verify the independent service renders its actual JSON";
  await expect(servicePage.locator("body")).toContainText("Workbench demonstration");
  stage = "initialize and check the native JSON document privacy guard";
  // Chromium's native JSON document may skip context initialization scripts.
  // Seed the same continuous guard before this response enters the public clip.
  check(await servicePage.evaluate(({ secrets }) => {
    let guard = window.__workbenchVideoSecretGuard;
    const scan = () => {
      const text = document.body?.innerText || "";
      if (secrets.some((secret) => text.includes(secret))) guard.leaked = true;
    };
    if (!guard) {
      guard = { leaked: false };
      Object.defineProperty(window, "__workbenchVideoSecretGuard", { value: guard });
      new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true });
    }
    scan();
    return guard.leaked === false;
  }, { secrets: [credentials.password, authorization.slice(6)] }));
  stage = "format the labelled independent-response recording annotation";
  // Format only this independent response for readability in the video. This
  // explicitly labelled annotation is outside the released Workbench UI.
  await servicePage.addStyleTag({ content: "body { padding: 48px; background: #f6f8f7; color: #182522; } pre { white-space: pre-wrap; font: 26px/1.65 ui-monospace, monospace; } #screencast-service-note { margin: 0 0 32px; font: 20px/1.6 sans-serif; } #screencast-service-note small { display: block; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: #557065; }" });
  await servicePage.evaluate(() => {
    const note = document.createElement("aside");
    note.id = "screencast-service-note";
    const label = document.createElement("small");
    label.textContent = "Video annotation · Independent IRIS response";
    const heading = document.createElement("strong");
    heading.textContent = "GET /workbench-demo/status · HTTP 200";
    note.append(label, heading);
    document.body.prepend(note);
  });
  const serviceVisibleAt = Date.now() - serviceRecordedAt;
  const serviceSceneIndex = scenes.length;
  stage = "capture the privacy-checked independent service clip";
  await scene("Independent request to IRIS: HTTP 200. The real demonstration service returns ready.", 13, servicePage);
  await screenshot("04-independent-service-http-200.png", servicePage);
  const serviceCompleteAt = Date.now() - serviceRecordedAt;
  await servicePage.close();
  const serviceRawVideo = await serviceVideo.path();
  await page.bringToFront();
  const serviceResumeAt = Date.now() - recordedAt;

  stage = "show read-only logs and system context";
  await expect(page.getByLabel("Data mode")).toHaveValue("live");
  await navigate("Logs");
  await page.getByLabel("Log source", { exact: true }).selectOption("messages");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  await expect(page.locator(".table-foot")).toContainText("Updated", { timeout: 30000 });
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await scene("Logs reads runtime messages from this disposable instance. Filters preserve source context.", 10);
  await navigate("System");
  await page.getByRole("tab", { name: "CPU, memory and disk", exact: true }).click();
  await expect(page.locator(".table-foot")).toContainText("Updated", { timeout: 30000 });
  await expect(page.getByRole("cell", { name: "CPU logical cores", exact: true })).toBeVisible();
  await scene("System shows measured CPU, memory, and disk capacity through the runtime extension.", 10);
  await screenshot("05-live-system-capacity.png");

  stage = "verify session history and console health";
  await navigate("Workspace");
  await expect(page.getByRole("cell", { name: "Update web applications: /workbench-demo", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Changed fields verified from IRIS", exact: true })).toBeVisible();
  await scene("Workspace keeps the changes from this session. Durable auditing follows IRIS policy.", 10);
  await scene("IRIS Workbench 1.0.3 | Inspect. Review. Apply. Verify. Source and setup are on GitHub.", 8);
  if (Date.now() - recordedAt < 150000) await pause(150000 - (Date.now() - recordedAt));
  scenes.at(-1).end = Date.now() - recordedAt;
  await safeScreen();
  check(pageErrors === 0 && consoleErrors === 0 && consoleWarnings === 0);
  await screenshot("06-session-change-history.png");
  await context.close();
  context = undefined;
  const rawVideo = await video.path();

  stage = "encode the sanitized silent recording and captions";
  const rawDuration = await durationOf(rawVideo);
  // The private WebM can contain the app's initial loading frame. Remove every
  // frame before the first confirmed connected screen from the public MP4.
  const trimStart = scenes[0].start / 1000;
  const serviceClipDuration = (serviceCompleteAt - serviceVisibleAt) / 1000;
  const contentDuration = rawDuration - trimStart - (serviceResumeAt - serviceGapStart) / 1000 + serviceClipDuration;
  check(contentDuration >= 120 && contentDuration <= 260);
  const rate = Math.min(1, 170 / contentDuration);
  const beforeServiceDuration = serviceGapStart - trimStart * 1000;
  const captions = scenes.map((entry, index) => {
    const relative = index < serviceSceneIndex
      ? { start: entry.start - trimStart * 1000, end: Math.min(entry.end, serviceGapStart) - trimStart * 1000 }
      : index === serviceSceneIndex
        ? { start: beforeServiceDuration, end: beforeServiceDuration + serviceClipDuration * 1000 }
        : { start: entry.start - serviceResumeAt + beforeServiceDuration + serviceClipDuration * 1000, end: entry.end - serviceResumeAt + beforeServiceDuration + serviceClipDuration * 1000 };
    return { ...entry, start: Math.max(0, relative.start) * rate, end: Math.min(relative.end, contentDuration * 1000) * rate };
  });
  const srt = captions.map((entry, index) => `${index + 1}\n${timestamp(entry.start, ",")} --> ${timestamp(entry.end, ",")}\n${entry.text}\n`).join("\n");
  const vtt = "WEBVTT\n\n" + captions.map((entry) => `${timestamp(entry.start)} --> ${timestamp(entry.end)}\n${entry.text}\n`).join("\n");
  fs.writeFileSync(path.join(output, "captions.srt"), srt);
  fs.writeFileSync(path.join(output, "captions.vtt"), vtt);
  // Relative subtitle path avoids ffmpeg filter escaping for runner directories.
  const filename = "iris-workbench_1.0.3_screencast.mp4";
  const filter = `[0:v]trim=start=${trimStart}:end=${serviceGapStart / 1000},setpts=PTS-STARTPTS[a];[1:v]trim=start=${serviceVisibleAt / 1000}:end=${serviceCompleteAt / 1000},setpts=PTS-STARTPTS[b];[0:v]trim=start=${serviceResumeAt / 1000},setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0,setpts=${rate.toFixed(8)}*PTS,subtitles=captions.srt:force_style='FontName=DejaVu Sans,FontSize=18,Outline=1,Shadow=0,BorderStyle=3,BackColour=&H990D181B,MarginV=25'[out]`;
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", rawVideo, "-i", serviceRawVideo, "-an", "-filter_complex", filter, "-map", "[out]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(output, filename)], { cwd: output });
  const encodedDuration = await durationOf(path.join(output, filename));
  check(encodedDuration >= 120 && encodedDuration <= 180);
  fs.writeFileSync(path.join(output, "recording-summary.txt"), [
    `IRIS Workbench ${version}: silent live-instance screencast`,
    `Released source commit: ${releaseCommit}`,
    "Browser: Chromium via temporary Playwright 1.56.1. Browser plugin not available.",
    "Viewport: 1600 x 1000. Recording starts after configured UI authentication.",
    `Video duration: ${encodedDuration.toFixed(1)} seconds. Playback rate adjustment: ${rate.toFixed(3)}.`,
    "Verified: disabled real service HTTP 404; UI Enabled=false to true; exact review diff; IRIS readback; independent browser HTTP 200 JSON; runtime messages; system capacity; session history.",
    "Page identity, nonblank content, framework-overlay absence, console health, screenshots, and the interaction loop passed.",
    "Only a newly created disposable IRIS Community instance was changed. Production instances and mobile viewports were not tested.",
    "Generated credentials, browser state, traces, and raw process logs are excluded. Captions and the labelled independent-response annotation are editorial video aids, not application UI.",
    "Source and setup: https://github.com/agammann/iris-workbench",
    "Release: https://github.com/agammann/iris-workbench/releases/tag/v1.0.3",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(output, "storyboard.txt"), "The independent service segment is a real second browser page. Its labelled response annotation and video captions are recording aids, not Workbench product features.\n\n" + captions.map((entry, index) => `${index + 1}. ${timestamp(entry.start)} - ${timestamp(entry.end)}\n${entry.text}`).join("\n\n") + "\n");
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const files = fs.readdirSync(output).sort().map((name) => {
    const bytes = fs.readFileSync(path.join(output, name));
    return { name, sha256: digest(bytes), bytes: bytes.length };
  });
  const allowed = [filename, "01-disabled-application.png", "02-review-enabled-change.png", "03-verified-change-result.png", "04-independent-service-http-200.png", "05-live-system-capacity.png", "06-session-change-history.png", "captions.srt", "captions.vtt", "recording-summary.txt", "storyboard.txt"].sort();
  check(files.length === allowed.length && files.every((file, index) => file.name === allowed[index]));
  const qa = {
    schemaVersion: 1, passed: true,
    release: { version, tag: "v" + version, commit: releaseCommit },
    guards: { secretGuardPassed: true, generatedPasswordAbsent: true, credentialScreensAbsent: true, privateStateExcluded: true },
    checks: {
      pageIdentity: true, nonblank: true, noFrameworkOverlay: true,
      consoleErrors, consoleWarnings, pageErrors, initialServiceStatus: disabled.status, finalServiceStatus: service.status(),
      reviewEnabled: { before: false, proposed: true },
      after: { Enabled: readback.Enabled, DispatchClass: readback.DispatchClass },
      independentService: result,
    },
    video: { filename, sha256: files.find((file) => file.name === filename).sha256, durationSeconds: encodedDuration },
    files,
  };
  fs.writeFileSync(path.join(output, "qa-summary.json"), JSON.stringify(qa, null, 2) + "\n");
  const checksumFiles = [...files, { name: "qa-summary.json", sha256: digest(fs.readFileSync(path.join(output, "qa-summary.json"))) }].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  fs.writeFileSync(path.join(output, "SHA256SUMS"), checksumFiles.map((file) => `${file.sha256}  ${file.name}\n`).join(""));
  console.log("Recorded and verified the released live IRIS demo; sanitized MP4, captions, screenshots, and summary are ready.");
} catch {
  console.error(`Screencast failed while attempting to ${stage}. Private responses and credentials are omitted.`);
  process.exitCode = 1;
  // Never leave an apparently publishable partial capture after failed checks.
  if (process.env.WORKBENCH_SCREENCAST_DIR) fs.rmSync(output, { recursive: true, force: true });
} finally {
  await context?.close().catch(() => {});
  await loginContext?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (demoCreated && backend && !backendExited)
    await run(process.execPath, [path.join(app, "scripts/demo.mjs"), "cleanup", state], { env: { ...process.env, WORKBENCH_URL: portal } }).catch(() => { process.exitCode = 1; });
  if (backend && !backendExited) {
    backend.kill("SIGTERM");
    await Promise.race([backendExit, pause(2000)]);
    if (!backendExited) { backend.kill("SIGKILL"); await backendExit; }
  }
}
