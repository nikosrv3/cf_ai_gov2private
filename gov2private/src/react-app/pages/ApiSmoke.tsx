// src/react-app/pages/ApiSmoke.tsx
// Simple in-browser tester for /api/history and /api/discover-jobs

import { useEffect, useMemo, useState } from "react";
import {
  getHistory,
  humanizeApiError,
  type HistoryResponse,
  discoverJobs,
} from "../lib/api";

export default function ApiSmoke() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const latestRunId = useMemo(
    () => (data?.items && data.items[0]?.id) || null,
    [data]
  );

  const load = () => {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    getHistory(ctrl.signal)
      .then(setData)
      .catch((e) => setError(humanizeApiError(e)))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  };

  useEffect(() => {
    const cleanup = load();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTestRun() {
    setCreating(true);
    setError(null);
    try {
      const res = await discoverJobs({
        resumeText:
          "US government analyst with cloud migration exposure and scripting experience.",
        background:
          "Interested in Security Engineer or Cloud Engineer roles in Atlanta.",
      });
      console.log("Created run via /api/discover-jobs:", res.run?.id);
      load(); // refresh history after creating
    } catch (e) {
      setError(humanizeApiError(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f8fafc",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(900px, 90vw)",
          borderRadius: 16,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          padding: 20,
          fontFamily:
            "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            API Smoke Test — /api/history
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={load}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                cursor: "pointer",
              }}
              disabled={loading}
              title="Reload history"
            >
              {loading ? "Loading…" : "Reload"}
            </button>
            <button
              onClick={createTestRun}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#eef2ff",
                cursor: "pointer",
              }}
              disabled={creating}
              title="Create a run using your browser's uid cookie"
            >
              {creating ? "Creating…" : "Create test run"}
            </button>
            {latestRunId && (
              <a
                href={`/run/${latestRunId}`}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  textDecoration: "none",
                }}
                title="Open the latest run route"
              >
                Open latest run →
              </a>
            )}
          </div>
        </header>

        {loading && <div style={{ color: "#475569" }}>Fetching history…</div>}

        {!loading && error && (
          <div
            style={{
              color: "#b91c1c",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              padding: 12,
              borderRadius: 12,
            }}
          >
            Error: {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            <pre
              style={{
                marginTop: 8,
                padding: 16,
                background: "#f1f5f9",
                borderRadius: 12,
                overflowX: "auto",
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
{JSON.stringify(data, null, 2)}
            </pre>
            <p style={{ marginTop: 12, color: "#64748b", fontSize: 12 }}>
              Tip: ensure the app and Worker share the same origin (or use a
              Vite <code>server.proxy</code> for <code>/api</code>) so the{" "}
              <code>uid</code> cookie is sent with requests.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
