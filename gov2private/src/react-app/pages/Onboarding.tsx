// Onboarding page - where users start their resume tailoring journey
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { discoverJobs, humanizeApiError } from "../lib/api";
import Loading from "../components/Loading";

// Industry sectors - tried to cover the main areas people transition from/to
const SECTORS = [
  // Technology & Software
  "Software Development", "Cybersecurity", "Data Science", "Product Management",
  
  // Business & Finance  
  "Finance", "Consulting", "Sales & Marketing", "Operations",
  
  // Healthcare & Life Sciences
  "Healthcare", "Biotechnology", "Public Health",
  
  // Government & Public Sector
  "Government", "Defense & Intelligence", "Law Enforcement",
  
  // Education & Research
  "Education", "Research & Development",
  
  // Media & Communications
  "Media & Communications", "Content Creation",
  
  // Manufacturing & Engineering
  "Manufacturing", "Engineering",
  
  // Energy & Environment
  "Energy & Environment",
  
  // Legal & Compliance
  "Legal & Compliance",
  
  // Non-Profit & Social Impact
  "Non-Profit & Social Impact"
];

export default function Onboarding() {
  const navigate = useNavigate();
  
  // Form state
  const [position, setPosition] = useState("");
  const [sectors, setSectors] = useState<string[]>([]);
  const [clearance, setClearance] = useState("None");
  const [years, setYears] = useState("");
  const [resume, setResume] = useState("");
  const [background, setBackground] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toggle sector selection
  function toggleSector(s: string) {
    setSectors((prev) => 
      prev.includes(s) 
        ? prev.filter((x) => x !== s) 
        : [...prev, s]
    );
  }

  // Handle form submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!resume.trim()) {
      setError("Please paste your resume text");
      return;
    }
    
    setBusy(true);
    setError(null);
    
    try {
      // Build background context
      const bgParts = [
        position && `Current/Recent: ${position}`,
        sectors.length ? `Interest: ${sectors.join(", ")}` : "",
        years && `Experience: ${years} years`,
        clearance !== "None" && `Clearance: ${clearance}`,
        background && `Notes: ${background}`
      ].filter(Boolean);
      
      const bgContext = bgParts.join(" | ");
      
      // Submit and discover jobs
      const res = await discoverJobs({ 
        resumeText: resume, 
        background: bgContext 
      });
      
      const runId = res.run?.id;
      if (!runId) throw new Error("No run ID returned");
      
      // Navigate to role selection
      navigate(`/run/${runId}/select-role`);
    } catch (err) {
      setError(humanizeApiError(err));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        {busy && <Loading message="Analyzing your background..." fullScreen />}
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100">
          <h1 className="text-2xl font-bold text-slate-900">Start Your Transition</h1>
          <p className="text-slate-600 mt-1">
            From government service to private sector success
          </p>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 font-medium">Error</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Resume Text - Required */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Resume Text *
              <span className="ml-2 text-xs font-normal text-slate-500">
                (Copy and paste your current resume)
              </span>
            </label>
            <textarea
              className="w-full border border-slate-300 rounded-xl px-4 py-3 min-h-[200px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Paste your complete resume text here. Include all sections: experience, education, skills, etc."
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Don't worry about formatting - we'll handle that. Just paste the content.
            </p>
          </div>

          {/* Current/Recent Position */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Current/Recent Position
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="e.g., Program Analyst, IT Specialist, Contract Officer"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>

          {/* Years of Experience */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Years of Experience
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., 5, 10+"
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Security Clearance
              </label>
              <select
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={clearance}
                onChange={(e) => setClearance(e.target.value)}
              >
                {["None", "Public Trust", "Secret", "Top Secret", "Top Secret/SCI"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sectors of Interest */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Target Industries
              <span className="ml-2 text-xs font-normal text-slate-500">
                (Select all that interest you)
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSector(s)}
                  className={`px-4 py-2 rounded-xl border font-medium transition-all ${
                    sectors.includes(s)
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm"
                      : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {sectors.includes(s) && (
                    <span className="mr-1">✓</span>
                  )}
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Additional Context */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Additional Context
              <span className="ml-2 text-xs font-normal text-slate-500">
                (Optional)
              </span>
            </label>
            <textarea
              className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Any specific companies, roles, or goals you have in mind? Special achievements or projects to highlight?"
              rows={3}
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 rounded-b-2xl">
          <div className="flex gap-3 justify-between">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="px-4 py-2.5 border border-slate-300 rounded-xl hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !resume.trim()}
              className="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {busy ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Continue to Role Selection</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}