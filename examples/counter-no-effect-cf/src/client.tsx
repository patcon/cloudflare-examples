import { Button, Surface, Text } from "@cloudflare/kumo";
import { HashIcon, MinusIcon, MoonIcon, PlusIcon, SunIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Tag = "Increment" | "Decrement" | "Reset";

// After the WebSocket drops, the page waits this long before reconnecting.
const RECONNECT_MS = 1000;

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

/** The count, kept up to date over a WebSocket, and a way to send events. */
function useCounter() {
  const [count, setCount] = useState<number>();
  const socket = useRef<WebSocket>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let closed = false;
    const connect = () => {
      const url = new URL("/api/counter", location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
      ws.onmessage = (message) => setCount((JSON.parse(message.data) as { count: number }).count);
      ws.onclose = (close) => {
        if (close.reason) console.warn(`Counter closed the socket: ${close.reason}`);
        setCount(undefined);
        if (!closed) timer = setTimeout(connect, RECONNECT_MS);
      };
      socket.current = ws;
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket.current?.close();
    };
  }, []);

  const send = (tag: Tag) => socket.current?.send(JSON.stringify({ _tag: tag }));
  return { count, send };
}

function App() {
  const { count, send } = useCounter();

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
              onClick={() => send("Decrement")}
              icon={<MinusIcon size={16} />}
            />
            <Button
              variant="secondary"
              disabled={count === undefined}
              onClick={() => send("Reset")}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              shape="square"
              aria-label="Increment"
              disabled={count === undefined}
              onClick={() => send("Increment")}
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
