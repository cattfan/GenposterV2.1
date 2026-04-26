import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/packs")({
  beforeLoad: ({ location }) => {
    const routeSearch = location.search as { open?: unknown };
    const openPackId = typeof routeSearch.open === "string" ? routeSearch.open : undefined;
    throw redirect({
      to: "/templates",
      search: openPackId ? { open: openPackId } : undefined,
      replace: true,
    });
  },
});
