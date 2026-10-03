const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * Length of a string as a person counts it: every character they see is one, full-width or
 * half-width. Counts grapheme clusters, so a surrogate pair (𠮷) or a combined emoji (👨‍👩‍👧) is
 * one, where `String.prototype.length` would say 2 or 8. Use it for every `...MaxLength` in
 * `LIMITS`, in both the UI and the API.
 */
export const charLength = (value: string): number => [...segmenter.segment(value)].length

/** The first `max` characters of `value`, counted the same way as `charLength`. */
export const truncateChars = (value: string, max: number): string =>
  [...segmenter.segment(value)]
    .slice(0, max)
    .map(({ segment }) => segment)
    .join('')
