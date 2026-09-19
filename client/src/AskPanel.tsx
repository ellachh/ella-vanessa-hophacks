import { useState } from 'react'
import { useProcedure } from 'spacetimedb/react'

import { procedures } from './module_bindings'
import type { LatLng } from './radius'
import './PostForm.css'
import './AskPanel.css'

/** Typing on stage is slow. These cover the demo; the input covers everything else. */
const SUGGESTIONS = ['something sweet', "what's closest", 'expiring soon']

const MAX_QUESTION = 200

type Answer = { text: string; listingId: bigint | null; failed: boolean }

/**
 * Ask the database a question.
 *
 * `ask_scraps` is a `#[procedure]`, not a reducer: it reads the open board in a
 * short transaction, closes it, then calls a language model over HTTPS.
 * Reducers cannot do that and should not — determinism is the property that
 * makes two simultaneous claims resolve to exactly one winner.
 *
 * The call takes a single params object, the same shape as a reducer call.
 */
export default function AskPanel({
  center,
  onRecommend,
}: {
  center: LatLng
  onRecommend: (id: bigint) => void
}) {
  const askScraps = useProcedure(procedures.askScraps)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [busy, setBusy] = useState(false)
  const [wide, setWide] = useState(false)

  async function ask(text: string) {
    const q = text.trim()
    if (!q || busy) return
    setBusy(true)
    setAnswer(null)
    try {
      const result = await askScraps({ question: q, lat: center[0], lng: center[1] })
      setAnswer({
        text: result.answer,
        listingId: result.listingId ?? null,
        failed: result.failed,
      })
    } catch (err) {
      // The procedure returns prose for its own failures; this catches the
      // call never landing at all.
      setAnswer({
        text: err instanceof Error ? err.message : 'Couldn’t reach the assistant.',
        listingId: null,
        failed: true,
      })
    } finally {
      setBusy(false)
    }
  }

  const body = (
    <section className={`ask${wide ? ' ask--wide' : ''}`}>
      <div className="ask__head">
        <h2 className="ask__title">Ask Scraps</h2>
        <button
          type="button"
          className="ask__expand"
          onClick={() => setWide((v) => !v)}
          aria-expanded={wide}
        >
          {wide ? 'Close' : 'Expand'}
        </button>
      </div>
      <p className="ask__lead">What are you in the mood for?</p>

      <form
        className="ask__row"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <input
          id="ask-question"
          className="ask__input"
          value={question}
          maxLength={MAX_QUESTION}
          placeholder="something sweet…"
          aria-label="Ask about pickups"
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button className="btn btn--primary" type="submit" disabled={busy || !question.trim()}>
          {busy ? '…' : 'Ask'}
        </button>
      </form>

      <div className="ask__chips">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => {
              setQuestion(s)
              void ask(s)
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {answer && (
        <div className={`answer${answer.failed ? ' answer--failed' : ''}`}>
          <p className="answer__text">{answer.text}</p>
          {answer.listingId !== null && (
            <button
              type="button"
              className="answer__link"
              onClick={() => onRecommend(answer.listingId!)}
            >
              Show on map →
            </button>
          )}
        </div>
      )}

      <p className="ask__note">
        Answered inside the database — a procedure reads the open board, then calls the model.
      </p>
    </section>
  )

  // Expanded, the same component renders inside PostForm's modal shell. The
  // backdrop closes it, so there is no way to get stuck in the wide view.
  if (wide) {
    return (
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Ask Scraps"
        onClick={(e) => {
          if (e.target === e.currentTarget) setWide(false)
        }}
      >
        {body}
      </div>
    )
  }
  return body
}
