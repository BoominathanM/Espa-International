import mongoose from 'mongoose'
import Lead from '../models/Lead.js'
import CallLog from '../models/CallLog.js'
import User from '../models/User.js'
import Branch from '../models/Branch.js'
import UserSession from '../models/UserSession.js'
import { getAccessibleBranchIds, leadBranchMatchFromParam } from '../utils/branchAccess.js'
import { normalizeLeadSourceForReport } from '../utils/leadSourceNormalize.js'
import { ONLINE_WINDOW_MS, presenceFromSessions } from '../utils/userPresence.js'
import { parseIstDayStart, parseIstDayEnd, istDateKey } from '../utils/istDateRange.js'

const PRESENCE_ORDER = { online: 0, away: 1, offline: 2 }

// Dashboard tables are paginated 10 per page on the client; these caps give them several pages.
const RECENT_LEADS_LIMIT = 50
const TOP_AGENTS_LIMIT = 50
// The Agent Performance chart keeps showing only the top 10 agents.
const AGENT_CHART_LIMIT = 10

const latestDate = (...dates) => {
  const t = Math.max(0, ...dates.map((d) => (d ? new Date(d).getTime() : 0)))
  return t ? new Date(t) : null
}

/**
 * Live agents for the dashboard card: real users who, in the last 30 minutes, either
 * worked in the CRM (activity heartbeats — any module) or performed any lead action,
 * plus anyone online right now. Automated performers ("System", "ZenXAI AI Inbound",
 * webhooks) are not users, so they never appear.
 *
 * branchCond is the dashboard's Lead.branch condition (ObjectId, { $in: [...] } or undefined).
 */
async function loadLiveAgents({ branchCond, liveSince }) {
  const nowMs = Date.now()

  // aggregate() does not cast like find(): branch ids may arrive as strings for branch-limited users.
  const branchIds = branchCond ? (branchCond.$in ? branchCond.$in : [branchCond]).map(String) : null
  const leadMatch = { 'activityLogs.createdAt': { $gte: liveSince } }
  if (branchIds) {
    leadMatch.branch = {
      $in: branchIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id)),
    }
  }

  const [leadActions, sessions] = await Promise.all([
    Lead.aggregate([
      { $match: leadMatch },
      { $project: { activityLogs: 1 } },
      { $unwind: '$activityLogs' },
      { $match: { 'activityLogs.createdAt': { $gte: liveSince } } },
      {
        $group: {
          _id: '$activityLogs.performedBy',
          actions: { $sum: 1 },
          lastActionAt: { $max: '$activityLogs.createdAt' },
        },
      },
    ]),
    UserSession.find({
      $or: [
        { lastActiveAt: { $gte: liveSince } },
        { endedAt: null, lastSeenAt: { $gte: new Date(nowMs - ONLINE_WINDOW_MS) } },
      ],
    })
      .select('user lastSeenAt lastActiveAt endedAt currentModule currentTab')
      .lean(),
  ])

  const sessionsByUser = new Map()
  for (const s of sessions) {
    const id = String(s.user)
    if (!sessionsByUser.has(id)) sessionsByUser.set(id, [])
    sessionsByUser.get(id).push(s)
  }
  const performerNames = leadActions.map((r) => String(r._id || '').trim()).filter(Boolean)
  if (!sessionsByUser.size && !performerNames.length) return []

  const users = await User.find({
    $or: [{ _id: { $in: [...sessionsByUser.keys()] } }, { name: { $in: performerNames } }],
  })
    .select('name email role status branch branches')
    .lean()

  // Activity logs only store the performer's name: attribute by name when it is unambiguous.
  const byName = new Map()
  for (const u of users) {
    const name = String(u.name || '').trim()
    byName.set(name, byName.has(name) ? null : u)
  }
  const byId = new Map(users.map((u) => [String(u._id), u]))
  const branchSet = branchIds ? new Set(branchIds) : null
  const inBranchScope = (u) =>
    !branchSet || [u.branch, ...(u.branches || [])].some((b) => b && branchSet.has(String(b)))

  const rows = new Map()
  const rowFor = (u) => {
    const id = String(u._id)
    if (!rows.has(id)) rows.set(id, { user: u, actions: 0, lastLeadActionAt: null })
    return rows.get(id)
  }
  for (const r of leadActions) {
    const u = byName.get(String(r._id || '').trim())
    if (!u) continue
    const row = rowFor(u)
    row.actions += r.actions
    row.lastLeadActionAt = latestDate(row.lastLeadActionAt, r.lastActionAt)
  }
  for (const id of sessionsByUser.keys()) {
    const u = byId.get(id)
    if (u && inBranchScope(u)) rowFor(u)
  }

  return [...rows.values()]
    .map(({ user, actions, lastLeadActionAt }) => {
      const userSessions = sessionsByUser.get(String(user._id)) || []
      const presence = presenceFromSessions(userSessions, nowMs)
      const lastActiveAt = latestDate(...userSessions.map((s) => s.lastActiveAt))
      return {
        key: String(user._id),
        name: user.name || 'Unknown',
        email: user.email || '-',
        role: user.role || '-',
        status: user.status || '-',
        actions,
        lastActionAt: latestDate(lastActiveAt, lastLeadActionAt),
        presence: presence.status,
        currentModule: presence.currentModule,
        currentTab: presence.currentTab,
      }
    })
    .sort(
      (a, b) =>
        PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence] ||
        new Date(b.lastActionAt || 0) - new Date(a.lastActionAt || 0)
    )
}

