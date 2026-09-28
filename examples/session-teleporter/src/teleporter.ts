import { DurableObject } from "cloudflare:workers";

// A transfer is between two devices, so a third socket on the same PIN is
// turned away with this close code. The client stops reconnecting on it.
export const MAX_SOCKETS = 2;
export const PIN_FULL = 4000;

// One instance per PIN (the Worker picks it with getByName(pin)). It's a dumb
// relay: whatever one socket sends, the other socket on the same PIN gets.
// It stores nothing. The hibernation API lets it sleep between messages
// while the sockets stay open.
export class Teleporter extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    // Accept, then close with a code the client can read: a refused upgrade
    // only reaches the browser as a generic error.
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      server.accept();
      server.close(PIN_FULL, "this PIN already has two devices");
    } else {
      this.ctx.acceptWebSocket(server);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) other.send(message);
    }
  }
}
