import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

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

type AssetCheck = { url: string; status: number | "error"; ok: boolean };

function Index() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [assetWarnings, setAssetWarnings] = useState<AssetCheck[]>([]);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const assetErrorsRef = useRef<Diagnostic["assetErrors"]>([]);

  // Preflight probe: fetch the HTML, then HEAD every non-hash href/src it
  // references. Any 404/network failure surfaces as a dismissible warning.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(PAGE_URL);
        if (!res.ok || cancelled) return;
        const html = await res.text();
        const urls = new Set<string>();
        const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html))) {
          const u = m[1].trim();
          if (!u || u.startsWith("#") || u.startsWith("data:") || u.startsWith("javascript:") || u.startsWith("mailto:")) continue;
          urls.add(u);
        }
        const checks = await Promise.all(
          Array.from(urls).map(async (url): Promise<AssetCheck | null> => {
            try {
              const r = await fetch(url, { method: "HEAD", mode: "no-cors" });
              // opaque responses (no-cors) report status 0; treat as ok
              if (r.type === "opaque") return null;
              return r.ok ? null : { url, status: r.status, ok: false };
            } catch {
              return { url, status: "error", ok: false };
            }
          }),
        );
        if (cancelled) return;
        const failed = checks.filter((c): c is AssetCheck => !!c);
        if (failed.length) setAssetWarnings(failed);
      } catch {
        /* main-page failure is handled by the error panel below */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    // Pre-flight fetch to surface HTTP errors (404 etc.) explicitly.
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

    // Iframe load timeout watchdog.
    timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setStatus((prev) => {
        if (prev === "ready") return prev;
        setDiag({
          reason: "timeout",
          path: PAGE_URL,
          timedOutAfterMs: LOAD_TIMEOUT_MS,
          message: `Iframe did not signal load within ${LOAD_TIMEOUT_MS}ms.`,
          assetErrors: assetErrorsRef.current,
        });
        return "error";
      });
    }, LOAD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

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
          <h1 style={{ margin: 0, fontSize: 22 }}>
            Failed to load SWMM5 2030 page
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#991b1b" }}>
            {diag.message}
          </p>

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
                  <dd style={{ margin: 0 }}>
                    <code>{diag.httpStatus} {diag.httpStatusText}</code>
                  </dd>
                </>
              )}

              {diag.timedOutAfterMs !== undefined && (
                <>
                  <dt style={{ color: "#6b7280" }}>Timeout</dt>
                  <dd style={{ margin: 0 }}>
                    <code>{diag.timedOutAfterMs} ms</code>
                  </dd>
                </>
              )}
            </dl>

            {diag.assetErrors && diag.assetErrors.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  Failed sub-resources ({diag.assetErrors.length})
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {diag.assetErrors.map((a, i) => (
                    <li key={i}>
                      <code>&lt;{a.type}&gt;</code> {a.url}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <a
              href={PAGE_URL}
              style={{
                padding: "8px 14px",
                background: "#111",
                color: "#fff",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              Open {PAGE_URL} directly
            </a>
            <button
              onClick={() => location.reload()}
              style={{
                padding: "8px 14px",
                background: "#fff",
                color: "#111",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", background: "#f6f6f4" }}>
      {assetWarnings.length > 0 && !warningDismissed && (
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
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <strong>
              ⚠ {assetWarnings.length} asset{assetWarnings.length === 1 ? "" : "s"} failed to load
            </strong>
            <button
              onClick={() => setWarningDismissed(true)}
              style={{ background: "transparent", border: 0, color: "#78350f", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 140, overflow: "auto" }}>
            {assetWarnings.map((a, i) => (
              <li key={i}>
                <code>{a.status === "error" ? "network error" : `HTTP ${a.status}`}</code> — {a.url}
              </li>
            ))}
          </ul>
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
    </div>
  );
}
