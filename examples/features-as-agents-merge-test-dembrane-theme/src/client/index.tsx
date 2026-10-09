import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { IconContext } from "@phosphor-icons/react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/common/Toaster";
import { AppPreferencesProvider } from "@/hooks/useAppPreferences";
import { cssVariablesResolver, theme } from "@/theme";
import { isProjectId, isSessionId } from "../shared/ids";
import { Home } from "./pages/Home";
import { Review } from "./pages/Review";
import { Session } from "./pages/Session";
import { Settings } from "./pages/Settings";
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
  if (isProjectId(projectId) && !page) {
    // A project's own link, such as /demo/, opens its start page.
    location.replace(`/${encodeURIComponent(projectId)}/start`);
    return null;
  }
  if (isProjectId(projectId) && rest.length === 0) {
    if (page === "start" && !sessionId) return <Start projectId={projectId} />;
    if (page === "settings" && !sessionId) return <Settings projectId={projectId} />;
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

// echo's providers (App.tsx), less what's only for its dashboard and data.
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
    >
      {/* Phosphor's light cut, topped up to the one 1px stroke in rules.css */}
      <IconContext.Provider value={{ weight: "light" }}>
        <AppPreferencesProvider>
          <ModalsProvider>
            <App />
            <Toaster />
          </ModalsProvider>
        </AppPreferencesProvider>
      </IconContext.Provider>
    </MantineProvider>,
  );
}
