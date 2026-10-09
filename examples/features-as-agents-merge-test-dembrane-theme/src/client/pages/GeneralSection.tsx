import { useState } from "react";
import { Button, Input, InputArea, Surface, Text } from "@cloudflare/kumo";
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
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-4">
        <Text size="sm" bold>
          Project details
        </Text>
        <Input
          label="Name"
          description={named ? "Verify's outcomes see this." : "Required."}
          value={shown.name}
          maxLength={MAX_NAME_CHARS}
          onChange={edit("name")}
        />
        <InputArea
          label="Context"
          description="What the project is about, such as the question the groups are discussing. Explore's replies see this."
          value={shown.context}
          maxLength={MAX_CONTEXT_CHARS}
          rows={4}
          onChange={edit("context")}
        />
      </Surface>

      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Text size="sm" bold>
            Portal
          </Text>
          <Text size="xs" variant="secondary">
            What participants are shown. Explore's replies see this too.
          </Text>
        </div>
        <Input
          label="Title"
          value={shown.portalTitle}
          maxLength={MAX_PORTAL_TITLE_CHARS}
          onChange={edit("portalTitle")}
        />
        <InputArea
          label="Content"
          value={shown.portalContent}
          maxLength={MAX_PORTAL_CONTENT_CHARS}
          rows={4}
          onChange={edit("portalContent")}
        />
      </Surface>

      <div className="flex gap-2 items-center">
        <Button variant="primary" onClick={save} disabled={!dirty || !named || saving}>
          Save
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft({})} disabled={saving}>
            Discard
          </Button>
        )}
      </div>
    </>
  );
}
