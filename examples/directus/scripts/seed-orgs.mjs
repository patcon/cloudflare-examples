// Create a couple of organisations with projects, owned by the seeded users.
// Run after seed-users.mjs. Safe to re-run: rows are created with fixed ids,
// and any that already exist are left alone.
//
// It creates what dembrane's onboarding creates for a new user's personal
// organisation (create_personal_org in echo/server/dembrane/api/v2/onboarding.py):
//
//   org ─┬─ org_membership (role "owner")      ← who owns the organisation
//        ├─ billing_account (org-scoped)       ← a workspace can't exist without one
//        └─ workspace (is_default, "Default") ─┬─ workspace_membership (role "owner")
//                                              └─ project …
//
// Memberships point at app_user ids, not directus_users ids.
const url = process.env.PUBLIC_URL ?? "http://localhost:8055";

const ORGS = [
  {
    id: "0a11ce00-0000-4000-8000-000000000001",
    name: "Alice's Organisation",
    owner: "alice@example.com",
    members: ["bob@example.com"], // role "member": in the organisation, but not its owner
    projects: [
      { id: "0a11ce00-0000-4000-8000-0000000000a1", name: "Town hall listening session" },
      { id: "0a11ce00-0000-4000-8000-0000000000a2", name: "Budget survey" },
    ],
  },
  {
    id: "0b0b0000-0000-4000-8000-000000000001",
    name: "Bob's Organisation",
    owner: "bob@example.com",
    members: [],
    projects: [{ id: "0b0b0000-0000-4000-8000-0000000000b1", name: "Park redesign" }],
  },
];

// Derive the other rows' ids from the organisation's, so re-runs find them.
const derived = (orgId, n) => orgId.slice(0, -2) + String(n).padStart(2, "0");

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

async function ensure(collection, row, label) {
  const [existing] = await api("GET", `/items/${collection}?filter[id][_eq]=${row.id}&fields=id`, token);
  if (existing) return console.log(`  ${label}: exists, skipping`);
  await api("POST", `/items/${collection}`, token, row);
  console.log(`  ${label}: created`);
}

// directus_users id and app_user id for each seeded email.
async function findUser(email) {
  const q = `filter[email][_eq]=${encodeURIComponent(email)}&fields=id`;
  const [user] = await api("GET", `/users?${q}`, token);
  const [appUser] = user
    ? await api("GET", `/items/app_user?filter[directus_user_id][_eq]=${user.id}&fields=id`, token)
    : [];
  if (!appUser) throw new Error(`No user ${email}. Run seed-users.mjs first.`);
  return { directusId: user.id, appUserId: appUser.id };
}

for (const org of ORGS) {
  const owner = await findUser(org.owner);
  const workspaceId = derived(org.id, 2);

  await ensure("org", { id: org.id, name: org.name, created_by: owner.appUserId }, org.name);
  await ensure(
    "org_membership",
    { id: derived(org.id, 10), org_id: org.id, user_id: owner.appUserId, role: "owner" },
    `  ${org.owner} owns it`,
  );
  for (const [i, email] of org.members.entries()) {
    const member = await findUser(email);
    await ensure(
      "org_membership",
      { id: derived(org.id, 11 + i), org_id: org.id, user_id: member.appUserId, role: "member" },
      `  ${email} is a member`,
    );
  }
  await ensure(
    "billing_account",
    { id: derived(org.id, 3), org_id: org.id, tier: "free", payment_mode: "none", label: "Org billing" },
    "  billing account",
  );
  await ensure(
    "workspace",
    {
      id: workspaceId,
      org_id: org.id,
      name: "Default",
      is_default: true,
      created_by: owner.appUserId,
      billing_account_id: derived(org.id, 3),
    },
    "  Default workspace",
  );
  await ensure(
    "workspace_membership",
    { id: derived(org.id, 20), workspace_id: workspaceId, user_id: owner.appUserId, role: "owner", source: "direct" },
    `  ${org.owner} owns the workspace`,
  );
  for (const project of org.projects) {
    await ensure(
      "project",
      { ...project, workspace_id: workspaceId, directus_user_id: owner.directusId, is_conversation_allowed: true },
      `  project "${project.name}"`,
    );
  }
}
