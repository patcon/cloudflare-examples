import { DurableObject, env } from "cloudflare:workers";

export type CounterEvent = { _tag: "Increment" } | { _tag: "Decrement" } | { _tag: "Reset" };

const TAGS: readonly string[] = ["Increment", "Decrement", "Reset"];

/** A message that isn't JSON, or isn't one of the events. */
class BadEvent extends Error {}

const decodeEvent = (message: string | ArrayBuffer) => {
  if (typeof message !== "string") throw new BadEvent("Expected a text message");
  let event: unknown;
  try {
    event = JSON.parse(message);
  } catch (error) {
    throw new BadEvent((error as Error).message);
  }
  if (!TAGS.includes((event as CounterEvent | null)?._tag as string)) {
    throw new BadEvent(`Expected an event, got ${message}`);
  }
  return event as CounterEvent;
};

/**
 * One count per ID, kept in the Durable Object's storage. Each page holds a
 * WebSocket to it, sends events, and is sent `{ count }` whenever it changes.
 */
export class Counter extends DurableObject<Env> {
  async getCount() {
    return (await this.ctx.storage.get<number>("count")) ?? 0;
  }

  /** Sends `{ count }` to every open socket. */
  broadcast(count: number) {
    const update = JSON.stringify({ count });
    for (const socket of this.ctx.getWebSockets()) {
      // A socket can close before Cloudflare has told the object.
      if (socket.readyState === WebSocket.OPEN) socket.send(update);
    }
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    // Hibernatable: the object can be evicted while sockets stay open.
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ count: await this.getCount() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    let event: CounterEvent;
    try {
      event = decodeEvent(message);
    } catch (error) {
      if (!(error instanceof BadEvent)) throw error;
      // 1007: the message's data didn't match what the counter accepts.
      return ws.close(1007, error.message.slice(0, 120));
    }
    const count = await this.getCount();
    let next: number;
    switch (event._tag) {
      case "Increment":
        next = count + 1;
        break;
      case "Decrement":
        next = count - 1;
        break;
      case "Reset":
        next = 0;
        break;
    }
    await this.ctx.storage.put("count", next);
    this.broadcast(next);
  }

  // Cloudflare answers the page's close itself (`web_socket_auto_reply_to_close`),
  // so there's nothing to do, but the handler has to exist.
  webSocketClose() {}
}

export default {
  async fetch(request) {
    if (new URL(request.url).pathname !== "/api/counter") {
      return new Response("Not found", { status: 404 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }
    return env.COUNTER.getByName("default").fetch(request);
  },
} satisfies ExportedHandler<Env>;
