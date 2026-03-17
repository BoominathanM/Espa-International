/**
 * Ozonetel webhook routes
 * POST /api/ozonetel/call-details - receives Ozonetel call-details callback
 *
 * Sample CURL (localhost):
 *   curl -X POST "http://localhost:3001/api/ozonetel/call-details" \
 *     -H "Content-Type: application/x-www-form-urlencoded" \
 *     -d "Apikey=YOUR_OZONETEL_API_KEY" \
 *     -d "data={\"CallerID\":\"9876543210\",\"Status\":\"Answered\",\"CallDuration\":\"120\",\"AgentName\":\"Agent1\",\"AgentStatus\":\"Available\",\"DialStatus\":\"answered\",\"StartTime\":\"2025-03-17T10:00:00.000Z\",\"EndTime\":\"2025-03-17T10:02:00.000Z\",\"AudioFile\":\"https://recordings.example.com/abc.mp3\"}"
 *
 * With ngrok (replace with your ngrok URL):
 *   curl -X POST "https://YOUR-NGROK-URL.ngrok-free.app/api/ozonetel/call-details" \
 *     -H "Content-Type: application/x-www-form-urlencoded" \
 *     -d "Apikey=YOUR_OZONETEL_API_KEY" \
 *     -d "data={\"CallerID\":\"9876543210\",\"Status\":\"Answered\",\"CallDuration\":\"120\",\"AgentName\":\"Agent1\"}"
 */

import express from 'express'
import { handleCallDetails } from '../controllers/ozonetelCallDetailsController.js'

const router = express.Router()

router.post('/call-details', handleCallDetails)

export default router
