import Lead from '../models/Lead.js'

// @desc    Create lead from website contact form
// @route   POST /api/leads/website
// @access  Public (API Key protected)
export const createWebsiteLead = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body

    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone are required fields',
      })
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      })
    }

    // Get IP address from request
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'Unknown'
    
    // Get website URL from referer or request
    const websiteUrl = req.headers.referer || req.body.websiteUrl || 'https://www.espainternational.co.in/contact/'

    // Check if lead with same email or phone already exists (within last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const existingLead = await Lead.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { phone: phone.trim() }
      ],
      createdAt: { $gte: oneDayAgo },
      source: 'Website'
    })

    if (existingLead) {
      // Update existing lead instead of creating duplicate
      existingLead.name = name.trim()
      existingLead.subject = subject ? subject.trim() : existingLead.subject
      existingLead.message = message ? message.trim() : existingLead.message
      existingLead.lastInteraction = new Date()
      existingLead.websiteUrl = websiteUrl
      existingLead.ipAddress = ipAddress
      
      await existingLead.save()

      return res.status(200).json({
        success: true,
        message: 'Contact sent successfully (duplicate prevented)',
        lead: existingLead,
      })
    }

    // Create new lead
    const lead = new Lead({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      whatsapp: phone.trim(), // Default to phone if WhatsApp not provided
      subject: subject ? subject.trim() : '',
      message: message ? message.trim() : '',
      source: 'Website',
      status: 'New',
      websiteUrl: websiteUrl,
      ipAddress: ipAddress,
      lastInteraction: new Date(),
    })

    await lead.save()

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      lead: {
        _id: lead._id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        subject: lead.subject,
        source: lead.source,
        status: lead.status,
        createdAt: lead.createdAt,
      },
    })
  } catch (error) {
    console.error('Create website lead error:', error)
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

// @desc    Create lead (from frontend)
// @route   POST /api/leads
// @access  Private
export const createLead = async (req, res) => {
  try {
    const { name, email, phone, whatsapp, subject, message, source, status, branch, assignedTo, notes } = req.body

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name and phone are required fields',
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

    // Create new lead
    const lead = new Lead({
      name: name.trim(),
      email: email ? email.toLowerCase().trim() : '',
      phone: phone.trim(),
      whatsapp: whatsapp ? whatsapp.trim() : phone.trim(),
      subject: subject ? subject.trim() : '',
      message: message ? message.trim() : '',
      source: source || 'Call',
      status: status || 'New',
      branch: branch || null,
      assignedTo: assignedTo || null,
      notes: notes ? notes.trim() : '',
      lastInteraction: new Date(),
    })

    await lead.save()

    const savedLead = await Lead.findById(lead._id)
      .populate('branch', 'name')
      .populate('assignedTo', 'name email')

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      lead: savedLead,
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

    // Search in name, email, phone
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ]
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit)

    // Get leads with pagination
    const leads = await Lead.find(query)
      .populate('branch', 'name')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    // Get total count
    const total = await Lead.countDocuments(query)

    res.json({
      success: true,
      leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    })
  } catch (error) {
    console.error('Get leads error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Get single lead
// @route   GET /api/leads/:id
// @access  Private
export const getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('branch', 'name address phone email')
      .populate('assignedTo', 'name email phone')

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
    const { name, email, phone, whatsapp, subject, message, source, status, branch, assignedTo, notes } = req.body

    const lead = await Lead.findById(req.params.id)
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' })
    }

    // Update fields
    if (name) lead.name = name.trim()
    if (email) lead.email = email.toLowerCase().trim()
    if (phone) lead.phone = phone.trim()
    if (whatsapp !== undefined) lead.whatsapp = whatsapp.trim()
    if (subject !== undefined) lead.subject = subject.trim()
    if (message !== undefined) lead.message = message.trim()
    if (source) lead.source = source
    if (status) lead.status = status
    if (branch !== undefined) lead.branch = branch || null
    if (assignedTo !== undefined) lead.assignedTo = assignedTo || null
    if (notes !== undefined) lead.notes = notes.trim()
    
    lead.lastInteraction = new Date()

    await lead.save()

    const updatedLead = await Lead.findById(lead._id)
      .populate('branch', 'name')
      .populate('assignedTo', 'name email')

    res.json({ success: true, lead: updatedLead })
  } catch (error) {
    console.error('Update lead error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message })
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
