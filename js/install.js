// ══════════════════════════════════════════
// ── Clarix Install Prompt                ──
// ══════════════════════════════════════════
// Desktop Chrome shows its own install icon in the address bar, so the app
// looked installable there. Android Chrome dropped the automatic mini-infobar
// — a site has to catch `beforeinstallprompt` and offer its own button, or the
// only way in is the ⋮ menu. Clarix had no handler at all, which is why nothing
// ever appeared on Android.
//
// Plain script (not a module) so every page can include it with one tag.

;(function () {
  // Already installed and running standalone — nothing to offer.
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  if (standalone) return

  const SNOOZE_KEY = 'clarix_install_snoozed_until'
  const SNOOZE_DAYS = 7

  const snoozedUntil = parseInt(localStorage.getItem(SNOOZE_KEY) || '0', 10)
  if (snoozedUntil && Date.now() < snoozedUntil) return

  let deferredPrompt = null

  window.addEventListener('beforeinstallprompt', event => {
    // Chrome fires this only when the install criteria pass. Stop the default
    // mini-infobar (where it still exists) so our own button is the one UI.
    event.preventDefault()
    deferredPrompt = event
    showBar()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    removeBar()
    localStorage.removeItem(SNOOZE_KEY)
  })

  function removeBar() {
    const existing = document.getElementById('clarix-install-bar')
    if (existing) existing.remove()
  }

  function showBar() {
    if (document.getElementById('clarix-install-bar')) return

    const bar = document.createElement('div')
    bar.id = 'clarix-install-bar'
    bar.style.cssText =
      'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;' +
      'background:#1d4ed8;color:#fff;border-radius:12px;padding:12px 14px;' +
      'box-shadow:0 8px 24px rgba(15,23,42,.28);display:flex;align-items:center;' +
      'gap:12px;font-size:14px;max-width:420px;margin:0 auto;'

    bar.innerHTML = `
      <img src="/icons/icon-192.png" alt="" width="36" height="36" style="border-radius:8px;flex-shrink:0;" />
      <div style="flex:1;line-height:1.35;">
        <div style="font-weight:bold;">Install Clarix</div>
        <div style="font-size:12px;opacity:.85;">Add to your home screen for faster access.</div>
      </div>
      <button id="clarix-install-yes" style="background:#fff;color:#1d4ed8;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:bold;cursor:pointer;white-space:nowrap;">Install</button>
      <button id="clarix-install-no" aria-label="Dismiss" style="background:transparent;color:#fff;border:none;font-size:20px;line-height:1;cursor:pointer;padding:0 4px;opacity:.8;">&times;</button>
    `

    document.body.appendChild(bar)

    document.getElementById('clarix-install-yes').addEventListener('click', async () => {
      if (!deferredPrompt) return
      removeBar()
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      // A prompt event can only be used once, regardless of the answer.
      deferredPrompt = null
      if (outcome === 'dismissed') snooze()
    })

    document.getElementById('clarix-install-no').addEventListener('click', () => {
      removeBar()
      snooze()
    })
  }

  function snooze() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 864e5))
  }
})()
