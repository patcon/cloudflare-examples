import { DurableObject } from "cloudflare:workers";

export type CounterState = { count: number };
export type CounterEvent = { _tag: "Increment" } | { _tag: "Decrement" } | { _tag: "Reset" };

const TAGS: readonly string[] = ["Increment", "Decrement", "Reset"];

/** One count per ID. Events change it, and it's kept in the Durable Object's storage. */
export class Counter extends DurableObject<Env> {
  async getState() {
    return (await this.ctx.storage.get<CounterState>("state")) ?? null;
  }

  async send(event: CounterEvent) {
    const count = (await this.getState())?.count ?? 0;
    switch (event._tag) {
      case "Increment":
        return this.ctx.storage.put("state", { count: count + 1 });
      case "Decrement":
        return this.ctx.storage.put("state", { count: count - 1 });
      case "Reset":
        return this.ctx.storage.put("state", { count: 0 });
    }
  }
}

const getCount = async (env: Env, id: string) => {
  const state = await env.COUNTER.getByName(id).getState();
  return state?.count ?? 0;
};

const sendEvent = (env: Env, id: string, event: CounterEvent) =>
  env.COUNTER.getByName(id).send(event);

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== "/api/counter") {
      return new Response("Not found", { status: 404 });
    }
    // POST { "_tag": "Increment" } (or "Decrement", or "Reset") changes the count.
    if (request.method === "POST") {
      const event = (await request.json()) as CounterEvent;
      if (!TAGS.includes(event?._tag)) return new Response("Bad event", { status: 400 });
      await sendEvent(env, "default", event);
    }
    return Response.json({ count: await getCount(env, "default") });
  },
} satisfies ExportedHandler<Env>;
