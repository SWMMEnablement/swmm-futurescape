import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SWMM5 — 2030 Edition" },
      {
        name: "description",
        content:
          "A 2030 reimagining of the SWMM5 Wikipedia page with multiple alternative detailed views.",
      },
    ],
  }),
  component: Index,
});

const PAGE_URL = "/swmm5_2030.html";

function Index() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch(PAGE_URL, { method: "HEAD" })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setStatus("ready");
        else {
          setStatus("error");
          setErrorMsg(`HTTP ${r.status} loading ${PAGE_URL}`);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "error") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui",
          padding: 24,
          background: "#fff5f5",
          color: "#7f1d1d",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Failed to load SWMM5 2030 page</h1>
          <p style={{ marginTop: 8, fontSize: 14 }}>{errorMsg}</p>
          <p style={{ marginTop: 8, fontSize: 14 }}>
            Expected file: <code>public{PAGE_URL}</code>
          </p>
          <a href={PAGE_URL} style={{ color: "#0645ad" }}>
            Try opening it directly
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", background: "#f6f6f4" }}>
      {status === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: "system-ui",
            color: "#54595d",
            zIndex: 1,
          }}
        >
          <p>Loading SWMM5 2030…</p>
        </div>
      )}
      <iframe
        src={PAGE_URL}
        title="SWMM5 2030 Edition"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        onLoad={() => setStatus("ready")}
        onError={() => {
          setStatus("error");
          setErrorMsg("iframe failed to load");
        }}
      />
    </div>
  );
}
