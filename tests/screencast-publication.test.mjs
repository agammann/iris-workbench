import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import publishScreencast from "../scripts/publish-screencast.mjs";

const commit = "369a35815dded2c012ea0e753023525035741887";
const videoName = "iris-workbench_1.0.3_screencast.mp4";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Controlled file/API fixtures verify publication ordering. They do not record
// a browser, contact GitHub, or validate a live IRIS instance.
async function fixture(options, verify) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-capture-"));
  const saved = Object.fromEntries(["WORKBENCH_SCREENCAST_DIR", "GITHUB_REPOSITORY", "GITHUB_REF", "GITHUB_RUN_ATTEMPT"].map((name) => [name, process.env[name]]));
  try {
    const files = new Map();
    const video = Buffer.alloc(128 * 1024);
    video.write("ftyp", 4, "ascii");
    files.set(videoName, video);
    for (const name of ["01-disabled-application.png", "02-review-enabled-change.png", "03-verified-change-result.png", "04-independent-service-http-200.png", "05-live-system-capacity.png", "06-session-change-history.png"]) {
      const png = Buffer.alloc(1024);
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
      png.write("IHDR", 12, "ascii");
      png.writeUInt32BE(1600, 16);
      png.writeUInt32BE(1000, 20);
      files.set(name, png);
    }
    files.set("captions.srt", Buffer.from("1\n00:00:00,000 --> 00:00:01,000\nControlled fixture\n"));
    files.set("captions.vtt", Buffer.from("WEBVTT\n\nControlled fixture\n"));
    files.set("recording-summary.txt", Buffer.from(`IRIS Workbench 1.0.3\n${commit}\nControlled fixture\n`));
    files.set("storyboard.txt", Buffer.from("Controlled fixture\n"));
    const qa = {
      schemaVersion: 1, passed: true,
      release: { version: "1.0.3", tag: "v1.0.3", commit },
      guards: { generatedPasswordAbsent: true, credentialScreensAbsent: true, privateStateExcluded: true, secretGuardPassed: true },
      checks: {
        pageIdentity: true, nonblank: true, noFrameworkOverlay: true,
        consoleErrors: 0, consoleWarnings: 0, pageErrors: 0, initialServiceStatus: 404, finalServiceStatus: 200,
        reviewEnabled: { before: false, proposed: true },
        after: { Enabled: true, DispatchClass: "Workbench.DemoREST" },
        independentService: { service: "Workbench demonstration", status: "ready" },
      },
      video: { filename: videoName, sha256: hash(video), durationSeconds: 150 },
      files: [...files].map(([name, bytes]) => ({ name, sha256: hash(bytes), bytes: bytes.length })),
    };
    files.set("qa-summary.json", Buffer.from(JSON.stringify(qa)));
    files.set("SHA256SUMS", Buffer.from([...files].sort(([a], [b]) => a < b ? -1 : 1).map(([name, bytes]) => `${hash(bytes)}  ${name}\n`).join("")));
    for (const [name, bytes] of files) fs.writeFileSync(path.join(directory, name), bytes);
    Object.assign(process.env, { WORKBENCH_SCREENCAST_DIR: directory, GITHUB_REPOSITORY: "agammann/iris-workbench", GITHUB_REF: "refs/heads/main", GITHUB_RUN_ATTEMPT: "1" });

    const calls = [];
    const media = {
      id: 99, name: videoName, size: video.length, digest: `sha256:${hash(video)}`,
      browser_download_url: `https://github.com/agammann/iris-workbench/releases/download/v1.0.3/${videoName}`,
    };
    const release = {
      id: 1, tag_name: "v1.0.3", target_commitish: commit, draft: false, prerelease: false,
      published_at: "2026-10-14T00:00:00Z", name: "v1.0.3", body: "Controlled fixture",
      assets: [...new Map([["iris-workbench_1.0.3_source.zip", 1304040], ["iris-workbench_1.0.3_source.zip.sha256", 98], ["release-manifest.json", 1062], ["SHA256SUMS", 186]])].map(([name, size], index) => ({
        id: index + 1, name, size, created_at: "2026-10-14T00:00:00Z",
        ...(name.endsWith("_source.zip") ? { digest: "sha256:9e24d198a2d98a18b702e3117e61535efdcfab77c06671e8d790c4157f5cd1e8" } : {}),
      })),
    };
    if (options.existing) release.assets.push({ ...media, ...(options.existing === "different" ? { digest: "sha256:different" } : {}) });
    const api = (name, result) => async (args) => {
      calls.push(name);
      if (options.fail === name) throw Object.assign(new Error("Controlled API failure"), { status: 503 });
      return { data: typeof result === "function" ? result(args) : result };
    };
    let releaseReads = 0;
    const github = { rest: {
      git: {
        getRef: api("getRef", ({ ref }) => {
          if (ref.startsWith("tags/")) return { object: { type: "commit", sha: commit } };
          throw Object.assign(new Error("Controlled missing ref"), { status: 404 });
        }),
        getCommit: api("getCommit", { tree: { sha: "source-tree" } }),
        getTree: api("getTree", { truncated: false, tree: [] }),
        createBlob: api("createBlob", ({ content }) => ({ sha: hash(content) })),
        createTree: api("createTree", { sha: "evidence-tree" }),
        createCommit: api("createCommit", { sha: "evidence-commit" }),
        createRef: api("createRef", {}),
      },
      repos: {
        getReleaseByTag: api("getReleaseByTag", () => {
          const snapshot = structuredClone(release);
          if ((++releaseReads > 1 && options.drift) || (options.driftAfterUpload && calls.includes("uploadReleaseAsset"))) snapshot.body = "Changed during publication";
          return snapshot;
        }),
        uploadReleaseAsset: api("uploadReleaseAsset", () => {
          release.assets.push(media);
          return media;
        }),
      },
    } };
    const publish = () => publishScreencast({ github, context: { repo: { owner: "agammann", repo: "iris-workbench" }, eventName: "workflow_dispatch", ref: "refs/heads/main", runId: 123 }, core: { setOutput() {}, info() {} } });
    await verify({ publish, calls });
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("screencast evidence failure leaves the release media untouched", async () => {
  await fixture({ fail: "createRef" }, async ({ publish, calls }) => {
    await assert.rejects(publish, /save sanitized screenshot and QA evidence/);
    assert.ok(!calls.includes("uploadReleaseAsset"));
  });
});

test("screencast source verification failure prevents a media upload", async () => {
  await fixture({ drift: true }, async ({ publish, calls }) => {
    await assert.rejects(publish, /verify source metadata and assets remained unchanged/);
    assert.ok(!calls.includes("uploadReleaseAsset"));
  });
});

test("screencast uploads media only after evidence and source verification succeed", async () => {
  await fixture({}, async ({ publish, calls }) => {
    const result = await publish();
    assert.equal(result.video.reused, false);
    assert.equal(result.evidence.commit, "evidence-commit");
    assert.ok(calls.indexOf("createRef") < calls.indexOf("uploadReleaseAsset"));
    const uploadIndex = calls.indexOf("uploadReleaseAsset");
    assert.equal(calls.slice(0, uploadIndex).filter((name) => name === "getReleaseByTag").length, 2);
    assert.ok(calls.slice(uploadIndex + 1).includes("getRef"), "verify the release tag after uploading");
    assert.equal(calls.at(-1), "getReleaseByTag", "verify source metadata and assets after uploading");
  });
});

test("screencast still rejects source drift discovered after uploading", async () => {
  await fixture({ driftAfterUpload: true }, async ({ publish, calls }) => {
    await assert.rejects(publish, /verify source metadata and assets remained unchanged after media publication/);
    assert.equal(calls.filter((name) => name === "uploadReleaseAsset").length, 1);
  });
});

test("screencast reuses an identical published video without uploading", async () => {
  await fixture({ existing: "same" }, async ({ publish, calls }) => {
    const result = await publish();
    assert.equal(result.video.reused, true);
    assert.ok(!calls.includes("uploadReleaseAsset"));
  });
});

test("screencast refuses a different published video before writing evidence", async () => {
  await fixture({ existing: "different" }, async ({ publish, calls }) => {
    await assert.rejects(publish);
    assert.ok(!calls.includes("createBlob") && !calls.includes("uploadReleaseAsset"));
  });
});
