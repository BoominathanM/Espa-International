import Lead from '../models/Lead.js'
import Branch from '../models/Branch.js'
import { autoAssignLeadToBranchUser } from '../utils/leadAssignment.js'

/**
 * @desc    Handle WhatsApp webhook events
 * @route   POST /api/whatsapp/webhook
 * @access  Public (authenticated with API key)
 */
export const handleWebhook = async (req, res) => {
  try {
    const { event, timestamp, data } = req.body

    // Validate required fields
    if (!event || !data) {
      return res.status(400).json({
        success: false,
        message: 'Event and data are required fields',
      })
    }

    // Log incoming webhook
    console.log(`[WhatsApp Webhook] Received event: ${event} at ${timestamp || new Date().toISOString()}`)

    // Handle different event types
    switch (event) {
      case 'lead_created':
        return await handleLeadCreated(req, res, data, timestamp)
      
      case 'lead_updated':
        return await handleLeadUpdated(req, res, data, timestamp)
      
      case 'lead_deleted':
        return await handleLeadDeleted(req, res, data, timestamp)
      
      default:
        console.warn(`[WhatsApp Webhook] Unknown event type: ${event}`)
        return res.status(200).json({
          success: true,
          message: `Event ${event} received but not processed`,
        })
    }
  } catch (error) {
    console.error('[WhatsApp Webhook] Error processing webhook:', error)
    return res.status(500).json({
      success: false,
      message: 'Error processing webhook',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    })
  }
}

/**
 * Handle lead_created event from WhatsApp API
 */
const handleLeadCreated = async (req, res, data, timestamp) => {
  try {
    const { leadId, name, email, mobile, company, status } = data

    // Validate required fields
    if (!name || !mobile) {
      return res.status(400).json({
        success: false,
        message: 'Name and mobile are required fields',
      })
    }

    // Parse name into first_name and last_name
    const nameParts = name.trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Check for duplicate lead (by email or phone)
    const duplicateQuery = {
      $or: []
    }
    
    if (email && email.trim()) {
      duplicateQuery.$or.push({ email: email.toLowerCase().trim() })
    }
    if (mobile && mobile.trim()) {
      duplicateQuery.$or.push({ phone: mobile.trim() })
    }

    if (duplicateQuery.$or.length > 0) {
      const existingLead = await Lead.findOne(duplicateQuery)
      if (existingLead) {
        console.log(`[WhatsApp Webhook] Duplicate lead found: ${existingLead._id}`)
        return res.status(200).json({
          success: true,
          message: 'Lead already exists',
          lead: existingLead,
          duplicate: true,
        })
      }
    }

    // Try to find branch by company name if provided
    let branchId = null
    if (company && company.trim()) {
      const branch = await Branch.findOne({
        name: { $regex: new RegExp(`^${company.trim()}$`, 'i') },
      })
      if (branch) {
        branchId = branch._id
      }
    }

    // Default to Anna Nagar if no branch found
    if (!branchId) {
      const defaultBranch = await Branch.findOne({ name: 'Anna Nagar' })
      if (defaultBranch) {
        branchId = defaultBranch._id
        console.log('[WhatsApp Webhook] Default branch selected → Anna Nagar')
      }
    }

    // Auto-assign to branch user
    let assignedUserId = null
    if (branchId) {
      assignedUserId = await autoAssignLeadToBranchUser(branchId)
      if (assignedUserId) {
        console.log(`[WhatsApp Webhook] Auto-assigned to user: ${assignedUserId}`)
      }
    }

    // Map status from WhatsApp API to our status enum
    const statusMap = {
      'New Lead': 'New',
      'In Progress': 'In Progress',
      'Follow-Up': 'Follow-Up',
      'Converted': 'Converted',
      'Lost': 'Lost',
    }
    const mappedStatus = statusMap[status] || 'New'

    // Create new lead
    const lead = new Lead({
      first_name: firstName,
      last_name: lastName,
      email: email ? email.toLowerCase().trim() : '',
      phone: mobile.trim(),
      whatsapp: mobile.trim(),
      subject: company ? `From ${company}` : 'WhatsApp Lead',
      message: `Lead created via WhatsApp API${company ? ` from ${company}` : ''}`,
      source: 'WhatsApp',
      status: mappedStatus,
      branch: branchId,
      assignedTo: assignedUserId,
      lastInteraction: timestamp ? new Date(timestamp) : new Date(),
    })

    await lead.save()

    const savedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email')
      .populate('branch', 'name')

    console.log(`[WhatsApp Webhook] Lead created successfully: ${savedLead._id}`)

    return res.status(201).json({
      success: true,
      message: 'Lead created successfully from WhatsApp webhook',
      lead: savedLead,
    })
  } catch (error) {
    console.error('[WhatsApp Webhook] Error creating lead:', error)
    return res.status(500).json({
      success: false,
      message: 'Error creating lead from webhook',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    })
  }
}

