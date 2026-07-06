import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Create an AbortSignal that times out after the specified milliseconds.
 *
 * Uses AbortController + setTimeout. When the timeout fires, calls
 * controller.abort() WITHOUT a custom DOMException — this prevents
 * "Request timed out" from appearing in the browser console as an
 * unhandled error. The native AbortError ("The user aborted a request.")
 * is caught by .catch() / Promise.allSettled() and is silent in the console.
 *
 * The timeout is auto-cleaned when the signal is aborted (either by the
 * timeout or by an external controller.abort() call), preventing dangling
 * timers that could fire after the fetch has already completed.
 */
export function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  // Clean up the timeout if the signal is aborted externally (e.g., component
  // unmount cleanup). If the timeout itself triggered the abort, the timer
  // has already fired so clearTimeout is a safe no-op.
  controller.signal.addEventListener('abort', () => clearTimeout(id), { once: true })
  return controller.signal
}
