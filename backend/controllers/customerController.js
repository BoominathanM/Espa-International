import mongoose from 'mongoose'
import Customer from '../models/Customer.js'
import Lead from '../models/Lead.js'
import CallLog from '../models/CallLog.js'
import { applyBranchScope, canAccessBranch, getAccessibleBranchIds, leadBranchMatchFromParam } from '../utils/branchAccess.js'

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '')
}

async function countCallsForPhone(phone) {
  const digits = normalizePhoneDigits(phone)
  if (digits.length < 7) return 0
  const tail = digits.slice(-10)
  try {
    return await CallLog.countDocuments({
      customer_number: { $regex: tail, $options: 'i' },
    })
  } catch {
    return 0
  }
}

function formatCustomerDoc(c) {
  if (!c) return null
  const o = c.toObject ? c.toObject() : { ...c }
  return {
    _id: o._id,
    key: String(o._id),
    name: o.name,
    mobile: o.phone,
    whatsapp: o.whatsapp || o.phone,
    branch: o.branch?.name || o.branch || '-',
    branchId: o.branch?._id || o.branch,
    tags: o.tags?.length ? o.tags : ['New Customer'],
    totalLeads: o.totalLeads ?? 0,
    totalCalls: o.totalCalls ?? 0,
    totalChats: o.totalChats ?? 0,
    lastInteraction: o.lastInteraction
      ? new Date(o.lastInteraction).toISOString().slice(0, 16).replace('T', ' ')
      : '',
    email: o.email || '',
    notes: o.notes || '',
  }
}

function customerBranchFilter(req) {
  const user = req.user
  const q = {}
  if (user.role !== 'superadmin' && !user.allBranches) {
    applyBranchScope(q, user, 'branch')
  } else {
    const match = leadBranchMatchFromParam(req.query.branch)
    if (match) Object.assign(q, match)
  }
  return q
}

export const getCustomers = async (req, res) => {
  try {
    const filter = customerBranchFilter(req)
    if (req.query.search) {
      const s = req.query.search.trim()
      filter.$or = [
        { name: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
      ]
    }
    const customers = await Customer.find(filter).populate('branch', 'name').sort({ updatedAt: -1 }).lean()
    res.json({
      success: true,
      customers: customers.map((c) =>
        formatCustomerDoc({
          ...c,
          branch: c.branch ? { _id: c.branch._id, name: c.branch.name } : null,
        })
      ),
    })
  } catch (e) {
    console.error('[Customers] getCustomers', e)
    res.status(500).json({ success: false, message: e.message || 'Server error' })
  }
}

export const createCustomer = async (req, res) => {
  try {
    const { name, mobile, whatsapp, branch, email, tags } = req.body
    if (!name || !mobile) {
      return res.status(400).json({ success: false, message: 'Name and mobile are required' })
    }
    const user = req.user
    let branchId = branch || null
    if (user.role !== 'superadmin' && !user.allBranches) {
      const accessible = getAccessibleBranchIds(user) || []
      if (branchId && !canAccessBranch(user, branchId)) {
        return res.status(403).json({ success: false, message: 'Not allowed for selected branch' })
      }
      if (!branchId && accessible.length > 0) {
        branchId = accessible[0]
      }
    }
    if (branchId && !mongoose.Types.ObjectId.isValid(branchId)) {
      branchId = null
    }
    const phoneNorm = normalizePhoneDigits(mobile)
    const dup = await Customer.findOne({ phoneNormalized: phoneNorm, branch: branchId || null })
    if (dup) {
      return res.status(400).json({ success: false, message: 'A customer with this mobile already exists for this branch' })
    }
    const calls = await countCallsForPhone(mobile)
    const customer = await Customer.create({
      name: name.trim(),
      phone: mobile.trim(),
      phoneNormalized: phoneNorm,
      email: (email || '').trim(),
      whatsapp: (whatsapp || mobile).trim(),
      branch: branchId,
      tags: Array.isArray(tags) && tags.length ? tags : ['New Customer'],
      sourceLeads: [],
      totalLeads: 0,
      totalCalls: calls,
      totalChats: 0,
      lastInteraction: new Date(),
    })
    const populated = await Customer.findById(customer._id).populate('branch', 'name')
    res.status(201).json({ success: true, customer: formatCustomerDoc(populated) })
  } catch (e) {
    console.error('[Customers] createCustomer', e)
    res.status(500).json({ success: false, message: e.message || 'Server error' })
  }
}

export const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' })
    }
    const user = req.user
    if (!canAccessBranch(user, customer.branch)) {
      return res.status(403).json({ success: false, message: 'Not allowed' })
    }
    const { name, mobile, whatsapp, branch, email, tags, notes } = req.body
    if (name !== undefined) customer.name = name.trim()
    if (mobile !== undefined) {
      customer.phone = mobile.trim()
      customer.phoneNormalized = normalizePhoneDigits(mobile)
    }
    if (whatsapp !== undefined) customer.whatsapp = whatsapp.trim()
    if (email !== undefined) customer.email = (email || '').trim().toLowerCase()
    if (branch !== undefined && (user.role === 'superadmin' || user.allBranches)) {
      customer.branch = branch && mongoose.Types.ObjectId.isValid(branch) ? branch : null
    } else if (branch !== undefined && user.role !== 'superadmin' && !user.allBranches && branch) {
      if (!canAccessBranch(user, branch)) {
        return res.status(403).json({ success: false, message: 'Not allowed for selected branch' })
      }
    }
    if (tags !== undefined && Array.isArray(tags)) customer.tags = tags
    if (notes !== undefined) customer.notes = notes
    customer.lastInteraction = new Date()
    await customer.save()
    const populated = await Customer.findById(customer._id).populate('branch', 'name')
    res.json({ success: true, customer: formatCustomerDoc(populated) })
  } catch (e) {
    console.error('[Customers] updateCustomer', e)
    res.status(500).json({ success: false, message: e.message || 'Server error' })
  }
}

