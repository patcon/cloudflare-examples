import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { IconContext } from "@phosphor-icons/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { AppPreferencesProvider } from "@/hooks/useAppPreferences";
import { cssVariablesResolver, theme } from "@/theme";
import { isProjectId, isSessionId } from "../shared/ids";
import { Finish } from "./pages/Finish";
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
  // echo's thank-you page, after Finish.
  if (
    isProjectId(projectId) &&
    page === "conversation" &&
    isSessionId(sessionId) &&
    rest.length === 1 &&
    rest[0] === "finish"
  ) {
    return <Finish projectId={projectId} />;
  }
  if (isProjectId(projectId) && rest.length === 0) {
    if (page === "start" && !sessionId) return <Start projectId={projectId} />;
    if (page === "settings" && !sessionId) return <Settings projectId={projectId} />;
    if (page === "review" && !sessionId) return <Review projectId={projectId} />;
    // echo's participant path, which its start page opens, or this app's own.
    if ((page === "conversation" || page === "sessions") && isSessionId(sessionId)) {
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
const queryClient = new QueryClient();
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        // Light only, as the portal is used.
        forceColorScheme="light"
      >
        {/* Phosphor's light cut, topped up to the one 1px stroke in rules.css */}
        <IconContext.Provider value={{ weight: "light" }}>
          <AppPreferencesProvider>
            <ModalsProvider>
              <App />
            </ModalsProvider>
          </AppPreferencesProvider>
        </IconContext.Provider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}
