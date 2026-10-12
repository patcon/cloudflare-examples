import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgent } from "agents/react";
import { connectVerify, setVerifySettings, setVerifyState } from "@/lib/api";
import type {
  VerifyAgent,
  VerifyMessage,
  VerifyState,
} from "../../../server/features/verify/agent";
import { parse } from "../parse";
import type { PanelProps } from "../types";

/**
 * Verify's connection, for echo's verify screens: this session's
 * `VerifyAgent`, its state and the project's topics, where echo's API
 * calls look for them (`lib/api.ts`). It shows nothing itself; echo's
 * screens open from the ECHO button.
 */
export function VerifyBridge({ sessionId, settings }: PanelProps<"verify">) {
  const queryClient = useQueryClient();
  const agent = useAgent<VerifyAgent, VerifyState>({
    agent: "VerifyAgent",
    name: sessionId,
    onStateUpdate: setVerifyState,
    onMessage: (event) => {
      if (parse<VerifyMessage>(event.data)?.type === "approved") {
        void queryClient.invalidateQueries({
          queryKey: ["verify", "conversation_artifacts", sessionId],
        });
      }
    },
  });
  useEffect(() => {
    connectVerify(agent);
    return () => connectVerify(null);
  }, [agent]);

  useEffect(() => {
    setVerifySettings(settings);
    void queryClient.invalidateQueries({ queryKey: ["verify", "topics"] });
  }, [queryClient, settings]);

  return null;
}
