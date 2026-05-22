import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot } from 'lucide-react'
import { useProfile } from '@/lib/auth'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function greeting(role?: string) {
  if (role === 'admin')   return "Hi! I have access to your full org's call data. Ask me about team performance, scores, or coaching."
  if (role === 'manager') return "Hi! I can see your department's calls and scores. Ask me about your team or coaching insights."
  if (role === 'rep')     return "Hi! I can see your own call performance. Ask me about your scores, strengths, or areas to improve."
  return "Hi! I can help with call performance and coaching insights."
}

export default function ChatWidget() {
  const profile = useProfile()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Set greeting on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: greeting(profile?.role) }])
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const updated: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(updated)
    setLoading(true)

    try {
      const data = await (api as any).chat.send(updated)
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? 'No response.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all',
          open
            ? 'bg-[hsl(222,47%,12%)] border border-[hsl(222,32%,20%)] text-gray-400 hover:text-white'
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        )}
        title={open ? 'Close assistant' : 'Open AI assistant'}
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-80 flex flex-col rounded-xl border border-[hsl(222,32%,15%)] bg-[hsl(222,47%,6%)] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(222,32%,15%)] bg-[hsl(222,47%,8%)]">
            <div className="w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-white leading-tight">AI Assistant</p>
              <p className="text-[10px] text-gray-500">Powered by Claude</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 max-h-80 min-h-[160px]">
            {messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap break-words',
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-[hsl(222,47%,12%)] border border-[hsl(222,32%,18%)] text-gray-200 rounded-bl-sm'
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[hsl(222,47%,12%)] border border-[hsl(222,32%,18%)] rounded-xl rounded-bl-sm px-3 py-2">
                  <span className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-3 border-t border-[hsl(222,32%,15%)]">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={loading}
              placeholder="Ask anything..."
              className="flex-1 bg-[hsl(222,47%,10%)] border border-[hsl(222,32%,18%)] rounded-lg px-3 py-1.5 text-[12px] text-white placeholder-gray-600 outline-none focus:border-blue-500/50 disabled:opacity-50 transition"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition shrink-0"
            >
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
