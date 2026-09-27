import { describe, expect, it } from "vitest";
import { parseCsv, parsePolisExport } from "../src/worker/polis-csv";

describe("parseCsv", () => {
  it("splits plain rows and fields", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps commas, doubled quotes and newlines inside quoted fields", () => {
    expect(parseCsv('id,body\n1,"Walk, cycle"\n2,"She said ""no"""\n3,"two\nlines"\n')).toEqual([
      ["id", "body"],
      ["1", "Walk, cycle"],
      ["2", 'She said "no"'],
      ["3", "two\nlines"],
    ]);
  });

  it("handles CRLF line endings, a byte-order mark and no final newline", () => {
    expect(parseCsv('﻿a,b\r\n1,"x\r\ny"\r\n2,z')).toEqual([
      ["a", "b"],
      ["1", "x\r\ny"],
      ["2", "z"],
    ]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("a,b,c\n,,\n")).toEqual([
      ["a", "b", "c"],
      ["", "", ""],
    ]);
  });
});

const COMMENTS = `timestamp,datetime,comment-id,author-id,agrees,disagrees,moderated,comment-body
1593461131,Mon Jun 29 2020,0,0,50,1,1,"More cycling, and walking."
1593461482,Mon Jun 29 2020,1,4,40,5,0,Telecommuting will stay.
1593461494,Mon Jun 29 2020,2,7,44,3,-1,Rejected by a moderator.
`;

const VOTES = `timestamp,datetime,comment-id,voter-id,vote
1594984322,Fri Jul 17 2020,0,0,1
1594148968,Tue Jul 07 2020,0,3,1
1594100000,Tue Jul 07 2020,1,3,-1
1594200000,Tue Jul 07 2020,1,3,0
1594150000,Tue Jul 07 2020,1,3,1
1594067327,Mon Jul 06 2020,2,5,1
1594067327,Mon Jul 06 2020,9,5,1
`;

describe("parsePolisExport", () => {
  it("maps comments to statements, with prefixed author IDs and times in milliseconds", () => {
    const { statements } = parsePolisExport({ comments: COMMENTS, votes: VOTES });

    expect(statements).toEqual([
      { externalId: "0", authorId: "polis:0", text: "More cycling, and walking.", createdAt: 1593461131000 },
      { externalId: "1", authorId: "polis:4", text: "Telecommuting will stay.", createdAt: 1593461482000 },
    ]);
  });

  it("skips comments a moderator rejected, and votes on comments that weren't imported", () => {
    const { statements, votes } = parsePolisExport({ comments: COMMENTS, votes: VOTES });

    expect(statements.map((s) => s.externalId)).not.toContain("2");
    expect(votes.map((v) => v.externalId)).not.toContain("2");
    expect(votes.map((v) => v.externalId)).not.toContain("9");
  });

  it("keeps each voter's latest vote on a comment", () => {
    const { votes } = parsePolisExport({ comments: COMMENTS, votes: VOTES });

    expect(votes.filter((v) => v.participantId === "polis:3" && v.externalId === "1")).toEqual([
      { participantId: "polis:3", externalId: "1", vote: 0, updatedAt: 1594200000000 },
    ]);
    expect(votes).toHaveLength(3);
  });

  it("lists every voter and author as a participant, with the time they first appeared", () => {
    const { participants } = parsePolisExport({ comments: COMMENTS, votes: VOTES });

    expect(participants).toEqual([
      { id: "polis:0", createdAt: 1593461131000 },
      { id: "polis:3", createdAt: 1594100000000 },
      { id: "polis:4", createdAt: 1593461482000 },
    ]);
  });

  it("matches columns by name, and ignores extra columns such as importance", () => {
    const comments = `comment-body,importance,moderated,author-id,comment-id,timestamp
Reordered.,2,1,8,5,1600000000
`;
    const votes = `vote,important,voter-id,comment-id,timestamp
-1,1,8,5,1600000001
`;

    const result = parsePolisExport({ comments, votes });

    expect(result.statements).toEqual([{ externalId: "5", authorId: "polis:8", text: "Reordered.", createdAt: 1600000000000 }]);
    expect(result.votes).toEqual([{ participantId: "polis:8", externalId: "5", vote: -1, updatedAt: 1600000001000 }]);
  });

  it("rejects a file that's missing a column it needs", () => {
    expect(() => parsePolisExport({ comments: "comment-id,comment-body\n0,Hi\n", votes: VOTES })).toThrow(
      /comments\.csv is missing columns: timestamp, author-id, moderated/,
    );
  });

  it("rejects a vote that isn't -1, 0 or 1", () => {
    const votes = "timestamp,comment-id,voter-id,vote\n1,0,0,2\n";

    expect(() => parsePolisExport({ comments: COMMENTS, votes })).toThrow(/votes\.csv row 2: vote must be -1, 0 or 1/);
  });
});
