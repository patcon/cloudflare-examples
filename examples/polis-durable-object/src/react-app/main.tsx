import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Me } from "../shared/types";

function App() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch("/api/demo/me")
      .then((res) => res.json() as Promise<Me>)
      .then(setMe);
  }, []);
  return <h1>Hello, participant {me?.participantId ?? "…"}</h1>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
