import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [hello, setHello] = useState<string>("…");
  useEffect(() => {
    fetch("/api/hello")
      .then((res) => res.json() as Promise<{ hello: string }>)
      .then((body) => setHello(body.hello));
  }, []);
  return <h1>Hello, {hello}</h1>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
