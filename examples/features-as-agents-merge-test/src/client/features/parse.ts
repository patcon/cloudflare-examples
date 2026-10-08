/** A message an agent broadcast, or null when it isn't one of ours. */
export function parse<T>(data: unknown): T | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
