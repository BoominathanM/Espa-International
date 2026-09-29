/**
 * Swap one call's note line in a Lead's notes for its newer version.
 *
 * Only a WHOLE line equal to the previous version is replaced — the most recent one, since each
 * call appends its line at the end. A plain substring replace hits the wrong note: ZenXAI's first
 * call.completed arrives without collected data, so a call's first line is the bare
 * "[ZenXAI AI Call-back · Answered]", which is also the start of every EARLIER answered call's
 * note on the same Lead — the next event then overwrote that older note instead of this call's.
 * When no whole line matches (e.g. staff edited it), the new line is appended; nothing is lost.
 *
 * @param {string} notes         the Lead's current notes
 * @param {string} previousLine  what was written for this call before ('' = nothing yet)
 * @param {string} nextLine      this call's line as of now
 * @returns {string} the new notes
 */
export const replaceNoteLine = (notes, previousLine, nextLine) => {
  const text = String(notes || '')
  if (!text) return nextLine
  if (previousLine) {
    let from = text.length
    while (from >= 0) {
      const i = text.lastIndexOf(previousLine, from)
      if (i < 0) break
      const end = i + previousLine.length
      const startsLine = i === 0 || text[i - 1] === '\n'
      const endsLine = end === text.length || text[end] === '\n' || text[end] === '\r'
      if (startsLine && endsLine) return text.slice(0, i) + nextLine + text.slice(end)
      from = i - 1
    }
  }
  return `${text}\n${nextLine}`
}
