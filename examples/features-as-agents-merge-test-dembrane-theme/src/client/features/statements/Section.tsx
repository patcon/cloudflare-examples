import { Anchor, Paper, Text } from "@mantine/core";
import type { SectionProps } from "../types";

/**
 * Statements on the settings page: the way to the review page. What the
 * extraction prompt is told about the project is on the General tab.
 */
export function StatementsSection({ projectId }: SectionProps<"statements">) {
  return (
    <Paper p="md" className="flex flex-col gap-3">
      <Text size="xs" c="dimmed">
        Extraction sees the project's context, and the portal's title and content, from the General
        tab.
      </Text>
      <Anchor size="sm" href={`/${encodeURIComponent(projectId)}/review`}>
        Review every session's statements
      </Anchor>
    </Paper>
  );
}
