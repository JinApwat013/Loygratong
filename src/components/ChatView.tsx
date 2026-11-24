import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Heart, Loader2, Moon, Send, Smile, Sparkles, Star } from 'lucide-react';
import { ChatMessage, PRIVATE_ROOM_ID, RoomUser } from '../types/universe';

interface ChatViewProps {
  currentUser: RoomUser;
  partnerUser: RoomUser | undefined;
  usersMap: Record<string, RoomUser>;
  messages: ChatMessage[];
  typingUserName: string | null;
  onSendMessage: (message: string) => Promise<void>;
  onTypingChange: (isTyping: boolean) => void;
  onBackToRiver: () => void;
}

const GALAXY_EMOJIS = [
  '❤️',
  '💖',
  '🥰',
  '🌙',
  '✨',
  '🪷',
  '🕯️',
  '💫',
  '🌌',
  '🌸',
  '🫶',
  '🥺',
];

function formatMessageTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function formatDayDivider(iso: string): string {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function ChatView({
  currentUser,
  partnerUser,
  usersMap,
  messages,
  typingUserName,
  onSendMessage,
  onTypingChange,
  onBackToRiver,
}: ChatViewProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);

  // Auto-scroll to latest message whenever messages or typingUserName changes
  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, typingUserName]);

  // Clear typing indicator on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
      if (isTypingRef.current) {
        onTypingChange(false);
      }
    };
  }, [onTypingChange]);

  const handleDraftChange = (nextVal: string) => {
    setDraft(nextVal);
    if (errorMsg) setErrorMsg(null);

    const hasText = nextVal.trim().length > 0;
    if (hasText && !isTypingRef.current) {
      isTypingRef.current = true;
      onTypingChange(true);
    } else if (!hasText && isTypingRef.current) {
      isTypingRef.current = false;
      onTypingChange(false);
    }

    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
    }
    if (hasText) {
      typingTimerRef.current = window.setTimeout(() => {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          onTypingChange(false);
        }
      }, 2200);
    }
  };

  const submitMessage = async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setErrorMsg(null);
    setEmojiOpen(false);
    try {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingChange(false);
      }
      await onSendMessage(trimmed);
      setDraft('');
      inputRef.current?.focus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถส่งข้อความได้');
    } finally {
      setSending(false);
    }
  };

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await submitMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitMessage();
    }
  };

  const handleInsertEmoji = (emoji: string) => {
    const next = `${draft}${emoji}`;
    handleDraftChange(next);
    inputRef.current?.focus();
  };

  return (
    <div className="relative mx-auto flex h-[calc(100vh-116px)] max-w-5xl flex-col px-3 py-4 sm:px-6 md:h-[calc(100vh-68px)]">
      {/* Fantasy Galaxy Atmospheric Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-3 inset-y-4 overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_15%_10%,rgba(124,58,237,0.28),transparent_55%),radial-gradient(ellipse_at_85%_20%,rgba(37,99,235,0.24),transparent_50%),radial-gradient(ellipse_at_60%_90%,rgba(244,114,182,0.18),transparent_55%)] sm:inset-x-6"
      >
        <div className="animate-twinkle absolute left-[12%] top-[14%] h-1.5 w-1.5 rounded-full bg-amber-200" />
        <div
          className="animate-twinkle absolute left-[38%] top-[8%] h-1 w-1 rounded-full bg-pink-200"
          style={{ animationDelay: '1.1s' }}
        />
        <div
          className="animate-twinkle absolute right-[18%] top-[16%] h-1.5 w-1.5 rounded-full bg-violet-200"
          style={{ animationDelay: '2.2s' }}
        />
        <div
          className="animate-twinkle absolute right-[28%] bottom-[22%] h-1 w-1 rounded-full bg-sky-200"
          style={{ animationDelay: '0.6s' }}
        />
        <Moon className="absolute right-8 top-6 h-12 w-12 text-amber-200/15" />
        <Heart className="absolute bottom-24 left-8 h-10 w-10 text-pink-300/10" />
      </div>

      {/* Main Glass Chat Shell */}
      <section className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0b0820]/85 shadow-2xl backdrop-blur-xl">
        {/* Chat Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#110c2e]/80 px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-pink-300" />
              <h1 className="font-display truncate text-lg font-semibold tracking-wide text-white sm:text-xl">
                OUR LITTLE CHAT
              </h1>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              {partnerUser ? (
                <>
                  <span>
                    {currentUser.displayName} · สนทนากับ {partnerUser.displayName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Star
                      className={`h-3 w-3 ${
                        partnerUser.onlineStatus
                          ? 'fill-emerald-400 text-emerald-400'
                          : 'fill-slate-500 text-slate-500'
                      }`}
                    />
                    <span className={partnerUser.onlineStatus ? 'text-emerald-300' : 'text-slate-400'}>
                      {partnerUser.onlineStatus ? `${partnerUser.displayName} ออนไลน์` : `${partnerUser.displayName} ออฟไลน์`}
                    </span>
                  </span>
                </>
              ) : (
                <span>เข้าใช้งานในนาม {currentUser.displayName} · รออีกคนเข้ามาสนทนา</span>
              )}
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <span className="font-mono-tabular hidden text-slate-400 sm:inline">
                {PRIVATE_ROOM_ID}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToRiver}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-100 transition-colors hover:bg-white/15 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>กลับสู่แม่น้ำกาแล็กซี</span>
          </button>
        </header>

        {/* Scrollable Message Thread */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-pink-300/25 bg-pink-500/10">
                <Heart className="h-6 w-6 text-pink-300" />
              </div>
              <p className="font-display mt-4 text-lg font-medium text-white">
                {partnerUser
                  ? `ห้องสนทนาของ ${currentUser.displayName} และ ${partnerUser.displayName} ยังว่างอยู่`
                  : `ห้องสนทนาของ ${currentUser.displayName} ยังว่างอยู่`}
              </p>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-400">
                {partnerUser
                  ? `พื้นที่ส่วนตัวสำหรับ ${currentUser.displayName} และ ${partnerUser.displayName} ส่งข้อความทักทายหรือชวนกันไปลอยกระทงได้เลย`
                  : `พื้นที่ส่วนตัวสำหรับ ${currentUser.displayName} พิมพ์ข้อความรอไว้ได้เลย`}
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMine = msg.senderId === currentUser.uid;
              const resolvedSenderName = usersMap[msg.senderId]?.displayName ?? msg.senderName;
              const prevMsg = index > 0 ? messages[index - 1] : null;
              const currDay = formatDayDivider(msg.createdAt);
              const prevDay = prevMsg ? formatDayDivider(prevMsg.createdAt) : '';
              const showDayHeader = currDay !== prevDay;

              return (
                <div key={msg.messageId}>
                  {showDayHeader && (
                    <div className="my-3 flex items-center justify-center">
                      <span className="text-[11px] text-slate-400">{currDay}</span>
                    </div>
                  )}

                  <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
                      <span className={isMine ? 'text-pink-200' : 'text-violet-200'}>
                        {resolvedSenderName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{formatMessageTime(msg.createdAt)}</span>
                    </div>

                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-md sm:max-w-[70%] ${
                        isMine
                          ? 'rounded-br-sm border border-pink-300/25 bg-gradient-to-br from-violet-600/85 to-pink-500/80 text-white'
                          : 'rounded-bl-sm border border-white/15 bg-[#181438]/90 text-slate-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Real-time Partner Typing Indicator */}
          {typingUserName && (
            <div className="flex flex-col items-start">
              <div className="rounded-2xl rounded-bl-sm border border-pink-300/20 bg-[#181438]/80 px-4 py-2 text-xs text-pink-200">
                {typingUserName} กำลังพิมพ์...
              </div>
            </div>
          )}

          <div ref={bottomAnchorRef} />
        </div>

        {/* Emoji Picker & Message Input Bar */}
        <footer className="relative border-t border-white/10 bg-[#100b29]/90 px-3 py-3 sm:px-5">
          {emojiOpen && (
            <div className="mb-2.5 flex flex-wrap gap-1.5 rounded-xl border border-white/15 bg-[#171138] p-2.5 shadow-xl">
              {GALAXY_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleInsertEmoji(emoji)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-colors hover:bg-white/10"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {errorMsg && (
            <p className="mb-2 text-xs text-rose-300" role="alert">
              {errorMsg}
            </p>
          )}

          <form onSubmit={handleFormSubmit} className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setEmojiOpen((prev) => !prev)}
              aria-label="เลือกอีโมจิ"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                emojiOpen
                  ? 'border-pink-400/50 bg-pink-500/20 text-pink-200'
                  : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Smile className="h-5 w-5" />
            </button>

            <textarea
              ref={inputRef}
              rows={1}
              maxLength={1000}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                partnerUser
                  ? `พิมพ์ข้อความถึง${partnerUser.displayName} ในนาม ${currentUser.displayName}... (กด Enter เพื่อส่ง)`
                  : `พิมพ์ข้อความในนาม ${currentUser.displayName}... (กด Enter เพื่อส่ง)`
              }
              className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:border-pink-400/60 focus:bg-white/10 focus:outline-none"
            />

            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="ส่งข้อความ"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 px-4 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-pink-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">ส่งข้อความ</span>
            </button>
          </form>
        </footer>
      </section>
    </div>
  );
}
