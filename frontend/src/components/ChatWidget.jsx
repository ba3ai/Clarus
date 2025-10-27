// frontend/src/components/ChatWidget.jsx
import { useEffect, useRef, useState } from "react";

/**
 * Chat widget with:
 *  - Opening by default
 *  - Voice input (Web Speech API - SpeechRecognition / webkitSpeechRecognition)
 *  - Voice output (Speech Synthesis API)
 */

export default function ChatWidget({
  apiBase = "/api",
  brand = "Clarus AI",
  defaultOpen = true,
  autoSendOnFinal = false, // voice input: send recognized text automatically
  lang = "en-US",          // voice input language
  ttsDefaultEnabled = true // voice output: start with TTS enabled
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  /* -------------------- Voice Input (STT) -------------------- */
  const SpeechRecognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const sttSupported = Boolean(SpeechRecognition);
  const recognizerRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [sttError, setSttError] = useState("");

  /* -------------------- Voice Output (TTS) -------------------- */
  const synth =
    typeof window !== "undefined" ? window.speechSynthesis : undefined;
  const ttsSupported = Boolean(synth);
  const [ttsEnabled, setTtsEnabled] = useState(ttsDefaultEnabled && ttsSupported);
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef(null);

  // Load voices when available (Chrome loads async)
  useEffect(() => {
    if (!ttsSupported) return;

    function loadVoices() {
      const v = synth.getVoices();
      if (v && v.length) {
        setVoices(v);
      }
    }
    loadVoices();
    // Some browsers fire onvoiceschanged
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [ttsSupported, synth]);

  // pick a default English voice if possible
  function pickDefaultVoice() {
    if (!voices.length) return null;
    const english = voices.find((v) => /en/i.test(v.lang));
    return english || voices[0];
    }

  // TTS: speak text
  function speak(text) {
    if (!ttsEnabled || !ttsSupported || !text) return;
    try {
      // stop any current speech
      synth.cancel();
      setSpeaking(false);

      const utt = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utt;
      utt.lang = pickDefaultVoice()?.lang || "en-US";
      utt.voice = pickDefaultVoice() || null;
      utt.rate = 1;   // 0.1–10
      utt.pitch = 1;  // 0–2
      utt.volume = 1; // 0–1

      utt.onstart = () => setSpeaking(true);
      utt.onend = () => setSpeaking(false);
      utt.onerror = () => setSpeaking(false);

      synth.speak(utt);
    } catch {
      // ignore runtime errors; UI stays usable
    }
  }

  // Auto-speak new assistant messages when enabled
  useEffect(() => {
    if (!ttsEnabled || !ttsSupported || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant") {
      // strip markdown-ish **…** and convert <br> to newlines for speech
      const text = (last.content || "")
        .replace(/\*\*/g, "")
        .replace(/<br\s*\/?>/gi, "\n");
      speak(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, ttsEnabled, ttsSupported]);

  // Stop speaking when widget closes or a new user message is sent
  useEffect(() => {
    if (!ttsSupported) return;
    if (!open) {
      synth.cancel();
      setSpeaking(false);
    }
  }, [open, synth, ttsSupported]);

  /* -------------------- Basic UX -------------------- */

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Auto-scroll
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, open]);

  /* -------------------- Send Message -------------------- */

  async function sendMessage(e) {
    if (e) e.preventDefault();
    const text = (inputRef.current?.value || "").trim();
    if (!text) return;

    // Cancel TTS when sending a new message
    if (ttsSupported) {
      synth.cancel();
      setSpeaking(false);
    }

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
    if (data?.type === "metric") {
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
    if (data?.type === "explanation" || data?.type === "nlp") {
      return { role: "assistant", content: data.answer || "" };
    }
    if (data?.error || data?.message) {
      return {
        role: "assistant",
        content: data.error || data.message,
      };
    }
    return { role: "assistant", content: "(No response)" };
  }

  /* -------------------- Voice Input (start/stop) -------------------- */

  const startListening = () => {
    setSttError("");
    if (!sttSupported) {
      setSttError("Voice input not supported in this browser.");
      return;
    }
    if (listening) return;

    try {
      const rec = new SpeechRecognition();
      recognizerRef.current = rec;
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = false; // single utterance

      let finalTranscript = "";

      rec.onstart = () => setListening(true);

      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const transcript = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalTranscript += transcript + " ";
          else interim += transcript;
        }
        // show interim in input (non-destructive)
        if (inputRef.current) {
          const base = inputRef.current.dataset.base || inputRef.current.value;
          if (!inputRef.current.dataset.base) {
            inputRef.current.dataset.base = base;
          }
          inputRef.current.value = (base + " " + interim).trim();
        }
      };

      rec.onerror = (evt) => {
        setSttError(evt.error || "Voice input error");
        setListening(false);
      };

      rec.onend = () => {
        setListening(false);
        if (inputRef.current?.dataset?.base) {
          delete inputRef.current.dataset.base;
        }
        if (finalTranscript.trim()) {
          if (autoSendOnFinal) {
            if (inputRef.current) {
              inputRef.current.value = finalTranscript.trim();
            }
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

  const stopListening = () => {
    const rec = recognizerRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {}
    }
  };

  /* -------------------- Icons -------------------- */

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
      <path fill="currentColor" d="M3.4 20.6 22 12 3.4 3.4 3 10l12 2-12 2z" />
    </svg>
  );

  const MicIcon = ({ active }) => (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${active ? "text-rose-600" : ""}`}>
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93V21h2v-2.07A8 8 0 0 0 20 11h-2Z"
      />
    </svg>
  );

  const SpeakerIcon = ({ on = false }) => (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${on ? "text-emerald-600" : ""}`}>
      <path
        fill="currentColor"
        d="M4 10v4h4l5 4V6L8 10H4Zm12.54 2a4.5 4.5 0 0 0-1.54-3.39v6.78A4.5 4.5 0 0 0 16.54 12Zm2.96-6.36a9 9 0 0 1 0 12.73l-1.41-1.41a7 7 0 0 0 0-9.9l1.41-1.41Z"
      />
    </svg>
  );

  /* -------------------- UI -------------------- */

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* FAB */}
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
            <div className="absolute inset-0 flex items-center justify-between px-5">
              <div className="flex items-center gap-3 text-white">
                <div className="h-10 w-10 rounded-2xl bg-white/20 flex items-center justify-center ring-1 ring-white/30">
                  <Robot className="text-white" />
                </div>
                <div className="leading-tight">
                  <div className="font-semibold text-[15px]">{brand}</div>
                  <div className="text-[12px] flex items-center gap-1 opacity-90">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(255,255,255,0.35)]" />
                    {speaking ? "Speaking…" : "Online"}
                  </div>
                </div>
              </div>

              {/* TTS Toggle */}
              <button
                type="button"
                onClick={() => {
                  if (!ttsSupported) return;
                  // cancel if turning off while speaking
                  if (ttsEnabled && synth) synth.cancel();
                  setSpeaking(false);
                  setTtsEnabled((s) => !s);
                }}
                disabled={!ttsSupported}
                title={
                  ttsSupported
                    ? ttsEnabled
                      ? "Disable voice output"
                      : "Enable voice output"
                    : "Voice output not supported"
                }
                className={`rounded-xl px-3 py-2 text-white/90 hover:text-white border border-white/30 
                ${ttsEnabled ? "bg-white/10" : "bg-white/0"} disabled:opacity-50`}
              >
                <div className="flex items-center gap-2">
                  <SpeakerIcon on={ttsEnabled} />
                  <span className="text-[12px] hidden sm:inline">
                    {ttsEnabled ? "Voice On" : "Voice Off"}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            className="flex-1 max-h-[52vh] overflow-y-auto px-4 py-4 space-y-4 bg-gradient-to-b from-white/60 to-white"
          >

            {messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="text-[11px] text-gray-400 pl-1">
                  {m.role === "user" ? "You" : brand}
                </div>
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
                placeholder={
                  listening ? "Listening…" : "Type or use the mic to speak…"
                }
                autoComplete="off"
              />

              {/* Mic Button */}
              <button
                type="button"
                onClick={listening ? stopListening : startListening}
                disabled={!sttSupported}
                title={
                  sttSupported
                    ? listening
                      ? "Stop voice input"
                      : "Speak your question"
                    : "Voice input not supported"
                }
                className={`relative shrink-0 inline-flex items-center justify-center rounded-xl px-2.5 py-2 text-sm border
                  ${
                    listening
                      ? "border-rose-200 text-rose-600 bg-rose-50"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  } disabled:opacity-50`}
              >
                <MicIcon active={listening} />
                {listening && (
                  <span className="absolute -inset-1 rounded-xl animate-ping bg-rose-200/40" />
                )}
              </button>

              {/* Send */}
              <button
                type="submit"
                className="shrink-0 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition shadow-md"
              >
                <SendIcon />
                Send
              </button>
            </div>
            {sttError && (
              <div className="pt-2 text-xs text-rose-600">{sttError}</div>
            )}
          </form>

          <div className="px-5 py-2 text-[11px] text-gray-400 bg-white/70">
            Secure • Role-aware answers for Admin / GP / Group Admin / Investor
          </div>
        </div>
      )}
    </div>
  );
}
