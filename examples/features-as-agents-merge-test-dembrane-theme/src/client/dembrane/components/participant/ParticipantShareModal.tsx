// example: ours, in place of echo's, which also draws a QR code. Here it's
// the link, to copy.
import { Button, CopyButton, Modal, Stack, Text } from "@mantine/core";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";

export const ParticipantShareModal = ({
  opened,
  onClose,
  project,
}: {
  opened: boolean;
  onClose: () => void;
  project?: ParticipantProject;
}) => {
  const link = project ? `${location.origin}/${encodeURIComponent(project.id)}/start` : "";
  return (
    <Modal opened={opened} onClose={onClose} centered size="sm" padding="xl" title="Share portal">
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          Anyone with this link can start a conversation in this project.
        </Text>
        <Text size="sm" className="break-all">
          {link}
        </Text>
        <CopyButton value={link}>
          {({ copied, copy }) => (
            <Button
              variant="filled"
              size="md"
              onClick={copy}
              leftSection={copied ? <CheckIcon size={20} /> : <CopyIcon size={20} />}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          )}
        </CopyButton>
      </Stack>
    </Modal>
  );
};
