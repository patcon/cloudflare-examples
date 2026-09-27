import { useEffect, useState, type FormEvent } from "react";
import type { Me, Statement, Vote } from "../shared/types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function Participant({ convoId }: { convoId: string }) {
  const base = `/api/${encodeURIComponent(convoId)}`;
  const [me, setMe] = useState<Me | null>(null);
  // undefined while loading; null when there's nothing left to vote on.
  const [statement, setStatement] = useState<Statement | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const loadNext = () =>
    api<Statement | null>(`${base}/next`)
      .then((next) => {
        setStatement(next);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));

  // `me` first: it sets the participant cookie, so the requests after it
  // don't each create a new identity.
  useEffect(() => {
    api<Me>(`${base}/me`)
      .then((me) => {
        setMe(me);
        return loadNext();
      })
      .catch((e: Error) => setError(e.message));
  }, [base]);

  return (
    <main className="centered">
      <h1>Conversation {convoId}</h1>
      <p className="muted hint">
        You're participant <code>{me?.participantId ?? "…"}</code>
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <VoteCard base={base} statement={statement} onVoted={loadNext} onError={setError} />
      <StatementForm base={base} onAdded={() => statement === null && loadNext()} onError={setError} />
    </main>
  );
}

const VOTES: { vote: Vote; label: string }[] = [
  { vote: 1, label: "Agree" },
  { vote: -1, label: "Disagree" },
  { vote: 0, label: "Pass / unsure" },
];

function VoteCard({
  base,
  statement,
  onVoted,
  onError,
}: {
  base: string;
  statement: Statement | null | undefined;
  onVoted: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  if (statement === undefined) {
    return (
      <section className="panel" aria-busy="true">
        <p className="muted">Loading…</p>
      </section>
    );
  }
  if (statement === null) {
    return (
      <section className="panel" role="status">
        <p>You've voted on every statement.</p>
        <p className="muted">Add one below, or check back when others have.</p>
        <button onClick={onVoted}>Check again</button>
      </section>
    );
  }

  const vote = async (vote: Vote) => {
    setBusy(true);
    try {
      await api(`${base}/votes`, post({ statementId: statement.id, vote }));
      onVoted();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="statement-heading">
      <h2 id="statement-heading" className="muted hint">
        Statement {statement.id}
      </h2>
      <p className="statement">{statement.text}</p>
      <div className="actions">
        {VOTES.map(({ vote: v, label }) => (
          <button key={v} className={v === 1 ? "primary" : undefined} disabled={busy} onClick={() => vote(v)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

const MAX_LENGTH = 1_000;

function StatementForm({
  base,
  onAdded,
  onError,
}: {
  base: string;
  onAdded: () => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api<Statement>(`${base}/statements`, post({ text }));
      setText("");
      setAdded(true);
      onAdded();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <form onSubmit={submit}>
        <h2 id="statement-form-heading">Add a statement</h2>
        <textarea
          aria-labelledby="statement-form-heading"
          rows={3}
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAdded(false);
          }}
        />
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || text.trim() === ""}>
            Add
          </button>
          <span className="muted hint" role="status">
            {added ? "Added. Everyone can vote on it now." : `${text.length} / ${MAX_LENGTH}`}
          </span>
        </div>
      </form>
    </section>
  );
}
