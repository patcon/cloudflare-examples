import { useState } from "react";
import { Button, Paper, Text, TextInput } from "@mantine/core";
import { isProjectId } from "../../shared/ids";
import { Shell } from "../ui";

/** Picks a project by name. Any name is a project, made when first used. */
export function Home() {
  const [name, setName] = useState("demo");
  const valid = isProjectId(name);
  return (
    <Shell title="Features as Agents">
      <Paper p="md" className="flex flex-col gap-3">
        <Text size="sm">
          A project holds many recorded group conversations. Any of them can ask for a short reply
          to what's been said so far.
        </Text>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) location.href = `/${encodeURIComponent(name)}/start`;
          }}
        >
          <TextInput
            label="Project"
            className="flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="filled" disabled={!valid}>
            Open
          </Button>
        </form>
      </Paper>
    </Shell>
  );
}
