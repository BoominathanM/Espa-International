import mongoose from 'mongoose'
import Lead from '../models/Lead.js'
import Branch from '../models/Branch.js'
import User from '../models/User.js'

// @desc    Create lead from website contact form
// @route   POST /api/leads/website
// @access  Public (API Key protected)
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
    if (!firstName || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'First name, email, and phone are required fields',
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

    // Validate and convert branch if provided
    let branchId = null
    if (branch) {
      // Check if branch is a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(branch)) {
        // Verify branch exists
        const branchExists = await Branch.findById(branch)
        if (branchExists) {
          branchId = branch
        }
      } else {
        // If branch is a string (like branch name), try to find it by name
        const branchByName = await Branch.findOne({ name: { $regex: new RegExp(`^${branch}$`, 'i') } })
        if (branchByName) {
          branchId = branchByName._id
        }
        // If branch name not found, set to null (optional field)
      }
    }

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
      existingLead.first_name = firstName.trim()
      existingLead.last_name = lastName.trim()
      existingLead.subject = subject ? subject.trim() : existingLead.subject
      existingLead.message = message ? message.trim() : existingLead.message
      if (appointment_date) existingLead.appointment_date = new Date(appointment_date)
      if (slot_time) existingLead.slot_time = slot_time.trim()
      if (spa_package) existingLead.spa_package = spa_package.trim()
      existingLead.branch = branchId
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
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      whatsapp: phone.trim(), // Default to phone if WhatsApp not provided
      subject: subject ? subject.trim() : '',
      message: message ? message.trim() : '',
      source: 'Website',
      status: 'New',
      branch: branchId,
      appointment_date: appointment_date ? new Date(appointment_date) : null,
      slot_time: slot_time ? slot_time.trim() : '',
      spa_package: spa_package ? spa_package.trim() : '',
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
          first_name: lead.first_name,
          last_name: lead.last_name,
          name: lead.name, // Virtual field for backward compatibility
          email: lead.email,
          phone: lead.phone,
          subject: lead.subject,
          source: lead.source,
          status: lead.status,
          appointment_date: lead.appointment_date,
          slot_time: lead.slot_time,
          spa_package: lead.spa_package,
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
        // Verify branch exists
        const branchExists = await Branch.findById(branch)
        if (!branchExists) {
          return res.status(400).json({
            success: false,
            message: 'Branch not found',
          })
        }
        branchId = branch
      } else {
        // If branch is a string (like branch name), try to find it by name
        const branchByName = await Branch.findOne({ name: { $regex: new RegExp(`^${branch}$`, 'i') } })
        if (branchByName) {
          branchId = branchByName._id
        } else {
          // If branch name not found, set to null instead of error (optional field)
          branchId = null
        }
      }
    }

    // Check for duplicate email or phone
    const duplicateQuery = {
      $or: []
    }
    if (email && email.trim()) {
      duplicateQuery.$or.push({ email: email.toLowerCase().trim() })
    }
    if (phone && phone.trim()) {
      duplicateQuery.$or.push({ phone: phone.trim() })
    }

    if (duplicateQuery.$or.length > 0) {
      const existingLead = await Lead.findOne(duplicateQuery)
      if (existingLead) {
        return res.status(400).json({
          success: false,
          message: `Lead with this ${existingLead.email === email.toLowerCase().trim() ? 'email' : 'phone'} already exists`,
        })
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

    // Handle name field - support both old 'name' and new 'first_name'/'last_name'
    if (name && !first_name) {
      const nameParts = name.trim().split(' ')
      lead.first_name = nameParts[0] || lead.first_name
      lead.last_name = nameParts.slice(1).join(' ') || lead.last_name
    } else {
      if (first_name !== undefined) lead.first_name = first_name.trim()
      if (last_name !== undefined) lead.last_name = last_name.trim()
    }

    // Validate and convert branch if provided
    if (branch !== undefined) {
      if (branch === null || branch === '') {
        lead.branch = null
      } else {
        // Check if branch is a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(branch)) {
          // Verify branch exists
          const branchExists = await Branch.findById(branch)
          if (!branchExists) {
            return res.status(400).json({
              success: false,
              message: 'Branch not found',
            })
          }
          lead.branch = branch
        } else {
          // If branch is a string (like branch name), try to find it by name
          const branchByName = await Branch.findOne({ name: { $regex: new RegExp(`^${branch}$`, 'i') } })
          if (branchByName) {
            lead.branch = branchByName._id
          } else {
            // If branch name not found, set to null instead of error (optional field)
            lead.branch = null
          }
        }
      }
    }

    // Update fields
    if (email) lead.email = email.toLowerCase().trim()
    if (phone) lead.phone = phone.trim()
    if (whatsapp !== undefined) lead.whatsapp = whatsapp.trim()
    if (subject !== undefined) lead.subject = subject.trim()
    if (message !== undefined) lead.message = message.trim()
    if (source) lead.source = source
    if (status) lead.status = status
    if (appointment_date !== undefined) lead.appointment_date = appointment_date ? new Date(appointment_date) : null
    if (slot_time !== undefined) lead.slot_time = slot_time.trim()
    if (spa_package !== undefined) lead.spa_package = spa_package.trim()
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
      `"${(lead.first_name || '').replace(/"/g, '""')}"`,
      `"${(lead.last_name || '').replace(/"/g, '""')}"`,
      `"${(lead.email || '').replace(/"/g, '""')}"`,
      `"${(lead.phone || '').replace(/"/g, '""')}"`,
      `"${(lead.whatsapp || '').replace(/"/g, '""')}"`,
      `"${(lead.subject || '').replace(/"/g, '""')}"`,
      `"${(lead.message || '').replace(/"/g, '""')}"`,
      `"${(lead.source || '').replace(/"/g, '""')}"`,
      `"${(lead.status || '').replace(/"/g, '""')}"`,
      `"${(lead.branch?.name || '').replace(/"/g, '""')}"`,
      `"${lead.appointment_date ? new Date(lead.appointment_date).toISOString().split('T')[0] : ''}"`,
      `"${(lead.slot_time || '').replace(/"/g, '""')}"`,
      `"${(lead.spa_package || '').replace(/"/g, '""')}"`,
      `"${(lead.assignedTo?.name || '').replace(/"/g, '""')}"`,
      `"${(lead.notes || '').replace(/"/g, '""')}"`,
      `"${lead.lastInteraction ? new Date(lead.lastInteraction).toISOString() : ''}"`,
      `"${lead.createdAt ? new Date(lead.createdAt).toISOString() : ''}"`,
    ])

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n')

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="leads_${new Date().toISOString().split('T')[0]}.csv"`)
    res.send('\ufeff' + csvContent) // BOM for Excel compatibility
  } catch (error) {
    console.error('Export leads error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Get sample CSV file for import
// @route   GET /api/leads/import/sample
// @access  Private
export const getSampleCSV = async (req, res) => {
  try {
    // Create sample CSV with only allowed fields
    const csvHeaders = ['First Name', 'Last Name', 'Phone', 'Email', 'WhatsApp', 'Subject', 'Message', 'Appointment Date', 'Slot Time', 'Spa Package']
    const sampleRows = [
      ['John', 'Doe', '9876543210', 'john@example.com', '9876543210', 'Test Subject', 'Test message', '2024-12-25', '10:00 AM', 'Full Body Massage'],
      ['Jane', 'Smith', '9876543211', 'jane@example.com', '9876543211', '', '', '', '', ''],
    ]

    const csvContent = [
      csvHeaders.join(','),
      ...sampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="leads_import_sample.csv"')
    res.send('\ufeff' + csvContent) // BOM for Excel compatibility
  } catch (error) {
    console.error('Get sample CSV error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Import leads from CSV
// @route   POST /api/leads/import
// @access  Private
export const importLeads = async (req, res) => {
  try {
    const { leads: leadsData } = req.body

    if (!Array.isArray(leadsData) || leadsData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data. Please provide an array of leads.',
      })
    }

    // Allowed fields (mandatory + optional)
    const allowedFields = ['first_name', 'last_name', 'name', 'phone', 'email', 'whatsapp', 'subject', 'message', 'appointment_date', 'slot_time', 'spa_package', 'branch']
    
    const results = {
      total: leadsData.length,
      success: 0,
      failed: 0,
      duplicates: 0,
      errors: [],
    }

    // Track duplicates within the import file itself
    const fileDuplicates = new Set()
    const fileEmails = new Map()
    const filePhones = new Map()

    // Process each lead
    for (let i = 0; i < leadsData.length; i++) {
      const row = leadsData[i]
      const rowNumber = i + 1
      const rowErrors = []

      try {
        // Check for disallowed fields
        const disallowedFields = Object.keys(row).filter(key => !allowedFields.includes(key.toLowerCase()))
        if (disallowedFields.length > 0) {
          rowErrors.push(`Disallowed fields found: ${disallowedFields.join(', ')}. Only these fields are allowed: ${allowedFields.join(', ')}`)
        }

        // Handle name field - support both old 'name' and new 'first_name'/'last_name'
        let firstName = row.first_name || ''
        let lastName = row.last_name || ''
        
        if (row.name && !row.first_name) {
          const nameParts = row.name.trim().split(' ')
          firstName = nameParts[0] || ''
          lastName = nameParts.slice(1).join(' ') || ''
        }

        // Validate mandatory fields
        if (!firstName || !firstName.trim()) {
          rowErrors.push('First name (or name) is mandatory and cannot be empty')
        }
        if (!row.phone || !row.phone.trim()) {
          rowErrors.push('Phone is mandatory and cannot be empty')
        }

        // If mandatory fields are missing, skip further validation
        if (rowErrors.length > 0) {
          results.failed++
          results.errors.push({
            row: rowNumber,
            error: rowErrors.join('; '),
            data: row,
          })
          continue
        }

        // Validate email format if provided
        if (row.email && row.email.trim()) {
          const emailRegex = /^\S+@\S+\.\S+$/
          if (!emailRegex.test(row.email.trim())) {
            rowErrors.push(`Invalid email format: "${row.email}"`)
          }
        }

        // Check for duplicates within the file itself
        const normalizedEmail = row.email ? row.email.toLowerCase().trim() : null
        const normalizedPhone = row.phone.trim()

        // Check if email already exists in file
        if (normalizedEmail && fileEmails.has(normalizedEmail)) {
          rowErrors.push(`Duplicate email "${row.email}" found in row ${fileEmails.get(normalizedEmail)}`)
        }
        // Check if phone already exists in file
        if (filePhones.has(normalizedPhone)) {
          rowErrors.push(`Duplicate phone "${row.phone}" found in row ${filePhones.get(normalizedPhone)}`)
        }

        // If file duplicates found, skip (don't track this row)
        if (rowErrors.length > 0) {
          results.failed++
          results.errors.push({
            row: rowNumber,
            error: rowErrors.join('; '),
            data: row,
          })
          continue
        }

        // Track this row's email/phone for file duplicate checking (only if no errors so far)
        if (normalizedEmail) {
          fileEmails.set(normalizedEmail, rowNumber)
        }
        filePhones.set(normalizedPhone, rowNumber)

        // Check for duplicates in database (email or phone)
        const duplicateQuery = {
          $or: []
        }
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
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
    })
  }
}
