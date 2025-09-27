// src/pages/Landing.tsx
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { getHistory, type HistoryItem } from "../lib/api";

export default function Landing() {
  const [recentRuns, setRecentRuns] = useState<HistoryItem[]>([]);

  useEffect(() => {
    getHistory().then(res => {
      setRecentRuns(res.items.slice(0, 3));
    }).catch(() => {
      // Silent fail, not critical for landing page
    });
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 border border-slate-200 rounded-3xl p-8 lg:p-12 shadow-sm">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium mb-4">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Built for Federal Employees
          </div>
          
          <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 mb-4">
            From <span className="text-indigo-600">Government Service</span><br />
            to <span className="text-purple-600">Private Sector Success</span>
          </h1>
          
          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            Transform your federal experience into a compelling private sector resume. 
            Our AI understands government roles and translates your achievements into 
            industry language that gets noticed.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              to="/onboarding"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Your Resume
            </Link>
            
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
            <span className="text-xl font-bold">1</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Upload Your Resume
          </h3>
          <p className="text-slate-600">
            Paste your current federal resume or CV. Our AI extracts and understands your government experience.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 mb-4">
            <span className="text-xl font-bold">2</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Select Target Role
          </h3>
          <p className="text-slate-600">
            Choose from AI-suggested roles based on your skills, or provide your own job description.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-600 mb-4">
            <span className="text-xl font-bold">3</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Refine & Export
          </h3>
          <p className="text-slate-600">
            Use AI chat to perfect each section. Export to PDF, Word, or plain text when ready.
          </p>
        </div>
      </div>

      {/* Features Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">
          Built Specifically for Federal Transitions
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Demilitarize Jargon</h3>
              <p className="text-sm text-slate-600">
                Automatically converts military acronyms and government-speak into clear civilian language.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Quantify Impact</h3>
              <p className="text-sm text-slate-600">
                Transform vague duties into measurable achievements with metrics that matter.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">ATS Optimization</h3>
              <p className="text-sm text-slate-600">
                Format and keyword-optimize for Applicant Tracking Systems used by major companies.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Security Clearance Highlight</h3>
              <p className="text-sm text-slate-600">
                Properly position your clearance level as a valuable asset for contractors.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Runs */}
      {recentRuns.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900">Recent Resumes</h2>
          </div>
          
          <div className="space-y-3">
            {recentRuns.map((run) => (
              <Link
                key={run.id}
                to={`/run/${run.id}`}
                className="block p-3 border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-slate-900">
                      {run.role || "Untitled Resume"}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}