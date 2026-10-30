import TeleCMISettings from '../models/TeleCMISettings.js'
import TeleCMICallLog from '../models/TeleCMICallLog.js'
import User from '../models/User.js'
import {
  fetchTeleCMIBalance,
  fetchTeleCMIUser,
  teleCMIAppId,
} from '../services/telecmiAgentCallService.js'

const AGENT_ID_RE = /^\d+_\d+$/
const MAX_AGENT_LOOKUPS = 25
const phoneTail = (v) => String(v ?? '').replace(/\D/g, '').slice(-10)

export const getTeleCMISettings = async (req, res) => {
  try {
    const settings = await TeleCMISettings.getSettings()

    res.json({
      success: true,
      settings: {
        _id: settings._id,
        fromPhoneNumber: settings.fromPhoneNumber,
        webhookApiKey: settings.webhookApiKey,
        clickToCallSecret: settings.clickToCallSecret,
        isActive: settings.isActive,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('Get TeleCMI settings error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

export const updateTeleCMISettings = async (req, res) => {
  try {
    const { fromPhoneNumber, webhookApiKey, clickToCallSecret, isActive } = req.body

    let settings = await TeleCMISettings.findOne()

    const values = {
      fromPhoneNumber: (fromPhoneNumber || '').trim(),
      webhookApiKey: (webhookApiKey || '').trim(),
      clickToCallSecret: (clickToCallSecret || '').trim(),
      lastUpdatedBy: req.user?._id || null,
    }

    if (!settings) {
      settings = new TeleCMISettings({
        ...values,
        isActive: isActive !== undefined ? isActive : true,
      })
    } else {
      Object.assign(settings, values)
      if (isActive !== undefined) settings.isActive = isActive
    }

    await settings.save()

    res.json({
      success: true,
      message: 'TeleCMI integration settings updated successfully',
      settings: {
        _id: settings._id,
        fromPhoneNumber: settings.fromPhoneNumber,
        webhookApiKey: settings.webhookApiKey,
        clickToCallSecret: settings.clickToCallSecret,
        isActive: settings.isActive,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('Update TeleCMI settings error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message })
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

/**
 * Live, read-only check of the TeleCMI side of click-to-call for Settings → TeleCMI Integration:
 * the app's call balance + validity exactly as TeleCMI reports them (the account wallet can show
 * money while the app still reads 0 — the CRM blocks calls on the app figure), whether each CRM
 * user's TeleCMI User ID exists in that app, and the last webhook TeleCMI delivered.
 * No secrets, passwords or agent phone numbers are returned.
 */
export const getTeleCMIAccountStatus = async (req, res) => {
  try {
    const settings = await TeleCMISettings.getSettings()
    const secret = settings.clickToCallSecret
    const users = await User.find({ telecmiAgentId: { $nin: [null, ''] } })
      .select('name telecmiAgentId status')
      .sort({ name: 1 })
      .lean()

    // The app most mapped User IDs belong to (TELECMI_APP_ID wins when set).
    const suffixCounts = {}
    for (const u of users) {
      if (AGENT_ID_RE.test(u.telecmiAgentId)) {
        const suffix = u.telecmiAgentId.split('_').pop()
        suffixCounts[suffix] = (suffixCounts[suffix] || 0) + 1
      }
    }
    const topSuffix = Object.entries(suffixCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    const appId = teleCMIAppId(topSuffix)

    let balance
    if (!secret) balance = { ok: false, message: 'Click-to-Call App Secret is not set' }
    else if (!appId) balance = { ok: false, message: 'No user has a TeleCMI User ID like 5019_33338459, so the app id is unknown' }
    else {
      try {
        balance = { ok: true, ...(await fetchTeleCMIBalance(secret, appId)) }
      } catch (err) {
        balance = { ok: false, message: err.message }
      }
    }

    let lookups = 0
    const agents = await Promise.all(
      users.map(async (u) => {
        const row = { name: u.name, agentId: u.telecmiAgentId, active: u.status !== 'inactive' }
        if (!AGENT_ID_RE.test(u.telecmiAgentId)) {
          return { ...row, ok: false, reason: 'Not a TeleCMI User ID (expected e.g. 5019_33338459)' }
        }
        const suffix = u.telecmiAgentId.split('_').pop()
        if (appId && Number(suffix) !== appId) {
          return { ...row, ok: false, reason: `Belongs to TeleCMI app ${suffix}, not app ${appId}` }
        }
        if (!balance.ok || lookups >= MAX_AGENT_LOOKUPS) return { ...row, ok: null, reason: 'Not checked' }
        lookups += 1
        try {
          const agent = await fetchTeleCMIUser(secret, appId, u.telecmiAgentId)
          if (!agent) return { ...row, ok: false, reason: `Not found in TeleCMI app ${appId}` }
          if (!agent.hasPhone) return { ...row, ok: false, telecmiName: agent.name, reason: 'No follow-me phone set in TeleCMI' }
          return { ...row, ok: true, telecmiName: agent.name }
        } catch (err) {
          return { ...row, ok: null, reason: `Could not check: ${err.message}` }
        }
      })
    )

    const appIds = appId ? [appId, String(appId)] : []
    const lastWebhook = await TeleCMICallLog.findOne(appIds.length ? { 'rawPayload.appid': { $in: appIds } } : { rawPayload: { $ne: null } })
      .sort({ updatedAt: -1 })
      .select('updatedAt variant status rawPayload.virtual_number rawPayload.appid')
      .lean()
    const appNumber = lastWebhook?.rawPayload?.virtual_number ? String(lastWebhook.rawPayload.virtual_number) : ''

    const warnings = []
    const balanceCheckOff = String(process.env.TELECMI_BALANCE_CHECK || '').trim().toLowerCase() === 'false'
    if (!settings.isActive) warnings.push('Integration Status is Inactive.')
    if (!balance.ok) warnings.push(`Could not read the TeleCMI app balance: ${balance.message}.`)
    else if (balance.balance <= 0) {
      warnings.push(
        `TeleCMI reports a call balance of 0 for app ${appId}. TeleCMI rejects outbound calls until this app shows a balance` +
          (balanceCheckOff ? '' : ', so the CRM blocks click-to-call') +
          `. The TeleCMI account wallet ("Total voice balance") is not this app's balance — if you recharged, ask TeleCMI support to credit app ${appId}.`
      )
    }
    if (balance.ok && balance.expire && balance.expire < Date.now()) warnings.push(`TeleCMI app ${appId} expired.`)
    const badAgents = agents.filter((a) => a.ok === false)
    if (badAgents.length) warnings.push(`${badAgents.length} user(s) have a TeleCMI User ID that will not work — see the list below.`)
    if (!agents.some((a) => a.ok)) warnings.push('No user has a working TeleCMI User ID, so no click-to-call can ring anyone.')
    if (appNumber && phoneTail(appNumber) !== phoneTail(settings.fromPhoneNumber)) {
      warnings.push(`From Phone Number (${settings.fromPhoneNumber || 'empty'}) is not this app's number +${appNumber} (seen on TeleCMI's latest webhook) — set it to +${appNumber}.`)
    }

    res.json({
      success: true,
      checkedAt: new Date(),
      ready: warnings.length === 0,
      appId,
      balanceCheckEnabled: !balanceCheckOff,
      balance,
      appNumber,
      fromPhoneNumber: settings.fromPhoneNumber,
      agents,
      lastWebhook: lastWebhook
        ? { at: lastWebhook.updatedAt, variant: lastWebhook.variant, status: lastWebhook.status }
        : null,
      warnings,
    })
  } catch (error) {
    console.error('Get TeleCMI account status error:', error)
    res.status(500).json({ success: false, message: 'Failed to check the TeleCMI account' })
  }
}
