import { createRoot } from "react-dom/client";
import { isProjectId, isSessionId } from "../shared/ids";
import { Home } from "./pages/Home";
import { Review } from "./pages/Review";
import { Session } from "./pages/Session";
import { Start } from "./pages/Start";
import { Shell } from "./ui";
import "./styles.css";

// No router library: the pathname picks the page.
function App() {
  const [projectId, page, sessionId, ...rest] = location.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);

  if (!projectId) return <Home />;
  if (isProjectId(projectId) && rest.length === 0) {
    if (page === "start" && !sessionId) return <Start projectId={projectId} />;
    if (page === "review" && !sessionId) return <Review projectId={projectId} />;
    if (page === "sessions" && isSessionId(sessionId)) {
      return <Session projectId={projectId} sessionId={sessionId} />;
    }
  }
  return (
    <Shell title="Not found">
      <a className="underline" href="/">
        Start over
      </a>
    </Shell>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
