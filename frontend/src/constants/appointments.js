import dayjs from 'dayjs'

/** Operating window: first start 10:00, last end 22:00 (10 PM). */
const DAY_START_MIN = 10 * 60
const DAY_END_MIN = 22 * 60

export const SPA_PACKAGES = [
  'Bali Signature (2 Hours)',
  'Bamboo Massage (2 Hours)',
  'Banana Leaf Spa (2.20 hours)',
  'Couple Combo (2 Hours)',
  'Cucumber Full Body Facial Signature (2 Hours)',
  'E Spa Signature (2 Hours)',
  'Full Body Facial Signature (2 Hours)',
  'Hot Stone Massage (2 Hours)',
  'Thailand Balm Signature (2 Hours)',
  'Thailand Signature (2 Hours)',
  'Thai massage (1 Hour)',
  'Deep tissue (1 Hour)',
  'Swedish massage (1 Hour)',
  'Aroma therapy (1 Hour)',
  'Chocolate scrub (1 Hour)',
  'Wine massage (1 Hour)',
  'Combo 1 (1.30 Hours)',
  'Combo 2 (1.30 Hours)',
]

function formatTime12FromMinutes(totalMins) {
  const h24 = Math.floor(totalMins / 60)
  const m = totalMins % 60
  const d = dayjs().hour(h24).minute(m).second(0).millisecond(0)
  if (m === 0) return d.format('h A')
  return d.format('h:mm A')
}

function makeRangeLabel(startM, endM) {
  return `${formatTime12FromMinutes(startM)} - ${formatTime12FromMinutes(endM)}`
}

function buildTwoHourSlots() {
  const out = []
  for (let start = DAY_START_MIN; start + 120 <= DAY_END_MIN; start += 120) {
    out.push(makeRangeLabel(start, start + 120))
  }
  return out
}

function buildOneHourSlots() {
  const out = []
  for (let start = DAY_START_MIN; start + 60 <= DAY_END_MIN; start += 60) {
    out.push(makeRangeLabel(start, start + 60))
  }
  return out
}

function buildOnePointFiveHourSlots() {
  const out = []
  const duration = 90
  for (let start = DAY_START_MIN; start + duration <= DAY_END_MIN; start += duration) {
    out.push(makeRangeLabel(start, start + duration))
  }
  return out
}

/** 2 hours 20 minutes — e.g. 10 AM–12:20 PM, 12:20 PM–2:40 PM, … through 7:20 PM–9:40 PM. */
function buildTwoHoursTwentySlots() {
  const out = []
  const duration = 140
  for (let start = DAY_START_MIN; start + duration <= DAY_END_MIN; start += duration) {
    out.push(makeRangeLabel(start, start + duration))
  }
  return out
}

export const SLOT_TIMES_2H = buildTwoHourSlots()
export const SLOT_TIMES_1H = buildOneHourSlots()
export const SLOT_TIMES_1_5H = buildOnePointFiveHourSlots()
export const SLOT_TIMES_2H20 = buildTwoHoursTwentySlots()

/** Every distinct slot label, earliest first (calendar + filters). */
export const ALL_SLOT_TIMES_CHRONO = [
  ...new Set([...SLOT_TIMES_2H, ...SLOT_TIMES_2H20, ...SLOT_TIMES_1H, ...SLOT_TIMES_1_5H]),
].sort(
  (a, b) => {
    const ra = parseSlotTimeRange(a)
    const rb = parseSlotTimeRange(b)
    if (!ra || !rb) return String(a).localeCompare(String(b))
    return ra.startM - rb.startM
  },
)

/**
 * Slot dropdown options for a spa package (by duration in the label).
 * Unknown / empty package → 2-hour slots (legacy default for reschedule / imports).
 */
export function getSlotTimesForSpaPackage(packageName) {
  const p = (packageName || '').trim()
  if (!p) return [...SLOT_TIMES_2H]
  if (/\(1\.30 Hours\)/i.test(p)) return [...SLOT_TIMES_1_5H]
  if (/\(1 Hour\)/i.test(p)) return [...SLOT_TIMES_1H]
  if (/\(2\.20 hours\)/i.test(p)) return [...SLOT_TIMES_2H20]
  if (/\(2 Hours\)/i.test(p)) return [...SLOT_TIMES_2H]
  return [...SLOT_TIMES_2H]
}

/** Include current value when editing legacy / mismatched data. */
export function slotTimesWithCurrent(packageName, currentSlot) {
  const slots = getSlotTimesForSpaPackage(packageName)
  const cur = currentSlot != null && String(currentSlot).trim() ? String(currentSlot).trim() : ''
  if (cur && !slots.includes(cur)) return [cur, ...slots]
  return slots
}

function parseTimePartMinutes(part) {
  const s = String(part).trim()
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  if (Number.isNaN(h) || h < 1 || h > 12 || Number.isNaN(min) || min < 0 || min > 59) return null
  const ap = m[3].toUpperCase()
  let h24
  if (ap === 'AM') {
    h24 = h === 12 ? 0 : h
  } else {
    h24 = h === 12 ? 12 : h + 12
  }
  return h24 * 60 + min
}

/**
 * Parse slot labels like "11:30 AM - 1 PM" or "10 AM - 12 PM".
 * Returns start/end minutes from midnight plus integer hours for legacy checks.
 */
export function parseSlotTimeRange(slot) {
  if (!slot || typeof slot !== 'string') return null
  const idx = slot.indexOf(' - ')
  if (idx === -1) return null
  const left = slot.slice(0, idx).trim()
  const right = slot.slice(idx + 3).trim()
  const startM = parseTimePartMinutes(left)
  const endM = parseTimePartMinutes(right)
  if (startM === null || endM === null) return null
  if (endM <= startM) return null
  return {
    startHour: Math.floor(startM / 60),
    endHour: Math.floor(endM / 60),
    startM,
    endM,
  }
}

export function isWithinPackageScheduleHours(range) {
  if (!range || typeof range.startM !== 'number' || typeof range.endM !== 'number') return false
  return range.startM >= DAY_START_MIN && range.endM <= DAY_END_MIN
}
