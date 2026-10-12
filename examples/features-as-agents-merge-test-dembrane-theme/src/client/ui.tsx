import type { ReactNode } from "react";
import { Alert, Group, Text } from "@mantine/core";
import { WarningIcon } from "@phosphor-icons/react";
import { Logo } from "@/components/common/Logo";

/**
 * The header and centered column the host's pages share, after echo's
 * ParticipantHeader: a rule under the header the full width, and its
 * contents in the same 672px column as the page.
 */
export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="w-full border-b">
        <Group gap="md" className="mx-auto max-w-2xl px-4 py-2" wrap="nowrap">
          <Logo hideTitle h="28px" to="/" linkLabel="Home" />
          <Text size="sm" truncate>
            {title}
          </Text>
        </Group>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        <InsecureNotice />
        {children}
      </main>
    </div>
  );
}

/**
 * Over plain HTTP, such as a phone on a LAN or tailnet IP, the browser
 * blocks the microphone and `crypto.randomUUID()`. On a tailnet IP, the
 * agent's WebSocket also tries `wss://`.
 */
export function InsecureNotice() {
  if (window.isSecureContext) return null;
  return (
    <Alert
      color="red"
      icon={<WarningIcon size={20} />}
      title="This app only works on localhost or HTTPS"
    >
      Over plain HTTP, the browser blocks the microphone and the live connection. To use it from a
      phone, run pnpm dev:share for an HTTPS link.
    </Alert>
  );
}
