import mongoose from 'mongoose'
import Lead from '../models/Lead.js'
import Branch from '../models/Branch.js'
import User from '../models/User.js'
import { autoAssignLeadToBranchUser } from '../utils/leadAssignment.js'

// @desc    Create lead from website contact form
// @route   POST /api/leads/website
// @access  Public (with API key)
export const createWebsiteLead = async (req, res) => {
  try {
    const {
      name,
      first_name,
      last_name,
      email,
      phone,
      subject,
      message,
      appointment_date,
      slot_time,
      spa_package,
      branch
    } = req.body

    // Handle name field
    let firstName = first_name || ""
    let lastName = last_name || ""

    if (name && !first_name) {
      const parts = name.trim().split(" ")
      firstName = parts[0]
      lastName = parts.slice(1).join(" ")
    }

    if (!firstName || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "First name, email, and phone are required",
      })
    }

    const emailRegex = /^\S+@\S+\.\S+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      })
    }

    const ipAddress =
      req.ip ||
      req.connection.remoteAddress ||
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      "Unknown"

    const websiteUrl =
      req.headers.referer ||
      req.body.websiteUrl ||
      "https://www.espainternational.co.in/contact/"

    // STEP 1 — Identify branchId
    let branchId = null

    if (branch) {
      if (mongoose.Types.ObjectId.isValid(branch)) {
        const exists = await Branch.findById(branch)
        if (exists) branchId = branch
      } else {
        const byName = await Branch.findOne({
          name: { $regex: new RegExp(`^${branch}$`, "i") },
        })
        if (byName) branchId = byName._id
      }
    }

    // STEP 2 — If branch not provided, auto-default to "Anna Nagar"
    if (!branchId) {
      const defaultBranch = await Branch.findOne({ name: "Anna Nagar" })
      if (defaultBranch) {
        branchId = defaultBranch._id
        console.log("🌐 Default branch selected → Anna Nagar")
      }
    }

    // STEP 3 — Auto-assign (now branchId always exists)
    let assignedUserId = null
    if (branchId) {
      assignedUserId = await autoAssignLeadToBranchUser(branchId)
      console.log("Assigned user:", assignedUserId)
    }

    // STEP 4 — Save lead
    const lead = new Lead({
      first_name: firstName,
      last_name: lastName,
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      whatsapp: phone.trim(),
      subject: subject || "",
      message: message || "",
      source: "Website",
      status: "New",
      branch: branchId,
      assignedTo: assignedUserId,
      appointment_date: appointment_date ? new Date(appointment_date) : null,
      slot_time: slot_time || "",
      spa_package: spa_package || "",
      websiteUrl,
      ipAddress,
      lastInteraction: new Date(),
    })

    await lead.save()

    const savedLead = await Lead.findById(lead._id)
      .populate("assignedTo", "name email")
      .populate("branch", "name assignedUsers")

    return res.status(201).json({
      success: true,
      message: "Lead created successfully",
      lead: savedLead,
    })
  } catch (error) {
    console.error("Website lead creation error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Create lead (from frontend)
// @route   POST /api/leads
// @access  Private
export const createLead = async (req, res) => {
  try {
    const {
      name,
      first_name,
      last_name,
      email,
      phone,
      whatsapp,
      subject,
      message,
      source,
      status,
      branch,
      assignedTo,
      notes,
      appointment_date,
      slot_time,
      spa_package
    } = req.body

    // Handle name field - support both old 'name' and new 'first_name'/'last_name'
    let firstName = first_name || ''
    let lastName = last_name || ''

    if (name && !first_name) {
      // Split name if first_name not provided
      const nameParts = name.trim().split(' ')
      firstName = nameParts[0] || ''
      lastName = nameParts.slice(1).join(' ') || ''
    }

    // Validate required fields
    if (!firstName || !phone) {
      return res.status(400).json({
        success: false,
        message: 'First name and phone are required fields',
      })
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^\S+@\S+\.\S+$/
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address',
        })
      }
    }

    // Validate and convert branch if provided
    let branchId = null
    if (branch) {
      // Check if branch is a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(branch)) {
        const exists = await Branch.findById(branch)
        if (exists) {
          branchId = branch
        }
      } else {
        // Try to find by name
        const byName = await Branch.findOne({
          name: { $regex: new RegExp(`^${branch}$`, 'i') },
        })
        if (byName) {
          branchId = byName._id
        }
      }
    }

    // Default to Anna Nagar if no branch found
    if (!branchId) {
      const defaultBranch = await Branch.findOne({ name: 'Anna Nagar' })
      if (defaultBranch) {
        branchId = defaultBranch._id
      }
    }

    let finalAssignedTo = assignedTo || null
    if (branchId && !assignedTo) {
      const autoAssignedUserId = await autoAssignLeadToBranchUser(branchId)
      if (autoAssignedUserId) {
        finalAssignedTo = autoAssignedUserId
        console.log(`✅ Auto-assigned new lead to user: ${autoAssignedUserId} in branch: ${branchId}`)
      } else {
        console.log(`⚠️  Could not auto-assign lead: No active staff/supervisor users found in branch ${branchId}`)
      }
    }

    // Create new lead
    const lead = new Lead({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email ? email.toLowerCase().trim() : '',
      phone: phone.trim(),
      whatsapp: whatsapp ? whatsapp.trim() : phone.trim(),
      subject: subject ? subject.trim() : '',
      message: message ? message.trim() : '',
      source: source || 'Add',
      status: status || 'New',
      branch: branchId,
      appointment_date: appointment_date ? new Date(appointment_date) : null,
      slot_time: slot_time ? slot_time.trim() : '',
      spa_package: spa_package ? spa_package.trim() : '',
      assignedTo: finalAssignedTo,
      notes: notes ? notes.trim() : '',
      lastInteraction: new Date(),
    })

    await lead.save()

    const savedLead = await Lead.findById(lead._id)
      .populate({
        path: 'branch',
        select: 'name assignedUsers',
        populate: {
          path: 'assignedUsers',
          select: 'name email role status'
        }
      })
      .populate('assignedTo', 'name email')

    // Ensure userCount is calculated
    if (savedLead.branch) {
      savedLead.branch.userCount = savedLead.branch.assignedUsers
        ? (Array.isArray(savedLead.branch.assignedUsers) ? savedLead.branch.assignedUsers.length : 0)
        : 0
    }

    const populatedLead = await Lead.findById(lead._id)
      .populate("assignedTo", "name email")
      .populate("branch", "name")

    return res.status(201).json({
      success: true,
      message: "Lead created successfully",
      lead: populatedLead
    })

  } catch (error) {
    console.error('Create lead error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      })
    }
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
    })
  }
}

