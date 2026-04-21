# CLARIX — Project Context

## What is Clarix?
Clarix (formerly LendNet) is a shared credit intelligence network for Sri Lanka's informal lending sector — private moneylenders, gold pawning shops, microfinance cooperatives. Operated by Assert Holdings (Pvt) Ltd. Lenders submit borrower records and query the network before issuing new loans.

## Tech Stack
- **Frontend:** Plain HTML + CSS + JavaScript (no frameworks)
- **Backend/Database:** Supabase (PostgreSQL), Singapore region
- **Hosting:** Netlify at `clarix-lk.netlify.app` (currently paused — free tier credits exhausted)
- **GitHub repo:** AHPrimeNode/LendNet
- **Code editor:** VS Code on Windows
- **Local testing:** Live Server (`live-server` in terminal)

## Authentication
- Phone number + password login via Supabase Auth
- Phone numbers stored as email format: `07XXXXXXXX@clarix.lk`
- Code strips `@clarix.lk` to display the phone number
- **Admin gating (refactored 2026-04-21):** admin status is a DB-backed `is_admin BOOLEAN NOT NULL DEFAULT false` column on `lenders`. Initial admin (`0771234567`) was flipped via `UPDATE`. A SQL helper `public.is_admin()` (SECURITY DEFINER, reads JWT email → strips `@clarix.lk` → returns the lender's flag) is the canonical check for RLS policies — policies should call `public.is_admin()` instead of hardcoding emails. Client pages fetch `is_admin` from the lender row and gate on that. No more hardcoded `ADMIN_EMAIL` constants.
- Add/revoke admin: `UPDATE lenders SET is_admin = {true|false} WHERE phone = '07XXXXXXXX';`

## Project Structure
```
lendnet/
  css/
    style.css          — main stylesheet
    sidebar.css        — sidebar navigation styles
  icons/
    icon-192.png       — PWA icon
    icon-512.png       — PWA icon
  js/
    supabase.js        — Supabase client initialization
    sidebar.js         — reusable sidebar navigation component (auto-injects into any page)
    enforcement.js     — reads last_submission_at + update_required and gates access to the update-required page
    lang.js            — language engine (built but not active)
    translations.js    — EN/SI translations (built but not active)
  pages/
    admin.html         — admin panel (applications, disputes, analytics tabs)
    apply.html         — lender application form
    bulk-upload.html   — bulk records and bulk payments upload
    dashboard.html     — main dashboard with stats
    my-records.html    — lender's records + disputes tabs
    query-borrower.html — query borrower by NIC with risk scoring
    submit-record.html — submit a single borrower record
    update-required.html — lock screen shown when a lender is flagged update_required or past the submission window
  index.html           — login page
  manifest.json        — PWA manifest
  service-worker.js    — PWA service worker
```

## Database Tables (8 tables, all with RLS enabled)

### applications
Lender registration applications waiting for admin approval.

### lenders
Approved lender accounts.
- `id`, `application_id`, `full_name`, `business_name`, `business_type`, `district`, `phone`, `plan`, `status`, `created_at`, `last_submission_at`, `update_required`, `is_admin`
- `last_submission_at`: stamped by a compliant bulk payment upload (see Bulk Upload). Drives the enforcement timer.
- `update_required`: admin-settable boolean. When true, `js/enforcement.js` redirects the lender to `pages/update-required.html` until they submit a bulk payment covering ≥70% of their active records.
- `is_admin`: BOOLEAN NOT NULL DEFAULT false, added 2026-04-21. Canonical admin flag. See Authentication §.

### records
Borrower loan records submitted by lenders.
- `id`, `lender_id`, `borrower_nic`, `borrower_name`, `borrower_phone`, `borrower_district`, `record_type`, `loan_amount`, `outstanding`, `installment_amount`, `installment_frequency`, `total_installments`, `installments_paid` (plural), `disbursed_date`, `next_due_date`, `collateral`, `notes`, `status`, `created_at`, `last_repayment_date`
- `disbursed_date`: **NOT NULL**, DATE. When money actually changed hands (distinct from `created_at` which is when we recorded it). Added 2026-04-21 after wiping test data. Powers loan-stacking detection, payment velocity scoring, and true "recent default" timing in `query-borrower.html`.

**CRITICAL:** The column is `installments_paid` (plural). These are the actual database column names. Never change them.

### payments
Individual payment logs against records.
- `id`, `record_id`, `lender_id`, `amount`, `payment_date`, `notes`, `created_at`

### queries
PDPA-compliant log of every borrower query made.
- `id`, `lender_id`, `borrower_nic`, `search_type`, `created_at`

### disputes
Flagged records raised by lenders for admin review.
- `id`, `record_id`, `raised_by`, `reason`, `notes`, `status`, `created_at`
- Status values: `pending`, `resolved`, `rejected`
- Reason values: `wrong_nic`, `wrong_amount`, `already_settled`, `false_submission`, `identity_mismatch`

### audit_log
Immutable audit trail of all platform actions.
- `id`, `lender_id` (NOT performed_by), `action`, `target_table`, `target_id`, `details` (jsonb type, NOT text), `created_at`
- `lender_id` is a foreign key to lenders table
- `details` must be a JSON object like `{ message: "text here" }`, never a plain string

### announcements
Admin notices displayed to lenders.

## RLS Policies in Place
- Disputes: INSERT and SELECT for authenticated users
- Records: UPDATE (lenders own records only, admin any record), DELETE (admin only)
- Audit log: INSERT for authenticated users
- Queries: SELECT for authenticated users where `lender_id` matches the lender row whose `phone` equals the local-part of the JWT email (added 2026-04 so the dashboard's "Queries This Month" card can read its own rows)

## Sidebar Navigation (sidebar.js)
- Auto-injects into any page that includes `<script type="module" src="../js/sidebar.js"></script>`
- Detects current page from URL for active highlighting
- Shows Admin Panel link only when the lender row has `is_admin = true` (fetched once at sidebar init)
- Sidebar state (open/closed) persists in localStorage
- Nav items: Dashboard, Query Borrower, Submit Record, My Records, Bulk Upload
- Admin section: Admin Panel, Analytics

## Features Built and Working

### 1. Login & Registration
- Login page with phone + password
- Lender application form saving to `applications` table
- Admin approve/reject workflow creating lender accounts

### 2. Dashboard
- Live stats: Total Records, Active Loans, Defaulters, Queries This Month
- "Queries This Month" scopes to the current lender via `lender_id` + `created_at >= firstOfMonth` (count-only query, RLS-backed). Displays `—` while loading and falls back to `—` on error instead of silent `0`.
- Quick action buttons to Query, Submit Record, My Records

### 3. Query Borrower
- Search by NIC across entire network
- Rule-based risk scoring (0-100 with HIGH/MEDIUM/LOW) in `calculateRisk()`. Signals include:
  - **Status mix:** defaulter (+30 each), partial_default (+20), active (+10), +15 bonus for 3+ concurrent active. Settled loans subtract (-5 each).
  - **Loan stacking** *(disbursed_date-driven)*: 2+ disbursements in 30 days = +25 (strong fraud signal), 3+ in 90 days = +15, 4+ in 180 days = +10.
  - **Payment velocity** *(disbursed_date-driven)*: compares `installments_paid` vs expected-by-now given frequency. <25% of pace = +20, <50% = +10, ≥90% = -4. Loans under 30 days old are skipped (seasoning). Falls back to the older `paid/total` adherence ratio when `disbursed_date` or `installment_frequency` is missing.
  - **Default recency**: uses `disbursed_date` as baseline (not `created_at`) — defaults ≤6 months = +20, ≤12 months = +10.
  - **Overdue** active loans (past `next_due_date`): +15 each.
  - **Stale** active loans (no repayment in 60+ days): +10 each.
  - **Total outstanding**: >LKR 500k = +25, >200k = +15, >100k = +10.
- Thresholds: score ≥70 or any defaulter → HIGH; ≥35 → MEDIUM; else LOW. Scoring rules are live-adjusted as real data lands — don't treat the numbers as final.
- PDPA query logging to `queries` table
- Flag button on each record to raise disputes

### 4. Submit Record
- Full form with borrower details, loan details, installment tracking
- PDPA consent checkbox
- `disbursed_date` is required (NOT NULL at DB level, form-level required check, future-date guard)
- Both Next Due Date and Last Repayment Date fields (optional)

### 5. My Records
- Two tabs: My Records and My Disputes
- Records table with View, Payment, Settle buttons
- Payment logging auto-updates `outstanding` and `last_repayment_date`
- Mark as Settled logs the remaining outstanding as a final `payments` row (with note "Marked as settled") before setting the record's `outstanding` to 0, `status` to `settled`, and `last_repayment_date` to today. Confirm dialog states the exact amount being logged so the lender is confirming receipt.
- Disputes tab shows all disputes raised by this lender with status tracking

### 6. Dispute Workflow (complete)
- Lenders flag records from query results with reason and notes
- Admin sees disputes in admin panel with View/Resolve/Reject
- Resolve modal has 3 options: Correct record details, Mark as settled, Remove record
- Actual record corrections happen during resolution (not just status change)
- Duplicate dispute prevention
- All actions logged to audit_log

### 7. Bulk Upload (complete)
- Two tabs: Bulk Records and Bulk Payments
- Download Excel template → fill in → upload → validate → preview → submit
- **Multi-sheet templates (2026-04-21):**
  - *Records template* has three sheets: `Instructions` (format rules, required fields, restricted-value pointer), `Records` (where lenders fill data), `Reference` (columns listing allowed values for `record_type`, `collateral`, `installment_frequency`, `borrower_district`).
  - *Payments template* has two sheets: `Instructions` and `Payments` (pre-filled loan list).
  - Loaders use `workbook.Sheets['Records' | 'Payments']` by name, with a fallback to `SheetNames[0]` for backward compatibility.
  - SheetJS community build (CDN) doesn't reliably emit Excel data-validation XML, so we ship a Reference sheet + explicit instructions rather than hard-locked dropdowns. If we ever want true dropdowns, swap the CDN to `xlsx-js-style`.
- Bulk Records: validates all fields, checks duplicates against existing records AND within file. Three-branch submit outcome — full success, total failure (retryable, input preserved), partial failure (non-retryable, state cleared to prevent duplicate re-submission)
- Bulk Records validation (hardened 2026-04-21 after a 400 batch failure on the first real-data upload):
  - `parseDateCell(v)` handles Excel date serial numbers (`XLSX.SSF.parse_date_code`), empty cells, and YYYY-MM-DD strings. Returns `''` for empty, `null` for malformed. Anything else (e.g. `25-Apr`, `01/05/2026`) fails validation with a clear row-level error instead of silently breaking the Postgres insert.
  - `parseNumCell(v)` strips commas/spaces before `parseFloat` — `"287,585.00"` now parses as `287585`, not `287`. Applied to `loan_amount`, `outstanding`, `installment_amount`. Integer fields (`total_installments`, `installments_paid`) also strip commas before `parseInt`.
  - `NaN` values for numeric fields are coerced to `null`/`0` before insert so bad cells can't 400 the whole batch.
  - `disbursed_date` is required, parsed via `parseDateCell`, and future dates are rejected.
- Bulk Payments: matches NIC to lender's existing records, updates outstanding and last_repayment_date
- **Compliance threshold (70% universal, 2026-04-20):** a bulk payment only stamps `last_submission_at` and clears `update_required` if it touches ≥70% of the lender's active records (`status in ('active', 'defaulter', 'partial_default')`). Applies to every lender, not just admin-flagged ones — a token upload of a few payments can't reset the compliance clock. Threshold constant is `COMPLIANCE_THRESHOLD = 0.70` in `submitBulkPayments`. Non-compliant uploads show an amber warning with the coverage percentage.
- Audit log `details` for bulk payments include `touched_records`, `active_records`, `coverage_pct`, `compliance_met`
- Uses SheetJS library from CDN for Excel reading
- Max 500 records per upload
- Batched inserts (50 per batch) to prevent timeout

### 8. Admin Panel
- Three tabs: Applications, Disputes, Analytics
- Applications: approve/reject with temp password generation
- Disputes: full management with record correction
- Analytics: total lenders, records, queries, disputes, records by status bars, top districts, queries last 7 days chart, recent lenders

### 9. Sidebar Navigation (complete)
- Reusable component via sidebar.js
- Dark sidebar with icons, active page highlighting
- Admin-only section
- Analytics shortcut link

### 10. PWA (code complete, untested)
- manifest.json, service-worker.js, icon-192.png, icon-512.png
- Added to all pages but untested (Netlify credits expired)
- Cache name is versioned (`clarix-v3`); bump when cached assets change so old clients get new HTML/JS. STATIC_ASSETS covers `index.html`, `manifest.json`, all page HTML (including `apply.html` and `update-required.html`), all CSS, and `js/enforcement.js`. Fetch handler is network-first with cache fallback; on cache miss it returns a valid 504 Response so the browser doesn't raise "Failed to convert value to 'Response'".

### 11. Sinhala Language Toggle (built but deactivated)
- translations.js and lang.js created and ready
- Toggle button removed from sidebar
- Decision: skipped because target users know basic English

## April 21, 2026 — disbursed_date + onboarding enforcement
- **Test data wiped** — `TRUNCATE public.audit_log, public.disputes, public.queries, public.payments, public.records RESTART IDENTITY CASCADE`. `lenders`, `applications`, `announcements`, and Supabase Auth users preserved. Done because we're still pre-launch (no real lenders), so a schema break was cheaper than a backfill.
- **`disbursed_date DATE NOT NULL`** added to `records`. See Query Borrower §3 for how it feeds scoring. Submit-Record form and Bulk Upload template + validator all require it. Future dates rejected client-side.
- **Enforcement baseline softened** (`js/enforcement.js`): active-loan baseline changed from `last_repayment_date || created_at` to `max(last_repayment_date, created_at)`. Why: the first bulk upload of legacy data immediately locked the lender out because records arrived with old `last_repayment_date` values. `created_at` is when the network first heard about the loan — using the more recent of the two protects onboarding without letting ongoing loans skip enforcement. Duplicate detection in bulk records prevents re-upload abuse.
- **Bulk upload hardening** — see Bulk Upload §7 for the `parseDateCell`/`parseNumCell` fix triggered by a 400 on the first real-data batch (Excel date serials + comma-formatted amounts).
- **Multi-sheet templates** — Instructions + Reference sheets added to both bulk templates. Loaders look up the data sheet by name (`Records`/`Payments`) first, fall back to first sheet.

## Recent Audit Pass (April 2026)
17-bug pass across the app. Highlights worth remembering:
- **XSS hardening:** `query-borrower.html` and `admin.html` no longer concatenate user-controlled strings into `onclick=` attributes or raw innerHTML. Pattern is now `data-*` attributes + delegated click listeners, with an `esc()` helper for any text interpolated into HTML.
- **Tab highlighting:** `switchTab`/`switchBulkTab` take the clicked button (`this`) as a second arg instead of relying on `event.target`. Callers updated accordingly.
- **Analytics parallelism:** admin analytics queries now fan out with `Promise.all([...])` and destructuring; date math hoisted out of the query block.
- **Apply page:** phone stripped of all whitespace, validated against `/^07\d{8}$/`, and checked for duplicates against both `lenders` and active `applications` (status in `['new', 'approved']`).
- **Sidebar auth guard:** `js/sidebar.js` now `window.location.replace('../index.html')` before throwing when there's no session.
- **Bulk upload dead code:** removed duplicate `setupDropZone` block and broken `sidebarSignOut()` reference (replaced with a local `signOut()`).
- **Service worker:** cache name bumped to `clarix-v3`; fetch handler catch always returns a valid Response (was returning undefined on cache miss).
- **My Records Settle:** now writes a final `payments` row for the remaining outstanding before zeroing the record — ledger stays complete and the confirm dialog states the exact LKR amount being logged as received.
- **Dashboard queries count:** scoped to the logged-in lender and current month; fixed by adding an RLS SELECT policy on `queries` (was silently returning 0 due to RLS).
- **Compliance threshold:** see Bulk Upload §7.

## Pending Follow-ups
- **Admin-aware RLS policy sweep:** the client-side admin gate is done (`is_admin` column + `public.is_admin()` helper), but any existing RLS policies that hardcode the admin email (`auth.jwt() ->> 'email' = '0771234567@clarix.lk'`) still need to be rewritten to call `public.is_admin()`. Run `SELECT policyname, tablename, qual, with_check FROM pg_policies WHERE schemaname = 'public';` to list them, then drop/recreate any that reference the hardcoded email.

## Features Deferred
- Borrower Self-Lookup Portal — deferred for now
- Sinhala language toggle — files exist, reactivate if needed
- Quick Payment screen — skipped in favor of Bulk Payments

## Features Still to Build
- AI Risk Scoring (rule-based Wave 1) — enhance current scoring
- AI Insights Dashboard — lender-facing intelligence

## Paid Features (defer until pre-launch)
- PayHere payment gateway
- Notify.lk / eSMS.lk SMS
- Twilio phone OTP
- Copilot AI assistant (Anthropic Claude API)
- clarix.lk domain purchase
- Penetration testing

## Rules to Follow
1. Explain what you're doing and why before writing code
2. Only provide changed code sections, not entire files (saves tokens/credits)
3. Never push to GitHub mid-feature — only when complete and tested
4. All paid services deferred until pre-launch
5. Test locally with Live Server before any deployment
6. Always use correct database column names (`record_type`, `installments_paid`, `lender_id` in audit_log, `details` as jsonb)
7. Do your absolute best — this is a real business product

## Common Patterns
- Every page imports supabase from `../js/supabase.js`
- Every page includes sidebar.js and lang.js at the bottom before `</body>`
- Service worker registration script on every page
- Manifest and theme-color meta in every page's `<head>`
- Auth check at top of every page — redirect to `../index.html` if no session
- Admin pages fetch the current lender row and check `lenderRow.is_admin === true` before showing content; not-admin → redirect to `../index.html`
- `body` tag uses `style="visibility:hidden;"` on pages with sidebar (prevents flash)