// Mint a mock dembrane token for curl, signed with DIRECTUS_SECRET from .dev.vars.
//   pnpm mint-token alice        (alice | bob | admin)
import { readFileSync } from "node:fs";
import { MOCK_USERS, signMockToken } from "../src/auth";

const name = (process.argv[2] ?? "alice").toLowerCase();
const user = MOCK_USERS.find((u) => u.name.toLowerCase() === name);
if (!user) {
  console.error(`unknown user "${name}"; pick one of: ${MOCK_USERS.map((u) => u.name.toLowerCase()).join(", ")}`);
  process.exit(1);
}

const secret = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(/^DIRECTUS_SECRET=(.*)$/m)?.[1]?.trim();
if (!secret) {
  console.error("DIRECTUS_SECRET not found in .dev.vars (copy .dev.vars.example)");
  process.exit(1);
}

console.log(await signMockToken(user, secret));
