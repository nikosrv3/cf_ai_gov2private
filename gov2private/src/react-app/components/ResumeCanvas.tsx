// src/components/ResumeCanvas.tsx
import { JSX, useState } from "react";
import type { RunData, NormalizedData, Experience, Education } from "../lib/api";
import { LoadingOverlay } from "./Loading";

interface ResumeCanvasProps {
  run: RunData;
  onChangeRole?: () => void;
  loading?: boolean;
}

export default function ResumeCanvas({ run, onChangeRole, loading = false }: ResumeCanvasProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["summary", "skills", "experience"])
  );

  const norm: NormalizedData = run?.phases?.normalize ?? {};
  const selectedRole = run?.phases?.selectedRole;
  
  const name = norm?.name || "Your Name";
  const contact = norm?.contact || {};
  const summary = norm?.summary || "";
  const skills = norm?.skills || [];
  const certs = norm?.certifications || [];
  const education = norm?.education || [];
  const experience = norm?.experience || [];

  function toggleSection(section: string) {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  }

  const renderContact = () => {
    const items = [
      contact.location,
      contact.email,
      contact.phone,
      ...(contact.links || [])
    ].filter(Boolean);

    return items.length > 0 ? items.join(" • ") : "Contact information will appear here";
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden relative">
      {loading && <LoadingOverlay message="Updating resume..." />}
      
      {/* Header Section */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-5 border-b border-slate-200">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900">{name}</h1>
            <p className="text-slate-600 mt-1">{renderContact()}</p>
          </div>
        </div>

        {/* Target Role Badge */}
        {selectedRole && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-indigo-700">
                  Tailored for: {selectedRole.title}
                  {selectedRole.company && ` at ${selectedRole.company}`}
                </span>
              </div>
            </div>
            <button
              onClick={onChangeRole}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              title="Change target role"
            >
              Change Role
            </button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">

        {/* Professional Summary */}
        <Section
          title="Professional Summary"
          hint="Edit: 'Update summary with...'"
          icon="user"
          expanded={expandedSections.has("summary")}
          onToggle={() => toggleSection("summary")}
        >
          {summary ? (
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{summary}</p>
          ) : (
            <p className="text-slate-400 italic">
              A professional summary will be generated based on your experience and target role.
            </p>
          )}
        </Section>

        {/* Core Skills */}
        <Section
          title="Core Competencies"
          hint="Edit: 'Add Python to skills'"
          icon="tool"
          expanded={expandedSections.has("skills")}
          onToggle={() => toggleSection("skills")}
        >
          {skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 italic">No skills listed yet.</p>
          )}
        </Section>

        {/* Professional Experience */}
        <Section
          title="Professional Experience"
          hint="Edit: 'Update job 1 bullet 2'"
          icon="briefcase"
          expanded={expandedSections.has("experience")}
          onToggle={() => toggleSection("experience")}
        >
          {experience.length > 0 ? (
            <div className="space-y-4">
              {experience.map((job: Experience, idx) => (
                <div
                  key={idx}
                  className="border-l-4 border-indigo-200 pl-4 hover:border-indigo-400 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-lg text-slate-900">{job.title}</h4>
                      <p className="text-slate-700 font-medium">{job.org}</p>
                    </div>
                    <div className="text-right text-sm text-slate-600">
                      <p>{job.location}</p>
                      <p>{[job.start, job.end].filter(Boolean).join(" - ")}</p>
                    </div>
                  </div>
                  
                  {job.bullets && job.bullets.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {job.bullets.map((bullet: string, i: number) => (
                        <li key={i} className="flex gap-2 text-slate-700">
                          <span className="text-indigo-400 mt-1">•</span>
                          <span className="flex-1">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 italic">No experience listed yet.</p>
          )}
        </Section>

        {/* Education */}
        <Section
          title="Education"
          hint="Edit: 'Add certification...'"
          icon="academic"
          expanded={expandedSections.has("education")}
          onToggle={() => toggleSection("education")}
        >
          {education.length > 0 ? (
            <div className="space-y-2">
              {education.map((edu: Education, i) => (
                <div key={i} className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-slate-900">
                      {[edu.degree, edu.field].filter(Boolean).join(" in ")}
                    </p>
                    <p className="text-slate-700">{edu.institution}</p>
                  </div>
                  <div className="text-sm text-slate-600">
                    {[edu.location, edu.year].filter(Boolean).join(" • ")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 italic">No education listed yet.</p>
          )}
        </Section>

        {/* Certifications */}
        {certs.length > 0 && (
          <Section
            title="Certifications & Credentials"
            hint="Edit: 'Add AWS cert'"
            icon="award"
            expanded={expandedSections.has("certs")}
            onToggle={() => toggleSection("certs")}
          >
            <ul className="space-y-1">
              {certs.map((cert, i) => (
                <li key={i} className="flex gap-2 text-slate-700">
                  <span className="text-indigo-400">✓</span>
                  <span>{cert}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  hint?: string;
  icon?: string;
  expanded: boolean;
  onToggle: () => void;
  highlight?: boolean;
  children: React.ReactNode;
}

function Section({
  title,
  hint,
  icon,
  expanded,
  onToggle,
  highlight = false,
  children,
}: SectionProps) {
  const icons: Record<string, JSX.Element> = {
    star: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ),
    user: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    tool: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    briefcase: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    academic: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 14l9-5-9-5-9 5 9 5z" />
        <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
      </svg>
    ),
    award: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  };

  return (
    <section
      className={`border rounded-xl transition-all ${
        highlight
          ? "border-indigo-300 bg-indigo-50/50"
          : "border-slate-200 bg-white"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-3">
          {icon && (
            <span className={highlight ? "text-indigo-600" : "text-slate-600"}>
              {icons[icon]}
            </span>
          )}
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {hint && <span className="text-xs text-slate-500 ml-2">{hint}</span>}
        </div>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {expanded && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}