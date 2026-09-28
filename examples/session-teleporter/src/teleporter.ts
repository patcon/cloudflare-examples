import { DurableObject } from "cloudflare:workers";

// One instance per PIN (the Worker picks it with getByName(pin)). It's a dumb
// relay: whatever one socket sends, every other socket on the same PIN gets.
// It stores nothing. The hibernation API lets it sleep between messages
// while the sockets stay open.
export class Teleporter extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) other.send(message);
    }
  }
}
