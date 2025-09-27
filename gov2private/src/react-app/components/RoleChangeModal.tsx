// src/components/RoleChangeModal.tsx
import { useState } from "react";
import { 
  changeRole, 
  generateResume,
  humanizeApiError, 
  type RunData, 
  type JobRole 
} from "../lib/api";
import Loading from "./Loading";
import LinkedInSearchLinks from "./LinkedInSearchLinks";

interface RoleChangeModalProps {
  run: RunData;
  onClose: () => void;
  onRoleChanged: (updatedRun: RunData) => void;
  onLoading: (loading: boolean) => void;
}

export default function RoleChangeModal({ 
  run, 
  onClose, 
  onRoleChanged,
  onLoading 
}: RoleChangeModalProps) {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedRoles = run.phases?.roleDiscovery || [];
  const currentRoleId = run.phases?.selectedRole?.id;

  async function handleSubmit() {
    if (!run.id) return;
    
    setSubmitting(true);
    setError(null);
    onLoading(true);
    
    try {
      let payload: any = {};
      
      if (customMode) {
        const customRole: JobRole = {
          id: "custom-" + Date.now(),
          title: customTitle,
          company: customCompany,
          description: customDescription,
          source: "user"
        };
        payload = { customRole };
      } else if (selectedRole) {
        payload = { roleId: selectedRole };
      } else {
        throw new Error("Please select a role or provide custom details");
      }
      
      // Change the role
      await changeRole(run.id, payload);
      
      // Generate new resume for the new role
      const updatedRun = await generateResume(run.id);
      
      onRoleChanged(updatedRun);
    } catch (err) {
      setError(humanizeApiError(err));
      onLoading(false);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Change Target Role</h2>
            <button
              onClick={onClose}
              disabled={submitting}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Changing the role will regenerate your entire resume to match the new position.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {submitting && (
            <div className="absolute inset-0 bg-white/90 z-10 flex items-center justify-center">
              <Loading message="Regenerating resume for new role..." size="md" />
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Current Role */}
          {run.phases?.selectedRole && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-sm font-medium text-blue-900 mb-1">Currently tailored for:</p>
              <p className="font-semibold text-blue-700">
                {run.phases.selectedRole.title}
                {run.phases.selectedRole.company && ` at ${run.phases.selectedRole.company}`}
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setCustomMode(false)}
              disabled={submitting}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                !customMode 
                  ? "bg-indigo-600 text-white" 
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              } disabled:opacity-50`}
            >
              Suggested Roles
            </button>
            <button
              onClick={() => setCustomMode(true)}
              disabled={submitting}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                customMode 
                  ? "bg-indigo-600 text-white" 
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              } disabled:opacity-50`}
            >
              Custom Role
            </button>
          </div>

          {!customMode ? (
            // Suggested Roles
            <div className="space-y-3">
              {suggestedRoles
                .filter(role => role.id !== currentRoleId)
                .map((role) => (
                  <label
                    key={role.id}
                    className={`block border rounded-xl p-4 cursor-pointer transition-all ${
                      selectedRole === role.id
                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="role"
                        value={role.id}
                        checked={selectedRole === role.id}
                        onChange={() => setSelectedRole(role.id)}
                        disabled={submitting}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold">{role.title}</h3>
                        {role.company && (
                          <p className="text-sm text-slate-600">{role.company}</p>
                        )}
                        <p className="text-sm text-slate-700 mt-1 line-clamp-2">
                          {role.description}
                        </p>
                        
                        {/* LinkedIn Search Links */}
                        <LinkedInSearchLinks 
                          jobTitle={role.title}
                          location={run.phases?.normalize?.contact?.location}
                          className="mt-2"
                        />
                      </div>
                    </div>
                  </label>
                ))}
            </div>
          ) : (
            // Custom Role Form
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Job Title *
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g., Senior Data Analyst"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
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
                  disabled={submitting}
                  placeholder="e.g., Tech Corp"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Job Description *
                </label>
                <textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  disabled={submitting}
                  placeholder="Paste the job description here..."
                  rows={6}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                submitting || 
                (!customMode && !selectedRole) || 
                (customMode && (!customTitle || !customDescription))
              }
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Changing..." : "Change Role & Regenerate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}