import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SWMM5 — 2030 Edition" },
      { name: "description", content: "A 2030 reimagining of the SWMM5 Wikipedia page with multiple alternative detailed views." },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace("/swmm5_2030.html");
  }, []);
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>
      <p>Loading SWMM5 2030…</p>
    </div>
  );
}
