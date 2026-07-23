import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

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
const LOAD_TIMEOUT_MS = 10000;

type Diagnostic = {
  reason: "fetch-failed" | "http-error" | "iframe-error" | "timeout";
  path: string;
  httpStatus?: number;
  httpStatusText?: string;
  message: string;
  timedOutAfterMs?: number;
  assetErrors?: { url: string; status?: number; type: string }[];
};

type ProbeResult = {
  url: string;
  method: "GET" | "HEAD";
  status: number | null; // null = network error / opaque with no status
  statusText?: string;
  ok: boolean;
  opaque: boolean;
  durationMs: number;
  error?: string;
  startedAt: number;
};

async function probe(url: string, method: "GET" | "HEAD"): Promise<ProbeResult> {
  const startedAt = Date.now();
  const t0 = performance.now();
  try {
    const r = await fetch(url, { method, mode: method === "HEAD" ? "no-cors" : "cors" });
    const durationMs = Math.round(performance.now() - t0);
    if (r.type === "opaque") {
      return { url, method, status: null, ok: true, opaque: true, durationMs, startedAt };
    }
    return {
      url,
      method,
      status: r.status,
      statusText: r.statusText,
      ok: r.ok,
      opaque: false,
      durationMs,
      startedAt,
    };
  } catch (e) {
    return {
      url,
      method,
      status: null,
      ok: false,
      opaque: false,
      durationMs: Math.round(performance.now() - t0),
      error: e instanceof Error ? e.message : String(e),
      startedAt,
    };
  }
}

