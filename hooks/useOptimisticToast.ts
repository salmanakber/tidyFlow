"use client"

/**
 * Small optimistic UI helper for ops pages.
 * Shows an optimistic message immediately, then rolls back on failure.
 */
import { useCallback, useState } from "react"

export type OptimisticToast = {
  ok: boolean
  text: string
} | null

export type RunOptimisticArgs = {
  optimisticMessage: string
  action: () => Promise<unknown>
  onRollbackMessage?: string
}

export function useOptimisticToast() {
  const [toast, setToast] = useState<OptimisticToast>(null)

  const clearToast = useCallback(() => setToast(null), [])

  const runOptimistic = useCallback(
    async ({ optimisticMessage, action, onRollbackMessage }: RunOptimisticArgs) => {
      setToast({ ok: true, text: optimisticMessage })
      try {
        const result = await action()
        return result
      } catch (err) {
        setToast({
          ok: false,
          text: onRollbackMessage || "Something went wrong — changes were not saved",
        })
        throw err
      }
    },
    []
  )

  return { toast, setToast, clearToast, runOptimistic }
}

/** Standalone helper when the page already owns toast state. */
export async function runOptimistic({
  optimisticMessage,
  action,
  onRollbackMessage,
  setToast,
}: RunOptimisticArgs & {
  setToast: (t: OptimisticToast) => void
}) {
  setToast({ ok: true, text: optimisticMessage })
  try {
    return await action()
  } catch (err) {
    setToast({
      ok: false,
      text: onRollbackMessage || "Something went wrong — changes were not saved",
    })
    throw err
  }
}
