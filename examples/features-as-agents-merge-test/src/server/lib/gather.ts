/**
 * Asks every session the same thing, in parallel, for a project-wide view,
 * such as each session's approved outcomes. A session that doesn't answer
 * gets null, and is logged, and the rest still show. `ask` gives null itself
 * when the call fails or is slow, with the `optional` transform. This catches
 * the rest, such as `getAgentByName` failing before the call is made.
 */
export async function gather<T>(
  ids: readonly string[],
  ask: (id: string) => Promise<T | null>,
): Promise<{ id: string; value: T | null }[]> {
  const results = await Promise.allSettled(ids.map(ask));
  return results.map((result, i) => {
    if (result.status === "fulfilled") return { id: ids[i], value: result.value };
    console.error(`Session ${ids[i]} didn't answer: ${result.reason}`);
    return { id: ids[i], value: null };
  });
}
