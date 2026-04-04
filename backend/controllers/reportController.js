import Lead from '../models/Lead.js'
import CallLog from '../models/CallLog.js'
import { getAccessibleBranchIds, leadBranchMatchFromParam } from '../utils/branchAccess.js'

function buildLeadBranchFilter(req) {
  const { branch: branchParam } = req.query
  const user = req.user
  const filter = {}
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
  return filter
}

function parseRange(req) {
  const to = req.query.dateTo || new Date().toISOString().split('T')[0]
  const from =
    req.query.dateFrom ||
    (() => {
      const d = new Date(to)
      d.setUTCDate(d.getUTCDate() - 29)
      return d.toISOString().split('T')[0]
    })()
  const start = new Date(from)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setUTCHours(23, 59, 59, 999)
  return { from, to, start, end }
}

const SOURCE_COLORS = {
  Call: '#D4AF37',
  WhatsApp: '#25D366',
  Facebook: '#1877F2',
  Insta: '#E4405F',
  Website: '#722ed1',
  Add: '#D4AF37',
  Import: '#9B59B6',
  Other: '#888888',
}

/**
 * GET /api/reports?branch=&dateFrom=&dateTo=
 */
export const getReports = async (req, res) => {
  try {
    const branchFilter = buildLeadBranchFilter(req)
    const { start, end, from, to } = parseRange(req)
    const createdMatch = { ...branchFilter, createdAt: { $gte: start, $lte: end } }

    const callTimeMatch = { start_time: { $gte: start, $lte: end } }
    let callLeadFilter = {}
    if (branchFilter.branch) {
      const ids = await Lead.find({ branch: branchFilter.branch }).distinct('_id')
      callLeadFilter = { lead: { $in: ids } }
    }

    const [
      totalsAgg,
      dailyAgg,
      sourceAgg,
      agentLeadAgg,
      branchAgg,
      callTypeAgg,
      callStatusAgg,
      totalCallsInRange,
      phoneBuckets,
    ] = await Promise.all([
      Lead.aggregate([
        { $match: createdMatch },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } },
            lost: { $sum: { $cond: [{ $eq: ['$status', 'Lost'] }, 1, 0] } },
          },
        },
      ]),
      Lead.aggregate([
        { $match: createdMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: 1 },
            converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } },
            lost: { $sum: { $cond: [{ $eq: ['$status', 'Lost'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Lead.aggregate([
        { $match: createdMatch },
        { $group: { _id: { $ifNull: ['$source', 'Other'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Lead.aggregate([
        { $match: { ...createdMatch, assignedTo: { $ne: null } } },
        {
          $group: {
            _id: '$assignedTo',
            leads: { $sum: 1 },
            converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } },
          },
        },
        { $sort: { leads: -1 } },
        { $limit: 20 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      ]),
      Lead.aggregate([
        { $match: createdMatch },
        { $group: { _id: '$branch', leads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } } } },
        {
          $lookup: {
            from: 'branches',
            localField: '_id',
            foreignField: '_id',
            as: 'b',
          },
        },
        { $unwind: { path: '$b', preserveNullAndEmptyArrays: true } },
        { $sort: { leads: -1 } },
        { $limit: 20 },
      ]),
      CallLog.aggregate([{ $match: { ...callTimeMatch, ...callLeadFilter } }, { $group: { _id: '$call_type', count: { $sum: 1 } } }]),
      CallLog.aggregate([{ $match: { ...callTimeMatch, ...callLeadFilter } }, { $group: { _id: '$call_status', count: { $sum: 1 } } }]),
      CallLog.countDocuments({ ...callTimeMatch, ...callLeadFilter }),
      Lead.aggregate([
        { $match: createdMatch },
        { $match: { phone: { $nin: ['', null] } } },
        { $group: { _id: '$phone', n: { $sum: 1 } } },
      ]),
    ])

    const t = totalsAgg[0] || { total: 0, converted: 0, lost: 0 }
    const totalLeads = t.total || 0
    const converted = t.converted || 0
    const lost = t.lost || 0
    const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 1000) / 10 : 0

    const msPerDay = 86400000
    const rangeDays = Math.ceil((end - start) / msPerDay) + 1
    const useMonthly = rangeDays > 45

    let performanceTrend = []
    if (useMonthly) {
      const byMonth = {}
      dailyAgg.forEach((row) => {
        const m = row._id.slice(0, 7)
        if (!byMonth[m]) byMonth[m] = { leads: 0, converted: 0, lost: 0 }
        byMonth[m].leads += row.total
        byMonth[m].converted += row.converted
        byMonth[m].lost += row.lost
      })
      performanceTrend = Object.keys(byMonth)
        .sort()
        .map((k) => ({
          name: k,
          leads: byMonth[k].leads,
          converted: byMonth[k].converted,
          lost: byMonth[k].lost,
        }))
    } else {
      performanceTrend = dailyAgg.map((row) => {
        const d = new Date(row._id + 'T12:00:00Z')
        return {
          name: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
          leads: row.total,
          converted: row.converted,
          lost: row.lost,
        }
      })
    }

    const detailsTable = [...dailyAgg]
      .reverse()
      .map((row, i) => {
        const rate = row.total > 0 ? Math.round((row.converted / row.total) * 1000) / 10 : 0
        return {
          key: String(i),
          date: row._id,
          total: row.total,
          converted: row.converted,
          lost: row.lost,
          rate,
        }
      })

    const sourceDistribution = sourceAgg.map((r) => ({
      name: r._id || 'Other',
      value: r.count,
      color: SOURCE_COLORS[r._id] || SOURCE_COLORS.Other,
    }))

    const agentCalls = await CallLog.aggregate([
      {
        $match: {
          ...callTimeMatch,
          ...callLeadFilter,
          agent_name: { $nin: ['', null] },
        },
      },
      { $group: { _id: '$agent_name', calls: { $sum: 1 } } },
    ])
    const callsByAgent = Object.fromEntries(agentCalls.map((x) => [x._id, x.calls]))

    const agentPerformance = agentLeadAgg.map((r) => {
      const name = r.user?.name || 'Unknown'
      return {
        name,
        leads: r.leads,
        calls: callsByAgent[name] || 0,
        chats: 0,
        converted: r.converted,
      }
    })

    const inbound = callTypeAgg.find((x) => x._id === 'Inbound')?.count || 0
    const outbound = callTypeAgg.find((x) => x._id === 'Outbound')?.count || 0
    const ivr = callTypeAgg.find((x) => x._id === 'IVR')?.count || 0
    const missed = callStatusAgg.find((x) => x._id === 'Missed')?.count || 0
    const answered = callStatusAgg.find((x) => x._id === 'Answered')?.count || 0
    const otherCalls = Math.max(0, totalCallsInRange - inbound - outbound - ivr)

    const callSummary = [
      { name: 'Inbound', value: inbound, color: '#D4AF37' },
      { name: 'Outbound', value: outbound, color: '#25D366' },
      { name: 'Missed', value: missed, color: '#ff4d4f' },
    ]
    if (ivr > 0) callSummary.push({ name: 'IVR', value: ivr, color: '#4A90E2' })
    if (otherCalls > 0) callSummary.push({ name: 'Other', value: otherCalls, color: '#888888' })

    const branchPerformance = branchAgg.map((r) => ({
      name: r.b?.name || 'Unassigned',
      leads: r.leads,
      revenue: (r.converted || 0) * 5000,
    }))

    const singlePhone = phoneBuckets.filter((p) => p.n === 1).length
    const multiPhone = phoneBuckets.filter((p) => p.n > 1).length
    const multiLeadCount = phoneBuckets.filter((p) => p.n > 1).reduce((s, p) => s + p.n, 0)
    const newCustomers = singlePhone
    const repeatCustomers = multiLeadCount

    // Appointments: filter by appointment_date in range
    const appointmentMatch = {
      ...branchFilter,
      appointment_date: { $ne: null, $gte: start, $lte: end },
    }
    const [appointmentTotals, appointmentDetails] = await Promise.all([
      Lead.aggregate([
        { $match: appointmentMatch },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } },
            rescheduled: { $sum: { $cond: [{ $eq: ['$status', 'Follow-Up'] }, 1, 0] } },
          },
        },
      ]),
      Lead.find(appointmentMatch)
        .populate('branch', 'name')
        .populate('assignedTo', 'name')
        .sort({ appointment_date: 1, slot_time: 1 })
        .lean(),
    ])

    const apt = appointmentTotals[0] || { total: 0, completed: 0, cancelled: 0, rescheduled: 0 }
    const appointmentStats = {
      totalAppointments: apt.total || 0,
      completed: apt.completed || 0,
      cancelled: apt.cancelled || 0,
      rescheduled: apt.rescheduled || 0,
    }
    const appointmentDetailsTable = (appointmentDetails || []).map((l, i) => ({
      key: String(l._id),
      sno: i + 1,
      date: l.appointment_date ? new Date(l.appointment_date).toISOString().split('T')[0] : '-',
      customer: `${(l.first_name || '').trim()} ${(l.last_name || '').trim()}`.trim() || '-',
      phone: l.phone || l.whatsapp || '-',
      status: l.status,
      slot: l.slot_time || '-',
      package: l.spa_package || '-',
      branch: l.branch?.name || '-',
      assignedTo: l.assignedTo?.name || '-',
    }))

    res.json({
      success: true,
      meta: { dateFrom: from, dateTo: to },
      lead: {
        stats: {
          totalLeads,
          converted,
          lost,
          conversionRate,
        },
        performanceTrend,
        sourceDistribution,
        detailsTable,
        appointmentStats,
        appointmentDetailsTable,
      },
      agent: { performance: agentPerformance },
      call: {
        summary: callSummary.filter((x) => x.value > 0),
        totalCalls: totalCallsInRange,
        answered,
        missed,
      },
      branch: { performance: branchPerformance },
      repeat: {
        distribution: [
          { name: 'Single lead (unique phone)', value: newCustomers, color: '#D4AF37' },
          { name: 'Multiple leads (same phone)', value: multiPhone, color: '#52c41a' },
        ],
        totalCustomers: newCustomers + multiPhone,
        newCustomers,
        repeatCustomerPhones: multiPhone,
        repeatLeadRows: multiLeadCount,
      },
    })
  } catch (error) {
    console.error('[Reports] Error:', error)
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to load reports',
    })
  }
}
