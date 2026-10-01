// Puts a fresh `gcloud auth print-access-token` in .dev.vars as
// GOOGLE_ACCESS_TOKEN, leaving the other lines alone. The token lasts about
// an hour, so run this again when Gemini says it's expired.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const token = execFileSync("gcloud", ["auth", "print-access-token"], {
  encoding: "utf8",
}).trim();

const file = ".dev.vars";
const lines = existsSync(file)
  ? readFileSync(file, "utf8").split("\n")
  : readFileSync(".dev.vars.example", "utf8").split("\n");
const line = `GOOGLE_ACCESS_TOKEN=${token}`;
const i = lines.findIndex((l) => l.startsWith("GOOGLE_ACCESS_TOKEN="));
if (i === -1) lines.push(line);
else lines[i] = line;
writeFileSync(file, lines.join("\n"));
console.log(`Wrote GOOGLE_ACCESS_TOKEN to ${file}`);
