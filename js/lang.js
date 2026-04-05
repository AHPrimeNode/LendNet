// ══════════════════════════════════════════
// ── Clarix Language Engine              ──
// ══════════════════════════════════════════
// Include this after sidebar.js on every page.
// Elements with data-i18n="section.key" get translated automatically.
// Elements with data-i18n-placeholder="section.key" get placeholder translated.

import { translations } from './translations.js'

// ── Get / Set Language ──

export function getLang() {
  return localStorage.getItem('clarix-lang') || 'en'
}

export function setLang(lang) {
  localStorage.setItem('clarix-lang', lang)
}

// ── Translate a single key ──

export function t(section, key) {
  const lang = getLang()
  if (translations[section] && translations[section][key]) {
    return translations[section][key][lang] || translations[section][key]['en']
  }
  return key
}

// ── Apply translations to all elements on the page ──

export function applyTranslations() {
  const lang = getLang()

  // Translate text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const path = el.getAttribute('data-i18n')
    const [section, key] = path.split('.')
    if (translations[section] && translations[section][key]) {
      el.textContent = translations[section][key][lang] || translations[section][key]['en']
    }
  })

  // Translate placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const path = el.getAttribute('data-i18n-placeholder')
    const [section, key] = path.split('.')
    if (translations[section] && translations[section][key]) {
      el.placeholder = translations[section][key][lang] || translations[section][key]['en']
    }
  })

  // Update toggle button text
  const toggleBtn = document.getElementById('lang-toggle-btn')
  if (toggleBtn) {
    toggleBtn.textContent = lang === 'en' ? 'සිංහල' : 'English'
  }
}

// ── Toggle language ──

window.toggleLanguage = function() {
  const current = getLang()
  const newLang = current === 'en' ? 'si' : 'en'
  setLang(newLang)
  applyTranslations()
}



// ── Initialize ──

applyTranslations()