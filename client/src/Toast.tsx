import { useEffect } from 'react'

/**
 * The losing claimant's message. This is the demo: a row quietly changing
 * colour is indistinguishable from a bug, but "Ella claimed this first"
 * makes the serialized transaction visible to someone watching.
 */
export default function Toast({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  if (!message) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}
