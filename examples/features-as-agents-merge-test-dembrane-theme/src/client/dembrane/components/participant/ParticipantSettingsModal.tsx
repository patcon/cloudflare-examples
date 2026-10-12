import { Trans } from "@lingui/react/macro";
import { Modal } from "@mantine/core";
import { testId } from "@/lib/testUtils";
import MicrophoneTest from "./MicrophoneTest";

interface ParticipantSettingsModalProps {
	opened: boolean;
	onClose: () => void;
	onMicTestSuccess?: (success: boolean) => void;
}

// example: one function, not a new one each render, which MicrophoneTest's
// setup depends on: a new one reran it as the modal closed, and the check
// flashed "We cannot hear you".
const noop = () => {};

export function ParticipantSettingsModal({
	opened,
	onClose,
	onMicTestSuccess = noop, // example: was () => {}
}: ParticipantSettingsModalProps) {
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title={<Trans id="participant.settings.modal.title">Settings</Trans>}
			size="sm"
			padding="xl"
			centered
			{...testId("portal-settings-modal")}
		>
			<MicrophoneTest
				onContinue={(_id: string) => {
					onClose();
				}}
				onMicTestSuccess={onMicTestSuccess}
				isInModal={true}
			/>
		</Modal>
	);
}
