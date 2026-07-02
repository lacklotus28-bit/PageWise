import { useEffect, RefObject } from 'react'

/**
 * Calls `onOutside` when a pointerdown happens outside of `ref`'s element.
 * Only listens while `active` is true, so callers can pass their open/closed
 * state directly instead of remembering to conditionally mount the hook.
 *
 * `ignoreRefs` lets you exclude a toggle button from counting as "outside" —
 * without it, clicking the same button that opened the panel would close it
 * (via this hook) and then immediately reopen it (via the button's own
 * onClick toggle) in the same gesture.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  onOutside: () => void,
  active: boolean = true,
  ignoreRefs: RefObject<HTMLElement>[] = []
) {
  useEffect(() => {
    if (!active) return

    const handler = (e: MouseEvent) => {
      const el = ref.current
      if (!el || el.contains(e.target as Node)) return
      if (ignoreRefs.some((r) => r.current?.contains(e.target as Node))) return
      onOutside()
    }

    // mousedown (not click) so it fires before the new target's own click
    // handler, matching how native dropdowns/menus typically behave.
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, onOutside, active, ...ignoreRefs])
}
