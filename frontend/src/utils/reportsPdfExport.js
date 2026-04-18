import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const MARGIN = 40
/** Limit rows per large table so the browser can finish generating the PDF. */
const PDF_MAX_DETAIL_ROWS = 800

function pdfStr(v) {
  if (v == null || v === undefined) return ''
  const s = String(v)
  return s.length > 1200 ? `${s.slice(0, 1197)}…` : s
}

function normOzId(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  return s.split(/\s*(?:->|=>|→)\s*/)[0].trim()
}

function callRowMatchesAgentProfile(row, agent) {
  const pid = normOzId(agent.ozonetelAgentId)
  const rid = normOzId(row.agentId)
  const rcrm = normOzId(row.crmCloudAgentId)
  if (pid && (rid === pid || rcrm === pid)) return true
  const an = String(agent.name || '').trim().toLowerCase()
  if (!an) return false
  if (String(row.crmAgentName || '').trim().toLowerCase() === an) return true
  if (String(row.agentName || '').trim().toLowerCase() === an) return true
  return false
}

function callGroupKeyForExport(r) {
  const id = String(r.agentId ?? '').trim()
  const nm = String(r.agentName ?? '').trim()
  return id || nm || '_'
}

function sortLocale(a, b) {
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
}

function collectAgentSections(report) {
  const perf = report.agent?.performance || []
  const assignedRows = report.agent?.assignedLeadsTable || []
  const agentCallRows = report.agent?.agentCallsTable || []

  const leadsByNorm = new Map()
  for (const row of assignedRows) {
    const raw = String(row.assignedAgent ?? '').trim() || '-'
    const nk = raw === '-' ? '-' : raw.toLowerCase()
    if (!leadsByNorm.has(nk)) leadsByNorm.set(nk, [])
    leadsByNorm.get(nk).push(row)
  }

  const usedCallKeys = new Set()
  const takeCallsForProfile = (profile) => {
    const out = []
    for (const row of agentCallRows) {
      if (usedCallKeys.has(row.key)) continue
      if (callRowMatchesAgentProfile(row, profile)) {
        usedCallKeys.add(row.key)
        out.push(row)
      }
    }
    return out
  }

  const sections = []
  const perfSorted = [...perf].sort((a, b) => sortLocale(a.name || '', b.name || ''))
  const perfNameNorms = new Set(perf.map((p) => String(p.name || '').trim().toLowerCase()).filter(Boolean))

  for (const r of perfSorted) {
    const norm = String(r.name || '').trim().toLowerCase()
    const leadRows = norm ? leadsByNorm.get(norm) || [] : []
    const profile = { name: r.name, ozonetelAgentId: r.ozonetelAgentId }
    const callRows = takeCallsForProfile(profile)
    sections.push({ title: pdfStr(r.name), perfRow: r, leadRows, callRows })
  }

  const leadNormsSorted = [...leadsByNorm.keys()].sort((a, b) => {
    if (a === '-') return 1
    if (b === '-') return -1
    return sortLocale(a, b)
  })
  for (const nk of leadNormsSorted) {
    if (nk === '-' || perfNameNorms.has(nk)) continue
    const leadRows = leadsByNorm.get(nk) || []
    const first = leadRows[0]
    const displayName = String(first.assignedAgent || '').trim() || 'Unknown'
    const profile = { name: first.assignedAgent, ozonetelAgentId: first.assignedOzonetelId }
    const callRows = takeCallsForProfile(profile)
    sections.push({ title: displayName, perfRow: null, leadRows, callRows })
  }

  if (leadsByNorm.has('-') && !perfNameNorms.has('-')) {
    const leadRows = leadsByNorm.get('-') || []
    const first = leadRows[0]
    const profile = {
      name: first?.assignedAgent || '-',
      ozonetelAgentId: first?.assignedOzonetelId ?? '',
    }
    const callRows = takeCallsForProfile(profile)
    sections.push({ title: 'Unassigned', perfRow: null, leadRows, callRows })
  }

  const remainingCalls = agentCallRows.filter((row) => !usedCallKeys.has(row.key))
  const callsByCk = new Map()
  for (const row of remainingCalls) {
    const ck = callGroupKeyForExport(row)
    if (!callsByCk.has(ck)) callsByCk.set(ck, [])
    callsByCk.get(ck).push(row)
  }
  const ckSorted = [...callsByCk.keys()].sort(sortLocale)
  for (const ck of ckSorted) {
    const callRows = callsByCk.get(ck)
    const first = callRows[0]
    const displayName = String(first.agentName || first.agentId || ck).trim() || 'Unknown'
    sections.push({ title: displayName, perfRow: null, leadRows: [], callRows })
  }

  return sections
}

