# Website Integration Testing Guide

This guide will help you test the website integration endpoint to ensure everything is working correctly.

## Prerequisites

1. **Backend server must be running**
   ```bash
   cd backend
   npm run dev
   ```

2. **MongoDB must be connected**
   - Check that you see "✅ Connected to MongoDB" in the console

3. **API Key configured**
   - Default API key: `esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4`
   - Or set in Settings → API & Integrations → Website Integration

## Quick Test Methods

### Method 1: Using the Test Script (Recommended)

```bash
cd backend
node test-website-integration.js
```

This will run comprehensive tests including:
- Health check
- Valid lead creation
- Validation testing
- API key authentication
- Duplicate prevention

### Method 2: Using cURL (Windows PowerShell)

```powershell
# Test 1: Health Check
curl http://localhost:3001/api/health

# Test 2: Create a Lead
$headers = @{
    "Content-Type" = "application/json"
    "X-API-Key" = "esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4"
}
$body = @{
    name = "Test User"
    email = "test@example.com"
    phone = "+91 9876543210"
    subject = "Test Subject"
    message = "This is a test message"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/leads/website" -Method POST -Headers $headers -Body $body
```

### Method 3: Using Postman

1. **Create a new POST request**
   - URL: `http://localhost:3001/api/leads/website`

2. **Add Headers:**
   - `Content-Type`: `application/json`
   - `X-API-Key`: `esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4`

3. **Add Body (JSON):**
   ```json
   {
     "name": "Test User",
     "email": "test@example.com",
     "phone": "+91 9876543210",
     "subject": "Test Subject",
     "message": "This is a test message"
   }
   ```

4. **Send the request**

### Method 4: Using Browser Console (for CORS testing)

Open your browser console on `https://www.espainternational.co.in` and run:

```javascript
fetch('http://localhost:3001/api/leads/website', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4'
  },
  body: JSON.stringify({
    name: 'Test User',
    email: 'test@example.com',
    phone: '+91 9876543210',
    subject: 'Test Subject',
    message: 'This is a test message'
  })
})
.then(response => response.json())
.then(data => console.log('Success:', data))
.catch(error => console.error('Error:', error));
```

## Expected Responses

### ✅ Success Response (201 Created)
```json
{
  "success": true,
  "message": "Lead created successfully",
  "lead": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+91 9876543210",
    "subject": "Test Subject",
    "source": "Website",
    "status": "New",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### ❌ Error: Missing Required Fields (400)
```json
{
  "success": false,
  "message": "Name, email, and phone are required fields"
}
```

### ❌ Error: Invalid API Key (401)
```json
{
  "success": false,
  "message": "Invalid API key"
}
```

### ❌ Error: Missing API Key (401)
```json
{
  "success": false,
  "message": "API key is required. Please provide X-API-Key header."
}
```

## Verification Steps

1. **Check Server Logs**
   - Look for any error messages in the backend console
   - Check if the request is being received

2. **Check MongoDB Database**
   - Connect to your MongoDB database
   - Check the `leads` collection
   - Verify the lead was created with:
     - `source: "Website"`
     - `status: "New"`
     - Correct name, email, phone

3. **Test Duplicate Prevention**
   - Submit the same email/phone within 24 hours
   - Should update existing lead instead of creating duplicate

4. **Test from Actual Website**
   - Use the JavaScript code from `WEBSITE_INTEGRATION.md`
   - Submit a test form from your website
   - Verify the lead appears in the database

## Troubleshooting

### Issue: "Cannot connect to server"
- **Solution**: Make sure backend server is running on port 3001
- Check: `http://localhost:3001/api/health`

### Issue: "Invalid API key"
- **Solution**: 
  1. Check API key in Settings → API & Integrations
  2. Verify it matches the key in your request header
  3. Make sure there are no extra spaces

### Issue: "CORS error"
- **Solution**: 
  1. Verify your website URL is in the CORS allowed origins
  2. Check `server.js` CORS configuration
  3. For production, update CORS settings

### Issue: "MongoDB connection error"
- **Solution**: 
  1. Check MongoDB URI in `.env` file
  2. Verify MongoDB is running and accessible
  3. Check network connectivity

## Next Steps After Testing

1. ✅ If all tests pass, your integration is ready!
2. 📝 Update your website contact form with the JavaScript code
3. 🔒 For production, use environment variables for API key (never expose in client-side code)
4. 📊 Monitor leads coming in through the CRM dashboard

## Support

If you encounter any issues:
1. Check the backend console for error messages
2. Verify all environment variables are set correctly
3. Review the `WEBSITE_INTEGRATION.md` file for integration code examples
