import { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles, User, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

const QUICK_QUESTIONS = [
  "Como funciona a dupla eliminação?",
  "O que é o sistema chapéu?",
  "Como cadastrar equipes?",
  "Regras do Beach Tennis",
];

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isLoading) return;

    setInput("");
    setShowQuick(false);
    const userMsg: Message = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const allMessages = [...messages, userMsg];

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || "Erro ao conectar com a IA");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantContent += delta;
              const captured = assistantContent;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: captured };
                return updated;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ ${errorMsg}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (dismissed) return null;

  return (
    <>
      {/* Dismiss button (X acima do botão) */}
      {!open && (
        <button
          onClick={() => setDismissed(true)}
          aria-label="Fechar assistente"
          className="fixed bottom-[82px] right-7 z-50 w-5 h-5 rounded-full bg-[hsl(220_12%_22%)] border border-[hsl(220_10%_30%)] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(220_12%_28%)] transition-all duration-200 shadow-md"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Floating button with glow */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Assistente IA"
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300",
          "bg-[hsl(var(--primary))] shadow-[0_0_24px_hsl(var(--primary)/0.6)]",
          "hover:scale-110 hover:shadow-[0_0_36px_hsl(var(--primary)/0.8)] active:scale-95",
          open && "rotate-45"
        )}
      >
        {open ? (
          <X className="w-6 h-6 text-[hsl(var(--primary-foreground))]" />
        ) : (
          <Sparkles className="w-6 h-6 text-[hsl(var(--primary-foreground))]" />
        )}
      </button>

      {/* Pulse ring */}
      {!open && (
        <span className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-[hsl(var(--primary)/0.3)] animate-ping pointer-events-none" />
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed bottom-24 right-6 z-50 w-[370px] max-w-[calc(100vw-1.5rem)] h-[560px] max-h-[75vh]",
            "flex flex-col rounded-2xl overflow-hidden",
            "border border-[hsl(var(--primary)/0.3)]",
            "bg-[hsl(220_15%_11%)]",
            "shadow-[0_0_60px_hsl(var(--primary)/0.15),0_24px_48px_rgba(0,0,0,0.6)]",
            "animate-in slide-in-from-bottom-4 fade-in duration-300"
          )}
        >
          {/* Header */}
          <div className="relative flex items-center gap-3 px-4 py-3 bg-[hsl(220_15%_14%)] border-b border-[hsl(var(--primary)/0.2)] overflow-hidden">
            {/* Glow line */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary)/0.8)] to-transparent" />

            {/* AI Avatar */}
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(195_85%_35%)] flex items-center justify-center shadow-[0_0_12px_hsl(var(--primary)/0.5)]">
              <Sparkles className="w-5 h-5 text-[hsl(var(--primary-foreground))]" />
              {/* Online dot */}
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[hsl(220_15%_14%)]" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-sm text-[hsl(var(--foreground))] truncate">IA Torneio Pro</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)] font-medium tracking-wide">
                  GEMINI
                </span>
              </div>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Assistente inteligente • Online</p>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(220_15%_20%)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">

            {/* Welcome state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center text-center pt-4 pb-2 gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(195_85%_30%)] flex items-center justify-center shadow-[0_0_30px_hsl(var(--primary)/0.4)]">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="font-bold text-[hsl(var(--foreground))] text-base">Olá! Sou sua IA 🏐</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 leading-relaxed max-w-[240px]">
                    Posso ajudar organizadores e atletas com torneios, regras e como usar o app.
                  </p>
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2.5 items-end",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                    msg.role === "user"
                      ? "bg-[hsl(var(--primary)/0.2)] border border-[hsl(var(--primary)/0.4)]"
                      : "bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(195_85%_30%)] shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
                  )}
                >
                  {msg.role === "user" ? (
                    <User className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-br-sm shadow-[0_0_12px_hsl(var(--primary)/0.3)]"
                      : "bg-[hsl(220_12%_17%)] text-[hsl(var(--foreground))] rounded-bl-sm border border-[hsl(220_10%_25%)]"
                  )}
                >
                  <MarkdownText content={msg.content} />
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
              <div className="flex gap-2.5 items-end">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(195_85%_30%)] flex items-center justify-center shadow-[0_0_8px_hsl(var(--primary)/0.4)]">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-[hsl(220_12%_17%)] border border-[hsl(220_10%_25%)] rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick questions */}
          {showQuick && messages.length === 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.18)] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-[hsl(220_10%_20%)] bg-[hsl(220_15%_12%)] p-3 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte algo sobre o torneio..."
              rows={1}
              className={cn(
                "flex-1 resize-none text-sm outline-none",
                "bg-[hsl(220_12%_17%)] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]",
                "border border-[hsl(220_10%_25%)] rounded-xl px-3 py-2",
                "focus:border-[hsl(var(--primary)/0.5)] focus:shadow-[0_0_0_2px_hsl(var(--primary)/0.1)]",
                "transition-all duration-200 max-h-24 min-h-[38px]"
              )}
              style={{ overflowY: input.split("\n").length > 2 ? "auto" : "hidden" }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={isLoading || !input.trim()}
              className={cn(
                "w-[38px] h-[38px] rounded-xl flex items-center justify-center shrink-0 transition-all duration-200",
                input.trim() && !isLoading
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_0_12px_hsl(var(--primary)/0.5)] hover:shadow-[0_0_20px_hsl(var(--primary)/0.7)] hover:scale-105"
                  : "bg-[hsl(220_12%_17%)] text-[hsl(var(--muted-foreground))] border border-[hsl(220_10%_25%)] cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <Zap className="w-4 h-4 animate-pulse" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function MarkdownText({ content }: { content: string }) {
  if (!content) return <span className="opacity-40 text-xs">digitando...</span>;

  const parts = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\n)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        if (part.startsWith("*") && part.endsWith("*"))
          return <em key={i}>{part.slice(1, -1)}</em>;
        if (part === "\n") return <br key={i} />;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