function Index() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [probes, setProbes] = useState<ProbeResult[]>([]);
  const [probing, setProbing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [runId, setRunId] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const assetErrorsRef = useRef<Diagnostic["assetErrors"]>([]);

  const runProbes = useCallback(async (signal?: { cancelled: boolean }) => {
    setProbing(true);
    setProbes([]);
    const mainRes = await probe(PAGE_URL, "GET");
    if (signal?.cancelled) return;
    setProbes([mainRes]);
    if (!mainRes.ok || mainRes.status === null) {
      setProbing(false);
      return;
    }
    let html = "";
    try {
      const r = await fetch(PAGE_URL);
      html = await r.text();
    } catch {
      setProbing(false);
      return;
    }
    const urls = new Set<string>();
    const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const u = m[1].trim();
      if (!u || u.startsWith("#") || u.startsWith("data:") || u.startsWith("javascript:") || u.startsWith("mailto:")) continue;
      urls.add(u);
    }
    const results = await Promise.all(Array.from(urls).map((u) => probe(u, "HEAD")));
    if (signal?.cancelled) return;
    setProbes([mainRes, ...results]);
    setProbing(false);
  }, []);

  // Preflight probe on mount / retry.
  useEffect(() => {
    const signal = { cancelled: false };
    void runProbes(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [runProbes, runId]);

  useEffect(() => {
    let cancelled = false;

    fetch(PAGE_URL, { method: "GET" })
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setStatus("error");
          setDiag({
            reason: "http-error",
            path: PAGE_URL,
            httpStatus: r.status,
            httpStatusText: r.statusText,
            message: `Server returned HTTP ${r.status} ${r.statusText} for ${PAGE_URL}`,
          });
        } else {
          setStatus("ready");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("error");
        setDiag({
          reason: "fetch-failed",
          path: PAGE_URL,
          message: `Network fetch failed: ${String(e?.message ?? e)}`,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [runId]);

  const attachAssetErrorListener = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.addEventListener(
        "error",
        (ev) => {
          const target = ev.target as HTMLElement | null;
          if (!target) return;
          const url =
            (target as HTMLImageElement).src ||
            (target as HTMLLinkElement).href ||
            (target as HTMLScriptElement).src ||
            "(unknown)";
          assetErrorsRef.current = [
            ...(assetErrorsRef.current ?? []),
            { url, type: target.tagName.toLowerCase() },
          ];
        },
        true,
      );
    } catch {
      /* cross-origin — ignore */
    }
  };

  const retryAll = () => {
    assetErrorsRef.current = [];
    setDiag(null);
    setStatus("loading");
    setWarningDismissed(false);
    setRunId((n) => n + 1);
  };

  const failedProbes = probes.filter((p) => !p.ok);
  const okProbes = probes.filter((p) => p.ok);

  const drawer = (
    <>
      <button
        onClick={() => setDrawerOpen(true)}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 3,
          padding: "8px 14px",
          background: failedProbes.length ? "#b91c1c" : "#111",
          color: "#fff",
          border: 0,
          borderRadius: 999,
          fontSize: 13,
          fontFamily: "system-ui, -apple-system, sans-serif",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}
        aria-label="Open diagnostics"
      >
        Diagnostics {probing ? "…" : `(${okProbes.length}✓ ${failedProbes.length}✗)`}
      </button>
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 4 }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(560px, 100vw)",
              background: "#fff",
              boxShadow: "-2px 0 16px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              fontFamily: "system-ui, -apple-system, sans-serif",
              color: "#111",
            }}
            aria-label="Diagnostics drawer"
          >
            <header
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Diagnostics</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {probing
                    ? "Probing…"
                    : `${probes.length} URL${probes.length === 1 ? "" : "s"} · ${okProbes.length} ok · ${failedProbes.length} failed`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={retryAll}
                  disabled={probing}
                  style={{
                    padding: "6px 12px",
                    background: "#111",
                    color: "#fff",
                    border: 0,
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: probing ? "not-allowed" : "pointer",
                    opacity: probing ? 0.6 : 1,
                  }}
                >
                  {probing ? "Retrying…" : "Retry all"}
                </button>
                <button
                  onClick={() => setDrawerOpen(false)}
                  style={{
                    padding: "6px 10px",
                    background: "#fff",
                    color: "#111",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                  aria-label="Close"
                >
                  Close
                </button>
              </div>
            </header>

            <div style={{ overflow: "auto", padding: 12, flex: 1 }}>
              {probes.length === 0 && !probing && (
                <p style={{ color: "#6b7280", fontSize: 13 }}>No probes recorded yet.</p>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {probes.map((p, i) => {
                  const badge = p.ok
                    ? { bg: "#ecfdf5", fg: "#065f46", label: p.opaque ? "opaque" : `HTTP ${p.status}` }
                    : {
                        bg: "#fef2f2",
                        fg: "#991b1b",
                        label: p.status === null ? "network error" : `HTTP ${p.status}`,
                      };
                  return (
                    <li
                      key={`${p.url}-${i}`}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "10px 12px",
                        background: p.ok ? "#fff" : "#fffafa",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: badge.bg,
                            color: badge.fg,
                            fontWeight: 600,
                          }}
                        >
                          {p.method} · {badge.label}
                        </span>
                        <span style={{ fontSize: 11, color: "#6b7280" }}>{p.durationMs} ms</span>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, wordBreak: "break-all" }}>
                        <code>{p.url}</code>
                      </div>
                      {(p.statusText || p.error) && (
                        <div style={{ marginTop: 4, fontSize: 12, color: p.ok ? "#6b7280" : "#991b1b" }}>
                          {p.error ?? p.statusText}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </>
  );

  if (status === "error" && diag) {
    return (
      <div
        style={{
          minHeight: "100vh",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 24,
          background: "#fff5f5",
          color: "#7f1d1d",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Failed to load SWMM5 2030 page</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#991b1b" }}>{diag.message}</p>

          <div
            style={{
              marginTop: 16,
              background: "#fff",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: 16,
              color: "#111",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Diagnostics</div>
            <dl style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 6, margin: 0 }}>
              <dt style={{ color: "#6b7280" }}>Reason</dt>
              <dd style={{ margin: 0 }}><code>{diag.reason}</code></dd>
              <dt style={{ color: "#6b7280" }}>Requested path</dt>
              <dd style={{ margin: 0 }}><code>{diag.path}</code></dd>
              <dt style={{ color: "#6b7280" }}>Expected file</dt>
              <dd style={{ margin: 0 }}><code>public{diag.path}</code></dd>
              {diag.httpStatus !== undefined && (
                <>
                  <dt style={{ color: "#6b7280" }}>HTTP status</dt>
                  <dd style={{ margin: 0 }}><code>{diag.httpStatus} {diag.httpStatusText}</code></dd>
                </>
              )}
              {diag.timedOutAfterMs !== undefined && (
                <>
                  <dt style={{ color: "#6b7280" }}>Timeout</dt>
                  <dd style={{ margin: 0 }}><code>{diag.timedOutAfterMs} ms</code></dd>
                </>
              )}
            </dl>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <a
              href={PAGE_URL}
              style={{ padding: "8px 14px", background: "#111", color: "#fff", borderRadius: 6, textDecoration: "none", fontSize: 14 }}
            >
              Open {PAGE_URL} directly
            </a>
            <button
              onClick={retryAll}
              style={{ padding: "8px 14px", background: "#fff", color: "#111", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, cursor: "pointer" }}
            >
              Retry
            </button>
          </div>
        </div>
        {drawer}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", background: "#f6f6f4" }}>
      {failedProbes.length > 0 && !warningDismissed && (
        <div
          role="alert"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 2,
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            color: "#78350f",
            borderRadius: 8,
            padding: "10px 14px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: 13,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <strong>
            ⚠ {failedProbes.length} asset{failedProbes.length === 1 ? "" : "s"} failed to load
          </strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setDrawerOpen(true)}
              style={{ background: "#78350f", color: "#fff", border: 0, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
            >
              View details
            </button>
            <button
              onClick={() => setWarningDismissed(true)}
              style={{ background: "transparent", border: 0, color: "#78350f", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

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
        ref={iframeRef}
        key={runId}
        src={PAGE_URL}
        title="SWMM5 2030 Edition"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        onLoad={() => {
          attachAssetErrorListener();
          setStatus("ready");
        }}
        onError={() => {
          setStatus("error");
          setDiag({
            reason: "iframe-error",
            path: PAGE_URL,
            message: "The iframe element emitted an error event while loading the page.",
            assetErrors: assetErrorsRef.current,
          });
        }}
      />
      {drawer}
    </div>
  );
}
