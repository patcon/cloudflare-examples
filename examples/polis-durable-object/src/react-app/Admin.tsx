import { useState, type FormEvent } from "react";
import type { ImportResult } from "../shared/types";

// Seeds a conversation from a Polis CSV export. No auth, on purpose, for the demo.
export function Admin({ convoId }: { convoId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/${encodeURIComponent(convoId)}/import`, {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const body = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
      setResult(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="centered">
      <h1>Import into {convoId}</h1>
      <p className="muted">
        Seed this conversation from a Polis export. On a Polis report, the raw data is at{" "}
        <code>https://pol.is/api/v3/reportExport/&lt;report-id&gt;/comments.csv</code> and <code>…/votes.csv</code>.
        Importing the same export again updates it rather than duplicating it.
      </p>
      <form className="panel" onSubmit={submit}>
        <label htmlFor="comments">comments.csv</label>
        <input id="comments" name="comments" type="file" accept=".csv,text/csv" required />
        <label htmlFor="votes">votes.csv</label>
        <input id="votes" name="votes" type="file" accept=".csv,text/csv" required />
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </form>
      <div role="status">
        {result && (
          <p className="ok">
            Imported {result.statements} statements, {result.participants} participants and {result.votes} votes.{" "}
            <a href={`/${encodeURIComponent(convoId)}`}>Go to the conversation</a>
          </p>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
