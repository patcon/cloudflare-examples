// The user details the token doesn't carry (name, email), fetched from Directus
// as the user: the Worker passes on their own access token, so Directus applies
// that user's permissions and the Worker needs no credentials of its own.

export type Profile = { name: string | null; email: string | null };

type DirectusUser = { first_name?: string | null; last_name?: string | null; email?: string | null };

export async function fetchDirectusProfile(directusUrl: string, token: string): Promise<Profile> {
  // `fields=*` returns only the fields this user's role may read, where naming a
  // forbidden field would fail the whole request.
  const res = await fetch(`${directusUrl.replace(/\/$/, "")}/users/me?fields=*`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Directus /users/me: HTTP ${res.status}`);
  const { data } = await res.json<{ data: DirectusUser }>();
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
  return { name, email: data.email ?? null };
}
