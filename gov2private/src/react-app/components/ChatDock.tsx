// Chat component for interacting with the AI
import { useEffect, useRef, useState } from "react";
import { postChat, type RunData, type Turn } from "../lib/api";
import Loading from "./Loading";

interface ChatDockProps {
  run: RunData | null;
  onReply?: () => void;
}

// Example prompts to help users get started
const EXAMPLE_PROMPTS = [
  { text: 'Add "SQL" to skills', context: "skills" },
  { text: "Make summary more technical", context: "summary" },
  { text: "Add bullet about team leadership", context: "bullets" },
  { text: "Replace job 1 bullet 2 with...", context: "experience" },
  { text: "Make all bullets more quantifiable", context: "bullets" },
  { text: "Update education with MBA details", context: "education" },
];

export default function ChatDock({ run, onReply }: ChatDockProps) {
  const runId = run?.id;
  const thread: Turn[] = run?.phases?.chat || [];
  
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showExamples, setShowExamples] = useState(thread.length === 0);
  const [context, setContext] = useState<string>("general");
  
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTo({
        top: boxRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [thread.length]);

  async function send() {
    const text = msg.trim();
    if (!text || !runId) return;
    
    setBusy(true);
    setShowExamples(false);
    
    try {
      await postChat({ 
        runId, 
        message: text,
        context: context as any
      });
      setMsg("");
      setContext("general");
      onReply?.();
    } finally {
      setBusy(false);
    }
  }

  function handleExampleClick(example: typeof EXAMPLE_PROMPTS[0]) {
    setMsg(example.text);
    setContext(example.context);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Detect context from message
  useEffect(() => {
    const lower = msg.toLowerCase();
    if (lower.includes("skill")) setContext("skills");
    else if (lower.includes("summar")) setContext("summary");
    else if (lower.includes("bullet") || lower.includes("highlight")) setContext("bullets");
    else if (lower.includes("experience") || lower.includes("job")) setContext("experience");
    else if (lower.includes("education") || lower.includes("degree")) setContext("education");
    else setContext("general");
  }, [msg]);

  return (
    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col h-[500px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">AI Assistant</h3>
          <span className="text-xs text-slate-500">
            {context !== "general" && `Context: ${context}`}
          </span>
        </div>
      </div>

      {/* Chat Messages */}
      <div ref={boxRef} className="flex-1 p-4 overflow-y-auto">
        {thread.length === 0 && showExamples ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              I can help you edit any part of your resume. Try these examples or type your own request:
            </p>
            <div className="space-y-2">
              {EXAMPLE_PROMPTS.map((example, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(example)}
                  className="block w-full text-left px-3 py-2 text-sm bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                >
                  <span className="text-slate-700">{example.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {thread.map((turn, i) => (
              <div
                key={i}
                className={`max-w-[85%] ${
                  turn.role === "user" ? "ml-auto" : "mr-auto"
                }`}
              >
                <div
                  className={`rounded-xl px-4 py-2.5 ${
                    turn.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-900 border border-slate-200"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {turn.content}
                  </div>
                  {turn.timestamp && (
                    <div className={`text-xs mt-1 ${
                      turn.role === "user" ? "text-indigo-200" : "text-slate-500"
                    }`}>
                      {new Date(turn.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="mr-auto">
                <div className="bg-slate-100 rounded-xl px-4 py-3 border border-slate-200">
                  <Loading size="sm" inline message="Thinking..." />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 p-3 bg-slate-50">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 pr-10 min-h-[44px] max-h-32 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Ask me to edit any section..."
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy}
              rows={1}
            />
            {msg.length > 0 && (
              <button
                onClick={() => setMsg("")}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                title="Clear"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={send}
            disabled={busy || !msg.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {busy ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <span>Send</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </>
            )}
          </button>
        </div>
        
        {/* Quick Actions */}
        {thread.length > 0 && (
          <div className="mt-2 flex gap-1 flex-wrap">
            <span className="text-xs text-slate-500">Quick:</span>
            <button
              onClick={() => setMsg("Make all bullets more quantifiable with metrics")}
              className="text-xs px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100"
            >
              Add metrics
            </button>
            <button
              onClick={() => setMsg("Make the summary more ATS-friendly")}
              className="text-xs px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100"
            >
              ATS optimize
            </button>
            <button
              onClick={() => setMsg("Add a bullet about leadership")}
              className="text-xs px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100"
            >
              + Leadership
            </button>
            <button
              onClick={() => setMsg("Remove military jargon")}
              className="text-xs px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100"
            >
              Dejargon
            </button>
          </div>
        )}
      </div>
    </div>
  );
}