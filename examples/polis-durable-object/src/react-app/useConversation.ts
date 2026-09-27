import { useEffect, useState } from "react";
import { WebSocket as PartySocket } from "partysocket";
import type { Counts, MathResult, ServerMessage } from "../shared/types";

export type ConversationState = { connected: boolean; counts: Counts | null; math: MathResult | null };

// Live counts and math over a WebSocket that reconnects by itself. Pass
// `enabled: false` until the participant cookie is set (by /me), so the
// upgrade request carries it.
export function useConversation(convoId: string, enabled: boolean): ConversationState {
  const [state, setState] = useState<ConversationState>({ connected: false, counts: null, math: null });

  useEffect(() => {
    if (!enabled) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new PartySocket(`${scheme}://${location.host}/api/${encodeURIComponent(convoId)}/ws`);
    socket.onopen = () => setState((s) => ({ ...s, connected: true }));
    socket.onclose = () => setState((s) => ({ ...s, connected: false }));
    socket.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "snapshot") setState((s) => ({ ...s, counts: message.counts, math: message.math }));
      if (message.type === "counts") setState((s) => ({ ...s, counts: message.counts }));
      if (message.type === "math") setState((s) => ({ ...s, math: message.math }));
    };
    return () => socket.close();
  }, [convoId, enabled]);

  return state;
}
