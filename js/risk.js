// ══════════════════════════════════════════
// ── Clarix Rule-Based Risk Scoring        ──
// ══════════════════════════════════════════
// Single source of truth for risk scoring. Imported by query-borrower and insights.
// Tune weights here — the function is provisional and will be calibrated as real
// lender data accumulates. See CLAUDE.md §3 for the signal reference.

// calculateRisk — takes a borrower's records plus cross-lender payments and disputes.
// Returns { level, score, label, sublabel, reasons: [{ text, delta }] } so the UI
// can render WHY each score contribution exists.
export function calculateRisk(records, payments = [], disputes = []) {
  if (!records || records.length === 0) {
    return {
      level: 'unknown',
      score: null,
      label: 'UNKNOWN — FIRST-TIME BORROWER',
      sublabel: 'No history on the network. Not a green light — verify identity and proceed cautiously.',
      reasons: []
    }
  }

  let score = 0
  const reasons = []
  const add = (delta, text) => { if (delta === 0) return; score += delta; reasons.push({ text, delta }) }
  const today = new Date()
  const MS_PER_DAY = 86400000

  const active = records.filter(r => r.status === 'active')
  const defaulters = records.filter(r => r.status === 'defaulter')
  const partialDefault = records.filter(r => r.status === 'partial_default')
  const settled = records.filter(r => r.status === 'settled')

  // Base status mix
  if (defaulters.length > 0)     add(defaulters.length * 30, `${defaulters.length} default${defaulters.length > 1 ? 's' : ''} on record`)
  if (partialDefault.length > 0) add(partialDefault.length * 20, `${partialDefault.length} partial default${partialDefault.length > 1 ? 's' : ''}`)
  if (active.length > 0) {
    add(active.length * 10, `${active.length} active loan${active.length > 1 ? 's' : ''}`)
    if (active.length >= 3) add(15, `${active.length} concurrent active loans`)
  }
  if (settled.length > 0) add(-settled.length * 5, `${settled.length} settled loan${settled.length > 1 ? 's' : ''} (positive history)`)

  // Default recency — disbursed_date is the source of truth; falls back to created_at.
  let recentDefaults = 0, olderDefaults = 0
  defaulters.forEach(r => {
    const baseline = r.disbursed_date ? new Date(r.disbursed_date) : new Date(r.created_at)
    const monthsAgo = (today - baseline) / (MS_PER_DAY * 30)
    if (monthsAgo <= 6) recentDefaults++
    else if (monthsAgo <= 12) olderDefaults++
  })
  if (recentDefaults > 0) add(recentDefaults * 20, `${recentDefaults} recent default${recentDefaults > 1 ? 's' : ''} within 6 months`)
  if (olderDefaults > 0)  add(olderDefaults * 10,  `${olderDefaults} default${olderDefaults > 1 ? 's' : ''} within 6–12 months`)

  // Loan stacking — multiple disbursements in a short window.
  const disbursements = records.map(r => r.disbursed_date ? new Date(r.disbursed_date) : null).filter(Boolean)
  const in30  = disbursements.filter(d => (today - d) / MS_PER_DAY <= 30).length
  const in90  = disbursements.filter(d => (today - d) / MS_PER_DAY <= 90).length
  const in180 = disbursements.filter(d => (today - d) / MS_PER_DAY <= 180).length
  if (in30 >= 2)       add(25, `${in30} loans disbursed in last 30 days — possible loan stacking`)
  else if (in90 >= 3)  add(15, `${in90} loans disbursed in last 90 days`)
  else if (in180 >= 4) add(10, `${in180} loans disbursed in last 6 months`)

  // Overdue active loans (past next_due_date).
  const overdueLoans = active.filter(r => r.next_due_date && new Date(r.next_due_date) < today)
  if (overdueLoans.length > 0) add(overdueLoans.length * 15, `${overdueLoans.length} overdue active loan${overdueLoans.length > 1 ? 's' : ''}`)

  // Payment pace — velocity via disbursed_date+frequency; falls back to paid/total adherence.
  const periodDays = { daily: 1, weekly: 7, monthly: 30 }
  let slowPace = 0, verySlowPace = 0, goodPace = 0, lowAdherence = 0, badAdherence = 0
  active.forEach(r => {
    const paid = parseInt(r.installments_paid) || 0
    const freq = r.installment_frequency
    const total = parseInt(r.total_installments) || 0

    if (r.disbursed_date && freq && periodDays[freq]) {
      const daysSince = (today - new Date(r.disbursed_date)) / MS_PER_DAY
      if (daysSince < 30) return
      const expected = Math.floor(daysSince / periodDays[freq])
      if (expected <= 0) return
      const ratio = paid / expected
      if (ratio < 0.25)      verySlowPace++
      else if (ratio < 0.5)  slowPace++
      else if (ratio >= 0.9) goodPace++
    } else if (total > 0) {
      const adherence = paid / total
      if (adherence < 0.25)      badAdherence++
      else if (adherence < 0.5)  lowAdherence++
    }
  })
  if (verySlowPace > 0) add(verySlowPace * 20, `${verySlowPace} loan${verySlowPace > 1 ? 's' : ''} paying far below schedule (<25% of pace)`)
  if (slowPace > 0)     add(slowPace * 10,     `${slowPace} loan${slowPace > 1 ? 's' : ''} paying below schedule (<50% of pace)`)
  if (goodPace > 0)     add(-goodPace * 4,     `${goodPace} loan${goodPace > 1 ? 's' : ''} on pace or ahead of schedule`)
  if (badAdherence > 0) add(badAdherence * 12, `${badAdherence} loan${badAdherence > 1 ? 's' : ''} with very low repayment adherence`)
  if (lowAdherence > 0) add(lowAdherence * 6,  `${lowAdherence} loan${lowAdherence > 1 ? 's' : ''} with low repayment adherence`)

  // Stale active loans — no repayment in 60+ days.
  const staleActive = active.filter(r => r.last_repayment_date && (today - new Date(r.last_repayment_date)) / MS_PER_DAY > 60)
  if (staleActive.length > 0) add(staleActive.length * 10, `${staleActive.length} loan${staleActive.length > 1 ? 's' : ''} with no repayment in 60+ days`)

  // Outstanding amount thresholds.
  const totalOutstanding = records.reduce((sum, r) => sum + (parseFloat(r.outstanding) || 0), 0)
  if (totalOutstanding > 500000)      add(25, 'Total outstanding over LKR 500,000')
  else if (totalOutstanding > 200000) add(15, 'Total outstanding over LKR 200,000')
  else if (totalOutstanding > 100000) add(10, 'Total outstanding over LKR 100,000')

  // ── Wave 1 additions ──────────────────────────────────────────────

  // Multi-lender shopping — borrowing from many lenders indicates fragmentation/stress.
  const uniqueLenders = new Set(records.map(r => r.lender_id)).size
  if (uniqueLenders >= 5)      add(25, `Active with ${uniqueLenders} different lenders on the network`)
  else if (uniqueLenders >= 3) add(15, `Active with ${uniqueLenders} different lenders on the network`)

  // Partial-payment pattern — averaging below the required installment.
  // Needs >=3 payments to avoid one-off underpayments flipping the signal.
  const paymentsByRecord = {}
  payments.forEach(p => {
    if (!p.record_id) return
    ;(paymentsByRecord[p.record_id] ||= []).push(parseFloat(p.amount) || 0)
  })
  let partialPayers = 0
  active.forEach(r => {
    const pays = paymentsByRecord[r.id] || []
    if (pays.length < 3) return
    const avgPay = pays.reduce((a, b) => a + b, 0) / pays.length
    const expected = parseFloat(r.installment_amount) || 0
    if (expected > 0 && avgPay < expected * 0.7) partialPayers++
  })
  if (partialPayers > 0) add(partialPayers * 12, `${partialPayers} loan${partialPayers > 1 ? 's' : ''} paying below the installment amount on average`)

  // Repeat loans from the same lender within 60 days — classic top-up-to-cover-shortfall.
  const datesByLender = {}
  records.forEach(r => {
    if (!r.disbursed_date || !r.lender_id) return
    ;(datesByLender[r.lender_id] ||= []).push(new Date(r.disbursed_date))
  })
  let renewalLenders = 0
  Object.values(datesByLender).forEach(dates => {
    dates.sort((a, b) => a - b)
    for (let i = 1; i < dates.length; i++) {
      if ((dates[i] - dates[i - 1]) / MS_PER_DAY <= 60) { renewalLenders++; break }
    }
  })
  if (renewalLenders > 0) add(renewalLenders * 15, `${renewalLenders} lender${renewalLenders > 1 ? 's' : ''} issued repeat loan${renewalLenders > 1 ? 's' : ''} within 60 days`)

  // Collateral reuse across active loans — same item pledged to multiple lenders.
  const collateralCount = {}
  active.forEach(r => {
    const c = (r.collateral || '').trim().toLowerCase()
    if (!c || c === '—' || c === 'none' || c === 'n/a') return
    collateralCount[c] = (collateralCount[c] || 0) + 1
  })
  const reusedCollateral = Object.entries(collateralCount).filter(([, n]) => n >= 2).length
  if (reusedCollateral > 0) add(20, `Same collateral pledged on multiple active loans`)

  // Dispute history — records previously flagged by other lenders.
  const recordIdSet = new Set(records.map(r => r.id))
  const linkedDisputes = disputes.filter(d => recordIdSet.has(d.record_id))
  if (linkedDisputes.length > 0) {
    const weight = Math.min(15, linkedDisputes.length * 5)
    add(weight, `${linkedDisputes.length} record${linkedDisputes.length > 1 ? 's' : ''} previously flagged in disputes`)
  }

  // Loan-size escalation — most recent loan is 2x+ the historical median.
  const loanAmounts = records.map(r => parseFloat(r.loan_amount) || 0).filter(n => n > 0)
  if (loanAmounts.length >= 3) {
    const mostRecent = parseFloat(records[0].loan_amount) || 0  // records are ordered desc by created_at
    const rest = loanAmounts.slice(1).sort((a, b) => a - b)
    const median = rest[Math.floor(rest.length / 2)]
    if (median > 0 && mostRecent >= median * 2) {
      add(10, `Latest loan (LKR ${mostRecent.toLocaleString()}) is 2×+ their historical median`)
    }
  }

  score = Math.min(100, Math.max(0, score))

  let level, label
  if (defaulters.length > 0 || score >= 70) { level = 'high';   label = 'HIGH RISK' }
  else if (score >= 35)                     { level = 'medium'; label = 'MEDIUM RISK' }
  else                                      { level = 'low';    label = 'LOW RISK' }

  const sublabel = reasons.length > 0
    ? `Score: ${score}/100 — ${reasons.length} signal${reasons.length !== 1 ? 's' : ''} contributing`
    : `Score: ${score}/100 — No significant risk signals found`

  return { level, score, label, sublabel, reasons }
}
