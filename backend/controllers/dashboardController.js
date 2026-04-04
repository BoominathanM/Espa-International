import Lead from '../models/Lead.js'
import CallLog from '../models/CallLog.js'
import User from '../models/User.js'
import Branch from '../models/Branch.js'
import { getAccessibleBranchIds, leadBranchMatchFromParam } from '../utils/branchAccess.js'

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
    const dateStr = req.query.date || new Date().toISOString().split('T')[0]
    const user = req.user

    const leadFilter = { ...buildBaseFilter(req, { useDate: false }) }
    const branchFilterForLeads = leadFilter.branch ? { branch: leadFilter.branch } : {}

    const todayStart = new Date(dateStr)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date(dateStr)
    todayEnd.setUTCHours(23, 59, 59, 999)

    let callFilter = {}
    if (branchFilterForLeads.branch) {
      const leadIdsForBranch = await Lead.find({ branch: branchFilterForLeads.branch }).distinct('_id')
      callFilter = { lead: { $in: leadIdsForBranch } }
    }

    const todayLeadFilter = { ...branchFilterForLeads, createdAt: { $gte: todayStart, $lte: todayEnd } }
    const todayCallFilter = {
      ...callFilter,
      $or: [
        { startTime: { $gte: todayStart, $lte: todayEnd } },
        { createdAt: { $gte: todayStart, $lte: todayEnd } },
      ],
    }

    const [
      todayLeads,
      callsReceived,
      callsMissed,
      appointmentsToday,
      totalAgents,
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
        ...(branchFilterForLeads.branch
          ? {
              $or: [
                { branch: branchFilterForLeads.branch },
                { branches: branchFilterForLeads.branch },
              ],
            }
          : {}),
      }),
      Lead.aggregate([
        { $match: branchFilterForLeads },
        {
          $match: {
            createdAt: {
              $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              $lte: new Date(),
            },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
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
        { $sort: { leads: -1 } },
        { $limit: 10 },
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
      Lead.find(branchFilterForLeads)
        .populate('branch', 'name')
        .populate('assignedTo', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Lead.countDocuments({ ...branchFilterForLeads, assignedTo: null }),
    ])

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const last7 = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      const found = leadTrendRaw.find((r) => r._id === key)
      last7.push({
        name: dayNames[d.getDay()],
        dateKey: key,
        leads: found ? found.leads : 0,
        calls: 0,
      })
    }
    const callTrendByDay = await CallLog.aggregate([
      { $match: { ...callFilter, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: { $ifNull: ['$startTime', '$createdAt'] } } },
          calls: { $sum: 1 },
        },
      },
    ])
    last7.forEach((day) => {
      const c = callTrendByDay.find((x) => x._id === day.dateKey)
      if (c) day.calls = c.calls
    })

    const sourceMap = {
      Call: '--chart-pie-call',
      WhatsApp: '--chart-pie-wa',
      Facebook: '--chart-pie-fb',
      Insta: '--chart-pie-insta',
      Website: '--chart-pie-web',
      Add: '--chart-pie-call',
      Import: '--chart-pie-web',
      'Walk-in': '--chart-pie-call',
      Referral: '--chart-pie-fb',
      Other: '--chart-pie-web',
    }
    const sourceData = sourceDistributionRaw.map((r) => ({
      name: r._id || 'Other',
      value: r.count,
      fillVar: sourceMap[r._id] || '--chart-pie-web',
    }))

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
      source: l.source || '-',
      status: l.status || '-',
      branch: l.branch?.name || '-',
      agent: l.assignedTo?.name || '-',
      date: l.createdAt,
    }))

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
          offlineAgents: 0,
        },
        leadTrend: last7,
        sourceDistribution: sourceData,
        branchActivity: branchActivityRaw,
        agentPerformance: agentPerformanceRaw.map((r, i) => ({
          name: r.agent,
          leads: r.leads,
          calls: 0,
          converted: r.converted,
        })),
        topAgents: topAgentsData,
        recentLeads,
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
