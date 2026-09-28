import { useEffect, useState } from "react";
import type { Statement } from "../shared/types";

// Every statement's text, by ID. Loads when enabled (after /me has set the
// participant cookie), and again whenever the statement count goes up.
export function useStatements(base: string, enabled: boolean, count: number | undefined): Map<number, string> {
  const [texts, setTexts] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`${base}/statements`)
      .then((res) => (res.ok ? (res.json() as Promise<Statement[]>) : Promise.reject(new Error(res.statusText))))
      .then((statements) => !cancelled && setTexts(new Map(statements.map((s) => [s.id, s.text]))))
      .catch(() => {
        // Keep the texts we have; the next count change retries.
      });
    return () => {
      cancelled = true;
    };
  }, [base, enabled, count]);

  return texts;
}
