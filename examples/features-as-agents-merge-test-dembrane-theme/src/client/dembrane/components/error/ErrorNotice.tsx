// example: ours, in place of echo's, which explains each API error.
import { Alert } from "@mantine/core";
import { WarningCircleIcon } from "@phosphor-icons/react";

export const ErrorNotice = ({ error }: { error: unknown }) => (
  <Alert color="red" icon={<WarningCircleIcon size={20} />}>
    {error instanceof Error ? error.message : "Something went wrong."}
  </Alert>
);
