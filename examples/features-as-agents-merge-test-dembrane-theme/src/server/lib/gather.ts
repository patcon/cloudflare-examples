/**
 * Asks every session the same thing, in parallel, for a project-wide view,
 * such as each session's approved outcomes. A session that doesn't answer
 * gets null, and is logged, and the rest still show.
 */
export async function gather<T>(
  ids: readonly string[],
  ask: (id: string) => Promise<T>,
): Promise<{ id: string; value: T | null }[]> {
  const results = await Promise.allSettled(ids.map(ask));
  return results.map((result, i) => {
    if (result.status === "fulfilled") return { id: ids[i], value: result.value };
    console.error(`Session ${ids[i]} didn't answer: ${result.reason}`);
    return { id: ids[i], value: null };
  });
}
