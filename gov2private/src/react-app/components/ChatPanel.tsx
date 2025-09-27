import { useState } from "react";
import { postChat } from "../lib/api";

export default function ChatPanel({ runId }: { runId?: string }) {
  const [msg, setMsg] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!msg.trim()) return;
    setBusy(true);
    try {
      const r = await postChat({ runId, message: msg });
      setReply(r.reply);
      setMsg("");
    } catch (e: any) {
      setReply(e?.message || "Chat failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <input
          className="flex-1 border border-slate-300 rounded-xl px-3 py-2"
          placeholder='Try: "Explain role 1" or "ATS all bullets"'
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          onClick={send}
          disabled={busy}
          className="rounded-xl border border-slate-300 bg-indigo-600 text-white px-4 py-2 hover:bg-indigo-700 disabled:opacity-60"
        >
          Send
        </button>
      </div>

      {reply && (
        <div className="border border-slate-200 bg-white rounded-xl p-3 whitespace-pre-wrap">
          {reply}
        </div>
      )}
    </div>
  );
}
