// ══════════════════════════════════════════
// ── Clarix UI Feedback (toast + dialogs) ──
// ══════════════════════════════════════════
// Replaces native alert()/confirm(). Native dialogs look foreign inside the
// installed PWA, can't be styled for money confirmations, and block the page.
//
//   import { toast, alertDialog, confirmDialog } from '../js/ui.js'
//   toast('Payment saved', 'success')
//   await alertDialog({ title: 'Error', message: err.message })
//   if (!await confirmDialog({ title: 'Settle?', message: '…', confirmText: 'Settle', danger: true })) return
//
// All text is set via textContent, so error messages from Supabase can never
// inject HTML. Styles live in css/style.css (.ui-modal*, .ui-toast*).

// ── Toasts ──

let toastRegion = null

function getToastRegion() {
  if (toastRegion && document.body.contains(toastRegion)) return toastRegion
  toastRegion = document.createElement('div')
  toastRegion.className = 'ui-toast-region'
  toastRegion.setAttribute('role', 'status')
  toastRegion.setAttribute('aria-live', 'polite')
  document.body.appendChild(toastRegion)
  return toastRegion
}

/**
 * Short, non-blocking notice. type: 'info' | 'success' | 'warning' | 'error'.
 * Errors stay longer (6s) — they usually need reading.
 */
export function toast(message, type = 'info', duration) {
  const ms = duration ?? (type === 'error' ? 6000 : 3500)
  const el = document.createElement('div')
  el.className = 'ui-toast ' + type
  el.textContent = message
  getToastRegion().appendChild(el)

  const remove = () => {
    el.classList.add('leaving')
    setTimeout(() => el.remove(), 200)
  }
  const timer = setTimeout(remove, ms)
  el.addEventListener('click', () => { clearTimeout(timer); remove() })
}

// ── Dialogs ──

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
let dialogSeq = 0

/**
 * Core modal. Resolves true (confirm) / false (cancel, Escape, backdrop).
 * opts: title, message, confirmText, cancelText (null = no cancel button),
 *       danger (red confirm), details: [{ label, value, copy }] rendered as
 *       mono rows with optional Copy buttons (e.g. login credentials).
 */
function openDialog(opts) {
  const {
    title = '',
    message = '',
    confirmText = 'OK',
    cancelText = 'Cancel',
    danger = false,
    details = [],
    role = 'dialog'
  } = opts

  return new Promise(resolve => {
    const id = 'ui-dialog-' + (++dialogSeq)
    const previouslyFocused = document.activeElement

    const backdrop = document.createElement('div')
    backdrop.className = 'ui-modal-backdrop'

    const modal = document.createElement('div')
    modal.className = 'ui-modal'
    modal.setAttribute('role', role)
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-labelledby', id + '-title')
    modal.setAttribute('aria-describedby', id + '-body')

    const h = document.createElement('h2')
    h.className = 'ui-modal-title'
    h.id = id + '-title'
    h.textContent = title
    modal.appendChild(h)

    const body = document.createElement('p')
    body.className = 'ui-modal-body'
    body.id = id + '-body'
    body.textContent = message
    modal.appendChild(body)

    if (details.length) {
      const list = document.createElement('dl')
      list.className = 'ui-modal-details'
      details.forEach(d => {
        const row = document.createElement('div')
        row.className = 'ui-modal-detail'
        const dt = document.createElement('dt')
        dt.textContent = d.label
        const dd = document.createElement('dd')
        const val = document.createElement('span')
        val.className = 'mono'
        val.textContent = d.value
        dd.appendChild(val)
        if (d.copy) {
          const copyBtn = document.createElement('button')
          copyBtn.type = 'button'
          copyBtn.className = 'btn btn-ghost btn-sm'
          copyBtn.textContent = 'Copy'
          copyBtn.setAttribute('aria-label', 'Copy ' + d.label)
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(d.value)
              copyBtn.textContent = 'Copied'
            } catch {
              copyBtn.textContent = 'Select & copy'
              const range = document.createRange()
              range.selectNodeContents(val)
              const sel = window.getSelection()
              sel.removeAllRanges()
              sel.addRange(range)
            }
          })
          dd.appendChild(copyBtn)
        }
        row.append(dt, dd)
        list.appendChild(row)
      })
      modal.appendChild(list)
    }

    const actions = document.createElement('div')
    actions.className = 'ui-modal-actions'

    let cancelBtn = null
    if (cancelText) {
      cancelBtn = document.createElement('button')
      cancelBtn.type = 'button'
      cancelBtn.className = 'btn btn-ghost'
      cancelBtn.textContent = cancelText
      actions.appendChild(cancelBtn)
    }

    const okBtn = document.createElement('button')
    okBtn.type = 'button'
    okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-brand')
    okBtn.textContent = confirmText
    actions.appendChild(okBtn)

    modal.appendChild(actions)
    backdrop.appendChild(modal)
    document.body.appendChild(backdrop)

    // Lock background scroll while open
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function close(result) {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      backdrop.remove()
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus()
      resolve(result)
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close(false)
      } else if (e.key === 'Tab') {
        // Keep focus inside the dialog
        const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled)
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    okBtn.addEventListener('click', () => close(true))
    if (cancelBtn) cancelBtn.addEventListener('click', () => close(false))
    backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(false) })
    document.addEventListener('keydown', onKey, true)

    // Destructive confirms focus Cancel so a stray Enter can't delete/settle.
    ;(danger && cancelBtn ? cancelBtn : okBtn).focus()
  })
}

