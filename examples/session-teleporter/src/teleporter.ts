import { DurableObject } from "cloudflare:workers";

// A transfer is between two devices, so a third socket on the same PIN is
// turned away with this close code. The client stops reconnecting on it.
export const MAX_SOCKETS = 2;
export const PIN_FULL = 4000;

// One instance per PIN (the Worker picks it with getByName(pin)). It relays
// whatever one socket sends to the other socket on the same PIN, and tells
// them when they're paired (peer_joined) and when one leaves (peer_left). The
// session messages themselves are the clients' business. It stores nothing.
// The hibernation API lets it sleep between messages while the sockets stay
// open.
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
      if (this.ctx.getWebSockets().length === MAX_SOCKETS) this.sendToAll({ type: "peer_joined" });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) other.send(message);
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.sendToAll({ type: "peer_left" }, ws);
  }

  private sendToAll(message: { type: string }, except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except) ws.send(JSON.stringify(message));
    }
  }
}
