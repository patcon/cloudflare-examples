import Markdown from "react-markdown";
import { Text } from "@mantine/core";
import type { Outcome } from "../../../server/features/verify/agent";

/** One approved outcome: its emoji, label and time, opening to its text. */
export function ApprovedItem({ outcome: o }: { outcome: Outcome }) {
  return (
    <details className="group rounded-lg border">
      <summary className="flex items-center gap-2 cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
        <span className="text-lg">{o.topicIcon}</span>
        <span className="text-sm font-medium flex-1">{o.topicLabel}</span>
        {o.approvedAt && (
          <Text size="xs" c="dimmed">
            {new Date(o.approvedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </Text>
        )}
      </summary>
      <div className="markdown text-sm px-3 pb-3">
        <Markdown>{o.content}</Markdown>
      </div>
    </details>
  );
}
