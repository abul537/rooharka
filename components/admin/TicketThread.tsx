import { formatPkt } from '@/lib/admin/dates'

/** The messages of one support conversation, oldest first. Text is always shown as plain text. `mine` = which side is the reader. */
export default function TicketThread({ messages, mine }: { messages: { id: string; body: string; fromPlatform: boolean; createdAt: Date }[]; mine: 'store' | 'platform' }) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const own = (mine === 'platform') === m.fromPlatform
        return (
          <li key={m.id} className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${own ? 'ml-auto bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>
            <p className={`mb-1 text-xs ${own ? 'text-slate-300' : 'text-slate-500'}`}>{m.fromPlatform ? 'Rooharka support' : 'Store'} · {formatPkt(m.createdAt)}</p>
            <p className="whitespace-pre-line break-words">{m.body}</p>
          </li>
        )
      })}
    </ol>
  )
}
