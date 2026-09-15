import fs from "node:fs";
import { createHash } from "node:crypto";
const url =
  "https://raw.githubusercontent.com/intersystems-community/sysadmin-api-specification/f764aea427e5c0b1dd08a4c18a0457e0ff7b3b34/mainspec_v2.json";
const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
if (!r.ok) throw Error("API specification download failed: " + r.status);
const bytes = Buffer.from(await r.arrayBuffer());
if (
  createHash("sha256").update(bytes).digest("hex") !==
  "1ab154c7c5d9b25e6b227944a44a120c670686f876c2e14abfb9ee5898596650"
)
  throw Error("API specification checksum differs from the verified version");
fs.writeFileSync(new URL("../server/spec.json", import.meta.url), bytes);
console.log("Verified API specification downloaded.");
