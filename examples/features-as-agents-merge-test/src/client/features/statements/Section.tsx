import { useEffect, useState } from "react";
import { Input, Surface } from "@cloudflare/kumo";
import { MAX_TOPIC_CHARS } from "../../../shared/features/statements/settings";
import type { SectionProps } from "../types";

/**
 * Statements on the settings page: the topic the extraction prompt gets,
 * saved on leaving the field, and the way to the review page.
 */
export function StatementsSection({
  projectId,
  project,
  settings,
  run,
}: SectionProps<"statements">) {
  const [topic, setTopic] = useState(settings.topic);
  // A change from another tab shows here.
  useEffect(() => setTopic(settings.topic), [settings.topic]);

  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      <Input
        label="Topic"
        description="What the conversations are about. It helps pick statements."
        value={topic}
        maxLength={MAX_TOPIC_CHARS}
        onChange={(e) => setTopic(e.target.value)}
        onBlur={() => {
          if (topic !== settings.topic) {
            run(project.call("updateSettings", ["statements", { topic }])).catch(() => {});
          }
        }}
      />
      <a className="text-sm underline" href={`/${encodeURIComponent(projectId)}/review`}>
        Review every session's statements
      </a>
    </Surface>
  );
}