/** Blocking notice with a single OK button. Resolves when dismissed. */
export function alertDialog({ title = 'Notice', message = '', confirmText = 'OK', details } = {}) {
  return openDialog({ title, message, confirmText, cancelText: null, details, role: 'alertdialog' }).then(() => undefined)
}

/** Yes/no question. Resolves true only when the confirm button is pressed. */
export function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  return openDialog({ title, message, confirmText, cancelText, danger, role: 'alertdialog' })
}

// ── Content modal (forms, detail views) ──

/**
 * Open a modal whose body is page-supplied HTML. Caller is responsible for
 * escaping any data interpolated into bodyHTML / footerHTML.
 * Returns { el, body, close }. Escape, backdrop click and any element with
 * [data-close] close it; focus is trapped inside and restored on close.
 * opts: title, bodyHTML, footerHTML, size ('md' | 'lg'), onClose
 */
export function openModal({ title = '', bodyHTML = '', footerHTML = '', size = 'md', onClose } = {}) {
  const id = 'ui-dialog-' + (++dialogSeq)
  const previouslyFocused = document.activeElement

  const backdrop = document.createElement('div')
  backdrop.className = 'ui-modal-backdrop'
  backdrop.innerHTML = `
    <div class="ui-modal form-modal${size === 'lg' ? ' form-modal-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="form-modal-header">
        <h2 class="ui-modal-title" id="${id}-title"></h2>
        <button type="button" class="btn btn-ghost btn-icon" data-close aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="form-modal-body">${bodyHTML}</div>
      ${footerHTML ? `<div class="form-modal-footer ui-modal-actions">${footerHTML}</div>` : ''}
    </div>`
  const modal = backdrop.firstElementChild
  modal.querySelector('.ui-modal-title').textContent = title
  document.body.appendChild(backdrop)

  const prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  let closed = false
  function close() {
    if (closed) return
    closed = true
    document.removeEventListener('keydown', onKey, true)
    document.body.style.overflow = prevOverflow
    backdrop.remove()
    if (previouslyFocused && document.body.contains(previouslyFocused)) previouslyFocused.focus()
    if (onClose) onClose()
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') {
      const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled && el.offsetParent !== null)
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close() })
  modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) close() })
  document.addEventListener('keydown', onKey, true)

  // Focus first form control, else the close button
  const firstField = modal.querySelector('.form-modal-body input:not([disabled]), .form-modal-body select, .form-modal-body textarea')
  ;(firstField || modal.querySelector('[data-close]')).focus()

  return { el: modal, body: modal.querySelector('.form-modal-body'), close }
}

// ── Form helpers ──

/**
 * Show (or clear, when msg is falsy) an inline error under a field.
 * Error element is created once as a sibling with id `<input.id>-error` and
 * linked via aria-describedby so screen readers announce it.
 */
