// ══════════════════════════════════════════
// ── Clarix Sidebar Navigation Component  ──
// ══════════════════════════════════════════
// Include this in any page to get the sidebar.
// It auto-detects the current page and admin status.

import { supabase } from './supabase.js'
import { checkEnforcement } from './enforcement.js'
import { trapTab } from './ui.js'

// Only inject sidebar if user is authenticated — otherwise send them to login
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.replace('../index.html')
  throw new Error('Not authenticated')
}

const phone = session.user.email.replace('@clarix.lk', '')

// Fetch lender row — source of truth for both id (enforcement) and is_admin (gating).
// If there's no row, the account is orphaned; sign out and bounce to login.
const { data: lenderRow } = await supabase.from('lenders').select('id, is_admin').eq('phone', phone).single()
if (!lenderRow) {
  await supabase.auth.signOut()
  window.location.replace('../index.html')
  throw new Error('No lender record for this account')
}

const isAdmin = lenderRow.is_admin === true
const currentLenderIdForEnforcement = isAdmin ? null : lenderRow.id

// Pages exempt from enforcement block (payments upload + admin)
const currentPageName = window.location.pathname.split('/').pop()
const exemptPages = ['bulk-upload.html', 'admin.html', 'update-required.html']
const isExempt = isAdmin || exemptPages.includes(currentPageName)

// Detect current page from URL
const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'dashboard'

// ── SVG Icons (Lucide-style) ──
// Decorative: every icon sits next to a visible text label, so aria-hidden.

