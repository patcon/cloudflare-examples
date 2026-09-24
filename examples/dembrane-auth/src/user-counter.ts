import { DurableObject } from "cloudflare:workers";
import type { Profile } from "./profile";

// One instance per dembrane user (the Worker picks it with getByName(userId)).
// It does no auth itself: it's only reachable through the Worker's binding,
// and the Worker has already checked who the caller is.
export class UserCounter extends DurableObject<Env> {
  getCount(): number {
    return this.ctx.storage.kv.get<number>("count") ?? 0;
  }

  increment(): number {
    const count = this.getCount() + 1;
    this.ctx.storage.kv.put("count", count);
    return count;
  }

  // Saved by the Worker when the user logs in (see POST /api/session).
  getProfile(): Profile | null {
    return this.ctx.storage.kv.get<Profile>("profile") ?? null;
  }

  setProfile(profile: Profile): void {
    this.ctx.storage.kv.put("profile", profile);
  }
}
