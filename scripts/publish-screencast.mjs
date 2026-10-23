import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// Imported by github-script only after the independent recording job succeeds.
// This appends one media asset; it never edits a release, tag, or source asset.
const owner = "agammann";
const repo = "iris-workbench";
const version = "1.0.3";
const tag = `v${version}`;
const releaseCommit = "369a35815dded2c012ea0e753023525035741887";
const videoName = `iris-workbench_${version}_screencast.mp4`;
const screenshots = [
  "01-disabled-application.png",
  "02-review-enabled-change.png",
  "03-verified-change-result.png",
  "04-independent-service-http-200.png",
  "05-live-system-capacity.png",
  "06-session-change-history.png",
];
const textFiles = ["captions.srt", "captions.vtt", "recording-summary.txt", "storyboard.txt"];
const describedFiles = [videoName, ...screenshots, ...textFiles];
const expectedFiles = [...describedFiles, "qa-summary.json", "SHA256SUMS"];
const sourceAssets = new Map([
  [`iris-workbench_${version}_source.zip`, 1304040],
  [`iris-workbench_${version}_source.zip.sha256`, 98],
  ["release-manifest.json", 1062],
  ["SHA256SUMS", 186],
]);
const sourceDigest = "sha256:9e24d198a2d98a18b702e3117e61535efdcfab77c06671e8d790c4157f5cd1e8";
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function check(condition, message) {
  if (!condition) throw new Error(message);
}
function keys(object, expected, label) {
  check(object && typeof object === "object" && !Array.isArray(object), `${label} must be an object`);
  check(Object.keys(object).sort().join("\n") === [...expected].sort().join("\n"), `${label} has unexpected fields`);
}
function isMissing(error) {
  return error?.status === 404;
}
function assetIdentity(asset) {
  return JSON.stringify({ id: asset.id, name: asset.name, size: asset.size, digest: asset.digest ?? null, created_at: asset.created_at });
}
function releaseIdentity(release) {
  return JSON.stringify({
    id: release.id, tag_name: release.tag_name, target_commitish: release.target_commitish,
    name: release.name, body: release.body, draft: release.draft,
    prerelease: release.prerelease, published_at: release.published_at,
  });
}
function validateQA(qa, files) {
  keys(qa, ["schemaVersion", "passed", "release", "guards", "checks", "video", "files"], "QA summary");
  check(qa.schemaVersion === 1 && qa.passed === true, "Recording QA did not pass");
  keys(qa.release, ["version", "tag", "commit"], "QA release");
  check(qa.release.version === version && qa.release.tag === tag && qa.release.commit === releaseCommit, "Recording source is not the pinned release");
  keys(qa.guards, ["generatedPasswordAbsent", "credentialScreensAbsent", "privateStateExcluded", "secretGuardPassed"], "QA guards");
  check(Object.values(qa.guards).every((value) => value === true), "Recording privacy guards did not pass");
  keys(qa.checks, ["pageIdentity", "nonblank", "noFrameworkOverlay", "consoleErrors", "consoleWarnings", "pageErrors", "initialServiceStatus", "finalServiceStatus", "reviewEnabled", "after", "independentService"], "QA checks");
  check(qa.checks.pageIdentity === true && qa.checks.nonblank === true && qa.checks.noFrameworkOverlay === true, "Browser page checks did not pass");
  check(qa.checks.consoleErrors === 0 && qa.checks.consoleWarnings === 0 && qa.checks.pageErrors === 0, "Browser errors or warnings were reported");
  check(qa.checks.initialServiceStatus === 404 && qa.checks.finalServiceStatus === 200, "Independent 404-to-200 service verification did not pass");
  keys(qa.checks.reviewEnabled, ["before", "proposed"], "Reviewed change");
  check(qa.checks.reviewEnabled.before === false && qa.checks.reviewEnabled.proposed === true, "Reviewed change is unexpected");
  keys(qa.checks.after, ["Enabled", "DispatchClass"], "IRIS readback");
  check(qa.checks.after.Enabled === true && qa.checks.after.DispatchClass === "Workbench.DemoREST", "IRIS change readback is unexpected");
  keys(qa.checks.independentService, ["service", "status"], "Independent service result");
  check(qa.checks.independentService.service === "Workbench demonstration" && qa.checks.independentService.status === "ready", "Independent service result is unexpected");
  keys(qa.video, ["filename", "sha256", "durationSeconds"], "QA video");
  check(qa.video.filename === videoName && qa.video.sha256 === sha256(files.get(videoName)), "Video checksum does not match QA");
  check(Number.isFinite(qa.video.durationSeconds) && qa.video.durationSeconds >= 120 && qa.video.durationSeconds <= 180, "Video duration is outside the short-screencast range");
  check(Array.isArray(qa.files) && qa.files.length === describedFiles.length, "QA file manifest is incomplete");
  const seen = new Set();
  for (const file of qa.files) {
    keys(file, ["name", "sha256", "bytes"], "QA file entry");
    check(describedFiles.includes(file.name) && !seen.has(file.name), "QA file manifest includes an unexpected or repeated file");
    seen.add(file.name);
    check(file.bytes === files.get(file.name).length && file.sha256 === sha256(files.get(file.name)), "QA file manifest checksum or size does not match");
  }
}
function readCapture(directory) {
  check(directory && path.isAbsolute(directory), "An absolute recording artifact directory is required");
  const directoryStat = fs.lstatSync(directory);
  check(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), "Recording artifact directory is not a regular directory");
  check(fs.readdirSync(directory).sort().join("\n") === [...expectedFiles].sort().join("\n"), "Recording artifact contains unexpected or missing files");
  const files = new Map();
  for (const name of expectedFiles) {
    const filename = path.join(directory, name);
    const stat = fs.lstatSync(filename);
    check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, "Recording artifact contains a linked or non-regular file");
    const maximum = name === videoName ? 100 * 1024 * 1024 : screenshots.includes(name) ? 10 * 1024 * 1024 : 128 * 1024;
    check(stat.size > 0 && stat.size <= maximum, "Recording artifact file size is outside the permitted range");
    const contents = fs.readFileSync(filename);
    check(contents.length === stat.size, "Recording artifact changed while being read");
    files.set(name, contents);
  }
  const video = files.get(videoName);
  check(video.length >= 128 * 1024 && video.toString("ascii", 4, 8) === "ftyp", "Recording artifact is not an MP4 video");
  for (const name of screenshots) {
    const png = files.get(name);
    check(png.length >= 1024 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Recording screenshot is not a PNG");
    check(png.toString("ascii", 12, 16) === "IHDR" && png.readUInt32BE(16) === 1600 && png.readUInt32BE(20) === 1000, "Recording screenshot dimensions are unexpected");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const name of [...textFiles, "qa-summary.json", "SHA256SUMS"]) {
    const content = decoder.decode(files.get(name));
    check(!content.includes("\0"), "Recording text contains unexpected binary content");
    check(!/(?:Basic\s+[A-Za-z\d+/]{40,}={0,2}|Bearer\s+[A-Za-z\d._-]{20,}|-----BEGIN .*PRIVATE KEY-----|(?:password|authorization|cookie|storageState)\s*[=:]\s*["'][^"']{12,})/i.test(content), "Recording text contains possible private material");
  }
  check(decoder.decode(files.get("captions.vtt")).startsWith("WEBVTT\n"), "WebVTT captions are invalid");
  check(/^1\r?\n\d{2}:\d{2}:\d{2},\d{3} --> /u.test(decoder.decode(files.get("captions.srt"))), "SRT captions are invalid");
  const summary = decoder.decode(files.get("recording-summary.txt"));
  check(summary.includes(`IRIS Workbench ${version}`) && summary.includes(releaseCommit), "Recording summary does not identify the pinned source");
  const sums = decoder.decode(files.get("SHA256SUMS"));
  const expectedSums = expectedFiles.filter((name) => name !== "SHA256SUMS").sort().map((name) => `${sha256(files.get(name))}  ${name}\n`).join("");
  check(sums === expectedSums, "Artifact checksum file is incomplete or does not match");
  const qa = JSON.parse(decoder.decode(files.get("qa-summary.json")));
  validateQA(qa, files);
  return { files, qa };
}

export default async function publishScreencast({ github, context, core }) {
  let stage = "validate publication authorization";
  try {
    check(context.repo?.owner === owner && context.repo?.repo === repo, "Screencast publication is restricted to the owned project");
    const campaignRef = "refs/heads/codex/intersystems-campaign";
    check((context.eventName === "push" && context.ref === campaignRef) ||
      (context.eventName === "workflow_dispatch" && ["refs/heads/main", campaignRef].includes(context.ref)), "Screencast publication requires a trusted workflow event and ref");
    if (process.env.GITHUB_REPOSITORY) check(process.env.GITHUB_REPOSITORY === `${owner}/${repo}`, "Workflow repository does not match");
    if (process.env.GITHUB_REF) check(process.env.GITHUB_REF === context.ref, "Workflow ref does not match");
    const runId = String(context.runId);
    const attempt = process.env.GITHUB_RUN_ATTEMPT || "1";
    check(/^[1-9]\d*$/.test(runId) && /^[1-9]\d*$/.test(attempt), "Workflow run identity is invalid");
    stage = "validate the complete sanitized recording artifact";
    const { files, qa } = readCapture(process.env.WORKBENCH_SCREENCAST_DIR);
    const videoHash = sha256(files.get(videoName));

    async function assertTag() {
      let object = (await github.rest.git.getRef({ owner, repo, ref: `tags/${tag}` })).data.object;
      for (let depth = 0; object.type === "tag" && depth < 5; depth++)
        object = (await github.rest.git.getTag({ owner, repo, tag_sha: object.sha })).data.object;
      check(object.type === "commit" && object.sha === releaseCommit, "Release tag no longer identifies the verified source commit");
    }
    stage = "verify the existing immutable published source release";
    await assertTag();
    const release = (await github.rest.repos.getReleaseByTag({ owner, repo, tag })).data;
    check(Number.isSafeInteger(release.id) && release.tag_name === tag && release.target_commitish === releaseCommit && release.draft === false && release.prerelease === false && release.published_at, "Release is not the verified published source release");
    const originalRelease = releaseIdentity(release);
    const originalAssets = new Map();
    for (const [name, size] of sourceAssets) {
      const matches = release.assets.filter((asset) => asset.name === name);
      check(matches.length === 1 && matches[0].size === size, "Published source asset is missing or changed");
      if (name.endsWith("_source.zip") && matches[0].digest)
        check(matches[0].digest === sourceDigest, "Published source ZIP checksum is unexpected");
    }
    for (const asset of release.assets) {
      check(!originalAssets.has(asset.id), "Published release contains duplicate asset identities");
      originalAssets.set(asset.id, assetIdentity(asset));
    }
    function matchingVideo(assets) {
      const matches = assets.filter((asset) => asset.name === videoName);
      check(matches.length <= 1, "Release contains repeated media asset names");
      if (matches.length === 0) return undefined;
      const asset = matches[0];
      check(asset.size === files.get(videoName).length && asset.digest === `sha256:${videoHash}`, "An existing different or unverifiable media asset will not be overwritten");
      check(asset.browser_download_url === `https://github.com/${owner}/${repo}/releases/download/${tag}/${videoName}`, "Media download URL is unexpected");
      return asset;
    }
    stage = "check for an existing verified MP4 before writing evidence";
    matchingVideo(release.assets);

    stage = "save sanitized screenshot and QA evidence on a unique branch";
    const evidenceBranch = `codex/screencast-evidence-${runId}-${attempt}`;
    const base = (await github.rest.git.getCommit({ owner, repo, commit_sha: releaseCommit })).data;
    const baseTree = (await github.rest.git.getTree({ owner, repo, tree_sha: base.tree.sha, recursive: "true" })).data;
    check(baseTree.truncated === false && !baseTree.tree.some((entry) => entry.path === "evidence/screencast" || entry.path.startsWith("evidence/screencast/")), "Pinned release already contains a screencast evidence directory");
    const evidenceNames = [...screenshots, "qa-summary.json"];
    const treeEntries = [];
    for (const name of evidenceNames) {
      const blob = (await github.rest.git.createBlob({ owner, repo, content: files.get(name).toString("base64"), encoding: "base64" })).data;
      treeEntries.push({ path: `evidence/screencast/${name}`, mode: "100644", type: "blob", sha: blob.sha });
    }
    const tree = (await github.rest.git.createTree({ owner, repo, base_tree: base.tree.sha, tree: treeEntries })).data;
    let evidenceCommit;
    try {
      const existing = (await github.rest.git.getRef({ owner, repo, ref: `heads/${evidenceBranch}` })).data.object;
      check(existing.type === "commit", "Existing evidence ref is unexpected");
      const commit = (await github.rest.git.getCommit({ owner, repo, commit_sha: existing.sha })).data;
      check(commit.parents.length === 1 && commit.parents[0].sha === releaseCommit && commit.tree.sha === tree.sha, "Existing evidence branch differs from this verified capture");
      evidenceCommit = existing.sha;
    } catch (error) {
      if (!isMissing(error)) throw error;
      const commit = (await github.rest.git.createCommit({
        owner, repo, message: `Record verified ${tag} live screencast evidence (run ${runId}, attempt ${attempt})`,
        tree: tree.sha, parents: [releaseCommit],
      })).data;
      try {
        await github.rest.git.createRef({ owner, repo, ref: `refs/heads/${evidenceBranch}`, sha: commit.sha });
        evidenceCommit = commit.sha;
      } catch (error) {
        if (error?.status !== 422) throw error;
        const existing = (await github.rest.git.getRef({ owner, repo, ref: `heads/${evidenceBranch}` })).data.object;
        const raced = (await github.rest.git.getCommit({ owner, repo, commit_sha: existing.sha })).data;
        check(existing.type === "commit" && raced.parents.length === 1 && raced.parents[0].sha === releaseCommit && raced.tree.sha === tree.sha, "Concurrent evidence publication differs from this capture");
        evidenceCommit = existing.sha;
      }
    }

    async function verifySourceRelease() {
      await assertTag();
      const published = (await github.rest.repos.getReleaseByTag({ owner, repo, tag })).data;
      check(releaseIdentity(published) === originalRelease, "Published source release metadata changed during media publication");
      for (const [id, identity] of originalAssets)
        check(published.assets.some((asset) => asset.id === id && assetIdentity(asset) === identity), "An existing release asset changed during media publication");
      return published;
    }
    stage = "verify source metadata and assets remained unchanged before media upload";
    const published = await verifySourceRelease();
    // Complete evidence writes and source checks before the immutable media
    // upload. A failure above must leave a new capture safe to record and retry.
    stage = "append the verified MP4 without overwriting release assets";
    let media = matchingVideo(published.assets);
    let reused = Boolean(media);
    if (!media) {
      try {
        media = (await github.rest.repos.uploadReleaseAsset({
          owner, repo, release_id: release.id, name: videoName,
          label: `IRIS Workbench ${version}: verified live screencast (silent, captioned)`,
          data: files.get(videoName), headers: { "content-type": "video/mp4", "content-length": files.get(videoName).length },
        })).data;
      } catch (error) {
        if (error?.status !== 422) throw error;
        const latest = (await github.rest.repos.getReleaseByTag({ owner, repo, tag })).data;
        media = matchingVideo(latest.assets);
        check(media, "Concurrent media upload did not produce the verified asset");
        reused = true;
      }
      // Retries can reuse only these exact capture bytes.
      matchingVideo([media]);
    }
    stage = "verify source metadata and assets remained unchanged after media publication";
    const finalRelease = await verifySourceRelease();
    media = matchingVideo(finalRelease.assets);
    check(media, "Verified media asset is absent after publication");
    const publication = {
      schemaVersion: 1,
      release: { version, tag, commit: releaseCommit, url: `https://github.com/${owner}/${repo}/releases/tag/${tag}` },
      video: { filename: videoName, bytes: files.get(videoName).length, sha256: videoHash, durationSeconds: qa.video.durationSeconds, url: media.browser_download_url, reused },
      evidence: { branch: evidenceBranch, commit: evidenceCommit, url: `https://github.com/${owner}/${repo}/tree/${evidenceBranch}/evidence/screencast`, files: evidenceNames },
      qa: { passed: true, initialServiceStatus: 404, finalServiceStatus: 200, enabledReadback: true, consoleErrors: 0, consoleWarnings: 0, pageErrors: 0, secretGuardPassed: true },
    };
    core.setOutput("publication", JSON.stringify(publication));
    core.setOutput("video_url", publication.video.url);
    core.setOutput("evidence_branch", evidenceBranch);
    core.setOutput("evidence_commit", evidenceCommit);
    core.info(`Published verified ${tag} live screencast and sanitized evidence; source release and assets remain unchanged.`);
    return publication;
  } catch {
    // API responses, file contents, environment values and credentials never
    // enter an Actions error annotation. The stage is sufficient to investigate.
    throw new Error(`Screencast publication stopped while attempting to ${stage}. Existing assets were not overwritten; private details are omitted.`);
  }
}
