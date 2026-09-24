// Create a few non-admin dembrane users to log in as. Safe to re-run: users
// that already exist are left alone.
//
// Each gets the "Basic User" role (what dembrane sign-up gives) and an app_user
// row, the profile dembrane's backend reads alongside directus_users.
const url = process.env.PUBLIC_URL ?? "http://localhost:8055";
const PASSWORD = "password";
const USERS = [
  { email: "alice@example.com", first_name: "Alice" },
  { email: "bob@example.com", first_name: "Bob" },
];

async function api(method, path, token, body) {
  const res = await fetch(url + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json.data;
}

const { access_token: token } = await api("POST", "/auth/login", null, {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});

const [role] = await api("GET", "/roles?filter[name][_eq]=Basic%20User&fields=id", token);
if (!role) throw new Error('No "Basic User" role. Run `pnpm schema:push` first.');

for (const user of USERS) {
  const q = `filter[email][_eq]=${encodeURIComponent(user.email)}&fields=id`;
  let [existing] = await api("GET", `/users?${q}`, token);
  if (existing) {
    console.log(`  ${user.email}: exists, skipping`);
    continue;
  }
  const created = await api("POST", "/users", token, {
    ...user,
    password: PASSWORD,
    role: role.id,
    status: "active",
  });
  await api("POST", "/items/app_user", token, {
    directus_user_id: created.id,
    email: user.email,
    display_name: user.first_name,
  });
  console.log(`  ${user.email}: created (${created.id})`);
}
console.log(`Log in as any of them with password "${PASSWORD}".`);