const svg = (size, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`

const icons = {
  dashboard: svg(18, '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  search: svg(18, '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  plus: svg(18, '<path d="M12 5v14"/><path d="M5 12h14"/>'),
  folder: svg(18, '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>'),
  upload: svg(18, '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  insights: svg(18, '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>'),
  analytics: svg(18, '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.5"/><rect x="12" y="8" width="3" height="10" rx="0.5"/><rect x="17" y="5" width="3" height="13" rx="0.5"/>'),
  admin: svg(18, '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  user: svg(16, '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  signout: svg(18, '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  menu: svg(20, '<line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="18" x2="20" y2="18"/>'),
  more: svg(22, '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
  alert: svg(16, '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>')
}

// ── Build Navigation Items ──

const navItems = [
  { name: 'Dashboard', short: 'Home', page: 'dashboard', icon: icons.dashboard, href: 'dashboard.html' },
  { name: 'Query Borrower', short: 'Query', page: 'query-borrower', icon: icons.search, href: 'query-borrower.html' },
  { name: 'Submit Record', short: 'Submit', page: 'submit-record', icon: icons.plus, href: 'submit-record.html' },
  { name: 'My Records', short: 'Records', page: 'my-records', icon: icons.folder, href: 'my-records.html' },
  { name: 'Bulk Upload', page: 'bulk-upload', icon: icons.upload, href: 'bulk-upload.html' },
  { name: 'Insights', page: 'insights', icon: icons.insights, href: 'insights.html' },
]

const current = page => currentPage === page ? ' active" aria-current="page' : ''

// Pages without their own bottom-nav tab (Bulk Upload, Insights, Admin…) light up "More"
const inBottomNav = navItems.slice(0, 4).some(item => item.page === currentPage)

let adminNavHTML = ''
if (isAdmin) {
  adminNavHTML = `
    <div class="sidebar-divider"></div>
    <div class="sidebar-section-label" id="sidebar-admin-label">Administration</div>
    <a href="admin.html" class="sidebar-link${current('admin')}">
      <span class="sidebar-icon">${icons.admin}</span>
      <span class="sidebar-text">Admin Panel</span>
    </a>
    <a href="admin.html" onclick="localStorage.setItem('admin-tab','analytics')" class="sidebar-link">
      <span class="sidebar-icon">${icons.analytics}</span>
      <span class="sidebar-text">Analytics</span>
    </a>
  `
}

// ── Create Sidebar HTML ──

const sidebarHTML = `
  <aside class="sidebar" id="sidebar" aria-label="Main navigation">
    <div class="sidebar-header">
      <span class="sidebar-mark" aria-hidden="true">C</span>
      <div>
        <span class="sidebar-logo">CLARIX</span>
        <span class="sidebar-subtitle">Lending Intelligence Network</span>
      </div>
    </div>
    <nav class="sidebar-nav" aria-label="Primary">
      ${navItems.map(item => `
        <a href="${item.href}" class="sidebar-link${current(item.page)}">
          <span class="sidebar-icon">${item.icon}</span>
          <span class="sidebar-text">${item.name}</span>
        </a>
      `).join('')}
      ${adminNavHTML}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user-info">
        <span class="sidebar-avatar">${icons.user}</span>
        <div>
          <span class="sidebar-user-phone">${phone}</span>
          <span class="sidebar-user-role">${isAdmin ? 'Administrator' : 'Lender'}</span>
        </div>
      </div>
      <button type="button" class="sidebar-signout" onclick="window.sidebarSignOut()">
        ${icons.signout}
        <span>Sign Out</span>
      </button>
    </div>
  </aside>
  <div class="sidebar-backdrop" id="sidebar-backdrop" onclick="window.toggleSidebar(false)"></div>
`

// ── Mobile bottom nav: first four primary destinations + "More" (opens drawer) ──

const bottomNavHTML = `
  <nav class="bottom-nav" aria-label="Quick navigation">
    ${navItems.slice(0, 4).map(item => `
      <a href="${item.href}" class="bottom-nav-item${current(item.page)}">
        ${item.icon}<span>${item.short}</span>
      </a>
    `).join('')}
    <button type="button" class="bottom-nav-item${inBottomNav ? '' : ' active'}" id="bottom-nav-more" aria-controls="sidebar" aria-expanded="false" onclick="window.toggleSidebar()">
      ${icons.more}<span>More</span>
    </button>
  </nav>
`

// ── Inject Sidebar into Page ──

document.body.insertAdjacentHTML('afterbegin', sidebarHTML)
document.body.insertAdjacentHTML('beforeend', bottomNavHTML)
document.body.classList.add('has-bottomnav')
document.body.style.visibility = 'visible'

// ── Add Hamburger Button to Existing Topbar ──
// Wraps [hamburger + logo] in .topbar-start so the logo stays left-aligned
// when the hamburger is hidden on phones.

const topbar = document.querySelector('.topbar')
let hamburger = null
if (topbar) {
  hamburger = document.createElement('button')
  hamburger.type = 'button'
  hamburger.className = 'sidebar-toggle'
  hamburger.innerHTML = icons.menu
  hamburger.setAttribute('aria-label', 'Toggle navigation')
  hamburger.setAttribute('aria-controls', 'sidebar')
  hamburger.onclick = function() { window.toggleSidebar() }

  const start = document.createElement('div')
  start.className = 'topbar-start'
  start.appendChild(hamburger)
  const logo = topbar.querySelector('.logo-name')
  if (logo) start.appendChild(logo)
  topbar.insertBefore(start, topbar.firstChild)
}

// ── Sidebar State Management ──
// Re-evaluated on resize so rotating a tablet or resizing a window
// switches between push (desktop) and drawer (mobile) correctly.

const mobileQuery = window.matchMedia('(max-width: 768px)')
const moreButton = document.getElementById('bottom-nav-more')

function syncExpanded() {
  const open = document.body.classList.contains('sidebar-open')
  if (hamburger) hamburger.setAttribute('aria-expanded', String(open))
  if (moreButton) moreButton.setAttribute('aria-expanded', String(open))
}

function applyInitialState() {
  if (mobileQuery.matches) {
    // Always start closed on mobile
    document.body.classList.remove('sidebar-open')
  } else if (localStorage.getItem('clarix-sidebar') === 'closed') {
    document.body.classList.remove('sidebar-open')
  } else {
    // Desktop: default to open
    document.body.classList.add('sidebar-open')
  }
  syncExpanded()
}

applyInitialState()
mobileQuery.addEventListener('change', applyInitialState)

// ── Toggle Function ──
// toggleSidebar() flips; toggleSidebar(false) forces closed.

window.toggleSidebar = function(force) {
  const isOpen = document.body.classList.toggle('sidebar-open', force)
  if (!mobileQuery.matches) {
    localStorage.setItem('clarix-sidebar', isOpen ? 'open' : 'closed')
  } else if (isOpen) {
    // Move focus into the drawer so keyboard / screen-reader users land in it
    const first = document.querySelector('#sidebar .sidebar-link')
    if (first) setTimeout(() => first.focus(), 50)
  }
  syncExpanded()
}

// Mobile drawer is modal: Escape closes it, Tab stays inside it
const sidebarEl = document.getElementById('sidebar')
document.addEventListener('keydown', e => {
  if (!mobileQuery.matches || !document.body.classList.contains('sidebar-open')) return
  if (e.key === 'Escape') {
    window.toggleSidebar(false)
    if (moreButton) moreButton.focus()
  } else if (e.key === 'Tab') {
    trapTab(e, sidebarEl)
  }
})

// ── Sign Out Function ──

window.sidebarSignOut = async function() {
  await supabase.auth.signOut()
  window.location.href = '../index.html'
}

// ── Close Sidebar on Mobile When Clicking a Link ──

document.querySelectorAll('.sidebar-link').forEach(link => {
  link.addEventListener('click', () => {
    if (mobileQuery.matches) document.body.classList.remove('sidebar-open')
  })
})

// ── Enforcement Check ──

if (!isExempt && currentLenderIdForEnforcement) {
  const enforcement = await checkEnforcement(currentLenderIdForEnforcement)

  if (enforcement.blocked) {
    window.location.href = 'update-required.html'
  } else if (enforcement.warning) {
    const oldest = enforcement.overdueLoans.reduce((a, b) => a.days > b.days ? a : b)
    const daysLeft = oldest.threshold - oldest.days
    const banner = document.createElement('div')
    banner.id = 'enforcement-warning-banner'
    banner.className = 'enforcement-banner'
    banner.setAttribute('role', 'alert')
    banner.innerHTML = `
      <span class="enforcement-banner-text">${icons.alert}<span><strong>Payment records are due for update.</strong> ${enforcement.overdueLoans.length} loan${enforcement.overdueLoans.length > 1 ? 's' : ''} need updating — access will be restricted in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.</span></span>
      <a href="bulk-upload.html" class="btn btn-sm">Update Now</a>
    `
    const content = document.querySelector('.dashboard-content')
    if (content) content.insertBefore(banner, content.firstChild)
  }
}