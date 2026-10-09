import type { ReactNode } from "react";
import { ActionIcon, Alert, Group, Text, useMantineColorScheme } from "@mantine/core";
import { MoonIcon, SunIcon, WarningIcon } from "@phosphor-icons/react";
import { Logo } from "@/components/common/Logo";

/** Light or dark, in Mantine's own storage, which index.html reads before mount. */
function ModeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const dark =
    colorScheme === "dark" ||
    (colorScheme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <ActionIcon aria-label="Toggle theme" onClick={() => setColorScheme(dark ? "light" : "dark")}>
      {dark ? <SunIcon size={20} /> : <MoonIcon size={20} />}
    </ActionIcon>
  );
}

/**
 * The header and centered column the host's pages share, after echo's
 * ParticipantHeader: a rule under the header the full width, and its
 * contents in the same 672px column as the page.
 */
export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="w-full border-b">
        <Group justify="space-between" className="mx-auto max-w-2xl px-4 py-2" wrap="nowrap">
          <Group gap="md" wrap="nowrap" className="min-w-0">
            <Logo hideTitle h="28px" to="/" linkLabel="Home" />
            <Text size="sm" truncate>
              {title}
            </Text>
          </Group>
          <ModeToggle />
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
