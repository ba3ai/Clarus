// src/components/ChatWidget.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api"; // <-- same client as Documents.jsx

/**
 * Cookie + CSRF friendly chat widget
 * - Same-origin requests through the shared Axios client
 * - CSRF header comes from the XSRF-TOKEN cookie (handled in api.js)
 */
export default function ChatWidget({
  apiBase = "/api",
  authBase = "/auth",
  brand = "Clarus AI",
  defaultOpen = true,
  autoSendOnFinal = false,
  lang = "en-US",
  ttsDefaultEnabled = true,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [who, setWho] = useState({ user: null, investor: null, ready: false, error: null });

  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Stable conversation id
  function getConversationId() {
    try {
      const key = "clarus_cid_global";
      let cid = localStorage.getItem(key);
      if (!cid) cid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      localStorage.setItem(key, cid);
      return cid;
    } catch {
      return Math.random().toString(36).slice(2);
    }
  }

  // ---------------------------- identity --------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`${authBase}/me`, { headers: { Accept: "application/json" } });
        if (!alive) return;
        if (!data?.ok) {
          setWho({ user: null, investor: null, ready: true, error: `Auth error` });
          return;
        }
        setWho({ user: data.user || null, investor: data.investor || null, ready: true, error: null });
      } catch {
        if (!alive) return;
        setWho({ user: null, investor: null, ready: true, error: "Cannot reach /auth/me" });
      }
    })();
    return () => { alive = false; };
  }, [authBase]);

  // ------------------------ voice (STT/TTS) ------------------------------
  const SpeechRecognition =
    typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const sttSupported = Boolean(SpeechRecognition);
  const recognizerRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [sttError, setSttError] = useState("");

  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  const ttsSupported = Boolean(synth);
  const [ttsEnabled, setTtsEnabled] = useState(ttsDefaultEnabled && ttsSupported);
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef(null);

  useEffect(() => {
    if (!ttsSupported) return;
    function loadVoices() {
      const v = synth.getVoices();
      if (v && v.length) setVoices(v);
    }
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [ttsSupported, synth]);

  const defaultVoice = useMemo(() => {
    if (!voices.length) return null;
    const english = voices.find((v) => /en/i.test(v.lang));
    return english || voices[0];
  }, [voices]);

  function speak(text) {
    if (!ttsEnabled || !ttsSupported || !text) return;
    try {
      synth.cancel();
      setSpeaking(false);
      const utt = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utt;
      utt.lang = defaultVoice?.lang || "en-US";
      utt.voice = defaultVoice || null;
      utt.rate = 1;
      utt.pitch = 1;
      utt.volume = 1;
      utt.onstart = () => setSpeaking(true);
      utt.onend = () => setSpeaking(false);
      utt.onerror = () => setSpeaking(false);
      synth.speak(utt);
    } catch {}
  }

  useEffect(() => {
    if (!ttsEnabled || !ttsSupported || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant") {
      const text = (last.content || "").replace(/\*\*/g, "").replace(/<br\s*\/?>/gi, "\n");
      speak(text);
    }
  }, [messages, ttsEnabled, ttsSupported]); // eslint-disable-line

  useEffect(() => {
    if (!ttsSupported) return;
    if (!open) { synth.cancel(); setSpeaking(false); }
  }, [open, synth, ttsSupported]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, open]);

  // --------------------- safe link clicks (download) ---------------------
  async function handleLinkClick(e) {
    const a = e.target.closest('a[data-chat-dl="1"]');
    if (!a) return;
    e.preventDefault();

    const url = a.getAttribute("href");
    let urlFilename = "";
    try {
      const u = new URL(url, window.location.origin);
      urlFilename = u.searchParams.get("filename") || u.searchParams.get("fn") || "";
    } catch {}

    try {
      const res = await api.get(url, { responseType: "blob" });
      const blob = res.data;
      const cd = res.headers["content-disposition"] || "";
      const m = cd.match(/filename\*?=(?:UTF-8''|")(.*?)(?:\"|;|$)/i);
      const fallback = urlFilename || (url.split("/").pop() || "download").split("?")[0];
      const filename = m ? decodeURIComponent(m[1]) : fallback;

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
    } catch (err) {
      console.error(err);
      setMessages((m) => [...m, { role: "assistant", content: "Sorry—couldn’t download that file." }]);
    }
  }

  function escapeHtml(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function linkify(text) {
    let html = escapeHtml(text || "");
    // [label](url)
    html = html.replace(
      /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^) \t\r\n]+)\)/g,
      (_m, label, url) =>
        `<a href="${url}" data-chat-dl="1" class="text-violet-600 hover:underline" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    );
    // bare links
    html = html.replace(
      /((?:https?:\/\/|\/)[^\s<>"'()]+)(?=[\s)<]|$)/g,
      (url) =>
        `<a href="${url}" data-chat-dl="1" class="text-violet-600 hover:underline" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\n/g, "<br/>");
    return html;
  }

  // ----------------------------- send -----------------------------------
  async function sendMessage(e) {
    if (e) e.preventDefault();
    const text = (inputRef.current?.value || "").trim();
    if (!text) return;

    if (ttsSupported) { synth.cancel(); setSpeaking(false); }

    setMessages((m) => [...m, { role: "user", content: text }]);
    inputRef.current.value = "";
    setLoading(true);

    const conversation_id = getConversationId();

    const userPayload = who.user
      ? {
          id: who.user.id ?? null,
          email: who.user.email ?? null,
          username: who.user.username ?? null,
          name: who.user.name ?? null,
          first_name: who.user.first_name ?? null,
          last_name: who.user.last_name ?? null,
          user_type: who.user.user_type ?? "Investor",
        }
      : { user_type: "Investor" };

    const investorPayload = who.investor
      ? { investor_id: who.investor.id ?? null, investor_name: who.investor.name ?? null }
      : {};

    try {
      const { data } = await api.post(`${apiBase}/chat`, {
        message: text,
        conversation_id,
        user: userPayload,
        ...investorPayload,
      });

      const bot = formatBotReply(data);
      setMessages((m) => [...m, bot]);
    } catch (err) {
      // If backend returns structured error {error: "..."} axios throws; surface it nicely
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Sorry—server unavailable right now.";
      setMessages((m) => [...m, { role: "assistant", content: msg }]);
    } finally {
      setLoading(false);
    }
  }

  function formatBotReply(data) {
    if (data?.answer) return { role: "assistant", content: data.answer };
    if (data?.type === "db") return { role: "assistant", content: data.answer || "(No response)" };
    if (data?.type === "metric") {
      const val = typeof data.value === "number" ? new Intl.NumberFormat().format(data.value) : data.value;
      const header = (data.metric || "").replace(/_/g, " ");
      const period = data.period ? `\nPeriod: ${data.period}` : "";
      return { role: "assistant", content: `**${header}**: ${val}${period}\n${data.note || ""}` };
    }
    if (data?.type === "explanation" || data?.type === "nlp") return { role: "assistant", content: data.answer || "" };
    if (data?.error || data?.message) return { role: "assistant", content: data.error || data.message };
    return { role: "assistant", content: "(No response)" };
  }

  // --------------------------- STT controls ------------------------------
  const SpeechAPI = SpeechRecognition;
  const startListening = () => {
    setSttError("");
    if (!SpeechAPI) { setSttError("Voice input not supported in this browser."); return; }
    if (listening) return;
    try {
      const rec = new SpeechAPI();
      recognizerRef.current = rec;
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = false;

      let finalTranscript = "";
      rec.onstart = () => setListening(true);
      rec.onresult = (evt) => {
        let interim = "";
        for (let i = evt.resultIndex; i < evt.results.length; i++) {
          const t = evt.results[i][0].transcript;
          if (evt.results[i].isFinal) finalTranscript += t + " ";
          else interim += t;
        }
        if (inputRef.current) {
          const base = inputRef.current.dataset.base || inputRef.current.value;
          if (!inputRef.current.dataset.base) inputRef.current.dataset.base = base;
          inputRef.current.value = (base + " " + interim).trim();
        }
      };
      rec.onerror = (e) => { setSttError(e.error || "Voice input error"); setListening(false); };
      rec.onend = () => {
        setListening(false);
        if (inputRef.current?.dataset?.base) delete inputRef.current.dataset.base;
        if (finalTranscript.trim()) {
          if (autoSendOnFinal) {
            if (inputRef.current) inputRef.current.value = finalTranscript.trim();
            sendMessage();
          } else {
            if (inputRef.current) {
              const before = inputRef.current.value || "";
              inputRef.current.value = (before + " " + finalTranscript).trim();
              inputRef.current.focus();
            }
          }
        }
      };
      rec.start();
    } catch (e) {
      setSttError(e.message || "Failed to start voice input");
      setListening(false);
    }
  };

  // ----------------------------- UI -------------------------------------
  const Robot = ({ className = "" }) => (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className}`}>
      <path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v1.06A7.002 7.002 0 0 1 19 11v4a3 3 0 0 1-3 3h-1a3 3 0 0 1-6 0H8a3 3 0 0 1-3-3v-4a7.002 7.002 0 0 1 6-6.94V3a1 1 0 0 1 1-1Zm-3 9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H9Z" />
    </svg>
  );
  const MicIcon = ({ active }) => (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${active ? "text-rose-600" : ""}`}>
      <path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93V21h2v-2.07A8 8 0 0 0 20 11h-2Z" />
    </svg>
  );

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={() => setOpen(!open)}
        className="group rounded-full shadow-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white h-14 w-14 flex items-center justify-center hover:from-violet-500 hover:to-indigo-500 transition transform hover:scale-[1.03]"
        aria-label="Open financial chatbot"
      >
        <Robot className="text-white group-hover:scale-110 transition-transform" />
      </button>

      {open && (
        <div className="mt-3 w-[420px] max-h-[78vh] rounded-3xl overflow-hidden shadow-[0_20px_70px_rgba(0,0,0,0.25)] border border-white/20 bg-white/80 backdrop-blur-xl">
          {/* Header */}
          <div className="relative h-16 bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600">
            <div className="absolute inset-0 px-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-white">
                <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center ring-1 ring-white/30">
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
              <button
                type="button"
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className="text-white/90 hover:text-white bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl px-3 py-1.5 text-xs"
                title={ttsEnabled ? "Turn voice off" : "Turn voice on"}
              >
                {ttsEnabled ? "Voice On" : "Voice Off"}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            onClick={handleLinkClick}
            className="flex-1 max-h-[52vh] overflow-y-auto px-4 py-4 space-y-4 bg-gradient-to-b from-white/60 to-white"
          >
            {!who.ready && <div className="text-gray-500 text-sm pl-1">Loading identity…</div>}
            {who.ready && who.error && (
              <div className="text-amber-700 bg-amber-50 border border-amber-200 text-sm rounded-lg p-2">
                {who.error}. You may need to log in again.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="text-[11px] text-gray-400 pl-1">{m.role === "user" ? "You" : brand}</div>
                <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] leading-relaxed text-[15px] ${
                      m.role === "user"
                        ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md rounded-2xl rounded-br-md"
                        : "bg-white border border-gray-100 text-gray-800 shadow-sm rounded-2xl rounded-bl-md"
                    } px-4 py-2.5`}
                    dangerouslySetInnerHTML={{ __html: linkify(m.content || "") }}
                  />
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-gray-500 pl-1">
                <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" />
                <div className="h-2 w-2 rounded-full bg-gray-300 animate-bounce [animation-delay:150ms]" />
                <div className="h-2 w-2 rounded-full bg-gray-200 animate-bounce [animation-delay:300ms]" />
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={sendMessage} className="border-t border-gray-100 bg-white/80 backdrop-blur px-3 py-3">
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-violet-300">
              <input
                ref={inputRef}
                className="flex-1 outline-none text-[15px] placeholder-gray-400"
                placeholder={!who.ready ? "Loading identity…" : listening ? "Listening…" : "Type or use the mic to speak…"}
                autoComplete="off"
                disabled={!who.ready}
              />
              <button
                type="button"
                onClick={startListening}
                disabled={!sttSupported || !who.ready}
                className={`relative shrink-0 inline-flex items-center justify-center rounded-xl px-2.5 py-2 text-sm border
                  ${listening ? "border-rose-200 text-rose-600 bg-rose-50" : "border-gray-200 text-gray-700 hover:bg-gray-50"} disabled:opacity-50`}
                title={!who.ready ? "Identity not loaded yet" : (sttSupported ? "Speak your question" : "Voice input not supported")}
              >
                <MicIcon active={listening} />
              </button>
              <button
                type="submit"
                disabled={!who.ready}
                className="shrink-0 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition shadow-md disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="currentColor" d="M3.4 20.6 22 12 3.4 3.4 3 10l12 2-12 2z" /></svg>
                Send
              </button>
            </div>
            {sttError && <div className="pt-2 text-xs text-rose-600">{sttError}</div>}
          </form>

          <div className="px-5 py-2 text-[11px] text-gray-400 bg-white/70">
            Secure • Scoped answers for the logged-in investor
          </div>
        </div>
      )}
    </div>
  );
}
