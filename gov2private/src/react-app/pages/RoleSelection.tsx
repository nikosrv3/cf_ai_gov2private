// src/pages/RoleSelection.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  getRun, 
  selectRole, 
  generateResume,
  humanizeApiError,
  type RunData, 
  type JobRole 
} from "../lib/api";
import LinkedInSearchLinks from "../components/LinkedInSearchLinks";
import Loading from "../components/Loading";

export default function RoleSelection() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customRequirements, setCustomRequirements] = useState("");

  useEffect(() => {
    if (!id) return;
    
    const ctrl = new AbortController();
    loadRun(ctrl.signal);
    
    return () => ctrl.abort();
  }, [id]);

  async function loadRun(signal?: AbortSignal) {
    if (!id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await getRun(id, signal);
      setRun(data);
      
      // If already has a selected role, redirect to run detail
      if (data.phases?.selectedRole || data.status === "done") {
        navigate(`/run/${id}`);
      }
    } catch (err) {
      setError(humanizeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectRole() {
    if (!id) return;
    
    setSubmitting(true);
    setError(null);
    
    try {
      if (customMode) {
        // Submit custom role
        const customRole: JobRole = {
          id: "custom-" + Date.now(),
          title: customTitle,
          company: customCompany,
          description: customDescription,
          requirements: customRequirements.split("\n").filter(r => r.trim()),
          source: "user"
        };
        
        await selectRole(id, { customRole });
      } else if (selectedRole) {
        // Submit AI-discovered role
        await selectRole(id, { roleId: selectedRole });
      } else {
        throw new Error("Please select a role or provide custom details");
      }
      
      // Generate resume for selected role
      setError(null);
      await generateResume(id);      
      // Navigate to run detail
      navigate(`/run/${id}`);
    } catch (err) {
      setError(humanizeApiError(err));
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Loading message="Loading role options..." fullScreen />;
  }

  if (error && !run) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Error</h2>
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const suggestedRoles = run?.phases?.roleDiscovery || [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {submitting && <Loading message="Generating your tailored resume, this can take a minute..." fullScreen />}
        
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-2xl font-semibold">Select Your Target Role</h1>
          <p className="text-slate-600 mt-1">
            Choose from AI-suggested roles based on your background, or provide your own job description.
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="p-6">
          {/* Tab Navigation */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setCustomMode(false)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                !customMode 
                  ? "bg-indigo-600 text-white" 
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              AI Suggested Roles ({suggestedRoles.length})
            </button>
            <button
              onClick={() => setCustomMode(true)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                customMode 
                  ? "bg-indigo-600 text-white" 
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Custom Job Description
            </button>
          </div>

          {!customMode ? (
            // AI Suggested Roles
            <div className="space-y-4">
              {suggestedRoles.length > 0 ? (
                suggestedRoles.map((role) => (
                  <div
                    key={role.id}
                    className={`border rounded-xl p-4 cursor-pointer transition-all ${
                      selectedRole === role.id
                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={() => setSelectedRole(role.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">
                          {role.title}
                        </h3>
                        {role.company && (
                          <p className="text-slate-600 text-sm mt-1">{role.company}</p>
                        )}
                        <p className="text-slate-700 mt-2 line-clamp-3">
                          {role.description}
                        </p>
                        {role.score !== undefined && (
                          <div className="mt-3 flex items-center gap-2">
                            <span className="text-xs text-slate-500">Match Score:</span>
                            <div className="flex-1 max-w-[200px] h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600"
                                style={{ width: `${role.score}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-slate-700">
                              {role.score}%
                            </span>
                          </div>
                        )}
                        
                        {/* LinkedIn Search Links */}
                        <LinkedInSearchLinks 
                          jobTitle={role.title}
                          location={run?.phases?.normalize?.contact?.location}
                          className="mt-3"
                        />
                      </div>
                      <div className="ml-4">
                        <input
                          type="radio"
                          name="role"
                          checked={selectedRole === role.id}
                          onChange={() => setSelectedRole(role.id)}
                          className="w-5 h-5 text-indigo-600"
                        />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <p className="mb-4">No AI-suggested roles available yet.</p>
                  <button
                    onClick={() => setCustomMode(true)}
                    className="text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Add a custom job description →
                  </button>
                </div>
              )}
            </div>
          ) : (
            // Custom Job Description Form
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Job Title *
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g., Senior Cloud Engineer"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Company (optional)
                </label>
                <input
                  type="text"
                  value={customCompany}
                  onChange={(e) => setCustomCompany(e.target.value)}
                  placeholder="e.g., Tech Company Inc."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Job Description *
                </label>
                <textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="Paste the full job description here..."
                  rows={8}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Key Requirements (optional, one per line)
                </label>
                <textarea
                  value={customRequirements}
                  onChange={(e) => setCustomRequirements(e.target.value)}
                  placeholder="5+ years experience&#10;AWS certification&#10;Python expertise"
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 mt-8">
            <button
              onClick={handleSelectRole}
              disabled={submitting || (!customMode && !selectedRole) || (customMode && (!customTitle || !customDescription))}
              className="flex-1 px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Generating Resume..." : "Generate Tailored Resume"}
            </button>
            <button
              onClick={() => navigate("/")}
              disabled={submitting}
              className="px-6 py-3 border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}