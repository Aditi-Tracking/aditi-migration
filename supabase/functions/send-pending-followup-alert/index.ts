// supabase/functions/send-pending-followup-alert/index.ts
// Emails the Growth Director when a Field Sales lead reaches 2 pending follow-ups. Same stack as send-birthday-reminder (Resend, service role).
// Called every 5 minutes by pg_cron/pg_net; claims unsent rows from field_sales_alerts via fs_alerts_claim(), mails each, reports back via fs_alert_done().
// A failed send stays unsent and is retried (up to 5 attempts, 10 minutes apart). The recipient comes from field_sales_settings ('director_alert_email').

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('FS_ALERT_SECRET')!

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('forbidden', { status: 403 })
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: alerts, error } = await supabase.rpc('fs_alerts_claim', { p_limit: 10 })
  if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 })

  let sent = 0
  for (const a of alerts ?? []) {
    try {
      if (!a.to) throw new Error('No director_alert_email setting')
      const l = a.lead ?? {}
      const rows = (a.visits ?? [])
        .map((v: any) => `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb">${esc(day(v.at))}</td><td style="padding:6px 10px;border:1px solid #e5e7eb">${esc(v.reason)}</td><td style="padding:6px 10px;border:1px solid #e5e7eb">${esc(v.next_followup_date ? day(v.next_followup_date + 'T00:00:00') : '')}</td></tr>`)
        .join('')
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
        <h3 style="margin:0 0 8px">Two pending follow-ups on the same lead</h3>
        <p style="margin:0 0 12px;color:#374151">${esc(l.rep_name)} has logged two visits on <b>${esc(l.business_name)}</b> without giving the demo.</p>
        <p style="margin:0 0 12px;color:#374151">Contact: ${esc(l.contact_person)} &middot; ${esc(l.contact_number)}<br>${esc(l.area)}, ${esc(l.city)}</p>
        <table style="border-collapse:collapse;font-size:13px"><tr style="background:#f3f4f6"><th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left">Visit</th><th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left">Reason demo not given</th><th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left">Next follow-up</th></tr>${rows}</table>
        <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">Aditi Tracking &middot; Auto alert &middot; Do not reply</p></div>`
      const { error: mailError } = await resend.emails.send({
        from: 'Aditi Portal <portal@adititracking.com>',
        to: [a.to],
        subject: `Field Sales: 2 pending follow-ups — ${l.business_name} (${l.rep_name})`,
        html,
      })
      if (mailError) throw new Error(JSON.stringify(mailError))
      await supabase.rpc('fs_alert_done', { p_id: a.id })
      sent++
    } catch (e) {
      console.error('alert failed', a.id, e)
      await supabase.rpc('fs_alert_done', { p_id: a.id, p_error: String((e as Error).message ?? e) })
    }
  }
  return new Response(JSON.stringify({ success: true, claimed: (alerts ?? []).length, sent }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
