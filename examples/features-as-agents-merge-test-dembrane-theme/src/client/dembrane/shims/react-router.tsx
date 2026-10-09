// example: stands in for `react-router`, which echo routes with. This app
// picks its page from the path (src/client/index.tsx), so these read the
// URL, and navigating loads the page.
import { createContext, type ReactNode, useContext, useMemo } from "react";

/** echo's participant params, from this app's paths. */
export function useParams<T extends Record<string, string | undefined>>(): T {
  const [projectId, page, id] = location.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const conversationId = page === "conversation" || page === "sessions" ? id : undefined;
  return { language: undefined, projectId, conversationId } as unknown as T;
}

export function useLocation() {
  return { pathname: location.pathname, search: location.search, hash: location.hash };
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams) => void] {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const set = (next: URLSearchParams) => {
    const query = next.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
  };
  return [params, set];
}

export function useNavigate() {
  return (to: string | number) => {
    if (typeof to === "number") history.go(to);
    else location.assign(to);
  };
}

/** What `<Outlet />` shows: the page puts it here, around echo's layout. */
const OutletContext = createContext<ReactNode>(null);

export function OutletProvider({ outlet, children }: { outlet: ReactNode; children: ReactNode }) {
  return <OutletContext.Provider value={outlet}>{children}</OutletContext.Provider>;
}

export function Outlet() {
  return <>{useContext(OutletContext)}</>;
}
