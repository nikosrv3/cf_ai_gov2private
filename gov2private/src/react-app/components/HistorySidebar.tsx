// src/components/HistorySidebar.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
  getHistory, 
  type HistoryItem, 
  type RunStatus,
  humanizeApiError 
} from "../lib/api";
import { LoadingSkeleton } from "./Loading";

interface HistorySidebarProps {
  currentPath?: string;
}

export default function HistorySidebar({ currentPath }: HistorySidebarProps) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    loadHistory(controller.signal);
    
    // Refresh history periodically
    const interval = setInterval(() => {
      loadHistory();
    }, 30000); // Every 30 seconds
    
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  async function loadHistory(signal?: AbortSignal) {
    try {
      const response = await getHistory(signal);
      setItems(response.items);
      setError(null);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setError(humanizeApiError(err));
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-3 border border-slate-200 rounded-xl">
            <LoadingSkeleton lines={2} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-sm text-red-700 font-medium">Error loading history</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
        <button
          onClick={() => loadHistory()}
          className="mt-2 text-xs text-red-600 hover:text-red-700 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="p-4 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl text-center">
        <svg className="w-8 h-8 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm text-slate-600 font-medium">No resumes yet</p>
        <p className="text-xs text-slate-500 mt-1">
          Click "New Resume" to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isActive = currentPath?.includes(`/run/${item.id}`);
        const needsAction = item.status === "role_selection";
        
        return (
          <Link
            key={item.id}
            to={needsAction ? `/run/${item.id}/select-role` : `/run/${item.id}`}
            className={`
              block p-3 rounded-xl border transition-all
              ${isActive 
                ? "bg-indigo-50 border-indigo-300 shadow-sm" 
                : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
              }
              ${needsAction ? "animate-pulse" : ""}
            `}
            title={`Open run: ${item.role || "Untitled"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm text-slate-900 truncate">
                  {item.role || "Untitled Resume"}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatDate(item.createdAt)}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            
            {needsAction && (
              <div className="mt-2 text-xs text-amber-600 font-medium flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Action required
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: RunStatus }) {
  const configs = {
    done: {
      color: "text-green-700",
      bg: "bg-green-100",
      border: "border-green-200",
      icon: "✓",
      label: "Complete"
    },
    error: {
      color: "text-red-700",
      bg: "bg-red-100",
      border: "border-red-200",
      icon: "!",
      label: "Error"
    },
    pending: {
      color: "text-blue-700",
      bg: "bg-blue-100",
      border: "border-blue-200",
      icon: "↻",
      label: "Processing"
    },
    generating: {
      color: "text-purple-700",
      bg: "bg-purple-100",
      border: "border-purple-200",
      icon: "⚡",
      label: "Generating"
    },
    role_selection: {
      color: "text-amber-700",
      bg: "bg-amber-100",
      border: "border-amber-200",
      icon: "?",
      label: "Select Role"
    },
    queued: {
      color: "text-slate-700",
      bg: "bg-slate-100",
      border: "border-slate-200",
      icon: "⏱",
      label: "Queued"
    }
  };

  const config = configs[status as keyof typeof configs] || configs.queued;

  return (
    <span 
      className={`
        inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
        ${config.bg} ${config.color} ${config.border} border
      `}
    >
      <span className="text-xs">{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined
    });
  } else if (days > 0) {
    return `${days} day${days !== 1 ? "s" : ""} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  } else if (minutes > 0) {
    return `${minutes} min${minutes !== 1 ? "s" : ""} ago`;
  } else {
    return "Just now";
  }
}