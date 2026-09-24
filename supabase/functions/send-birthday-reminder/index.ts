// supabase/functions/send-birthday-reminder/index.ts
//
// Checks for employees whose birthday is tomorrow and, if any exist,
// emails HR a styled reminder so they can prepare celebration creatives.
// No birthdays tomorrow -> no email is sent.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const HR_RECIPIENTS = ['hr@adititracking.com', 'careers@adititracking.com','mis@adititracking.com']

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun",
                     "Jul","Aug","Sep","Oct","Nov","Dec"]

function tomorrowDisplayDate(): string {
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const d = new Date(todayIST + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: employees, error } = await supabase.rpc('get_tomorrows_birthdays')

  if (error) {
    console.error('Query failed:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (!employees || employees.length === 0) {
    console.log('No birthdays tomorrow — skipping email')
    return new Response(
      JSON.stringify({ success: true, sent: false, reason: 'No birthdays tomorrow' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const dateLabel = tomorrowDisplayDate()
  const count = employees.length
  const namesList = employees
    .map((e: { Employee_name: string }) => e.Employee_name)
    .join(', ')

  const cards = employees
    .map((e: { Employee_name: string; Emp_id: string }) => `
      <tr>
        <td style="padding:14px 20px; background:#f8f9fa; border-radius:8px;
                    border-left:4px solid #2474b5;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle;">
                <span style="font-size:22px; vertical-align:middle;">🎂</span>
                <span style="font-size:16px; font-weight:700; color:#222;
                             margin-left:10px; vertical-align:middle;">
                  ${e.Employee_name}
                </span>
              </td>
              <td style="text-align:right; vertical-align:middle;">
                <span style="font-size:12px; color:#888; font-family:monospace;">
                  ${e.Emp_id}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="height:10px;"></td></tr>
    `)
    .join('')

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0; padding:0; background:#f0f4f8; font-family:Arial, sans-serif;">
  <div style="max-width:600px; margin:30px auto; background:#ffffff;
              border-radius:8px; overflow:hidden;
              box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- HEADER -->
    <div style="background:#2474b5; padding:28px 32px;">
      <h2 style="margin:0; color:#ffffff; font-size:24px; font-weight:700;">
        🎉 Birthday Reminder
      </h2>
      <p style="margin:6px 0 0; color:#cce4f7; font-size:14px;">
        Tomorrow &middot; ${dateLabel}
      </p>
    </div>

    <!-- SUMMARY -->
    <div style="padding:24px 32px; border-bottom:1px solid #e9ecef;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="90" style="border-right:3px solid #00b894;
                                 padding-right:20px; vertical-align:middle;
                                 text-align:center;">
            <div style="font-size:44px; font-weight:700; color:#00b894; line-height:1;">
              ${count}
            </div>
            <div style="font-size:11px; color:#888; margin-top:6px;
                        text-transform:uppercase; letter-spacing:0.5px;">
              ${count === 1 ? 'Birthday' : 'Birthdays'}
            </div>
          </td>
          <td style="padding-left:20px; vertical-align:middle;">
            <p style="margin:0; color:#444; font-size:15px;">
              Please prepare the celebration creative${count > 1 ? 's' : ''} for
              tomorrow's birthday${count > 1 ? 's' : ''} listed below.
            </p>
          </td>
        </tr>
      </table>
    </div>

    <!-- EMPLOYEE LIST -->
    <div style="padding:24px 32px;">
      <p style="margin:0 0 14px; font-size:13px; font-weight:700;
                color:#555; text-transform:uppercase; letter-spacing:0.8px;">
        Employee${count > 1 ? 's' : ''}
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${cards}
      </table>
    </div>

    <!-- BUTTON -->
    <div style="padding:8px 32px 32px; text-align:center;">
      <a href="https://learn.adititracking.com"
         style="display:inline-block; background:#2474b5; color:#ffffff;
                padding:14px 36px; border-radius:6px; text-decoration:none;
                font-size:15px; font-weight:600;">
        Open Portal
      </a>
    </div>

    <!-- FOOTER -->
    <div style="background:#f8f9fa; padding:14px 32px; text-align:center;
                border-top:1px solid #e9ecef;">
      <p style="margin:0; font-size:12px; color:#aaa;">
        Aditi Tracking &middot; Auto birthday reminder &middot; Do not reply
      </p>
    </div>

  </div>
</body>
</html>`

  const { error: emailError } = await resend.emails.send({
    from: 'Aditi Portal <portal@adititracking.com>',
    to: HR_RECIPIENTS,
    subject: `🎂 Birthday Reminder — ${namesList} (${dateLabel})`,
    html,
  })

  if (emailError) {
    console.error('Resend error:', emailError)
    return new Response(
      JSON.stringify({ success: false, error: emailError }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  console.log(`Sent birthday reminder for ${count} employee(s)`)
  return new Response(
    JSON.stringify({ success: true, sent: true, count }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})