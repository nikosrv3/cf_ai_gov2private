// src/App.tsx
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { useState } from "react";
import Landing from "./pages/Landing";
import RunDetail from "./pages/RunDetail";
import Onboarding from "./pages/Onboarding";
import RoleSelection from "./pages/RoleSelection";
import HistorySidebar from "./components/HistorySidebar";

export default function App() {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(true);
  const cols = navOpen ? "grid-cols-[320px_1fr]" : "grid-cols-[95px_1fr]";

  return (
    <div className={`min-h-screen grid ${cols} bg-slate-50 text-slate-900 transition-all duration-300`}>
      {/* Sidebar Navigation */}
      <aside className="bg-white border-r border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            {navOpen ? (
              <Link 
                to="/" 
                className="flex items-center gap-2 no-underline text-slate-900 hover:text-indigo-600 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                  G2P
                </div>
                <div>
                  <h1 className="font-bold text-base">Gov2Private</h1>
                  <p className="text-xs text-slate-500">Career Transition Tool</p>
                </div>
              </Link>
            ) : (
              <Link 
                to="/" 
                className="mx-auto w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm hover:shadow-lg transition-shadow"
                title="Gov2Private"
              >
                G2P
              </Link>
            )}
            <button
              onClick={() => setNavOpen(v => !v)}
              className={`p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 transition-all ${
                !navOpen ? "mx-auto mt-auto" : ""
              }`}
              title={navOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {navOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 flex flex-col p-4 gap-4">
          {navOpen ? (
            <>
              {/* Quick Actions */}
              <div className="space-y-2">
                <Link
                  to="/onboarding"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Resume
                </Link>
              </div>

              {/* History Section */}
              <div className="flex-1 min-h-0 flex flex-col">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Your Runs
                </h3>
                <div className="flex-1 overflow-y-auto">
                  <HistorySidebar currentPath={location.pathname} />
                </div>
              </div>

              {/* Help Section */}
              <div className="border-t border-slate-200 pt-4">
                <div className="text-xs text-slate-500 space-y-1">
                  <p>Need help?</p>
                  <a href="#" className="text-indigo-600 hover:text-indigo-700">
                    View Documentation
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Link
                to="/onboarding"
                className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                title="New Resume"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="p-6 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/run/:id" element={<RunDetail />} />
          <Route path="/run/:id/select-role" element={<RoleSelection />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Page Not Found</h1>
        <p className="text-slate-600 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </div>
    </div>
  );
}