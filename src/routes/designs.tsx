import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/designs")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/designs") {
      throw redirect({ to: "/templates", replace: true });
    }
  },
  component: DesignsRoute,
});

function DesignsRoute() {
  return <Outlet />;
}
