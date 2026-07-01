/**
 * Some EPUBs (especially fan/scanlation releases) put literal placeholder
 * junk in their metadata fields instead of leaving them empty -- "---",
 * "N/A", "Unknown", a lone "-", etc. An empty string is easy to catch with
 * `||`, but these placeholder strings are truthy and slip through, which is
 * why "---" was showing up as if it were a real author name.
 */
const PLACEHOLDER_PATTERNS = [
  /^-+$/,           // "-", "--", "---", ...
  /^_+$/,           // "_", "__", ...
  /^n\/?a$/i,       // "N/A", "NA"
  /^unknown$/i,
  /^tbd$/i,
  /^untitled$/i,
  /^null$/i,
  /^undefined$/i,
]

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return true
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/**
 * Returns a clean display value for an EPUB metadata field, falling back
 * to the given default if the raw value is empty or a known placeholder.
 */
export function sanitizeMetadata(raw: string | undefined | null, fallback: string): string {
  if (!raw) return fallback
  const trimmed = raw.trim()
  return isPlaceholder(trimmed) ? fallback : trimmed
}

export function sanitizeAuthor(raw: string | undefined | null): string {
  return sanitizeMetadata(raw, 'Unknown Author')
}
