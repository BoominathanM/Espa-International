# Website Integration Guide

This document explains how to integrate the E Spa International website contact form with the backend API.

## API Endpoint

**Endpoint:** `POST /api/leads/website`

**Base URL:** `http://localhost:3001` (development) or your production URL

**Authentication:** API Key required in header

## API Key

Your API key: `esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4`

**Important:** Make sure to set `WEBSITE_API_KEY` in your `.env` file with this value.

## Request Format

### Headers
```
Content-Type: application/json
X-API-Key: esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4
```

### Request Body
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+91 9876543210",
  "subject": "General Enquiry",
  "message": "I would like to know more about your spa services."
}
```

### Required Fields
- `name` (string) - Customer name
- `email` (string) - Valid email address
- `phone` (string) - Phone number

### Optional Fields
- `subject` (string) - Subject of the enquiry
- `message` (string) - Message content

## Response Format

### Success Response (201 Created)
```json
{
  "success": true,
  "message": "Lead created successfully",
  "lead": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+91 9876543210",
    "subject": "General Enquiry",
    "source": "Website",
    "status": "New",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Error Response (400 Bad Request)
```json
{
  "success": false,
  "message": "Name, email, and phone are required fields"
}
```

### Error Response (401 Unauthorized)
```json
{
  "success": false,
  "message": "Invalid API key"
}
```

## Website Integration Example

### HTML Form
```html
<form id="contactForm">
  <input type="text" id="name" name="name" placeholder="Your Name" required>
  <input type="email" id="email" name="email" placeholder="Your Email" required>
  <input type="tel" id="phone" name="phone" placeholder="Your Phone" required>
  <input type="text" id="subject" name="subject" placeholder="Subject">
  <textarea id="message" name="message" placeholder="Your Message"></textarea>
  <button type="submit">Submit</button>
</form>
```

### JavaScript Integration
```javascript
document.getElementById('contactForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const formData = {
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    subject: document.getElementById('subject').value.trim() || '',
    message: document.getElementById('message').value.trim() || ''
  };

  try {
    const response = await fetch('http://localhost:3001/api/leads/website', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4'
      },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (response.ok && data.success) {
      alert('Thank you! Your message has been sent successfully.');
      document.getElementById('contactForm').reset();
    } else {
      alert('Error: ' + (data.message || 'Failed to send message. Please try again.'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Network error. Please check your connection and try again.');
  }
});
```

### jQuery Integration (Alternative)
```javascript
$('#contactForm').on('submit', function(e) {
  e.preventDefault();
  
  const formData = {
    name: $('#name').val().trim(),
    email: $('#email').val().trim(),
    phone: $('#phone').val().trim(),
    subject: $('#subject').val().trim() || '',
    message: $('#message').val().trim() || ''
  };

  $.ajax({
    url: 'http://localhost:3001/api/leads/website',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4'
    },
    data: JSON.stringify(formData),
    success: function(data) {
      if (data.success) {
        alert('Thank you! Your message has been sent successfully.');
        $('#contactForm')[0].reset();
      }
    },
    error: function(xhr) {
      const error = xhr.responseJSON || { message: 'Failed to send message' };
      alert('Error: ' + error.message);
    }
  });
});
```

## Important Notes

1. **CORS Configuration**: The backend is configured to accept requests from `https://www.espainternational.co.in`. Make sure your production URL is added to the CORS allowed origins.

2. **Duplicate Prevention**: The system automatically prevents duplicate leads from the same email or phone within 24 hours. If a duplicate is detected, the existing lead is updated instead.

3. **IP Tracking**: The system automatically captures the IP address and website URL from the request for tracking purposes.

4. **Production URL**: Replace `http://localhost:3001` with your production backend URL when deploying.

5. **Security**: Never expose your API key in client-side JavaScript in production. Consider using a server-side proxy or environment variables.

## Testing

You can test the endpoint using curl:

```bash
curl -X POST http://localhost:3001/api/leads/website \
  -H "Content-Type: application/json" \
  -H "X-API-Key: esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+91 9876543210",
    "subject": "Test Subject",
    "message": "This is a test message"
  }'
```

## Support

For issues or questions, contact the development team.
