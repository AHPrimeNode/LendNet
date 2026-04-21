import { supabase } from './supabase.js'

// Days since last update before warning / block per loan category
const THRESHOLDS = {
  daily:           { warn: 1,  block: 7  },
  weekly:          { warn: 1,  block: 7  },
  monthly:         { warn: 23, block: 30 },
  partial_default: { warn: 23, block: 30 },
  defaulter:       { warn: 53, block: 60 },
}

function getKey(record) {
  if (record.status === 'defaulter')       return 'defaulter'
  if (record.status === 'partial_default') return 'partial_default'
  if (record.installment_frequency === 'daily')   return 'daily'
  if (record.installment_frequency === 'weekly')  return 'weekly'
  if (record.installment_frequency === 'monthly') return 'monthly'
  if (record.installment_frequency === 'biweekly') return 'monthly' // grace for existing records
  return null
}

export async function checkEnforcement(lenderId) {
  const [{ data: lenderData }, { data: records }] = await Promise.all([
    supabase.from('lenders').select('update_required, last_submission_at').eq('id', lenderId).single(),
    supabase.from('records')
      .select('id, borrower_name, borrower_nic, installment_frequency, status, last_repayment_date, created_at')
      .eq('lender_id', lenderId)
      .not('status', 'eq', 'settled')
  ])

  if (lenderData?.update_required) {
    return { blocked: true, warning: false, overdueLoans: [], adminForced: true }
  }

  if (!records || records.length === 0) {
    return { blocked: false, warning: false, overdueLoans: [] }
  }

  const today = new Date()
  const blockedLoans = []
  const warnedLoans = []

  // For defaulters/partial_defaults, use last_submission_at as the baseline
  // (submitting any payment batch counts as "reviewed this period")
  const submissionBaseline = lenderData?.last_submission_at
    ? new Date(lenderData.last_submission_at)
    : null

  records.forEach(r => {
    const key = getKey(r)
    if (!key) return

    const t = THRESHOLDS[key]

    let baseline
    if (key === 'defaulter' || key === 'partial_default') {
      // Use last batch submission if available, otherwise record creation date
      baseline = submissionBaseline || new Date(r.created_at)
    } else {
      // Active loans: baseline is the most recent of last_repayment_date or created_at.
      // This protects onboarding — a freshly-uploaded record with an old last_repayment_date
      // starts its enforcement clock from when the network first saw it, not from its
      // historical payment date.
      const created = new Date(r.created_at)
      const lastPayment = r.last_repayment_date ? new Date(r.last_repayment_date) : null
      baseline = lastPayment && lastPayment > created ? lastPayment : created
    }

    const days = Math.floor((today - baseline) / 86400000)

    if (days >= t.block)      blockedLoans.push({ ...r, days, threshold: t.block })
    else if (days >= t.warn)  warnedLoans.push({ ...r, days, threshold: t.block })
  })

  return {
    blocked: blockedLoans.length > 0,
    warning: blockedLoans.length === 0 && warnedLoans.length > 0,
    overdueLoans: blockedLoans.length > 0 ? blockedLoans : warnedLoans,
    adminForced: false
  }
}
