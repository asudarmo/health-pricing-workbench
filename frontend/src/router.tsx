import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";
import { ApiError } from "./api/client";

function notify(error: unknown) {
  if (error instanceof ApiError) {
    const title =
      error.status === 403 ? "Not permitted" : error.status === 409 ? "Status conflict" : `Error ${error.status}`;
    toast.error(title, { description: error.message });
  } else {
    toast.error("Something went wrong", { description: error instanceof Error ? error.message : String(error) });
  }
}

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: notify }),
    mutationCache: new MutationCache({ onError: notify }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
