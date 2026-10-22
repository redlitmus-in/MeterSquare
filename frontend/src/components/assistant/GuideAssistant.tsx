/**
 * "Ask AI" opens Structo: the MeterSquare assistant that answers questions about using the ERP
 * from the user guide (backend: /api/assistant). It cannot see or change records.
 * Answers can include guide screenshots ("[screenshot: <file>]" lines).
 * Opens as a floating glass panel, or full screen with the expand button.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, FileDown, RotateCcw, Maximize2, Minimize2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { assistantApi, AssistantImage, AssistantStatus, AssistantTurn } from '@/api/assistant';

interface ChatMessage extends AssistantTurn {
  sources?: string[];
  images?: AssistantImage[];
  error?: boolean;
}

const ASSISTANT_NAME = 'Structo';
const GUIDE_PDF_URL = '/MeterSquare-User-Guide.pdf';
const GUIDE_IMAGES_URL = '/user-guide-images';
const SCREENSHOT_LINE = /^\s*\[screenshot:\s*([a-z0-9-]+\.jpg)\s*\]\s*$/i;
const EXPANDED_KEY = 'ask-ai-expanded';
const LAUNCHER_HIDDEN_KEY = 'ask-ai-launcher-hidden';
const storageKey = (userId?: number) => `guide-assistant-chat-${userId ?? 'anon'}`;

// ---------------------------------------------------------------------------
// Minimal, safe markdown rendering for answers (no HTML injection)
// ---------------------------------------------------------------------------

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-b${i++}`} className="font-semibold text-gray-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(
        <code key={`${keyPrefix}-c${i++}`} className="px-1 py-0.5 rounded bg-[#243d8a]/10 text-[12px]">
          {token.slice(1, -1)}
        </code>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Role colours (same palette as the PDF guide)
const ROLE_COLORS: Record<string, string> = {
  admin: '#475569',
  'technical director': '#7c3aed',
  td: '#7c3aed',
  estimator: '#0369a1',
  'project manager': '#1d4ed8',
  pm: '#1d4ed8',
  'mep supervisor': '#0e7490',
  mep: '#0e7490',
  'site engineer': '#c2410c',
  se: '#c2410c',
  procurement: '#047857',
  buyer: '#047857',
  'production manager': '#b45309',
  client: '#be185d',
  vendor: '#4d7c0f',
  system: '#6b7280',
};

const roleColor = (role: string) => ROLE_COLORS[role.toLowerCase()] || '#243d8a';

function FlowDiagram({ lines }: { lines: string[] }) {
  const steps = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.indexOf(':');
      return idx > 0 && idx < 30
        ? { role: l.slice(0, idx).trim(), text: l.slice(idx + 1).trim() }
        : { role: '', text: l };
    });
  return (
    <div className="my-1 rounded-2xl border border-[#243d8a]/10 bg-gradient-to-b from-white/90 to-[#243d8a]/[0.03] p-3">
      <div className="text-[10px] font-bold tracking-wider text-[#243d8a]/70 mb-2">PROCESS FLOW</div>
      <ol>
        {steps.map((step, i) => {
          const color = roleColor(step.role);
          const last = i === steps.length - 1;
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.25 }}
              className="relative flex gap-3 pb-3 last:pb-0"
            >
              {!last && (
                <span
                  className="absolute left-[13px] top-7 bottom-0 w-0.5 rounded-full opacity-40"
                  style={{ background: `linear-gradient(${color}, ${roleColor(steps[i + 1].role)})` }}
                  aria-hidden="true"
                />
              )}
              <span
                className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold shadow-md shrink-0"
                style={{ background: color }}
              >
                {i + 1}
              </span>
              <div
                className="flex-1 min-w-0 rounded-xl border bg-white/90 px-3 py-2 shadow-sm"
                style={{ borderColor: `${color}33` }}
              >
                {step.role && (
                  <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>
                    {step.role}
                  </div>
                )}
                <div className="text-[13px] text-gray-800 leading-snug">{renderInline(step.text, `f${i}`)}</div>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

const FENCE = '```';

// A guide screenshot inside an answer; opens full size in a new tab
function Screenshot({ file, caption }: { file: string; caption: string }) {
  // The guide's screenshots are published as WebP copies (est-new.jpg -> est-new.webp)
  const src = `${GUIDE_IMAGES_URL}/${file.replace(/\.jpg$/i, '.webp')}`;
  return (
    <figure className="my-1">
      <a href={src} target="_blank" rel="noopener noreferrer" title="Open full size">
        <img
          src={src}
          alt={caption}
          loading="lazy"
          className="w-full rounded-xl border border-[#243d8a]/15 shadow-sm hover:shadow-md transition-shadow"
        />
      </a>
      <figcaption className="mt-1 text-[11px] text-gray-500 italic">
        {caption} <span className="not-italic text-gray-400">· sample data</span>
      </figcaption>
    </figure>
  );
}

function AnswerText({ text, images }: { text: string; images?: AssistantImage[] }) {
  const blocks: React.ReactNode[] = [];
  // start: the first number of an ordered list, so steps continue after a screenshot (2., 3., ...)
  let list: { ordered: boolean; items: string[]; start: number } | null = null;
  let fence: { lang: string; lines: string[] } | null = null;

  const flushFence = (key: string) => {
    if (!fence) return;
    if (fence.lang === 'flow') {
      blocks.push(<FlowDiagram key={key} lines={fence.lines} />);
    } else if (fence.lines.some((l) => l.trim())) {
      blocks.push(
        <pre key={key} className="text-xs bg-gray-50 border border-gray-100 rounded-lg p-2 whitespace-pre-wrap">
          {fence.lines.join('\n')}
        </pre>
      );
    }
    fence = null;
  };

  const flushList = (key: string) => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag
        key={key}
        start={list.ordered && list.start > 1 ? list.start : undefined}
        className={`${list.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1 marker:text-[#243d8a]`}
      >
        {list.items.map((item, idx) => (
          <li key={idx}>{renderInline(item, `${key}-${idx}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  text.split('\n').forEach((raw, idx) => {
    const line = raw.trimEnd();
    // Fenced blocks: a "flow" block becomes a visual diagram
    if (line.trim().startsWith(FENCE)) {
      if (fence) {
        flushFence(`fence${idx}`);
      } else {
        flushList(`l${idx}`);
        fence = { lang: line.trim().slice(3).trim().toLowerCase(), lines: [] };
      }
      return;
    }
    if (fence) {
      fence.lines.push(line);
      return;
    }
    // Screenshot tags: only images the server confirmed for this answer
    const shot = line.match(SCREENSHOT_LINE);
    if (shot) {
      const image = images?.find((im) => im.file === shot[1].toLowerCase());
      if (image) {
        flushList(`l${idx}`);
        blocks.push(<Screenshot key={`s${idx}`} file={image.file} caption={image.caption} />);
      }
      return;
    }
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (ordered || bullet) {
      const isOrdered = !!ordered;
      if (!list || list.ordered !== isOrdered) {
        flushList(`l${idx}`);
        list = { ordered: isOrdered, items: [], start: ordered ? Number(ordered[1]) : 1 };
      }
      list.items.push(ordered ? ordered[2] : bullet![1]);
      return;
    }
    flushList(`l${idx}`);
    if (!line.trim()) return;
    if (heading) {
      blocks.push(
        <p key={idx} className="font-bold text-gray-900">
          {renderInline(heading[1], `h${idx}`)}
        </p>
      );
    } else {
      blocks.push(<p key={idx}>{renderInline(line, `p${idx}`)}</p>);
    }
  });
  flushList('end');
  flushFence('fence-end');
  return <div className="space-y-2 leading-relaxed">{blocks}</div>;
}

// ---------------------------------------------------------------------------

const GuideAssistant: React.FC = () => {
  const user = useAuthStore((s) => s.user) as any;
  const [open, setOpen] = useState(false);
  const [launcherHidden, setLauncherHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LAUNCHER_HIDDEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LAUNCHER_HIDDEN_KEY, launcherHidden ? '1' : '0');
    } catch {
      // ignore
    }
  }, [launcherHidden]);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(EXPANDED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore this tab's conversation
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey(user?.user_id));
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      // storage unavailable: start empty
    }
  }, [user?.user_id]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(user?.user_id), JSON.stringify(messages.slice(-30)));
    } catch {
      // ignore
    }
  }, [messages, user?.user_id]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, expanded ? '1' : '0');
    } catch {
      // ignore
    }
  }, [expanded]);

  useEffect(() => {
    if (open && !status) {
      assistantApi.getStatus().then(setStatus).catch(() => setStatus(null));
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open, status]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, expanded]);

  if (!user) return null;

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || sending) return;
    const history: AssistantTurn[] = messages
      .filter((m) => !m.error)
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    try {
      const result = await assistantApi.ask(text, history);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.answer, sources: result.sources, images: result.images },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: error.response?.data?.error || 'Sorry, I could not answer right now. Please try again.',
          error: true,
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(input);
    }
  };

  const notConfigured = status && !status.configured;
  const firstName = user.full_name?.split(' ')[0] || 'there';

  // Panel geometry. Width/height/position are animated as real CSS values (not scale
  // transforms), so the panel grows to full screen smoothly and text never stretches.
  const isMobile = viewport.w < 640;
  const panelBox = expanded
    ? { width: viewport.w, height: viewport.h, right: 0, bottom: 0, borderRadius: 0 }
    : isMobile
      ? { width: viewport.w, height: Math.round(viewport.h * 0.8), right: 0, bottom: 0, borderRadius: 20 }
      : { width: 360, height: Math.min(540, viewport.h - 40), right: 20, bottom: 20, borderRadius: 24 };

  return (
    <>
      {/* Launcher: full "Ask AI" button at the bottom right. The user can hide it with ×;
          a thin handle stays on the right edge to bring it back (choice is remembered). */}
      <AnimatePresence mode="wait">
        {!open && !launcherHidden && (
          <motion.div
            key="ask-ai-launcher"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 right-4 z-[90]"
          >
            <button
              onClick={() => setOpen(true)}
              aria-label="Ask AI about MeterSquare"
              className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-lg
                         bg-white/80 backdrop-blur-md bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10
                         text-[#243d8a] border border-[#243d8a]/20 shadow-md hover:shadow-lg hover:to-[#243d8a]/15 transition-shadow
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#243d8a]/40"
            >
              <span className="p-1.5 rounded-md bg-[#243d8a] shadow-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </span>
              <span className="text-xs font-semibold">Ask AI</span>
            </button>
            <button
              onClick={() => setLauncherHidden(true)}
              aria-label="Hide the Ask AI button"
              title="Hide (open again from the handle on the right edge)"
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-gray-200 shadow
                         flex items-center justify-center text-gray-500 hover:text-red-600 hover:border-red-200"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
        {!open && launcherHidden && (
          <motion.button
            key="ask-ai-handle"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
            onClick={() => setLauncherHidden(false)}
            aria-label="Show the Ask AI button"
            title="Ask AI"
            className="group fixed bottom-6 right-0 z-[90] h-12 w-2 hover:w-3 rounded-l-full
                       bg-gradient-to-b from-[#243d8a] to-[#4f6fd6] shadow-md transition-all duration-200
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#243d8a]/40"
          />
        )}
      </AnimatePresence>

      {/* Panel: one element that smoothly resizes between the corner panel and full screen */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={`${ASSISTANT_NAME}: MeterSquare assistant`}
            style={{ position: 'fixed' }}
            initial={{ opacity: 0, y: 24, ...panelBox }}
            animate={{ opacity: 1, y: 0, ...panelBox }}
            exit={{ opacity: 0, y: 24 }}
            transition={{
              default: { type: 'spring', stiffness: 260, damping: 32, mass: 0.9 },
              opacity: { duration: 0.18 },
            }}
            className={`z-[90] flex flex-col overflow-hidden
                        bg-white/75 backdrop-blur-2xl border border-white/70
                        shadow-[0_24px_60px_-12px_rgba(20,33,61,0.35)] ring-1 ring-[#243d8a]/10`}
          >
            {/* Header */}
            <div className="relative px-3 py-2.5 flex items-center gap-2.5 border-b border-white/60 bg-gradient-to-r from-[#243d8a]/10 via-white/40 to-[#4f6fd6]/10">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-[#243d8a] to-[#4f6fd6] shadow-md">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-[13px] text-gray-900 flex items-center gap-2">
                  {ASSISTANT_NAME}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#243d8a]/10 text-[#243d8a]">
                    MeterSquare
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 truncate">
                  Answers from the user guide{status?.role ? ` · You: ${status.role}` : ''}
                </div>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  aria-label="Start a new conversation"
                  title="New conversation"
                  className="p-2 rounded-xl text-gray-600 hover:bg-white/70 hover:text-[#243d8a] transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? 'Exit full screen' : 'Open full screen'}
                title={expanded ? 'Exit full screen' : 'Full screen'}
                className="p-2 rounded-xl text-gray-600 hover:bg-white/70 hover:text-[#243d8a] transition-colors"
              >
                {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setExpanded(false);
                }}
                aria-label="Close"
                className="p-2 rounded-xl text-gray-600 hover:bg-white/70 hover:text-red-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto bg-gradient-to-b from-[#243d8a]/[0.04] via-transparent to-[#4f6fd6]/[0.05]"
            >
              <div className={`${expanded ? 'max-w-3xl mx-auto px-6 py-6' : 'px-4 py-4'} space-y-3`}>
                {messages.length === 0 && (
                  <div className="space-y-4">
                    <div className={`${expanded ? 'pt-6 pb-2 text-center' : ''}`}>
                      {expanded && (
                        <div className="mx-auto mb-3 w-11 h-11 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-[#243d8a] to-[#4f6fd6] shadow-lg">
                          <Sparkles className="w-5 h-5" />
                        </div>
                      )}
                      <div className={`font-extrabold text-gray-900 ${expanded ? 'text-xl' : 'text-sm'}`}>
                        Hi {firstName}, I'm {ASSISTANT_NAME}. How can I help?
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Ask me how to do anything in MeterSquare: screens, steps, statuses or who approves what.
                      </div>
                    </div>
                    {notConfigured && (
                      <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900">
                        {ASSISTANT_NAME} is not configured yet. You can still download the full user guide below.
                      </div>
                    )}
                    {!!status?.suggestions?.length && !notConfigured && (
                      <div className={`grid gap-2 ${expanded ? 'sm:grid-cols-2' : ''}`}>
                        {status.suggestions.map((q) => (
                          <button
                            key={q}
                            onClick={() => ask(q)}
                            className="flex items-start gap-2 text-left text-xs px-3 py-2 rounded-xl border border-white/80 bg-white/70 backdrop-blur
                                       shadow-sm hover:border-[#243d8a]/40 hover:bg-white hover:text-[#243d8a] transition-all"
                          >
                            <Sparkles className="w-3.5 h-3.5 mt-0.5 text-[#4f6fd6] shrink-0" />
                            <span>{q}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {messages.map((m, idx) =>
                  m.role === 'user' ? (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-end"
                    >
                      <div className="max-w-[85%] text-[13px] text-white rounded-2xl rounded-br-md px-3 py-2 whitespace-pre-wrap bg-gradient-to-br from-[#243d8a] to-[#3b5bc4] shadow-md">
                        {m.content}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start gap-2"
                    >
                      <div className="w-6 h-6 mt-0.5 rounded-lg flex items-center justify-center text-white bg-gradient-to-br from-[#243d8a] to-[#4f6fd6] shrink-0">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div
                        className={`max-w-[88%] text-[13px] rounded-2xl rounded-tl-md px-3 py-2.5 border shadow-sm ${
                          m.error
                            ? 'bg-red-50/90 border-red-200 text-red-800'
                            : 'bg-white/85 backdrop-blur border-white/80 text-gray-700'
                        }`}
                      >
                        <AnswerText text={m.content} images={m.images} />
                        {!!m.sources?.length && (
                          <div className="mt-2.5 pt-2 border-t border-gray-100">
                            <div className="text-[10px] font-bold tracking-wide text-gray-400 mb-1">FROM THE GUIDE</div>
                            <div className="flex flex-wrap gap-1">
                              {m.sources.map((s) => (
                                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#243d8a]/[0.07] text-[#243d8a]">
                                  {s.split(' › ').slice(-1)[0]}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )
                )}

                {sending && (
                  <div className="flex justify-start gap-2" aria-live="polite">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white bg-gradient-to-br from-[#243d8a] to-[#4f6fd6]">
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    </div>
                    <div className="bg-white/85 backdrop-blur border border-white/80 rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1.5 shadow-sm">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-2 h-2 rounded-full bg-[#243d8a]/60"
                          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
                        />
                      ))}
                      <span className="ml-1 text-xs text-gray-500">Thinking…</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Input */}
            <div className="border-t border-white/60 bg-white/60 backdrop-blur-xl">
              <div className={`${expanded ? 'max-w-3xl mx-auto px-6' : 'px-3'} py-3 space-y-2`}>
                <div className="flex items-end gap-2 rounded-2xl bg-white/90 border border-gray-200 focus-within:border-[#243d8a] focus-within:ring-2 focus-within:ring-[#243d8a]/20 p-1.5 shadow-sm transition-all">
                  <label className="sr-only" htmlFor="ask-ai-input">
                    Your question
                  </label>
                  <textarea
                    id="ask-ai-input"
                    ref={inputRef}
                    rows={1}
                    value={input}
                    maxLength={1500}
                    disabled={!!notConfigured}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={notConfigured ? 'Ask AI is not configured' : 'Ask anything about MeterSquare...'}
                    className="flex-1 resize-none max-h-32 bg-transparent px-2 py-1.5 text-[13px] focus:outline-none disabled:opacity-60"
                  />
                  <button
                    onClick={() => ask(input)}
                    disabled={!input.trim() || sending || !!notConfigured}
                    aria-label="Send"
                    className="p-2 rounded-lg text-white bg-gradient-to-br from-[#243d8a] to-[#4f6fd6] shadow hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-500 px-1">
                  <span>Enter to send · Shift+Enter for a new line</span>
                  <a
                    href={GUIDE_PDF_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-semibold text-[#243d8a] hover:underline"
                  >
                    <FileDown className="w-3.5 h-3.5" /> User guide (PDF)
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default GuideAssistant;
