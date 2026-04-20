import Lead from '../models/Lead.js'
import CallLog from '../models/CallLog.js'
import User from '../models/User.js'
import { getAccessibleBranchIds, leadBranchMatchFromParam } from '../utils/branchAccess.js'
import { normalizeOzonetelAgentId, bucketCallStatus, formatCallStatusLabel } from '../utils/ozonetelFields.js'
import { normalizeLeadSourceForReport } from '../utils/leadSourceNormalize.js'

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
  IVR: '#531dab',
  'Walk-in': '#2f54eb',
  'Meta Ads': '#1877F2',
  WhatsApp: '#25D366',
  Website: '#722ed1',
  Referral: '#eb2f96',
  Import: '#9B59B6',
  Other: '#888888',
  Call: '#531dab',
  Add: '#2f54eb',
  Facebook: '#1877F2',
  Insta: '#E4405F',
}

/**
 * GET /api/reports?branch=&dateFrom=&dateTo=
 */
export const getReports = async (req, res) => {
  try {
    const branchFilter = buildLeadBranchFilter(req)
    const { start, end, from, to } = parseRange(req)
    const createdMatch = { ...branchFilter, createdAt: { $gte: start, $lte: end } }

    // CallLog schema fields are camelCase: startTime, type, callStatus, agentName (not start_time / call_type / …)
    const callTimeMatch = { startTime: { $gte: start, $lte: end } }
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
        {
          $group: {
            _id: '$branch',
            leads: { $sum: 1 },
            converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } },
            lost: { $sum: { $cond: [{ $eq: ['$status', 'Lost'] }, 1, 0] } },
          },
        },
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
      ]),
      CallLog.aggregate([{ $match: { ...callTimeMatch, ...callLeadFilter } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      CallLog.aggregate([{ $match: { ...callTimeMatch, ...callLeadFilter } }, { $group: { _id: '$callStatus', count: { $sum: 1 } } }]),
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

    const sourceMerged = new Map()
    for (const row of sourceAgg) {
      const key = normalizeLeadSourceForReport(row._id)
      sourceMerged.set(key, (sourceMerged.get(key) || 0) + (row.count || 0))
    }
    const sourceDistribution = [...sourceMerged.entries()]
      .map(([name, value]) => ({
        name,
        value,
        color: SOURCE_COLORS[name] || SOURCE_COLORS.Other,
      }))
      .sort((a, b) => b.value - a.value)

    const agentCalls = await CallLog.aggregate([
      {
        $match: {
          ...callTimeMatch,
          ...callLeadFilter,
          agentName: { $nin: ['', null] },
        },
      },
      { $group: { _id: '$agentName', calls: { $sum: 1 } } },
    ])
    const callsByAgent = Object.fromEntries(agentCalls.map((x) => [x._id, x.calls]))

    const agentPerformance = agentLeadAgg.map((r) => {
      const name = r.user?.name || 'Unknown'
      const u = r.user || {}
      return {
        name,
        agentEmail: u.email || '',
        agentRole: u.role || '',
        ozonetelAgentId: u.cloudAgentAgentId || '',
        leads: r.leads,
        calls: callsByAgent[name] || 0,
        chats: 0,
        converted: r.converted,
      }
    })

    const sumAggByNormalized = (rows, normalize) => {
      const m = new Map()
      for (const row of rows || []) {
        const key = normalize(row._id)
        if (!key) continue
        m.set(key, (m.get(key) || 0) + (row.count || 0))
      }
      return (key) => m.get(key) || 0
    }
    const normType = (id) => {
      const s = String(id ?? '')
        .trim()
        .toLowerCase()
      if (s === 'inbound') return 'Inbound'
      if (s === 'outbound') return 'Outbound'
      if (s === 'ivr') return 'IVR'
      return ''
    }
    const typeSum = sumAggByNormalized(callTypeAgg, normType)
    const inbound = typeSum('Inbound')
    const outbound = typeSum('Outbound')
    const ivr = typeSum('IVR')

    const normStatus = (id) => {
      const b = bucketCallStatus(id)
      return b === 'Missed' || b === 'Answered' ? b : ''
    }
    const statusSum = sumAggByNormalized(callStatusAgg, normStatus)
    const missed = statusSum('Missed')
    const answered = statusSum('Answered')
    const otherCalls = Math.max(0, totalCallsInRange - inbound - outbound - ivr)

    const callSummary = [
      { name: 'Inbound', value: inbound, color: '#D4AF37' },
      { name: 'Outbound', value: outbound, color: '#25D366' },
      { name: 'Missed', value: missed, color: '#ff4d4f' },
    ]
    if (ivr > 0) callSummary.push({ name: 'IVR', value: ivr, color: '#4A90E2' })
    if (otherCalls > 0) callSummary.push({ name: 'Other', value: otherCalls, color: '#888888' })

    const branchPerformance = branchAgg.map((r) => {
      const leads = r.leads || 0
      const conv = r.converted || 0
      const lost = r.lost || 0
      const conversionRate = leads > 0 ? Math.round((conv / leads) * 1000) / 10 : 0
      return {
        name: r.b?.name || 'Unassigned',
        leads,
        converted: conv,
        lost,
        conversionRate,
        revenue: conv * 5000,
      }
    })

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
      source: normalizeLeadSourceForReport(l.source),
      status: l.status,
      slot: l.slot_time || '-',
      package: l.spa_package || '-',
      branch: l.branch?.name || '-',
      assignedTo: l.assignedTo?.name || '-',
    }))

    const LEAD_DETAILS_EXPORT_CAP = 15000
    const leadDetailsRaw = await Lead.find(createdMatch)
      .populate('branch', 'name')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .limit(LEAD_DETAILS_EXPORT_CAP + 1)
      .lean()
    const leadDetailsTruncated = leadDetailsRaw.length > LEAD_DETAILS_EXPORT_CAP
    const leadDetailsSlice = leadDetailsTruncated ? leadDetailsRaw.slice(0, LEAD_DETAILS_EXPORT_CAP) : leadDetailsRaw
    const leadDetailsTable = leadDetailsSlice.map((l, i) => ({
      key: String(l._id),
      sno: i + 1,
      createdDate: l.createdAt ? new Date(l.createdAt).toISOString().split('T')[0] : '',
      name: `${(l.first_name || '').trim()} ${(l.last_name || '').trim()}`.trim() || '-',
      email: l.email || '',
      phone: l.phone || '',
      whatsapp: l.whatsapp || '',
      source: normalizeLeadSourceForReport(l.source),
      status: l.status || '',
      branch: l.branch?.name || '-',
      assignedTo: l.assignedTo?.name || '-',
      appointmentDate: l.appointment_date ? new Date(l.appointment_date).toISOString().split('T')[0] : '',
      slot: l.slot_time || '',
      spaPackage: l.spa_package || '',
      subject: l.subject || '',
    }))

    const CALL_DETAILS_EXPORT_CAP = 15000
    const AGENT_DETAIL_EXPORT_CAP = 15000
    const crmAgents = await User.find({ status: 'active' }).select('name email role cloudAgentAgentId').lean()
    const crmByOzonetelId = new Map()
    const crmByName = new Map()
    for (const u of crmAgents) {
      const oid = normalizeOzonetelAgentId(u.cloudAgentAgentId)
      if (oid) crmByOzonetelId.set(oid, u)
      const nk = String(u.name || '')
        .trim()
        .toLowerCase()
      if (nk) crmByName.set(nk, u)
    }
    const resolveCrmAgent = (agentIdRaw, agentNameRaw) => {
      const oid = normalizeOzonetelAgentId(agentIdRaw)
      if (oid && crmByOzonetelId.has(oid)) return crmByOzonetelId.get(oid)
      const nk = String(agentNameRaw || '')
        .trim()
        .toLowerCase()
      if (nk && crmByName.has(nk)) return crmByName.get(nk)
      return null
    }
    const fmtCallDuration = (sec) => {
      if (sec == null || !Number.isFinite(Number(sec))) return ''
      const s = Math.max(0, Math.floor(Number(sec)))
      const m = Math.floor(s / 60)
      const r = s % 60
      return `${m}:${String(r).padStart(2, '0')}`
    }
    const mapCallLogToDetailRow = (c, i) => {
      const crm = resolveCrmAgent(c.agentId, c.agentName)
      const branchNames = Array.isArray(c.branches)
        ? c.branches.map((b) => (b && typeof b === 'object' && b.name ? b.name : '')).filter(Boolean).join(', ') || '-'
        : '-'
      const st = c.startTime ? new Date(c.startTime) : null
      const et = c.endTime ? new Date(c.endTime) : null
      const callType = c.type || ''
      return {
        key: String(c._id),
        sno: i + 1,
        startTime: st && !Number.isNaN(st.getTime()) ? st.toISOString().replace('T', ' ').slice(0, 19) : '',
        endTime: et && !Number.isNaN(et.getTime()) ? et.toISOString().replace('T', ' ').slice(0, 19) : '',
        durationSec: c.callDuration ?? 0,
        duration: fmtCallDuration(c.callDuration),
        customerNumber: c.customerNumber || '',
        type: callType,
        callType,
        callStatus: formatCallStatusLabel(c.callStatus),
        agentName: c.agentName || '',
        agentId: normalizeOzonetelAgentId(c.agentId),
        crmAgentName: crm?.name || '',
        crmAgentEmail: crm?.email || '',
        crmAgentRole: crm?.role || '',
        crmCloudAgentId: crm?.cloudAgentAgentId ? normalizeOzonetelAgentId(crm.cloudAgentAgentId) : '',
        branches: branchNames,
        recordingUrl: c.audioFile || '',
        callRef: c.monitorUCID || c.callId || '',
      }
    }
    const callDetailsRaw = await CallLog.find({ ...callTimeMatch, ...callLeadFilter })
      .populate('branches', 'name')
      .sort({ startTime: -1 })
      .limit(CALL_DETAILS_EXPORT_CAP + 1)
      .lean()
    const callDetailsTruncated = callDetailsRaw.length > CALL_DETAILS_EXPORT_CAP
    const callDetailsSlice = callDetailsTruncated ? callDetailsRaw.slice(0, CALL_DETAILS_EXPORT_CAP) : callDetailsRaw
    const callDetailsTable = callDetailsSlice.map(mapCallLogToDetailRow)

    const assignedLeadsForAgentRaw = await Lead.find({ ...createdMatch, assignedTo: { $ne: null } })
      .populate('branch', 'name')
      .populate('assignedTo', 'name email role cloudAgentAgentId')
      .sort({ createdAt: -1 })
      .limit(AGENT_DETAIL_EXPORT_CAP + 1)
      .lean()
    const agentAssignedLeadsTruncated = assignedLeadsForAgentRaw.length > AGENT_DETAIL_EXPORT_CAP
    const assignedLeadsForAgentSlice = agentAssignedLeadsTruncated
      ? assignedLeadsForAgentRaw.slice(0, AGENT_DETAIL_EXPORT_CAP)
      : assignedLeadsForAgentRaw
    const agentAssignedLeadsTable = assignedLeadsForAgentSlice.map((l, i) => ({
      key: String(l._id),
      sno: i + 1,
      createdDate: l.createdAt ? new Date(l.createdAt).toISOString().split('T')[0] : '',
      assignedAgent: l.assignedTo?.name || '-',
      assignedEmail: l.assignedTo?.email || '',
      assignedRole: l.assignedTo?.role || '',
      assignedOzonetelId: l.assignedTo?.cloudAgentAgentId
        ? normalizeOzonetelAgentId(l.assignedTo.cloudAgentAgentId)
        : '',
      leadName: `${(l.first_name || '').trim()} ${(l.last_name || '').trim()}`.trim() || '-',
      phone: l.phone || '',
      email: l.email || '',
      source: normalizeLeadSourceForReport(l.source),
      status: l.status || '',
      branch: l.branch?.name || '-',
    }))

    const agentCallsMatch = {
      ...callTimeMatch,
      ...callLeadFilter,
      agentName: { $nin: ['', null] },
    }
    const agentCallsByAgentRaw = await CallLog.find(agentCallsMatch)
      .populate('branches', 'name')
      .sort({ startTime: -1 })
      .limit(AGENT_DETAIL_EXPORT_CAP + 1)
      .lean()
    const agentCallsByAgentTruncated = agentCallsByAgentRaw.length > AGENT_DETAIL_EXPORT_CAP
    const agentCallsByAgentSlice = agentCallsByAgentTruncated
      ? agentCallsByAgentRaw.slice(0, AGENT_DETAIL_EXPORT_CAP)
      : agentCallsByAgentRaw
    const agentCallsTable = agentCallsByAgentSlice.map(mapCallLogToDetailRow)

    res.json({
      success: true,
      meta: {
        dateFrom: from,
        dateTo: to,
        leadDetailsTruncated,
        leadDetailsCap: LEAD_DETAILS_EXPORT_CAP,
        callDetailsTruncated,
        callDetailsCap: CALL_DETAILS_EXPORT_CAP,
        agentAssignedLeadsTruncated,
        agentCallsByAgentTruncated,
        agentDetailCap: AGENT_DETAIL_EXPORT_CAP,
      },
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
        leadDetailsTable,
        appointmentStats,
        appointmentDetailsTable,
      },
      agent: {
        performance: agentPerformance,
        assignedLeadsTable: agentAssignedLeadsTable,
        agentCallsTable,
      },
      call: {
        summary: callSummary.filter((x) => x.value > 0),
        totalCalls: totalCallsInRange,
        answered,
        missed,
        callDetailsTable,
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
