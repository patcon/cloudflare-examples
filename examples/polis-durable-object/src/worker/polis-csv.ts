import type { Vote } from "../shared/types";

// Reads a Polis CSV export (comments.csv and votes.csv) into rows for the
// Conversation DO. The columns come from Polis's export code
// (server/src/routes/report.ts), matched by name, not position.

export type PolisImport = {
  statements: { externalId: string; authorId: string; text: string; createdAt: number }[];
  votes: { participantId: string; externalId: string; vote: Vote; updatedAt: number }[];
  participants: { id: string; createdAt: number }[];
};

// Imported participants are namespaced, so they can't collide with the
// hashed cookies of people voting here.
const participantId = (polisId: string) => `polis:${polisId}`;

export function parsePolisExport(files: { comments: string; votes: string }): PolisImport {
  const firstSeen = new Map<string, number>();
  const seen = (id: string, at: number) => firstSeen.set(id, Math.min(at, firstSeen.get(id) ?? Infinity));

  const statements: PolisImport["statements"] = [];
  for (const row of records(files.comments, "comments.csv", ["timestamp", "comment-id", "author-id", "moderated", "comment-body"])) {
    // -1 means a moderator rejected it in Polis. That's the only moderation we respect.
    if (row.get("moderated") === "-1") continue;
    const authorId = participantId(row.get("author-id"));
    const createdAt = seconds(row, "timestamp");
    statements.push({ externalId: row.get("comment-id"), authorId, text: row.get("comment-body"), createdAt });
    seen(authorId, createdAt);
  }

  // A voter can have several rows for one comment; the latest one wins.
  const imported = new Set(statements.map((s) => s.externalId));
  const latest = new Map<string, PolisImport["votes"][number]>();
  for (const row of records(files.votes, "votes.csv", ["timestamp", "comment-id", "voter-id", "vote"])) {
    const externalId = row.get("comment-id");
    if (!imported.has(externalId)) continue;
    const vote = Number(row.get("vote"));
    if (vote !== -1 && vote !== 0 && vote !== 1) throw new Error(`${row.file} row ${row.line}: vote must be -1, 0 or 1`);
    const id = participantId(row.get("voter-id"));
    const updatedAt = seconds(row, "timestamp");
    seen(id, updatedAt);
    const key = `${id}\n${externalId}`;
    if ((latest.get(key)?.updatedAt ?? -Infinity) <= updatedAt) latest.set(key, { participantId: id, externalId, vote, updatedAt });
  }

  const participants = [...firstSeen]
    .map(([id, createdAt]) => ({ id, createdAt }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return { statements, votes: [...latest.values()], participants };
}

type CsvRow = { file: string; line: number; get: (column: string) => string };

// Rows of a CSV file as lookups by column name. Throws if a required column
// is missing. `line` is the row's number in the file, counting the header as 1.
function* records(text: string, file: string, required: string[]): Generator<CsvRow> {
  const [header, ...rows] = parseCsv(text);
  const index = new Map((header ?? []).map((name, i) => [name.trim(), i]));
  const missing = required.filter((name) => !index.has(name));
  if (missing.length > 0) throw new Error(`${file} is missing columns: ${missing.join(", ")}`);
  for (const [n, row] of rows.entries()) {
    if (row.length === 1 && row[0] === "") continue; // a blank line
    yield { file, line: n + 2, get: (column) => row[index.get(column)!] ?? "" };
  }
}

// Polis timestamps are in seconds; ours are in milliseconds.
function seconds(row: CsvRow, column: string): number {
  const value = Number(row.get(column));
  if (!Number.isFinite(value)) throw new Error(`${row.file} row ${row.line}: ${column} isn't a number`);
  return value * 1000;
}

// An RFC 4180 parser: fields may be quoted, and a quoted field may contain
// commas, newlines and doubled quotes ("").
export function parseCsv(text: string): string[][] {
  if (text.startsWith("﻿")) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
