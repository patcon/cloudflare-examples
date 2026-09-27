import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "./Home";
import { Participant } from "./Participant";
import "./style.css";

// No router library: the pathname picks the page.
function App() {
  const segments = location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments.length === 0) return <Home />;
  if (segments.length === 1) return <Participant convoId={segments[0]} />;
  return (
    <main className="centered">
      <h1>Not found</h1>
      <p>
        <a href="/">Start a conversation</a>
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