function addTitleBlock(doc, heading, sub, meta, dateFrom, dateTo) {
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('ESPA — Reports', MARGIN, MARGIN)
  doc.setFontSize(12)
  doc.text(pdfStr(heading), MARGIN, MARGIN + 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(pdfStr(sub), MARGIN, MARGIN + 38)
  doc.text(
    `Date range: ${pdfStr(meta?.dateFrom ?? dateFrom)} → ${pdfStr(meta?.dateTo ?? dateTo)}`,
    MARGIN,
    MARGIN + 52
  )
  return MARGIN + 68
}

function tableOrNote(doc, startY, head, body, noteIfTrunc) {
  let y = startY
  if (noteIfTrunc) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(noteIfTrunc, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    y += 12
  }
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [head],
    body,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [41, 98, 138], textColor: 255, fontStyle: 'bold' },
    theme: 'grid',
    showHead: 'everyPage',
  })
  return doc.lastAutoTable.finalY + 14
}

function sliceDetail(rows, label) {
  const total = rows.length
  const slice = rows.slice(0, PDF_MAX_DETAIL_ROWS)
  const note =
    total > PDF_MAX_DETAIL_ROWS
      ? `${label}: showing first ${PDF_MAX_DETAIL_ROWS} of ${total} rows. Use Excel for full export.`
      : null
  return { slice, note }
}

