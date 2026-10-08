import { Surface, Text } from "@cloudflare/kumo";
import type { SectionProps } from "../types";

/**
 * Statements on the settings page: the way to the review page. What the
 * extraction prompt is told the conversations are about is the project's
 * context, on the General tab.
 */
export function StatementsSection({ projectId }: SectionProps<"statements">) {
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      <Text size="xs" variant="secondary">
        Extraction sees the project's context, from the General tab.
      </Text>
      <a className="text-sm underline" href={`/${encodeURIComponent(projectId)}/review`}>
        Review every session's statements
      </a>
    </Surface>
  );
}
