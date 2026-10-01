import { useEffect, useState, type ReactNode } from "react";
import { Button, Text } from "@cloudflare/kumo";
import { ChatsCircleIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";

function ModeToggle() {
  const [mode, setMode] = useState(() => localStorage.getItem("theme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [mode]);

  return (
    <Button
      variant="ghost"
      shape="square"
      aria-label="Toggle theme"
      onClick={() => setMode((m) => (m === "light" ? "dark" : "light"))}
      icon={mode === "light" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
    />
  );
}

/** The header and centered column every page shares. */
export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-kumo-base flex flex-col">
      <header className="border-b border-kumo-line px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChatsCircleIcon size={20} weight="bold" className="text-kumo-accent" />
          <Text size="sm" bold>
            {title}
          </Text>
        </div>
        <ModeToggle />
      </header>
      <main className="flex-1 p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">{children}</main>
    </div>
  );
}
