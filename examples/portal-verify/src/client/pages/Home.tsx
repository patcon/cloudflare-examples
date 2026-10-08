import { useState } from "react";
import { Button, Input, Surface, Text } from "@cloudflare/kumo";
import { isProjectId } from "../../shared/ids";
import { Shell } from "../ui";

/** Picks a project by name. Any name is a project, made when first used. */
export function Home() {
  const [name, setName] = useState("demo");
  const valid = isProjectId(name);
  return (
    <Shell title="Portal Verify">
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
        <Text size="sm">
          A project holds many recorded group conversations. Any of them can ask for a short reply
          to what's been said so far.
        </Text>
        <form
          className="flex gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) location.href = `/${encodeURIComponent(name)}/start`;
          }}
        >
          <Input label="Project" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="primary" disabled={!valid}>
            Open
          </Button>
        </form>
      </Surface>
    </Shell>
  );
}