// @desc    Get database statistics and verify leads
// @route   GET /api/leads/diagnostics
// @access  Private (for debugging)
export const getLeadsDiagnostics = async (req, res) => {
  try {
    // Get total leads count
    const totalLeads = await Lead.countDocuments({})
    
    // Get leads by source
    const leadsBySource = await Lead.aggregate([
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ])

    // Get WhatsApp leads count
    const whatsappLeadsCount = await Lead.countDocuments({ source: 'WhatsApp' })
    
    // Get latest 5 leads
    const latestLeads = await Lead.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('_id first_name last_name phone email source status createdAt')
      .lean()

    // Get latest WhatsApp lead
    const latestWhatsAppLead = await Lead.findOne({ source: 'WhatsApp' })
      .sort({ createdAt: -1 })
      .select('_id first_name last_name phone email source status createdAt')
      .lean()

    // Check database connection
    const dbState = {
      connected: true,
      database: Lead.db.name,
      collection: Lead.collection.name,
    }

    res.json({
      success: true,
      diagnostics: {
        database: dbState,
        totalLeads,
        leadsBySource,
        whatsappLeads: {
          count: whatsappLeadsCount,
          percentage: totalLeads > 0 ? ((whatsappLeadsCount / totalLeads) * 100).toFixed(2) + '%' : '0%',
          latest: latestWhatsAppLead,
        },
        latestLeads,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('[Leads Diagnostics] ❌ Error:', error)
    res.status(500).json({
      success: false,
      message: 'Error getting diagnostics',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    })
  }
}

// @desc    Get all leads
// @route   GET /api/leads
// @access  Private
export const getLeads = async (req, res) => {
  try {
    const { status, source, branch, assignedTo, search, page = 1, limit = 50 } = req.query

    // Build query
    const query = {}

    if (status) {
      query.status = status
    }

    if (source) {
      query.source = source
    }

    if (branch) {
      query.branch = branch
    }

    if (assignedTo) {
      query.assignedTo = assignedTo
    }

    // Search in first_name, last_name, email, phone
    if (search) {
      query.$or = [
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ]
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit)

    // Log query for debugging
    console.log(`[Get Leads] 📊 Request received`)
    console.log(`[Get Leads] Query parameters:`, {
      status: status || 'none',
      source: source || 'none',
      branch: branch || 'none',
      assignedTo: assignedTo || 'none',
      search: search || 'none',
      page,
      limit,
    })
    console.log(`[Get Leads] MongoDB query:`, JSON.stringify(query))
    console.log(`[Get Leads] Pagination: page=${page}, limit=${limit}, skip=${skip}`)

    // Check total leads in database first (before filtering)
    const totalLeadsInDb = await Lead.countDocuments({})
    console.log(`[Get Leads] 📈 Total leads in database (no filters): ${totalLeadsInDb}`)

    // Get leads with pagination
    const leads = await Lead.find(query)
      .populate({
        path: 'branch',
        select: 'name assignedUsers',
        populate: {
          path: 'assignedUsers',
          select: 'name email role status'
        }
      })
      .populate('assignedTo', 'name email status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    console.log(`[Get Leads] ✅ Found ${leads.length} leads matching query`)

    // Log sample lead sources if any found
    if (leads.length > 0) {
      const sources = leads.map(l => l.source).filter((v, i, a) => a.indexOf(v) === i)
      console.log(`[Get Leads] 📋 Lead sources in results:`, sources)
      console.log(`[Get Leads] 📋 Sample lead:`, {
        id: leads[0]._id,
        name: `${leads[0].first_name} ${leads[0].last_name}`,
        phone: leads[0].phone,
        source: leads[0].source,
        status: leads[0].status,
        createdAt: leads[0].createdAt,
      })
    } else {
      console.log(`[Get Leads] ⚠️  No leads found matching query`)
      if (Object.keys(query).length === 0) {
        console.log(`[Get Leads] ⚠️  Query is empty (no filters) - this means database might be empty`)
      }
    }

    // Clean up leads - set assignedTo to null if populated user doesn't exist or is inactive
    // Also ensure branch userCount is calculated correctly
    const cleanedLeads = leads.map(lead => {
      const leadObj = lead.toObject()
      // If assignedTo is null, undefined, or user is inactive, set to null
      if (!leadObj.assignedTo) leadObj.assignedTo = null;
      // If assignedTo exists but has no name, it's an invalid reference
      if (leadObj.assignedTo && !leadObj.assignedTo.name) {
        leadObj.assignedTo = null
      }
      // Ensure branch userCount is calculated correctly
      if (leadObj.branch) {
        // Calculate userCount from assignedUsers array
        leadObj.branch.userCount = leadObj.branch.assignedUsers
          ? (Array.isArray(leadObj.branch.assignedUsers) ? leadObj.branch.assignedUsers.length : 0)
          : 0
      }
      return leadObj
    })

    // Get total count
    const total = await Lead.countDocuments(query)
    console.log(`[Get Leads] 📊 Total leads matching query: ${total}`)
    
    // Count by source for debugging
    const sourceCounts = await Lead.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
    console.log(`[Get Leads] 📊 Leads by source:`, sourceCounts)

    res.json({
      success: true,
      leads: cleanedLeads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    })
  } catch (error) {
    console.error('[Get Leads] ❌ Error:', error)
    console.error('[Get Leads] Error stack:', error.stack)
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined
    })
  }
}

// @desc    Get single lead
// @route   GET /api/leads/:id
// @access  Private
export const getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate({
        path: 'branch',
        select: 'name address phone email assignedUsers',
        populate: {
          path: 'assignedUsers',
          select: 'name email role status'
        }
      })
      .populate('assignedTo', 'name email phone')

    // Ensure userCount is calculated
    if (lead && lead.branch) {
      lead.branch.userCount = lead.branch.assignedUsers
        ? (Array.isArray(lead.branch.assignedUsers) ? lead.branch.assignedUsers.length : 0)
        : 0
    }

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' })
    }

    res.json({ success: true, lead })
  } catch (error) {
    console.error('Get lead error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Update lead
// @route   PUT /api/leads/:id
// @access  Private
export const updateLead = async (req, res) => {
  try {
    const {
      name,
      first_name,
      last_name,
      email,
      phone,
      whatsapp,
      subject,
      message,
      source,
      status,
      branch,
      assignedTo,
      notes,
      appointment_date,
      slot_time,
      spa_package
    } = req.body

    const lead = await Lead.findById(req.params.id)
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' })
    }

    // Handle name field
    if (name && !first_name) {
      const nameParts = name.trim().split(' ')
      if (nameParts[0]) lead.first_name = nameParts[0]
      if (nameParts.slice(1).join(' ')) lead.last_name = nameParts.slice(1).join(' ')
    } else {
      if (first_name !== undefined) lead.first_name = first_name.trim()
      if (last_name !== undefined) lead.last_name = last_name.trim()
    }

    if (email !== undefined) {
      if (email) {
        const emailRegex = /^\S+@\S+\.\S+$/
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            success: false,
            message: 'Please provide a valid email address',
          })
        }
        lead.email = email.toLowerCase().trim()
      } else {
        lead.email = ''
      }
    }

    if (phone !== undefined) lead.phone = phone.trim()
    if (whatsapp !== undefined) lead.whatsapp = whatsapp.trim()
    if (subject !== undefined) lead.subject = subject.trim()
    if (message !== undefined) lead.message = message.trim()
    if (source !== undefined) lead.source = source
    if (status !== undefined) lead.status = status
    if (notes !== undefined) lead.notes = notes.trim()
    if (appointment_date !== undefined) {
      lead.appointment_date = appointment_date ? new Date(appointment_date) : null
    }
    if (slot_time !== undefined) lead.slot_time = slot_time.trim()
    if (spa_package !== undefined) lead.spa_package = spa_package.trim()

    // Handle branch
    if (branch !== undefined) {
      if (branch === null || branch === '') {
        lead.branch = null
      } else if (mongoose.Types.ObjectId.isValid(branch)) {
        const exists = await Branch.findById(branch)
        if (exists) {
          lead.branch = branch
        }
      } else {
        const byName = await Branch.findOne({
          name: { $regex: new RegExp(`^${branch}$`, 'i') },
        })
        if (byName) {
          lead.branch = byName._id
        }
      }
    }

    // Handle assignedTo
    if (assignedTo !== undefined) {
      if (assignedTo === null || assignedTo === '') {
        lead.assignedTo = null
      } else if (mongoose.Types.ObjectId.isValid(assignedTo)) {
        const exists = await User.findById(assignedTo)
        if (exists) {
          lead.assignedTo = assignedTo
        }
      }
    }

    lead.lastInteraction = new Date()
    await lead.save()

    const updatedLead = await Lead.findById(lead._id)
      .populate({
        path: 'branch',
        select: 'name assignedUsers',
        populate: {
          path: 'assignedUsers',
          select: 'name email role status'
        }
      })
      .populate('assignedTo', 'name email status')

    if (updatedLead.branch) {
      updatedLead.branch.userCount = updatedLead.branch.assignedUsers
        ? (Array.isArray(updatedLead.branch.assignedUsers) ? updatedLead.branch.assignedUsers.length : 0)
        : 0
    }

    res.json({
      success: true,
      message: 'Lead updated successfully',
      lead: updatedLead,
    })
  } catch (error) {
    console.error('Update lead error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      })
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Delete lead
// @route   DELETE /api/leads/:id
// @access  Private (Super Admin only)
export const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' })
    }

    await Lead.findByIdAndDelete(req.params.id)
    res.json({ success: true, message: 'Lead deleted successfully' })
  } catch (error) {
    console.error('Delete lead error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Export leads to CSV
// @route   GET /api/leads/export
// @access  Private
export const exportLeads = async (req, res) => {
  try {
    const { status, source, branch, assignedTo, search } = req.query

    // Build query
    const query = {}
    if (status) query.status = status
    if (source) query.source = source
    if (branch) query.branch = branch
    if (assignedTo) query.assignedTo = assignedTo
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ]
    }

    // Get all leads matching query
    const leads = await Lead.find(query)
      .populate('branch', 'name')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })

    // Convert to CSV format
    const csvHeaders = ['First Name', 'Last Name', 'Email', 'Phone', 'WhatsApp', 'Subject', 'Message', 'Source', 'Status', 'Branch', 'Appointment Date', 'Slot Time', 'Spa Package', 'Assigned To', 'Notes', 'Last Interaction', 'Created At']
    const csvRows = leads.map(lead => [
      `"${lead.first_name || ''}"`,
      `"${lead.last_name || ''}"`,
      `"${lead.email || ''}"`,
      `"${lead.phone || ''}"`,
      `"${lead.whatsapp || ''}"`,
      `"${lead.subject || ''}"`,
      `"${lead.message || ''}"`,
      `"${lead.source || ''}"`,
      `"${lead.status || ''}"`,
      `"${lead.branch?.name || ''}"`,
      `"${lead.appointment_date ? lead.appointment_date.toISOString().split('T')[0] : ''}"`,
      `"${lead.slot_time || ''}"`,
      `"${lead.spa_package || ''}"`,
      `"${lead.assignedTo?.name || ''}"`,
      `"${lead.notes || ''}"`,
      `"${lead.lastInteraction ? lead.lastInteraction.toISOString() : ''}"`,
      `"${lead.createdAt ? lead.createdAt.toISOString() : ''}"`,
    ])

    const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=leads.csv')
    res.send(csvContent)
  } catch (error) {
    console.error('Export leads error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Import leads from CSV
// @route   POST /api/leads/import
// @access  Private
export const importLeads = async (req, res) => {
  try {
    const { leads: leadsData } = req.body

    if (!leadsData || !Array.isArray(leadsData) || leadsData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Leads data is required and must be an array',
      })
    }

    const results = {
      success: 0,
      failed: 0,
      duplicates: 0,
      errors: [],
    }

    const filePhones = new Map()

    // Process each lead
    for (let i = 0; i < leadsData.length; i++) {
      const row = leadsData[i]
      const rowNumber = i + 2 // +2 because row 1 is header, and array is 0-indexed

      try {
        // Validate required fields
        if (!row.first_name && !row.name) {
          results.failed++
          results.errors.push({
            row: rowNumber,
            error: 'First name or name is required',
            data: row,
          })
          continue
        }

        if (!row.phone) {
          results.failed++
          results.errors.push({
            row: rowNumber,
            error: 'Phone is required',
            data: row,
          })
          continue
        }

        // Handle name field
        let firstName = row.first_name || ''
        let lastName = row.last_name || ''

        if (row.name && !row.first_name) {
          const nameParts = row.name.trim().split(' ')
          firstName = nameParts[0] || ''
          lastName = nameParts.slice(1).join(' ') || ''
        }

        // Normalize phone
        const normalizedPhone = row.phone.trim().replace(/\D/g, '')
        if (normalizedPhone.length < 10) {
          results.failed++
          results.errors.push({
            row: rowNumber,
            error: 'Invalid phone number',
            data: row,
          })
          continue
        }

        // Check for duplicates in file
        if (filePhones.has(normalizedPhone)) {
          results.duplicates++
          results.errors.push({
            row: rowNumber,
            error: `Duplicate in file: Phone "${row.phone}" already appears in row ${filePhones.get(normalizedPhone)}`,
            data: row,
          })
          continue
        }
        filePhones.set(normalizedPhone, rowNumber)

        // Check for duplicates in database
        const duplicateQuery = { $or: [] }
        const normalizedEmail = row.email ? row.email.toLowerCase().trim() : ''

        if (normalizedEmail) {
          duplicateQuery.$or.push({ email: normalizedEmail })
        }
        if (normalizedPhone) {
          duplicateQuery.$or.push({ phone: normalizedPhone })
        }

        if (duplicateQuery.$or.length > 0) {
          const existingLead = await Lead.findOne(duplicateQuery)
          if (existingLead) {
            results.duplicates++
            const duplicateField = existingLead.email === normalizedEmail ? 'email' : 'phone'
            const duplicateValue = existingLead.email === normalizedEmail ? row.email : row.phone
            results.errors.push({
              row: rowNumber,
              error: `Duplicate in database: Lead with ${duplicateField} "${duplicateValue}" already exists in the system`,
              data: row,
            })
            continue
          }
        }

        // Create lead with source as "Import"
        const lead = new Lead({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: row.email ? row.email.toLowerCase().trim() : '',
          phone: row.phone.trim(),
          whatsapp: row.whatsapp ? row.whatsapp.trim() : row.phone.trim(),
          subject: row.subject ? row.subject.trim() : '',
          message: row.message ? row.message.trim() : '',
          source: 'Import',
          status: 'New', // Always set to "New" for imported leads
          branch: row.branch || null,
          appointment_date: row.appointment_date ? new Date(row.appointment_date) : null,
          slot_time: row.slot_time ? row.slot_time.trim() : '',
          spa_package: row.spa_package ? row.spa_package.trim() : '',
          assignedTo: null,
          notes: '',
          lastInteraction: new Date(),
        })

        await lead.save()
        results.success++
      } catch (error) {
        results.failed++
        results.errors.push({
          row: rowNumber,
          error: error.message || 'Unknown error',
          data: row,
        })
      }
    }

    res.json({
      success: true,
      message: `Import completed: ${results.success} successful, ${results.failed} failed, ${results.duplicates} duplicates`,
      results,
    })
  } catch (error) {
    console.error('Import leads error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Get sample CSV for import
// @route   GET /api/leads/import/sample
// @access  Private
export const getSampleCSV = (req, res) => {
  const sampleData = [
    ['First Name', 'Last Name', 'Email', 'Phone', 'WhatsApp', 'Subject', 'Message', 'Source', 'Status', 'Branch', 'Appointment Date', 'Slot Time', 'Spa Package'],
    ['John', 'Doe', 'john@example.com', '1234567890', '1234567890', 'Inquiry', 'Sample message', 'Add', 'New', '', '', '', ''],
  ]

  const csvContent = sampleData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename=sample_leads.csv')
  res.send(csvContent)
}

// @desc    Auto-assign unassigned leads to branch users
// @route   POST /api/leads/auto-assign
// @access  Private
export const autoAssignUnassignedLeads = async (req, res) => {
  try {
    // Find all unassigned leads that have a branch
    const unassignedLeads = await Lead.find({
      assignedTo: null,
      branch: { $ne: null },
    }).populate('branch', 'name')

    if (unassignedLeads.length === 0) {
      return res.json({
        success: true,
        message: 'No unassigned leads found',
        assigned: 0,
      })
    }

    let assignedCount = 0
    const errors = []

    for (const lead of unassignedLeads) {
      try {
        const assignedUserId = await autoAssignLeadToBranchUser(lead.branch._id)
        if (assignedUserId) {
          lead.assignedTo = assignedUserId
          await lead.save()
          assignedCount++
        } else {
          errors.push({
            leadId: lead._id,
            message: `No available users in branch ${lead.branch.name}`,
          })
        }
      } catch (error) {
        errors.push({
          leadId: lead._id,
          message: error.message,
        })
      }
    }

    res.json({
      success: true,
      message: `Auto-assigned ${assignedCount} out of ${unassignedLeads.length} leads`,
      assigned: assignedCount,
      total: unassignedLeads.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Auto-assign leads error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}
