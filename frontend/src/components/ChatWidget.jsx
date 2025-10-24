// frontend/src/components/ChatWidget.jsx
import { useState, useRef, useEffect } from "react";

export default function ChatWidget({ apiBase = "/api", brand = "Clarus AI" }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // ===== KEEP YOUR CORE SEND LOGIC (unchanged) =====
  async function sendMessage(e) {
    e.preventDefault();
    const text = (inputRef.current?.value || "").trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    inputRef.current.value = "";
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: text,
          context: { sheet: "bCAS (Q4 Adj)" },
        }),
      });
      const data = await res.json();
      const bot = formatBotReply(data);
      setMessages((m) => [...m, bot]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry—server unavailable right now." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function formatBotReply(data) {
    if (data.type === "metric") {
      const val =
        typeof data.value === "number"
          ? new Intl.NumberFormat().format(data.value)
          : data.value;
      const header = (data.metric || "").replace(/_/g, " ");
      const period = data.period ? `\nPeriod: ${data.period}` : "";
      return {
        role: "assistant",
        content: `**${header}**: ${val}${period}\n${data.note || ""}`,
      };
    }
    if (data.type === "explanation" || data.type === "nlp") {
      return { role: "assistant", content: data.answer || "" };
    }
    if (data.error || data.message) {
      return {
        role: "assistant",
        content: data.error || data.message,
      };
    }
    return { role: "assistant", content: "(No response)" };
  }

  // Auto-scroll to latest
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, open]);

  // Small helpers: icons/avatars
  const Robot = ({ className = "" }) => (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className}`}>
      <path
        fill="currentColor"
        d="M12 2a1 1 0 0 1 1 1v1.06A7.002 7.002 0 0 1 19 11v4a3 3 0 0 1-3 3h-1a3 3 0 0 1-6 0H8a3 3 0 0 1-3-3v-4a7.002 7.002 0 0 1 6-6.94V3a1 1 0 0 1 1-1Zm-3 9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H9Z"
      />
    </svg>
  );

  const SendIcon = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="currentColor"
        d="M3.4 20.6 22 12 3.4 3.4 3 10l12 2-12 2z"
      />
    </svg>
  );

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* FAB Toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="group rounded-full shadow-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white h-14 w-14 flex items-center justify-center hover:from-violet-500 hover:to-indigo-500 transition transform hover:scale-[1.03]"
        aria-label="Open financial chatbot"
      >
        <Robot className="text-white group-hover:scale-110 transition-transform" />
      </button>

      {/* Panel */}
      {open && (
        <div
          className="mt-3 w-[420px] max-h-[78vh] rounded-3xl overflow-hidden shadow-[0_20px_70px_rgba(0,0,0,0.25)] border border-white/20
                     bg-white/80 backdrop-blur-xl"
        >
          {/* Header */}
          <div className="relative">
            <div className="h-16 bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600" />
            <div className="absolute inset-0 flex items-center px-5">
              <div className="flex items-center gap-3 text-white">
                <div className="h-10 w-10 rounded-2xl bg-white/20 flex items-center justify-center ring-1 ring-white/30">
                  <Robot className="text-white" />
                </div>
                <div className="leading-tight">
                  <div className="font-semibold text-[15px]">{brand}</div>
                  <div className="text-[12px] flex items-center gap-1 opacity-90">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(255,255,255,0.35)]" />
                    Online
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            className="flex-1 max-h-[52vh] overflow-y-auto px-4 py-4 space-y-4 bg-gradient-to-b from-white/60 to-white"
          >
            {/* Starter prompt (only if empty) */}
            {messages.length === 0 && (
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Robot className="text-violet-600" />
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-1">
                {/* Sender label */}
                <div className="text-[11px] text-gray-400 pl-1">
                  {m.role === "user" ? "You" : brand}
                </div>

                {/* Bubble */}
                <div
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[78%] leading-relaxed text-[15px] ${
                      m.role === "user"
                        ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md rounded-2xl rounded-br-md"
                        : "bg-white border border-gray-100 text-gray-800 shadow-sm rounded-2xl rounded-bl-md"
                    } px-4 py-2.5`}
                    dangerouslySetInnerHTML={{
                      __html: (m.content || "").replace(/\n/g, "<br/>"),
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex items-center gap-2 text-gray-500 pl-1">
                <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" />
                <div className="h-2 w-2 rounded-full bg-gray-300 animate-bounce [animation-delay:120ms]" />
                <div className="h-2 w-2 rounded-full bg-gray-200 animate-bounce [animation-delay:240ms]" />
              </div>
            )}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={sendMessage}
            className="border-t border-gray-100 bg-white/80 backdrop-blur px-3 py-3"
          >
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-violet-300">
              <input
                ref={inputRef}
                className="flex-1 outline-none text-[15px] placeholder-gray-400"
                placeholder="Type your question…"
                autoComplete="off"
              />
              <button
                type="submit"
                className="shrink-0 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition shadow-md"
              >
                <SendIcon />
                Send
              </button>
            </div>
          </form>

          {/* Footer strip */}
          <div className="px-5 py-2 text-[11px] text-gray-400 bg-white/70">
            Secure • Role-aware answers for Admin / GP / Group Admin / Investor
          </div>
        </div>
      )}
    </div>
  );
}
