import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import { LeadCaptureAccessProvider } from '../../src/context/LeadCaptureAccessContext.jsx'
import LeadCapturePanel from '../../src/components/panels/leadcapture/LeadCapturePanel.jsx'

// The REAL project files over LIVE data: every call the tab makes to the (pretend) Supabase host is answered by meca_bridge.py from the live database,
// under the identity in ?who= (ADMIN or an email). Read-only.
const q = new URLSearchParams(location.search)
const WHO = q.get('who') || 'ADMIN'
window.__calls = []
const realFetch = window.fetch.bind(window)
window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), location.href)
  if (!/rb\.test/.test(u.host)) return realFetch(url, init)
  const fn = u.pathname.split('/').pop()
  if (fn === 'sales_meca_summary') { const b = JSON.parse(init.body); window.__calls.push({ from: b.p_from, to: b.p_to, bucket: b.p_bucket }) }
  if (!u.pathname.includes('/rpc/')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
  return realFetch(`http://127.0.0.1:5390/rpc/${fn}?who=${encodeURIComponent(WHO)}`, { method: 'POST', body: init.body || '{}', headers: { 'content-type': 'application/json' } })
}
createRoot(document.getElementById('root')).render(<StrictMode><LeadCaptureAccessProvider><LeadCapturePanel /></LeadCaptureAccessProvider></StrictMode>)
