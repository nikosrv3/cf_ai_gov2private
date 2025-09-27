// import { useEffect, useMemo, useState } from "react";
// import type { RunData } from "../lib/api";
// import { selectRole } from "../lib/api";

// type Props = {
//   run: RunData | null;
//   onUpdated: (updated: RunData) => void;
// };

// type RoleCandidate = {
//   id: string;
//   title: string;
//   level?: string;
//   rationale?: string;
//   confidence?: number;
//   aiJobDescription?: string;
// };

// type RolesResp = {
//   ok: boolean;
//   candidates?: RoleCandidate[];
//   status?: string;
//   error?: string;
// };

// export default function RolePicker({ run, onUpdated }: Props) {
//   const runId = run?.id;
//   const [roles, setRoles] = useState<RoleCandidate[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [posting, setPosting] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   const [selectedId, setSelectedId] = useState<string>("");
//   const [jd, setJd] = useState("");
//   const [useAiJD, setUseAiJD] = useState(true);

//   const alreadySelected = useMemo(() => {
//     return Boolean((run as any)?.selectedRoleId || run?.targetRole);
//   }, [run]);

//   useEffect(() => {
//     if (!runId) return;
//     let abort = false;
//     (async () => {
//       setLoading(true);
//       setError(null);
//       try {
//         const r = await fetch(`/api/run/${encodeURIComponent(runId)}/roles`, { method: "GET" });
//         const data = (await r.json()) as RolesResp;
//         if (!abort) {
//           if (!data.ok) {
//             setError(data.error || "failed to load roles");
//           } else {
//             setRoles(data.candidates || []);
//           }
//         }
//       } catch (e: any) {
//         if (!abort) setError(String(e?.message || e || "network error"));
//       } finally {
//         if (!abort) setLoading(false);
//       }
//     })();
//     return () => { abort = true; };
//   }, [runId]);

//   useEffect(() => {
//     if (!selectedId) return;
//     const found = roles.find(r => String(r.id) === String(selectedId));
//     if (found && useAiJD && found.aiJobDescription) {
//       setJd(found.aiJobDescription);
//     }
//   }, [selectedId, roles, useAiJD]);

//   if (!runId) return null;

//   return (
//     <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
//       <div className="flex items-center justify-between">
//         <h3 className="font-semibold text-slate-900">Select target role</h3>
//         {loading ? <span className="text-xs text-slate-500">Loading…</span> : null}
//       </div>

//       {error ? (
//         <div className="text-sm text-red-600 mt-2">{error}</div>
//       ) : null}

//       <div className="mt-3 grid gap-2">
//         {roles.length === 0 && !loading ? (
//           <div className="text-sm text-slate-500">No role candidates found yet.</div>
//         ) : (
//           <div className="grid gap-2">
//             <div className="grid gap-1">
//               {roles.map((r) => (
//                 <label
//                   key={r.id}
//                   className={`border rounded-lg px-3 py-2 flex items-start gap-3 cursor-pointer ${
//                     selectedId === r.id ? "border-indigo-500 bg-indigo-50" : "border-slate-300"
//                   }`}
//                 >
//                   <input
//                     type="radio"
//                     name="role"
//                     className="mt-1"
//                     checked={selectedId === r.id}
//                     onChange={() => setSelectedId(String(r.id))}
//                   />
//                   <div className="flex-1">
//                     <div className="font-medium text-slate-900">
//                       {r.title} {r.level ? <span className="text-slate-500 font-normal">({r.level})</span> : null}
//                     </div>
//                     {r.rationale ? (
//                       <div className="text-xs text-slate-600">{r.rationale}</div>
//                     ) : null}
//                     {typeof r.confidence === "number" ? (
//                       <div className="text-[11px] text-slate-500 mt-0.5">
//                         Fit: {(r.confidence * 100).toFixed(0)}%
//                       </div>
//                     ) : null}
//                   </div>
//                 </label>
//               ))}
//             </div>

//             <div className="mt-2 border-t border-slate-200 pt-2">
//               <div className="flex items-center gap-2">
//                 <input
//                   id="useAiJD"
//                   type="checkbox"
//                   className="accent-indigo-600"
//                   checked={useAiJD}
//                   onChange={(e) => setUseAiJD(e.target.checked)}
//                 />
//                 <label htmlFor="useAiJD" className="text-sm text-slate-700">
//                   Use AI-generated job description (you can paste your own below)
//                 </label>
//               </div>

//               <textarea
//                 value={jd}
//                 onChange={(e) => setJd(e.target.value)}
//                 placeholder="Paste the job description (optional — if checked above, we’ll use the AI JD)"
//                 className="mt-2 w-full min-h-[120px] border border-slate-300 rounded-lg p-2 text-sm"
//               />
//             </div>

//             <div className="flex gap-2 mt-2">
//               <button
//                 disabled={!selectedId || posting || alreadySelected}
//                 onClick={async () => {
//                   if (!selectedId) return;
//                   setPosting(true);
//                   setError(null);
//                   try {
//                     const resp = await selectRole(runId, {
//                       roleId: selectedId,
//                       jobDescription: jd?.trim() || undefined,
//                       useAiGenerated: useAiJD && !jd.trim(),
//                     });
//                     if (!resp.ok || !resp.run) {
//                       throw new Error(resp.error || "Failed to select role");
//                     }
//                     onUpdated(resp.run as RunData);
//                   } catch (e: any) {
//                     setError(String(e?.message || e || "failed to select role"));
//                   } finally {
//                     setPosting(false);
//                   }
//                 }}
//                 className={`px-3 py-2 rounded-lg text-sm ${
//                   !selectedId || posting || alreadySelected
//                     ? "bg-slate-200 text-slate-500 cursor-not-allowed"
//                     : "bg-indigo-600 text-white hover:bg-indigo-700"
//                 }`}
//               >
//                 {alreadySelected ? "Role selected" : posting ? "Tailoring…" : "Select role & tailor"}
//               </button>
//               {alreadySelected ? (
//                 <span className="text-xs text-slate-600 self-center">
//                   A role is already selected for this run.
//                 </span>
//               ) : null}
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
