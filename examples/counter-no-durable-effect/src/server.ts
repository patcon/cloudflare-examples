import { DurableObject, env } from "cloudflare:workers";

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

const getCount = async (id: string) => {
  const state = await env.COUNTER.getByName(id).getState();
  return state?.count ?? 0;
};

const sendEvent = async (id: string, event: CounterEvent) => {
  await env.COUNTER.getByName(id).send(event);
};

/** A POST body that isn't JSON, or isn't one of the events. */
class BadEvent extends Error {}

const decodeEvent = (body: string) => {
  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch (error) {
    throw new BadEvent((error as Error).message);
  }
  if (!TAGS.includes((event as CounterEvent | null)?._tag as string)) {
    throw new BadEvent(`Expected an event, got ${body}`);
  }
  return event as CounterEvent;
};

const handleRequest = async (request: Request) => {
  if (new URL(request.url).pathname !== "/api/counter") {
    return new Response("Not found", { status: 404 });
  }
  // POST { "_tag": "Increment" } (or "Decrement", or "Reset") changes the count.
  if (request.method === "POST") {
    const event = decodeEvent(await request.text());
    await sendEvent("default", event);
  }
  return Response.json({ count: await getCount("default") });
};

export default {
  async fetch(request) {
    try {
      return await handleRequest(request);
    } catch (error) {
      if (error instanceof BadEvent) return new Response(error.message, { status: 400 });
      return new Response(`Counter failed: ${error}`, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
