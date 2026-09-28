import { useMemo } from "react";
import { selectConsensusStatements, selectRepStatements } from "../shared/repness";
import type { MathResult } from "../shared/types";
import { groupColor, groupLetter, Marker, SHAPES } from "./Scatter";

// What most people agree or disagree on, then what sets each opinion group
// apart (repness.ts). Consensus shows as soon as there are votes; the groups
// once there are groups.
export function StatementExplorer({ math, texts }: { math: MathResult | null; texts: Map<number, string> }) {
  // Math saved before MathResult had tallies has none until it's recomputed.
  const tallies = math?.tallies;
  const selected = useMemo(
    () => tallies && { consensus: selectConsensusStatements(tallies), groups: selectRepStatements(tallies) },
    [tallies],
  );

  if (!math || !tallies || !selected || tallies.length === 0) {
    return (
      <section className="panel explorer">
        <h2>Statements</h2>
        <p className="muted">These appear a few seconds after the first votes.</p>
      </section>
    );
  }

  const text = (id: number) => texts.get(id) ?? `Statement ${id}`;
  const { agree, disagree } = selected.consensus;

  return (
    <section className="panel explorer">
      <h2>Statements</h2>

      <h3>What most people agree or disagree on</h3>
      {agree.length + disagree.length === 0 ? (
        <p className="muted">Nothing yet that most people clearly agree or disagree on.</p>
      ) : (
        <ul>
          {[...agree.map((c) => ({ ...c, side: "agreed" })), ...disagree.map((c) => ({ ...c, side: "disagreed" }))].map(
            (c) => (
              <li key={`${c.side}-${c.statementId}`}>
                {text(c.statementId)}
                <span className="muted hint">
                  {c.nSuccess} of {c.nTrials} {c.side}
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      {math.k === null ? (
        <p className="muted hint">What sets each opinion group apart shows here once there are groups.</p>
      ) : (
        selected.groups.map((reps, g) => (
          <div key={g}>
            <h3>
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <Marker shape={SHAPES[g]} x={7} y={7} r={5} fill={groupColor(g)} />
              </svg>
              What sets group {groupLetter(g)} apart
            </h3>
            <ul>
              {reps.map((r) => (
                <li key={r.statementId}>
                  {text(r.statementId)}
                  <span className="muted hint">
                    {r.nSuccess} of {r.nTrials} in group {groupLetter(g)} {r.repfulFor === "agree" ? "agreed" : "disagreed"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
