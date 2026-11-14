import { createFileRoute, redirect } from "@tanstack/react-router";

// Short link: /m opens the Om Nada marriage form directly.
export const Route = createFileRoute("/m/")({
  beforeLoad: () => {
    throw redirect({
      to: "/m/$storeId",
      params: { storeId: "f81949ec-23dc-4920-801a-5362f8599b05" },
      replace: true,
    });
  },
});
