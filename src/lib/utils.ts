import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Create an AbortSignal that times out after the specified milliseconds.
 * Uses AbortController + setTimeout instead of AbortSignal.timeout() to
 * avoid unhandled TimeoutError in the console. The fetch rejects with
 * a DOMException (AbortError) which is caught by .catch() / Promise.allSettled().
 *
 * The abort reason is set to a DOMException with name 'AbortError' so that
 * it does NOT surface as an unhandled console error.
 */
export function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController()
  let timedOut = false
  const id = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('Request timed out', 'AbortError'))
  }, ms)
  // Clean up the timeout if the request finishes or is aborted before the timeout
  controller.signal.addEventListener('abort', () => {
    if (!timedOut) clearTimeout(id)
  })
  return controller.signal
}
