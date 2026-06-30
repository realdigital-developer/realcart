import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Create an AbortSignal that times out after the specified milliseconds.
 * Unlike AbortSignal.timeout(), this does NOT throw a TimeoutError to the
 * console — the fetch simply rejects with an AbortError which is caught
 * by the .catch() or Promise.allSettled() handler.
 */
export function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  // Clean up the timeout if the request finishes before the timeout
  controller.signal.addEventListener('abort', () => clearTimeout(id))
  return controller.signal
}
