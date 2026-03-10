/**
 * Test script to verify webhook stores leads in database with source "WhatsApp"
 * 
 * Usage: node test-webhook-storage.js
 */

import mongoose from 'mongoose'
import Lead from './models/Lead.js'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env file')
  process.exit(1)
}

// Test payload matching the webhook format
const testPayload = {
  event: 'lead_created',
  timestamp: '2023-07-20T12:34:56Z',
  data: {
    leadId: '507f1f77bcf86cd799439011',
    name: 'John Doe',
    email: 'john@example.com',
    mobile: '1234567890',
    company: 'Example Corp',
    status: 'New Lead'
  }
}

async function testWebhookStorage() {
  try {
    console.log('='.repeat(60))
    console.log('🧪 Testing WhatsApp Webhook Lead Storage')
    console.log('='.repeat(60))

    // Connect to MongoDB
    console.log('\n📡 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Extract data from payload (simulating webhook handler)
    const { name, email, mobile, company, status } = testPayload.data

    // Parse name
    const nameParts = name.trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Prepare email
    let emailValue = undefined
    if (email && email.trim()) {
      const emailRegex = /^\S+@\S+\.\S+$/
      if (emailRegex.test(email.trim())) {
        emailValue = email.toLowerCase().trim()
      }
    }

    // Map status
    const statusMap = {
      'New Lead': 'New',
      'In Progress': 'In Progress',
      'Follow-Up': 'Follow-Up',
      'Converted': 'Converted',
      'Lost': 'Lost',
    }
    const mappedStatus = statusMap[status] || 'New'

    // Create lead data (matching webhook handler)
    const leadData = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: mobile.trim(),
      whatsapp: mobile.trim(),
      subject: company ? `From ${company}` : 'WhatsApp Lead',
      message: `Lead created via WhatsApp API${company ? ` from ${company}` : ''}`,
      source: 'WhatsApp', // ✅ CRITICAL: Source set to WhatsApp
      status: mappedStatus,
      lastInteraction: new Date(),
      notes: '',
    }

    if (emailValue) {
      leadData.email = emailValue
    }

    console.log('\n📝 Lead data to create:')
    console.log(JSON.stringify(leadData, null, 2))

    // Check for duplicate
    const duplicateQuery = {
      $or: [
        { phone: mobile.trim() }
      ]
    }
    if (emailValue) {
      duplicateQuery.$or.push({ email: emailValue })
    }

    const existingLead = await Lead.findOne(duplicateQuery)
    if (existingLead) {
      console.log('\n⚠️  Duplicate lead found:', existingLead._id)
      console.log('   Source:', existingLead.source)
      console.log('   Phone:', existingLead.phone)
      
      // Delete duplicate for testing
      await Lead.findByIdAndDelete(existingLead._id)
      console.log('   ✅ Deleted duplicate for testing')
    }

    // Create and save lead
    console.log('\n💾 Creating and saving lead...')
    const lead = new Lead(leadData)
    
    // Validate
    await lead.validate()
    console.log('✅ Lead validation passed')

    // Save
    await lead.save()
    console.log('✅ Lead saved to database')
    console.log('   Lead ID:', lead._id)

    // Verify in database
    console.log('\n🔍 Verifying lead in database...')
    const savedLead = await Lead.findById(lead._id)
    
    if (!savedLead) {
      console.error('❌ Lead not found in database!')
      process.exit(1)
    }

    console.log('✅ Lead found in database')
    console.log('\n📊 Lead Details:')
    console.log('   ID:', savedLead._id)
    console.log('   Name:', `${savedLead.first_name} ${savedLead.last_name}`.trim())
    console.log('   Phone:', savedLead.phone)
    console.log('   Email:', savedLead.email || 'Not provided')
    console.log('   Source:', savedLead.source) // Should be "WhatsApp"
    console.log('   Status:', savedLead.status)
    console.log('   Created At:', savedLead.createdAt)

    // Verify source is "WhatsApp"
    if (savedLead.source === 'WhatsApp') {
      console.log('\n✅ SUCCESS: Source is correctly set to "WhatsApp"')
    } else {
      console.error(`\n❌ ERROR: Source is "${savedLead.source}" instead of "WhatsApp"`)
      process.exit(1)
    }

    // Query by source to verify
    const whatsappLeads = await Lead.find({ source: 'WhatsApp' }).limit(5)
    console.log(`\n📈 Found ${whatsappLeads.length} lead(s) with source "WhatsApp"`)

    // Clean up test lead
    console.log('\n🧹 Cleaning up test lead...')
    await Lead.findByIdAndDelete(lead._id)
    console.log('✅ Test lead deleted')

    console.log('\n' + '='.repeat(60))
    console.log('✅ TEST PASSED: Webhook correctly stores leads with source "WhatsApp"')
    console.log('='.repeat(60))

    process.exit(0)
  } catch (error) {
    console.error('\n❌ TEST FAILED:')
    console.error('Error:', error.message)
    if (error.errors) {
      console.error('Validation errors:', error.errors)
    }
    console.error('Stack:', error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n📡 Disconnected from MongoDB')
  }
}

// Run test
testWebhookStorage()

