// ══════════════════════════════════════════
// ── Clarix Sidebar Navigation Component  ──
// ══════════════════════════════════════════
// Include this in any page to get the sidebar.
// It auto-detects the current page and admin status.

import { supabase } from './supabase.js'
import { checkEnforcement } from './enforcement.js'

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

// ── SVG Icons (Lucide-style, clean 18x18) ──

const icons = {
  dashboard: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  search: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  folder: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>',
  upload: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  admin: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  signout: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  menu: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="18" x2="20" y2="18"/></svg>'
}

// ── Build Navigation Items ──

const navItems = [
  { name: 'Dashboard', page: 'dashboard', icon: icons.dashboard, href: 'dashboard.html' },
  { name: 'Query Borrower', page: 'query-borrower', icon: icons.search, href: 'query-borrower.html' },
  { name: 'Submit Record', page: 'submit-record', icon: icons.plus, href: 'submit-record.html' },
  { name: 'My Records', page: 'my-records', icon: icons.folder, href: 'my-records.html' },
  { name: 'Bulk Upload', page: 'bulk-upload', icon: icons.upload, href: 'bulk-upload.html' },
]

let adminNavHTML = ''
if (isAdmin) {
  adminNavHTML = `
    <div class="sidebar-divider"></div>
    <div class="sidebar-section-label">Administration</div>
    <a href="admin.html" class="sidebar-link ${currentPage === 'admin' ? 'active' : ''}">
      <span class="sidebar-icon">${icons.admin}</span>
      <span class="sidebar-text">Admin Panel</span>
    </a>
    <a href="admin.html" onclick="localStorage.setItem('admin-tab','analytics')" class="sidebar-link">
      <span class="sidebar-icon">${icons.dashboard}</span>
      <span class="sidebar-text">Analytics</span>
    </a>
  `
}

// ── Create Sidebar HTML ──

const sidebarHTML = `
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-logo">CLARIX</span>
      <span class="sidebar-subtitle">Lending Intelligence Network</span>
    </div>
    <nav class="sidebar-nav">
      ${navItems.map(item => `
        <a href="${item.href}" class="sidebar-link ${currentPage === item.page ? 'active' : ''}">
          <span class="sidebar-icon">${item.icon}</span>
          <span class="sidebar-text">${item.name}</span>
        </a>
      `).join('')}
      ${adminNavHTML}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user-info">
        <span class="sidebar-user-phone">${phone}</span>
        ${isAdmin ? '<span class="sidebar-user-role">Administrator</span>' : '<span class="sidebar-user-role">Lender</span>'}
      </div>
      <button class="sidebar-signout" onclick="window.sidebarSignOut()">
        ${icons.signout}
        <span>Sign Out</span>
      </button>
    </div>
    
  </aside>
  <div class="sidebar-backdrop" id="sidebar-backdrop" onclick="window.toggleSidebar()"></div>
`

// ── Inject Sidebar into Page ──

document.body.insertAdjacentHTML('afterbegin', sidebarHTML)
document.body.style.visibility = 'visible'
// ── Add Hamburger Button to Existing Topbar ──

const topbar = document.querySelector('.topbar')
if (topbar) {
  const hamburger = document.createElement('button')
  hamburger.className = 'sidebar-toggle'
  hamburger.innerHTML = icons.menu
  hamburger.onclick = function() { window.toggleSidebar() }
  topbar.insertBefore(hamburger, topbar.firstChild)
}

// ── Sidebar State Management ──

const isMobile = window.innerWidth <= 768
const savedState = localStorage.getItem('clarix-sidebar')

if (isMobile) {
  // Always start closed on mobile
  document.body.classList.remove('sidebar-open')
} else {
  // Desktop: use saved state, default to open
  if (savedState === 'closed') {
    document.body.classList.remove('sidebar-open')
  } else {
    document.body.classList.add('sidebar-open')
  }
}

// ── Toggle Function ──

window.toggleSidebar = function() {
  const isOpen = document.body.classList.toggle('sidebar-open')
  if (!isMobile) {
    localStorage.setItem('clarix-sidebar', isOpen ? 'open' : 'closed')
  }
}

// ── Sign Out Function ──

window.sidebarSignOut = async function() {
  await supabase.auth.signOut()
  window.location.href = '../index.html'
}

// ── Close Sidebar on Mobile When Clicking a Link ──

if (isMobile) {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      document.body.classList.remove('sidebar-open')
    })
  })
}

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
    banner.style.cssText = 'background:#fffbeb;border-bottom:2px solid #fcd34d;padding:10px 20px;font-size:13px;color:#92400e;display:flex;align-items:center;justify-content:space-between;gap:12px;'
    banner.innerHTML = `
      <span>⚠ <strong>Payment records are due for update.</strong> ${enforcement.overdueLoans.length} loan${enforcement.overdueLoans.length > 1 ? 's' : ''} need updating — access will be restricted in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.</span>
      <a href="bulk-upload.html" style="background:#f59e0b;color:white;padding:5px 14px;border-radius:6px;font-size:12px;font-weight:bold;text-decoration:none;white-space:nowrap;">Update Now</a>
    `
    const content = document.querySelector('.dashboard-content')
    if (content) content.insertBefore(banner, content.firstChild)
  }
}