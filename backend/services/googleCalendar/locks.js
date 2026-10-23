/**
 * In-process keyed lock: work for the same key (an appointment, a calendar) runs one at a time,
 * so a CRM push and a Google change for one appointment never interleave. Not re-entrant.
 */
const tails = new Map()

export function withKeyLock(key, fn) {
  const previous = tails.get(key) || Promise.resolve()
  const run = previous.then(() => fn())
  const tail = run.catch(() => {})
  tails.set(key, tail)
  tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key)
  })
  return run
}