/**
 * Handle lead_updated event from WhatsApp API
 */
const handleLeadUpdated = async (req, res, data, timestamp) => {
  try {
    const { leadId, name, email, mobile, company, status } = data

    // Try to find lead by leadId (from WhatsApp API) or by email/phone
    let lead = null
    
    if (leadId) {
      // Check if leadId is a valid MongoDB ObjectId
      if (leadId.match(/^[0-9a-fA-F]{24}$/)) {
        lead = await Lead.findById(leadId)
      }
    }

    // If not found by ID, try by email or phone
    if (!lead) {
      const query = { $or: [] }
      if (email && email.trim()) {
        query.$or.push({ email: email.toLowerCase().trim() })
      }
      if (mobile && mobile.trim()) {
        query.$or.push({ phone: mobile.trim() })
      }
      
      if (query.$or.length > 0) {
        lead = await Lead.findOne(query)
      }
    }

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found for update',
      })
    }

    // Update lead fields
    if (name) {
      const nameParts = name.trim().split(' ')
      lead.first_name = nameParts[0] || lead.first_name
      lead.last_name = nameParts.slice(1).join(' ') || lead.last_name
    }
    
    if (email) {
      lead.email = email.toLowerCase().trim()
    }
    
    if (mobile) {
      lead.phone = mobile.trim()
      lead.whatsapp = mobile.trim()
    }

    if (status) {
      const statusMap = {
        'New Lead': 'New',
        'In Progress': 'In Progress',
        'Follow-Up': 'Follow-Up',
        'Converted': 'Converted',
        'Lost': 'Lost',
      }
      lead.status = statusMap[status] || lead.status
    }

    if (company) {
      // Try to update branch if company name matches a branch
      const branch = await Branch.findOne({
        name: { $regex: new RegExp(`^${company.trim()}$`, 'i') },
      })
      if (branch) {
        lead.branch = branch._id
      }
    }

    lead.lastInteraction = timestamp ? new Date(timestamp) : new Date()
    await lead.save()

    const updatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email')
      .populate('branch', 'name')

    console.log(`[WhatsApp Webhook] Lead updated successfully: ${updatedLead._id}`)

    return res.status(200).json({
      success: true,
      message: 'Lead updated successfully from WhatsApp webhook',
      lead: updatedLead,
    })
  } catch (error) {
    console.error('[WhatsApp Webhook] Error updating lead:', error)
    return res.status(500).json({
      success: false,
      message: 'Error updating lead from webhook',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    })
  }
}

/**
 * Handle lead_deleted event from WhatsApp API
 */
const handleLeadDeleted = async (req, res, data, timestamp) => {
  try {
    const { leadId, email, mobile } = data

    // Try to find lead
    let lead = null
    
    if (leadId) {
      if (leadId.match(/^[0-9a-fA-F]{24}$/)) {
        lead = await Lead.findById(leadId)
      }
    }

    if (!lead) {
      const query = { $or: [] }
      if (email && email.trim()) {
        query.$or.push({ email: email.toLowerCase().trim() })
      }
      if (mobile && mobile.trim()) {
        query.$or.push({ phone: mobile.trim() })
      }
      
      if (query.$or.length > 0) {
        lead = await Lead.findOne(query)
      }
    }

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found for deletion',
      })
    }

    await Lead.findByIdAndDelete(lead._id)

    console.log(`[WhatsApp Webhook] Lead deleted successfully: ${lead._id}`)

    return res.status(200).json({
      success: true,
      message: 'Lead deleted successfully from WhatsApp webhook',
      leadId: lead._id,
    })
  } catch (error) {
    console.error('[WhatsApp Webhook] Error deleting lead:', error)
    return res.status(500).json({
      success: false,
      message: 'Error deleting lead from webhook',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    })
  }
}

/**
 * @desc    Get sample webhook payload
 * @route   GET /api/whatsapp/webhook/sample
 * @access  Public
 */
export const getSamplePayload = (req, res) => {
  const samplePayload = {
    event: 'lead_created',
    timestamp: new Date().toISOString(),
    data: {
      leadId: '507f1f77bcf86cd799439011',
      name: 'John Doe',
      email: 'john@example.com',
      mobile: '1234567890',
      company: 'Example Corp',
      status: 'New Lead',
    },
  }

  res.json({
    success: true,
    message: 'Sample webhook payload',
    payload: samplePayload,
    description: 'This is the expected payload format for WhatsApp webhook events',
  })
}