export function exportReportToPdf({ reportType, report, meta, dateFrom, dateTo }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const fileBase = `report_${reportType}_${dateFrom}_${dateTo}.pdf`

  const subLabels = {
    lead: 'Lead performance',
    appointment: 'Appointments',
    agent: 'Agent performance',
    call: 'Call summary',
    branch: 'Branch performance',
    repeat: 'Repeat customers',
  }

  let startY = addTitleBlock(
    doc,
    subLabels[reportType] || 'Report',
    `Type: ${reportType}`,
    meta,
    dateFrom,
    dateTo
  )

  const addNote = (text) => {
    doc.setFontSize(8)
    doc.text(pdfStr(text), MARGIN, startY)
    startY += 14
  }

  switch (reportType) {
    case 'lead': {
      const st = report.lead?.stats || {}
      if (meta?.leadDetailsTruncated) {
        addNote(`Lead details capped at ${meta.leadDetailsCap ?? 15000} rows in API.`)
        startY += 6
      }
      startY = tableOrNote(
        doc,
        startY,
        ['Metric', 'Value'],
        [
          ['Total leads', String(st.totalLeads ?? 0)],
          ['Converted', String(st.converted ?? 0)],
          ['Lost', String(st.lost ?? 0)],
          ['Conversion rate %', String(st.conversionRate ?? 0)],
        ],
        null
      )

      const trend = report.lead?.performanceTrend || []
      if (trend.length) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Performance trend', MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 12
        startY = tableOrNote(
          doc,
          startY,
          ['Period', 'Leads', 'Converted', 'Lost'],
          trend.map((r) => [pdfStr(r.name), String(r.leads), String(r.converted), String(r.lost)]),
          null
        )
      }

      const sources = report.lead?.sourceDistribution || []
      if (sources.length) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Source distribution', MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 12
        startY = tableOrNote(
          doc,
          startY,
          ['Source', 'Count'],
          sources.map((s) => [pdfStr(s.name), String(s.value)]),
          null
        )
      }

      const leadRows = report.lead?.detailsTable || []
      if (leadRows.length) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Daily details', MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 12
        const { slice, note } = sliceDetail(leadRows, 'Daily details')
        startY = tableOrNote(
          doc,
          startY,
          ['Date', 'Total', 'Converted', 'Lost', 'Conv. rate %'],
          slice.map((r) => [
            pdfStr(r.date),
            String(r.total),
            String(r.converted),
            String(r.lost),
            String(r.rate),
          ]),
          note
        )
      }

      const detailLeads = report.lead?.leadDetailsTable || []
      if (detailLeads.length) {
        doc.addPage()
        startY = MARGIN
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Lead details', MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 12
        const { slice, note } = sliceDetail(detailLeads, 'Lead details')
        startY = tableOrNote(
          doc,
          startY,
          [
            'S.No.',
            'Created',
            'Name',
            'Email',
            'Phone',
            'Source',
            'Status',
            'Branch',
            'Assigned',
          ],
          slice.map((r) => [
            String(r.sno),
            pdfStr(r.createdDate),
            pdfStr(r.name),
            pdfStr(r.email),
            pdfStr(r.phone),
            pdfStr(r.source),
            pdfStr(r.status),
            pdfStr(r.branch),
            pdfStr(r.assignedTo),
          ]),
          note
        )
      }
      break
    }

    case 'appointment': {
      const aptStats = report.lead?.appointmentStats || {}
      startY = tableOrNote(
        doc,
        startY,
        ['Metric', 'Value'],
        [
          ['Total appointments', String(aptStats.totalAppointments ?? 0)],
          ['Completed', String(aptStats.completed ?? 0)],
          ['Cancelled', String(aptStats.cancelled ?? 0)],
          ['Rescheduled', String(aptStats.rescheduled ?? 0)],
        ],
        null
      )
      const aptRows = report.lead?.appointmentDetailsTable || []
      if (aptRows.length) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Appointment details', MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 12
        const { slice, note } = sliceDetail(aptRows, 'Appointments')
        startY = tableOrNote(
          doc,
          startY,
          ['S.No.', 'Date', 'Customer', 'Phone', 'Status', 'Slot', 'Package', 'Branch', 'Assigned'],
          slice.map((r) => [
            String(r.sno),
            pdfStr(r.date),
            pdfStr(r.customer),
            pdfStr(r.phone),
            pdfStr(r.status),
            pdfStr(r.slot),
            pdfStr(r.package),
            pdfStr(r.branch),
            pdfStr(r.assignedTo),
          ]),
          note
        )
      }
      break
    }

    case 'agent': {
      if (meta?.agentAssignedLeadsTruncated) {
        addNote(`Assigned leads list may be capped at ${meta.agentDetailCap ?? 15000} rows.`)
        startY += 4
      }
      if (meta?.agentCallsByAgentTruncated) {
        addNote(`Calls list may be capped at ${meta.agentDetailCap ?? 15000} rows.`)
        startY += 4
      }
      const sections = collectAgentSections(report)
      if (!sections.length) {
        doc.setFontSize(10)
        doc.text('No agent data for this range.', MARGIN, startY)
        break
      }
      sections.forEach((sec, idx) => {
        if (idx > 0) {
          doc.addPage()
          startY = MARGIN
        }
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text(`Agent: ${pdfStr(sec.title)}`, MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 18

        doc.setFontSize(10)
        doc.text('Summary', MARGIN, startY)
        startY += 10
        if (sec.perfRow) {
          const p = sec.perfRow
          startY = tableOrNote(
            doc,
            startY,
            ['Name', 'Email', 'Role', 'Ozonetel ID', 'Leads', 'Calls', 'Converted'],
            [
              [
                pdfStr(p.name),
                pdfStr(p.agentEmail),
                pdfStr(p.agentRole),
                pdfStr(p.ozonetelAgentId),
                String(p.leads),
                String(p.calls),
                String(p.converted),
              ],
            ],
            null
          )
        } else {
          doc.setFontSize(8)
          doc.text(
            'No CRM aggregate row for this agent (leads/calls matched by assignee or Ozonetel).',
            MARGIN,
            startY
          )
          startY += 14
        }

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Assigned leads', MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 12
        if (!sec.leadRows.length) {
          doc.setFontSize(8)
          doc.text('(No rows in this period)', MARGIN, startY)
          startY += 14
        } else {
          const { slice, note } = sliceDetail(sec.leadRows, 'Leads')
          startY = tableOrNote(
            doc,
            startY,
            ['Agent', 'Email', 'Role', 'Oz ID', '#', 'Created', 'Lead', 'Phone', 'Email', 'Source', 'Status', 'Branch'],
            slice.map((r, i) => [
              pdfStr(r.assignedAgent),
              pdfStr(r.assignedEmail),
              pdfStr(r.assignedRole),
              pdfStr(r.assignedOzonetelId),
              String(i + 1),
              pdfStr(r.createdDate),
              pdfStr(r.leadName),
              pdfStr(r.phone),
              pdfStr(r.email),
              pdfStr(r.source),
              pdfStr(r.status),
              pdfStr(r.branch),
            ]),
            note
          )
        }

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Calls (Ozonetel)', MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 12
        if (!sec.callRows.length) {
          doc.setFontSize(8)
          doc.text('(No rows in this period)', MARGIN, startY)
        } else {
          const { slice, note } = sliceDetail(sec.callRows, 'Calls')
          startY = tableOrNote(
            doc,
            startY,
            [
              'Oz name',
              'Oz ID',
              'CRM name',
              'Type',
              'Status',
              '#',
              'Start',
              'End',
              'Dur',
              'Customer',
              'Branch',
            ],
            slice.map((r, i) => [
              pdfStr(r.agentName),
              pdfStr(r.agentId),
              pdfStr(r.crmAgentName),
              pdfStr(r.callType ?? r.type),
              pdfStr(r.callStatus),
              String(i + 1),
              pdfStr(r.startTime),
              pdfStr(r.endTime),
              pdfStr(r.duration),
              pdfStr(r.customerNumber),
              pdfStr(r.branches),
            ]),
            note
          )
        }
      })
      break
    }

    case 'call': {
      const { summary, totalCalls, answered, missed, callDetailsTable: callDetailRows = [] } = report.call || {}
      if (meta?.callDetailsTruncated) {
        addNote(`Call details capped at ${meta.callDetailsCap ?? 15000} rows in API.`)
        startY += 6
      }
      startY = tableOrNote(
        doc,
        startY,
        ['Metric', 'Value'],
        [
          ['Total calls', String(totalCalls ?? 0)],
          ['Answered', String(answered ?? 0)],
          ['Missed', String(missed ?? 0)],
        ],
        null
      )
      if ((summary || []).length) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Breakdown', MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 12
        startY = tableOrNote(
          doc,
          startY,
          ['Segment', 'Count'],
          (summary || []).map((s) => [pdfStr(s.name), String(s.value)]),
          null
        )
      }
      if (callDetailRows.length) {
        doc.addPage()
        startY = MARGIN
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Call details', MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 12
        const { slice, note } = sliceDetail(callDetailRows, 'Calls')
        startY = tableOrNote(
          doc,
          startY,
          [
            '#',
            'Start',
            'End',
            'Dur',
            'Customer',
            'Type',
            'Status',
            'Agent',
            'Oz ID',
            'CRM',
            'Branches',
          ],
          slice.map((r) => [
            String(r.sno),
            pdfStr(r.startTime),
            pdfStr(r.endTime),
            pdfStr(r.duration),
            pdfStr(r.customerNumber),
            pdfStr(r.callType ?? r.type),
            pdfStr(r.callStatus),
            pdfStr(r.agentName),
            pdfStr(r.agentId),
            pdfStr(r.crmAgentName),
            pdfStr(r.branches),
          ]),
          note
        )
      }
      break
    }

    case 'branch': {
      if (meta?.leadDetailsTruncated) {
        addNote(`Lead details capped at ${meta.leadDetailsCap ?? 15000} rows in API.`)
        startY += 6
      }
      const perf = report.branch?.performance || []
      const detailLeads = report.lead?.leadDetailsTable || []
      if (!perf.length && !detailLeads.length) {
        doc.setFontSize(10)
        doc.text('No branch data for this range.', MARGIN, startY)
        break
      }

      const leadsByNorm = new Map()
      for (const row of detailLeads) {
        const raw = String(row.branch ?? '').trim() || 'Unassigned'
        const nk = raw.toLowerCase()
        if (!leadsByNorm.has(nk)) leadsByNorm.set(nk, { displayName: raw, rows: [] })
        leadsByNorm.get(nk).rows.push(row)
      }

      const perfSorted = [...perf].sort((a, b) => sortLocale(a.name || '', b.name || ''))
      const coveredNorms = new Set()
      let branchFirst = true

      const appendBranchPage = (title, summaryHead, summaryBody, leadRows) => {
        if (!branchFirst) doc.addPage()
        const y = branchFirst ? startY : MARGIN
        branchFirst = false
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text(title, MARGIN, y)
        doc.setFont('helvetica', 'normal')
        y += 18
        y = tableOrNote(doc, y, summaryHead, summaryBody, null)
        y += 10
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Lead details', MARGIN, y)
        doc.setFont('helvetica', 'normal')
        y += 12
        if (!leadRows.length) {
          doc.setFontSize(9)
          doc.text('(No lead rows in export for this branch.)', MARGIN, y)
          return
        }
        const { slice, note } = sliceDetail(leadRows, 'Leads')
        tableOrNote(
          doc,
          y,
          [
            'S.No.',
            'Created',
            'Name',
            'Email',
            'Phone',
            'Source',
            'Status',
            'Branch',
            'Assigned',
          ],
          slice.map((r, i) => [
            String(i + 1),
            pdfStr(r.createdDate),
            pdfStr(r.name),
            pdfStr(r.email),
            pdfStr(r.phone),
            pdfStr(r.source),
            pdfStr(r.status),
            pdfStr(r.branch),
            pdfStr(r.assignedTo),
          ]),
          note
        )
      }

      for (const r of perfSorted) {
        const nk = String(r.name || '').trim().toLowerCase()
        coveredNorms.add(nk)
        const rowsForBranch = leadsByNorm.get(nk)?.rows || []
        appendBranchPage(
          `Branch: ${pdfStr(r.name)}`,
          ['Branch', 'Leads', 'Converted', 'Lost', 'Conv. %', 'Revenue index'],
          [
            [
              pdfStr(r.name),
              String(r.leads),
              String(r.converted ?? 0),
              String(r.lost ?? 0),
              String(r.conversionRate ?? 0),
              String(r.revenue ?? 0),
            ],
          ],
          rowsForBranch
        )
      }

      for (const [nk, bundle] of leadsByNorm) {
        if (coveredNorms.has(nk)) continue
        if (!bundle.rows.length) continue
        const rows = bundle.rows
        const total = rows.length
        const conv = rows.filter((l) => l.status === 'Converted').length
        const lost = rows.filter((l) => l.status === 'Lost').length
        const rate = total > 0 ? Math.round((conv / total) * 1000) / 10 : 0
        appendBranchPage(
          `Branch: ${pdfStr(bundle.displayName)}`,
          ['Branch', 'Leads', 'Converted', 'Lost', 'Conv. %', 'Revenue index'],
          [
            [
              pdfStr(bundle.displayName),
              String(total),
              String(conv),
              String(lost),
              String(rate),
              String(conv * 5000),
            ],
          ],
          rows
        )
      }
      break
    }

    case 'repeat': {
      const rep = report.repeat || {}
      const dist = rep.distribution || []
      startY = tableOrNote(
        doc,
        startY,
        ['Metric', 'Value'],
        [
          ['Unique phones (1 lead each)', String(rep.newCustomers ?? 0)],
          ['Phones with multiple leads', String(rep.repeatCustomerPhones ?? 0)],
          ['Total lead rows (same phone)', String(rep.repeatLeadRows ?? 0)],
        ],
        null
      )
      if (dist.length) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Distribution', MARGIN, startY)
        doc.setFont('helvetica', 'normal')
        startY += 12
        startY = tableOrNote(
          doc,
          startY,
          ['Category', 'Count'],
          dist.map((d) => [pdfStr(d.name), String(d.value)]),
          null
        )
      }
      break
    }

    default:
      doc.setFontSize(10)
      doc.text('PDF export is not configured for this report type.', MARGIN, startY)
  }

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`Page ${i} / ${pageCount}`, doc.internal.pageSize.getWidth() - MARGIN - 60, doc.internal.pageSize.getHeight() - 20)
    doc.setTextColor(0)
  }

  doc.save(fileBase)
}
