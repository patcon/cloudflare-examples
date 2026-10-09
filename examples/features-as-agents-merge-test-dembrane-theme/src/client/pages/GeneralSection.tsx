import { useState } from "react";
import { Button, Paper, Text, Textarea, TextInput, Title } from "@mantine/core";
import {
  MAX_CONTEXT_CHARS,
  MAX_NAME_CHARS,
  MAX_PORTAL_CONTENT_CHARS,
  MAX_PORTAL_TITLE_CHARS,
  type GeneralSettings,
} from "../../shared/general";
import type { ProjectConnection } from "../hooks/use-project";

/**
 * The settings page's General tab: the project's own details, and what
 * the portal shows. Text waits for Save. A change made in another tab
 * shows up here, unless this one has unsaved text.
 */
export function GeneralSection({
  project,
  settings,
  run,
}: {
  project: ProjectConnection;
  settings: GeneralSettings;
  run: <T>(call: Promise<T>) => Promise<T>;
}) {
  /** Unsaved changes, over the saved settings. */
  const [draft, setDraft] = useState<Partial<GeneralSettings>>({});
  const [saving, setSaving] = useState(false);

  const shown = { ...settings, ...draft };
  const edit = (field: keyof GeneralSettings) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }));
  const dirty = Object.keys(draft).length > 0;
  const named = shown.name.trim() !== "";
  const save = () => {
    setSaving(true);
    run(project.call("updateGeneral", [draft]))
      .then(
        () => setDraft({}),
        () => {},
      )
      .finally(() => setSaving(false));
  };

  return (
    <>
      <Paper p="md" className="flex flex-col gap-4">
        <Title order={5}>Project details</Title>
        <TextInput
          label="Name"
          description={named ? "Verify's outcomes see this." : "Required."}
          value={shown.name}
          maxLength={MAX_NAME_CHARS}
          onChange={edit("name")}
        />
        <Textarea
          label="Context"
          description="What the project is about, such as the question the groups are discussing. Explore's replies see this."
          value={shown.context}
          maxLength={MAX_CONTEXT_CHARS}
          autosize
          minRows={4}
          onChange={edit("context")}
        />
      </Paper>

      <Paper p="md" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Title order={5}>Portal</Title>
          <Text size="xs" c="dimmed">
            What participants are shown. Explore's replies see this too.
          </Text>
        </div>
        <TextInput
          label="Title"
          value={shown.portalTitle}
          maxLength={MAX_PORTAL_TITLE_CHARS}
          onChange={edit("portalTitle")}
        />
        <Textarea
          label="Content"
          value={shown.portalContent}
          maxLength={MAX_PORTAL_CONTENT_CHARS}
          autosize
          minRows={4}
          onChange={edit("portalContent")}
        />
      </Paper>

      <div className="flex gap-2 items-center">
        <Button variant="filled" onClick={save} disabled={!dirty || !named || saving}>
          Save
        </Button>
        {dirty && (
          <Button variant="subtle" onClick={() => setDraft({})} disabled={saving}>
            Discard
          </Button>
        )}
      </div>
    </>
  );
}
