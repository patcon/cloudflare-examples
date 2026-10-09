// example: stands in for `react-router`, which echo routes with. This app
// picks its page from the path (src/client/index.tsx), so these read the
// URL. Navigating loads the page, except between a conversation and its
// refine and verify screens, which echo nests in the conversation's route
// so the recording carries on: those change the URL in place.
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
addEventListener("popstate", notify);
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The URL, so a component shows the new one when it changes in place. */
const useHref = () => useSyncExternalStore(subscribe, () => location.href);

/** A conversation's own path, without its refine or verify screen. */
const conversationBase = (pathname: string) =>
  pathname.match(/^(\/[^/]+\/conversation\/[^/]+)(\/(refine|verify(\/approve)?))?\/?$/)?.[1];

type NavigateOptions = { replace?: boolean };

const go = (to: string, options?: NavigateOptions) => {
  const url = new URL(to, location.href);
  const base = conversationBase(url.pathname);
  if (url.origin === location.origin && base && base === conversationBase(location.pathname)) {
    history[options?.replace ? "replaceState" : "pushState"](null, "", url);
    notify();
  } else if (options?.replace) {
    location.replace(url);
  } else {
    location.assign(url);
  }
};

/** echo's participant params, from this app's paths. */
export function useParams<T extends Record<string, string | undefined>>(): T {
  const href = useHref();
  return useMemo(() => {
    const [projectId, page, id] = new URL(href).pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    const conversationId = page === "conversation" || page === "sessions" ? id : undefined;
    return { language: undefined, projectId, conversationId } as unknown as T;
  }, [href]);
}

export function useLocation() {
  const href = useHref();
  return useMemo(() => {
    const url = new URL(href);
    return { pathname: url.pathname, search: url.search, hash: url.hash };
  }, [href]);
}

type SearchInit = URLSearchParams | Record<string, string>;

export function useSearchParams(): [
  URLSearchParams,
  (next: SearchInit, options?: NavigateOptions) => void,
] {
  const href = useHref();
  const params = useMemo(() => new URL(href).searchParams, [href]);
  const set = (next: SearchInit, options?: NavigateOptions) => {
    const query = new URLSearchParams(next).toString();
    go(`${location.pathname}${query ? `?${query}` : ""}`, options);
  };
  return [params, set];
}

export function useNavigate() {
  return (to: string | number, options?: NavigateOptions) => {
    if (typeof to === "number") history.go(to);
    else go(to, options);
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
