import { Button, Surface, Text } from "@cloudflare/kumo";
import { HashIcon, MinusIcon, MoonIcon, PlusIcon, SunIcon } from "@phosphor-icons/react";
import { useAgent } from "agents/react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Counter, CounterState } from "./server";
import "./styles.css";

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

function App() {
  // Open a second tab to watch the count change in both.
  const agent = useAgent<Counter, CounterState>({ agent: "Counter", name: "default" });
  const count = agent.state?.count;

  return (
    <div className="min-h-full bg-kumo-base flex flex-col">
      <header className="border-b border-kumo-line px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HashIcon size={20} weight="bold" className="text-kumo-accent" />
          <Text size="sm" bold>
            Counter
          </Text>
        </div>
        <ModeToggle />
      </header>
      <main className="flex-1 p-4 flex items-center justify-center">
        <Surface className="rounded-xl p-8 flex flex-col items-center gap-6 w-full max-w-xs">
          <span className="text-6xl font-semibold tabular-nums text-kumo-default">
            {count ?? "…"}
          </span>
          <div className="flex gap-2">
            <Button
              shape="square"
              aria-label="Decrement"
              disabled={count === undefined}
              onClick={() => agent.stub.decrement()}
              icon={<MinusIcon size={16} />}
            />
            <Button
              variant="secondary"
              disabled={count === undefined}
              onClick={() => agent.stub.reset()}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              shape="square"
              aria-label="Increment"
              disabled={count === undefined}
              onClick={() => agent.stub.increment()}
              icon={<PlusIcon size={16} />}
            />
          </div>
        </Surface>
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