export function fieldError(input, msg) {
  if (!input) return
  const errId = input.id + '-error'
  let err = document.getElementById(errId)
  if (!msg) {
    input.removeAttribute('aria-invalid')
    if (err) err.remove()
    return
  }
  if (!err) {
    err = document.createElement('p')
    err.className = 'field-error'
    err.id = errId
    // Checkboxes sit inside their <label>; put the message under the whole label.
    // Inputs inside a wrapper (.input-prefix / .input-group) go under the wrapper.
    const anchor = (input.type === 'checkbox' && input.closest('label'))
      || input.closest('.input-prefix, .input-group')
      || input
    anchor.insertAdjacentElement('afterend', err)
  }
  err.textContent = msg
  input.setAttribute('aria-invalid', 'true')
  input.setAttribute('aria-describedby', errId)
}

/** Clear every inline error inside a container. */
export function clearFieldErrors(root = document) {
  root.querySelectorAll('[aria-invalid="true"]').forEach(el => fieldError(el, null))
}

/**
 * Validate required fields declaratively. rules: [{ el, msg, test? }].
 * test defaults to "non-empty". Marks every failure, focuses the first,
 * clears each error as soon as the user edits that field. Returns true if valid.
 */
export function validate(rules) {
  let first = null
  rules.forEach(({ el, msg, test }) => {
    if (!el) return
    const ok = test ? test(el.value) : el.value.trim() !== ''
    fieldError(el, ok ? null : msg)
    if (!ok) {
      if (!first) first = el
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => fieldError(el, null), { once: true })
    }
  })
  if (first) first.focus()
  return !first
}

/** Put a button into a busy state (spinner + label) and back. */
export function setLoading(btn, loading, label) {
  if (!btn) return
  if (loading) {
    if (!btn.dataset.idleHtml) btn.dataset.idleHtml = btn.innerHTML
    btn.disabled = true
    btn.setAttribute('aria-busy', 'true')
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>'
    btn.append(document.createTextNode(label || 'Please wait…'))
  } else {
    btn.disabled = false
    btn.removeAttribute('aria-busy')
    if (btn.dataset.idleHtml) btn.innerHTML = btn.dataset.idleHtml
    delete btn.dataset.idleHtml
  }
}

// ── Page-wide keyboard behaviour ──

/** Keep Tab / Shift+Tab inside `container`. Call from a keydown handler. */
export function trapTab(e, container) {
  const items = [...container.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled && el.offsetParent !== null)
  if (!items.length) return
  const first = items[0], last = items[items.length - 1]
  if (!container.contains(document.activeElement)) { e.preventDefault(); first.focus() }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

// Static in-page modals (.form-modal-backdrop.active — Query Borrower dispute,
// Admin resolve) get the same focus trap openModal() has.
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return
  // A confirmDialog / openModal stacked on top owns focus (its own trap handles it)
  if (document.querySelector('.ui-modal-backdrop:not(.form-modal-backdrop)')) return
  const open = document.querySelector('.form-modal-backdrop.active .ui-modal')
  if (open) trapTab(e, open)
})

// ARIA tabs: arrow keys / Home / End move between tabs, and only the selected
// tab sits in the Tab order (roving tabindex). Pages keep their own onclick
// switchers — we just click() the target tab.
function syncTabStops(list) {
  list.querySelectorAll('[role="tab"]').forEach(t => {
    t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1
  })
}
document.querySelectorAll('[role="tablist"]').forEach(list => {
  syncTabStops(list)
  // Bubble phase runs after the tab's inline onclick has updated aria-selected
  list.addEventListener('click', () => syncTabStops(list))
  // Tabs can also be switched in code (e.g. admin's Analytics shortcut)
  list.addEventListener('focusin', () => syncTabStops(list))
  list.addEventListener('keydown', e => {
    const tabs = [...list.querySelectorAll('[role="tab"]')]
    const i = tabs.indexOf(document.activeElement)
    if (i < 0) return
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    const target = tabs[(next + tabs.length) % tabs.length]
    target.focus()
    target.click()
  })
})

// Also expose globally for inline handlers / non-module scripts.
window.ui = { toast, alertDialog, confirmDialog, openModal, fieldError, clearFieldErrors, validate, setLoading, trapTab }
