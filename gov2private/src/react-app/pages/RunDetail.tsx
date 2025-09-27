// src/pages/RunDetail.tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRunPolling } from "../hooks/useRunPolling";
import ResumeCanvas from "../components/ResumeCanvas";
import ChatDock from "../components/ChatDock";
import Loading from "../components/Loading";
import RoleChangeModal from "../components/RoleChangeModal";
import { humanizeApiError } from "../lib/api";

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { run, error, refresh, setRun } = useRunPolling(id, {
    intervalMs: 2000,
    idleIntervalMs: 10000,
    pauseWhenHidden: true
  });

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect to role selection if needed
  useEffect(() => {
    if (run && run.status === "role_selection" && !run.phases?.selectedRole) {
      navigate(`/run/${id}/select-role`);
    }
  }, [run, id, navigate]);

  async function handleExport(format: "pdf" | "docx" | "txt" = "pdf") {
    if (!id) return;
    
    setExporting(true);
    try {
      const response = await fetch(`/api/run/${id}/export.${format}`);
      if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume-${run?.targetRole || "draft"}-${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${humanizeApiError(err)}`);
    } finally {
      setExporting(false);
    }
  }

  function handleRoleChanged(updatedRun: any) {
    setRun(updatedRun);
    setShowRoleModal(false);
    setLoading(false);
  }

  const isGenerating = run?.status === "pending" || run?.status === "queued" || run?.status === "generating";

  if (!id) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-red-900">Error</h2>
          <p className="text-red-700">No run ID provided</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Status Bar */}
      {(isGenerating || error) && (
        <div className="mb-4">
          {isGenerating && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <Loading 
                size="sm" 
                inline 
                message={`${run?.status === "generating" ? "Generating your tailored resume..." : "Processing..."}  This may take a few moments.`}
              />
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-red-700">{error}</p>
                <button
                  onClick={refresh}
                  className="text-sm px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-[1fr_440px]">
        {/* Main Resume Canvas */}
        <div className="min-w-0">
          {run ? (
            <ResumeCanvas 
              run={run} 
              onChangeRole={() => setShowRoleModal(true)}
              loading={loading}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12">
              <Loading message="Loading resume..." size="lg" />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="min-w-0 space-y-4">
          {/* Chat Interface */}
          <ChatDock run={run} onReply={refresh} />

          {/* Action Buttons */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Actions</h3>
            
            <div className="space-y-2">
              {/* Export Options */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleExport("pdf")}
                  disabled={exporting || isGenerating}
                  className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {exporting ? (
                    <Loading size="sm" inline message="Exporting..." />
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export PDF
                    </>
                  )}
                </button>
                
              </div>

              {/* Other Actions */}
              <button
                onClick={() => setShowRoleModal(true)}
                disabled={isGenerating}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Change Target Role
              </button>

              <button
                onClick={refresh}
                disabled={isGenerating}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          {run?.phases?.normalize && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Resume Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Skills:</span>
                  <span className="font-medium">{run.phases.normalize.skills?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Experience:</span>
                  <span className="font-medium">{run.phases.normalize.experience?.length || 0} roles</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Key Bullets:</span>
                  <span className="font-medium">{run.phases.bullets?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Status:</span>
                  <span className={`font-medium ${
                    run.status === "done" ? "text-green-600" : 
                    run.status === "error" ? "text-red-600" : 
                    "text-blue-600"
                  }`}>
                    {run.status}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Debug Panel (collapsible) */}
      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-slate-600 hover:text-slate-900">
          Debug Information
        </summary>
        <pre className="mt-2 p-4 bg-slate-900 text-slate-100 rounded-xl text-xs overflow-x-auto">
{JSON.stringify(run, null, 2)}
        </pre>
      </details>

      {/* Role Change Modal */}
      {showRoleModal && run && (
        <RoleChangeModal
          run={run}
          onClose={() => {
            setShowRoleModal(false);
            setLoading(false);
          }}
          onRoleChanged={handleRoleChanged}
          onLoading={setLoading}
        />
      )}
    </div>
  );
}