export const convertFromLead = async (req, res) => {
  try {
    const leadId = req.body.leadId || req.params.leadId
    if (!leadId || !mongoose.Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ success: false, message: 'Valid leadId is required' })
    }
    const lead = await Lead.findById(leadId)
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' })
    }
    const user = req.user
    const leadBranchId = lead.branch ? String(lead.branch) : ''
    if (!canAccessBranch(user, leadBranchId)) {
      return res.status(403).json({ success: false, message: 'Not allowed to convert this lead' })
    }

    if (lead.customer) {
      const existing = await Customer.findById(lead.customer).populate('branch', 'name')
      const leadPopulated = await Lead.findById(lead._id)
        .populate('branch', 'name')
        .populate('assignedTo', 'name email')
      return res.json({
        success: true,
        message: 'Lead was already converted',
        customer: formatCustomerDoc(existing),
        lead: leadPopulated,
      })
    }

    const phoneNorm = normalizePhoneDigits(lead.phone)
    if (!phoneNorm) {
      return res.status(400).json({ success: false, message: 'Lead has no valid phone for customer record' })
    }

    const name = `${lead.first_name} ${lead.last_name || ''}`.trim() || 'Customer'
    const branchId = lead.branch || null
    const calls = await countCallsForPhone(lead.phone)
    const waChats = lead.source === 'WhatsApp' ? 1 : 0

    let customer = await Customer.findOne({
      phoneNormalized: phoneNorm,
      branch: branchId,
    })

    if (customer) {
      const idStr = String(lead._id)
      if (!customer.sourceLeads.map(String).includes(idStr)) {
        customer.sourceLeads.push(lead._id)
      }
      customer.totalLeads = customer.sourceLeads.length
      customer.tags = customer.totalLeads > 1 ? ['Repeat Customer'] : ['New Customer']
      customer.totalCalls = Math.max(customer.totalCalls || 0, calls)
      customer.totalChats = (customer.totalChats || 0) + waChats
      customer.lastInteraction = new Date()
      if (name && name !== 'Customer') customer.name = name
      await customer.save()
    } else {
      customer = await Customer.create({
        name,
        phone: lead.phone,
        phoneNormalized: phoneNorm,
        email: lead.email || '',
        whatsapp: lead.whatsapp || lead.phone || '',
        branch: branchId,
        tags: ['New Customer'],
        sourceLeads: [lead._id],
        totalLeads: 1,
        totalCalls: calls,
        totalChats: waChats,
        lastInteraction: new Date(),
      })
    }

    lead.status = 'Converted'
    lead.customer = customer._id
    lead.activityLogs = lead.activityLogs || []
    lead.activityLogs.push({
      action: 'Converted to Customer',
      details: `Customer record: ${customer.name} (${customer.phone})`,
      performedBy: user.name || 'User',
    })
    lead.lastInteraction = new Date()
    await lead.save()

    const populated = await Customer.findById(customer._id).populate('branch', 'name')
    const leadOut = await Lead.findById(lead._id)
      .populate('branch', 'name')
      .populate('assignedTo', 'name email')
      .populate('customer')

    res.json({
      success: true,
      message: 'Lead converted to customer successfully',
      customer: formatCustomerDoc(populated),
      lead: leadOut,
    })
  } catch (e) {
    console.error('[Customers] convertFromLead', e)
    res.status(500).json({ success: false, message: e.message || 'Server error' })
  }
}