/**
 * Build base filter for leads/calls based on branch and optional date.
 * Non-superadmin users are restricted to their branch.
 */
function buildBaseFilter(req, options = {}) {
  const { branch: branchParam, date } = req.query
  const user = req.user
  const filter = {}

  // Branch: for non-superadmin, force user's branch; else use param (or all)
  if (user.role !== 'superadmin' && !user.allBranches) {
    const ids = getAccessibleBranchIds(user) || []
    if (ids.length === 0) {
      filter._id = { $exists: false }
    } else {
      filter.branch = { $in: ids }
    }
  } else {
    const match = leadBranchMatchFromParam(branchParam)
    if (match) Object.assign(filter, match)
  }

  // Date range for "today" stats
  if (date && options.useDate) {
    const d = new Date(date)
    d.setUTCHours(0, 0, 0, 0)
    const start = new Date(d)
    const end = new Date(d)
    end.setUTCHours(23, 59, 59, 999)
    filter.createdAt = { $gte: start, $lte: end }
  }

  return filter
}

/**
 * Get dashboard summary and charts.
 * GET /api/dashboard?branch=all|branchId&date=YYYY-MM-DD
 */
export const getDashboard = async (req, res) => {
  try {
    const branchParam = req.query.branch
    // "Today" is the IST calendar day (a UTC date would still be yesterday until 05:30 IST)
    const dateStr = req.query.date || istDateKey()
    const user = req.user

    const leadFilter = { ...buildBaseFilter(req, { useDate: false }) }
    const branchFilterForLeads = leadFilter.branch ? { branch: leadFilter.branch } : {}

    // appointment_date is a date-only value stored at UTC midnight: same day bounds as Appointment Bookings
    const todayStart = new Date(dateStr)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date(dateStr)
    todayEnd.setUTCHours(23, 59, 59, 999)
    // Lead/call timestamps: the IST day, like the Calls and Reports date filters
    const istDayStart = parseIstDayStart(dateStr) || todayStart
    const istDayEnd = parseIstDayEnd(dateStr) || todayEnd

    let callFilter = {}
    if (branchFilterForLeads.branch) {
      const leadIdsForBranch = await Lead.find({ branch: branchFilterForLeads.branch }).distinct('_id')
      callFilter = { lead: { $in: leadIdsForBranch } }
    }

    const todayLeadFilter = { ...branchFilterForLeads, createdAt: { $gte: istDayStart, $lte: istDayEnd } }
    const todayCallFilter = {
      ...callFilter,
      $or: [
        { startTime: { $gte: istDayStart, $lte: istDayEnd } },
        { createdAt: { $gte: istDayStart, $lte: istDayEnd } },
      ],
    }

    // Lead Trend (last 7 days): bucket by IST day so the last bar matches "Today's Leads"
    const trendDayKeys = []
    for (let i = 6; i >= 0; i--) trendDayKeys.push(istDateKey(Date.now() - i * 24 * 60 * 60 * 1000))
    const trendSince = parseIstDayStart(trendDayKeys[0])

    const liveSince = new Date(Date.now() - 30 * 60 * 1000)

    // Recent Leads: when a date is picked the client shows only that day's leads, so fetch that
    // IST day instead of the latest N overall (older days would otherwise always come back empty).
    const recentLeadsDateFilter = {}
    if (req.query.date) {
      const dayStart = parseIstDayStart(req.query.date)
      const dayEnd = parseIstDayEnd(req.query.date)
      if (dayStart && dayEnd) recentLeadsDateFilter.createdAt = { $gte: dayStart, $lte: dayEnd }
    }

    const [
      todayLeads,
      callsReceived,
      callsMissed,
      appointmentsToday,
      totalAgents,
      frontOfficeAgents,
      liveAgentsRaw,
      leadTrendRaw,
      sourceDistributionRaw,
      branchActivityRaw,
      agentPerformanceRaw,
      recentLeadsList,
      unassignedLeadsCount,
    ] = await Promise.all([
      Lead.countDocuments(todayLeadFilter),
      CallLog.countDocuments(todayCallFilter),
      CallLog.countDocuments({
        ...todayCallFilter,
        callStatus: {
          $in: [
            /^missed$/i,
            /^no[\s-]?answer$/i,
            /^unanswered$/i,
            /^not[\s-]?answered$/i,
          ],
        },
      }),
      Lead.countDocuments({
        ...branchFilterForLeads,
        appointment_date: { $gte: todayStart, $lte: todayEnd },
      }),
      User.countDocuments({
        status: 'active',
        role: { $ne: 'front office' },
        ...(branchFilterForLeads.branch
          ? {
              $or: [
                { branch: branchFilterForLeads.branch },
                { branches: branchFilterForLeads.branch },
              ],
            }
          : {}),
      }),
      User.countDocuments({
        status: 'active',
        role: 'front office',
        ...(branchFilterForLeads.branch
          ? {
              $or: [
                { branch: branchFilterForLeads.branch },
                { branches: branchFilterForLeads.branch },
              ],
            }
          : {}),
      }),
      // Live agents: users working in the CRM (activity heartbeats) or acting on leads in the last 30 minutes
      loadLiveAgents({ branchCond: branchFilterForLeads.branch, liveSince }),
      Lead.aggregate([
        { $match: branchFilterForLeads },
        {
          $match: {
            createdAt: {
              $gte: trendSince,
              $lte: new Date(),
            },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+05:30' } },
            leads: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Lead.aggregate([
        { $match: branchFilterForLeads },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      (async () => {
        const branches = await Branch.find(branchFilterForLeads.branch ? { _id: branchFilterForLeads.branch } : {}).select('name _id').lean()
        const branchIds = branches.map((b) => b._id)
        const [leadCounts, callCounts] = await Promise.all([
          Lead.aggregate([
            { $match: { branch: { $in: branchIds } } },
            { $group: { _id: '$branch', count: { $sum: 1 } } },
          ]),
          CallLog.aggregate([
            { $match: { lead: { $exists: true, $ne: null } } },
            { $lookup: { from: 'leads', localField: 'lead', foreignField: '_id', as: 'leadDoc' } },
            { $unwind: '$leadDoc' },
            { $match: { 'leadDoc.branch': { $in: branchIds } } },
            { $group: { _id: '$leadDoc.branch', count: { $sum: 1 } } },
          ]),
        ])
        const leadMap = Object.fromEntries(leadCounts.map((c) => [c._id.toString(), c.count]))
        const callMap = Object.fromEntries(callCounts.map((c) => [c._id.toString(), c.count]))
        return branches.map((b) => ({
          name: b.name,
          leads: leadMap[b._id.toString()] || 0,
          calls: callMap[b._id.toString()] || 0,
        })).sort((a, b) => b.leads - a.leads)
      })(),
      Lead.aggregate([
        { $match: branchFilterForLeads },
        { $match: { assignedTo: { $ne: null } } },
        {
          $group: {
            _id: '$assignedTo',
            leads: { $sum: 1 },
            converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } },
          },
        },
        // _id tie-breaker: agents with equal lead counts keep a stable order across refreshes/pages
        { $sort: { leads: -1, _id: 1 } },
        { $limit: TOP_AGENTS_LIMIT },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'branches',
            localField: 'user.branch',
            foreignField: '_id',
            as: 'branch',
          },
        },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            agent: { $ifNull: ['$user.name', 'Unknown'] },
            branch: { $ifNull: ['$branch.name', '-'] },
            leads: 1,
            converted: 1,
            conversionRate: {
              $cond: [
                { $gt: ['$leads', 0] },
                { $concat: [{ $toString: { $round: [{ $multiply: [{ $divide: ['$converted', '$leads'] }, 100] }, 1] } }, '%'] },
                '0%',
              ],
            },
          },
        },
      ]),
      Lead.find({ ...branchFilterForLeads, ...recentLeadsDateFilter })
        .populate('branch', 'name')
        .populate('assignedTo', 'name')
        .sort({ createdAt: -1 })
        .limit(RECENT_LEADS_LIMIT)
        .lean(),
      Lead.countDocuments({ ...branchFilterForLeads, assignedTo: null }),
    ])

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const last7 = trendDayKeys.map((key) => {
      const found = leadTrendRaw.find((r) => r._id === key)
      return {
        name: dayNames[new Date(`${key}T00:00:00Z`).getUTCDay()],
        dateKey: key,
        leads: found ? found.leads : 0,
        calls: 0,
      }
    })
    const callTrendByDay = await CallLog.aggregate([
      { $match: { ...callFilter, createdAt: { $gte: trendSince } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: { $ifNull: ['$startTime', '$createdAt'] }, timezone: '+05:30' } },
          calls: { $sum: 1 },
        },
      },
    ])
    last7.forEach((day) => {
      const c = callTrendByDay.find((x) => x._id === day.dateKey)
      if (c) day.calls = c.calls
    })

    const sourceMap = {
      IVR: '--chart-pie-call',
      WhatsApp: '--chart-pie-wa',
      Facebook: '--chart-pie-fb',
      Insta: '--chart-pie-insta',
      Website: '--chart-pie-web',
      'Walk-in': '--chart-pie-call',
      'Meta Ads': '--chart-pie-fb',
      Import: '--chart-pie-web',
      Referral: '--chart-pie-fb',
      Other: '--chart-pie-web',
    }
    const mergedSourceCounts = {}
    for (const r of sourceDistributionRaw || []) {
      const name = normalizeLeadSourceForReport(r?._id)
      mergedSourceCounts[name] = (mergedSourceCounts[name] || 0) + (r?.count || 0)
    }
    const sourceData = Object.entries(mergedSourceCounts)
      .map(([name, value]) => ({
        name,
        value,
        fillVar: sourceMap[name] || '--chart-pie-web',
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))

    const topAgentsData = agentPerformanceRaw.map((r, i) => ({
      key: String(i + 1),
      agent: r.agent,
      branch: r.branch,
      leads: r.leads,
      calls: 0,
      converted: r.converted,
      conversionRate: r.conversionRate,
    }))

    const recentLeads = recentLeadsList.map((l, i) => ({
      key: (l._id || i).toString(),
      name: [l.first_name, l.last_name].filter(Boolean).join(' ') || '-',
      mobile: l.phone || '-',
      // lets the Leads page open this lead's chat straight away (row click → Lead Details)
      whatsapp: l.whatsapp || l.phone || '',
      source: normalizeLeadSourceForReport(l.source || ''),
      status: l.status || '-',
      branch: l.branch?.name || '-',
      agent: l.assignedTo?.name || '-',
      date: l.createdAt,
    }))

    const liveAgents = liveAgentsRaw || []
    const liveAgentsCount = liveAgents.length

    const alerts = []
    if (callsMissed > 0) {
      alerts.push({ type: 'error', message: `${callsMissed} missed call${callsMissed > 1 ? 's' : ''} need attention` })
    }
    if (unassignedLeadsCount > 0) {
      alerts.push({ type: 'warning', message: `${unassignedLeadsCount} unassigned lead${unassignedLeadsCount > 1 ? 's' : ''}` })
    }
    if (alerts.length === 0) {
      alerts.push({ type: 'info', message: 'No pending alerts' })
    }

    res.json({
      success: true,
      dashboard: {
        stats: {
          todayLeads,
          callsReceived,
          callsMissed,
          appointmentsToday,
          totalAgents,
          frontOfficeAgents,
          offlineAgents: 0,
          liveAgentsCount,
        },
        leadTrend: last7,
        sourceDistribution: sourceData,
        branchActivity: branchActivityRaw,
        agentPerformance: agentPerformanceRaw.slice(0, AGENT_CHART_LIMIT).map((r, i) => ({
          name: r.agent,
          leads: r.leads,
          calls: 0,
          converted: r.converted,
        })),
        topAgents: topAgentsData,
        recentLeads,
        liveAgents,
        alerts,
      },
    })
  } catch (error) {
    console.error('[Dashboard] Error:', error)
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to load dashboard',
    })
  }
}
