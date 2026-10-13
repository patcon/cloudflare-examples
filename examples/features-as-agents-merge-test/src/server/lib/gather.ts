/**
 * Asks every session the same thing, in parallel, for a project-wide view,
 * such as each session's approved outcomes. `ask` gives null for a session
 * that doesn't answer, with the `optional` transform, so the rest still show.
 */
export async function gather<T>(
  ids: readonly string[],
  ask: (id: string) => Promise<T | null>,
): Promise<{ id: string; value: T | null }[]> {
  return Promise.all(ids.map(async (id) => ({ id, value: await ask(id) })));
}
