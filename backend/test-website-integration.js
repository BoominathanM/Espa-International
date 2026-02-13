/**
 * Test script for Website Integration Endpoint
 * Run this with: node test-website-integration.js
 */

const API_KEY = 'esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4'
const BASE_URL = 'http://localhost:3001'

async function testWebsiteIntegration() {
  console.log('🧪 Testing Website Integration Endpoint\n')
  console.log('=' .repeat(60))
  
  // Test 1: Health check
  console.log('\n1️⃣ Testing Health Check...')
  try {
    const healthResponse = await fetch(`${BASE_URL}/api/health`)
    const healthData = await healthResponse.json()
    console.log('✅ Health Check:', healthData)
  } catch (error) {
    console.error('❌ Health Check Failed:', error.message)
    console.log('\n⚠️  Make sure your server is running on port 3001')
    console.log('   Run: npm run dev (in the backend directory)')
    process.exit(1)
  }

  // Test 2: Create lead with valid data
  console.log('\n2️⃣ Testing Lead Creation (Valid Data)...')
  try {
    const leadData = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '+91 9876543210',
      subject: 'Test Subject',
      message: 'This is a test message from the integration test script.'
    }

    const response = await fetch(`${BASE_URL}/api/leads/website`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(leadData)
    })

    const data = await response.json()
    
    if (response.ok && data.success) {
      console.log('✅ Lead Created Successfully!')
      console.log('   Lead ID:', data.lead._id)
      console.log('   Name:', data.lead.name)
      console.log('   Email:', data.lead.email)
      console.log('   Phone:', data.lead.phone)
      console.log('   Source:', data.lead.source)
      console.log('   Status:', data.lead.status)
    } else {
      console.log('❌ Lead Creation Failed')
      console.log('   Status:', response.status)
      console.log('   Response:', JSON.stringify(data, null, 2))
    }
  } catch (error) {
    console.error('❌ Request Failed:', error.message)
  }

  // Test 3: Test with missing required fields
  console.log('\n3️⃣ Testing Validation (Missing Required Fields)...')
  try {
    const invalidData = {
      name: 'Test User',
      // Missing email and phone
    }

    const response = await fetch(`${BASE_URL}/api/leads/website`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(invalidData)
    })

    const data = await response.json()
    
    if (response.status === 400) {
      console.log('✅ Validation Working Correctly')
      console.log('   Error Message:', data.message)
    } else {
      console.log('⚠️  Unexpected Response')
      console.log('   Status:', response.status)
      console.log('   Response:', JSON.stringify(data, null, 2))
    }
  } catch (error) {
    console.error('❌ Request Failed:', error.message)
  }

  // Test 4: Test with invalid API key
  console.log('\n4️⃣ Testing API Key Authentication (Invalid Key)...')
  try {
    const leadData = {
      name: 'Test User',
      email: 'test2@example.com',
      phone: '+91 9876543211'
    }

    const response = await fetch(`${BASE_URL}/api/leads/website`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'invalid_api_key_12345'
      },
      body: JSON.stringify(leadData)
    })

    const data = await response.json()
    
    if (response.status === 401) {
      console.log('✅ API Key Authentication Working Correctly')
      console.log('   Error Message:', data.message)
    } else {
      console.log('⚠️  Unexpected Response')
      console.log('   Status:', response.status)
      console.log('   Response:', JSON.stringify(data, null, 2))
    }
  } catch (error) {
    console.error('❌ Request Failed:', error.message)
  }

  // Test 5: Test duplicate prevention
  console.log('\n5️⃣ Testing Duplicate Prevention...')
  try {
    const duplicateData = {
      name: 'Test User (Updated)',
      email: 'test@example.com', // Same email as test 2
      phone: '+91 9876543210',    // Same phone as test 2
      subject: 'Updated Subject',
      message: 'This should update the existing lead instead of creating a duplicate.'
    }

    const response = await fetch(`${BASE_URL}/api/leads/website`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(duplicateData)
    })

    const data = await response.json()
    
    if (response.ok && data.success) {
      if (data.message.includes('updated')) {
        console.log('✅ Duplicate Prevention Working')
        console.log('   Message:', data.message)
        console.log('   Lead was updated instead of creating duplicate')
      } else {
        console.log('⚠️  New lead created (might be outside 24-hour window)')
        console.log('   Message:', data.message)
      }
    } else {
      console.log('❌ Request Failed')
      console.log('   Status:', response.status)
      console.log('   Response:', JSON.stringify(data, null, 2))
    }
  } catch (error) {
    console.error('❌ Request Failed:', error.message)
  }

  console.log('\n' + '='.repeat(60))
  console.log('\n✅ Testing Complete!')
  console.log('\n📝 Next Steps:')
  console.log('   1. Check your MongoDB database to see the created leads')
  console.log('   2. Test from your actual website using the JavaScript code')
  console.log('   3. Verify leads appear in the CRM frontend (once connected)')
  console.log('\n📚 Integration Guide: backend/WEBSITE_INTEGRATION.md')
}

// Run the tests
testWebsiteIntegration().catch(console.error)
