import Lead from '../models/Lead.js'
import ChatDeletionLog from '../models/ChatDeletionLog.js'
import { getAccessibleBranchIds } from '../utils/branchAccess.js'

function leadQueryForUser(reqUser) {
  const q = {}
  if (reqUser.role === 'superadmin') return q
  if (reqUser.allBranches) return q
  const branchIds = getAccessibleBranchIds(reqUser) || []
  if (branchIds.length > 0) {
    q.branch = { $in: branchIds }
    return q
  }
  return { _id: { $exists: false } }
}

/**
 * @route GET /api/system-logs/chat-deletions
 */
export const getChatDeletionLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50)
    const skip = (page - 1) * limit

    const filter = {}
    if (req.user.role !== 'superadmin' && !req.user.allBranches) {
      const branchIds = getAccessibleBranchIds(req.user) || []
      if (branchIds.length > 0) {
        filter.branch = { $in: branchIds }
      } else {
        return res.json({
          success: true,
          logs: [],
          pagination: { total: 0, page, limit, pages: 0 },
        })
      }
    }

    const [total, logs] = await Promise.all([
      ChatDeletionLog.countDocuments(filter),
      ChatDeletionLog.find(filter)
        .populate('branch', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ])

    const formatted = logs.map((row) => ({
      _id: row._id,
      action: row.action,
      user: row.performedBy,
      source: row.source,
      chatId: row.chatId || row.leadId || '-',
      customer: row.customer || row.phone || '-',
      phone: row.phone || '-',
      branch: row.branch?.name || '-',
      timestamp: row.createdAt,
    }))

    res.json({
      success: true,
      logs: formatted,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 0,
      },
    })
  } catch (e) {
    console.error('getChatDeletionLogs:', e)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * @route GET /api/system-logs/lead-activity
 */
export const getLeadActivityLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50)
    const skip = (page - 1) * limit

    const match = {
      ...leadQueryForUser(req.user),
      activityLogs: { $exists: true, $ne: [] },
    }

    if (req.user.role !== 'superadmin' && !req.user.allBranches && (getAccessibleBranchIds(req.user) || []).length === 0) {
      return res.json({
        success: true,
        logs: [],
        pagination: { total: 0, page, limit, pages: 0 },
      })
    }

    const countAgg = await Lead.aggregate([
      { $match: match },
      { $unwind: '$activityLogs' },
      { $count: 'total' },
    ])
    const total = countAgg[0]?.total || 0

    const items = await Lead.aggregate([
      { $match: match },
      { $unwind: '$activityLogs' },
      { $sort: { 'activityLogs.createdAt': -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'branches',
          localField: 'branch',
          foreignField: '_id',
          as: 'branchDoc',
        },
      },
      {
        $project: {
          action: '$activityLogs.action',
          details: '$activityLogs.details',
          performedBy: '$activityLogs.performedBy',
          timestamp: '$activityLogs.createdAt',
          leadId: '$_id',
          leadName: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$first_name', ''] },
                  ' ',
                  { $ifNull: ['$last_name', ''] },
                ],
              },
            },
          },
          branchName: { $arrayElemAt: ['$branchDoc.name', 0] },
        },
      },
    ])

    const logs = items.map((row, i) => ({
      _id: `la_${skip + i}_${String(row.leadId)}`,
      action: row.action,
      user: row.performedBy || 'System',
      details: row.details || '',
      timestamp: row.timestamp,
      leadId: row.leadId?.toString?.() || row.leadId,
      leadName: row.leadName || '-',
      branch: row.branchName || '-',
    }))

    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 0,
      },
    })
  } catch (e) {
    console.error('getLeadActivityLogs:', e)
    res.status(500).json({ message: 'Server error' })
  }
}
