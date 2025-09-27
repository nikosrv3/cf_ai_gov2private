// src/components/LinkedInSearchLinks.tsx
import { useState, useEffect } from "react";
import { searchLinkedInJobs, type LinkedInSearchLink } from "../lib/api";

interface LinkedInSearchLinksProps {
  jobTitle: string;
  location?: string;
  className?: string;
}

export default function LinkedInSearchLinks({ 
  jobTitle, 
  location, 
  className = "" 
}: LinkedInSearchLinksProps) {
  const [links, setLinks] = useState<LinkedInSearchLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobTitle.trim()) return;
    
    const controller = new AbortController();
    
    async function fetchLinks() {
      setLoading(true);
      setError(null);
      
      try {
        const response = await searchLinkedInJobs(jobTitle, location, controller.signal);
        setLinks(response.links);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError("Failed to load LinkedIn search links");
          console.error("LinkedIn search error:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    
    fetchLinks();
    
    return () => controller.abort();
  }, [jobTitle, location]);

  if (loading) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
          Loading LinkedIn job searches...
        </div>
      </div>
    );
  }

  if (error || links.length === 0) {
    return null; // Don't show anything if there's an error or no links
  }

  return (
    <div className={`${className}`}>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          <span className="text-sm font-medium text-blue-800">Find Real Jobs on LinkedIn</span>
        </div>
        <div className="space-y-1">
          {links.map((link, index) => (
            <a
              key={index}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-blue-700 hover:text-blue-900 hover:underline transition-colors"
            >
              {link.title}
            </a>
          ))}
        </div>
        <div className="mt-2 text-xs text-blue-600">
          Opens in new tab • Results filtered for recent, full-time, remote-friendly positions
        </div>
      </div>
    </div>
  );
}

