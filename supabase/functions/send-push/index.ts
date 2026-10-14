// supabase/functions/send-push/index.ts
//
// Sends a OneSignal push notification to every subscribed device. Called by
// lib/pushNotifications.js's sendPush() whenever a new Portal Update is posted.
//
// Fixed from the previously-deployed version: that one always returned HTTP 200 with whatever
// OneSignal sent back, even when OneSignal rejected the request (bad key, bad app_id, zero
// recipients, etc.) — so a failed push looked identical to a successful one from the caller's
// side. This checks OneSignal's own response status and reports failures as a non-200, which
// lib/pushNotifications.js's sendPush() now reads and surfaces to the person posting the update.
//
// OS_REST_API_KEY must be set as a Supabase Edge Function secret (Project Settings > Edge
// Functions > send-push > Secrets, or `supabase secrets set OS_REST_API_KEY=...`) — never hardcode
// it in this file, since this file is tracked in the repo.
const OS_REST_API_KEY = Deno.env.get('OS_REST_API_KEY')!
const OS_APP_ID = '5b1d05e6-49bb-4b53-b3de-c57e83b4e229'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  let title: string
  let message: string
  try {
    const body = await req.json()
    title = body.title
    message = body.message
  } catch {
    return new Response(JSON.stringify({ errors: ['Invalid JSON body'] }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  if (!title || !message) {
    return new Response(JSON.stringify({ errors: ['title and message are both required'] }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let data: unknown
  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${OS_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: OS_APP_ID,
        included_segments: ['All'],
        headings: { en: '📢 Aditi Portal — ' + title },
        contents: { en: message },
      }),
    })
    data = await res.json()
    console.log('OneSignal response:', JSON.stringify(data))

    // OneSignal returns 200 with an `errors` array for several failure cases (e.g. no
    // subscribers matched, invalid app_id) instead of a non-2xx status — check both.
    const failed = !res.ok || (data && typeof data === 'object' && 'errors' in data)
    return new Response(JSON.stringify(data), {
      status: failed ? 502 : 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('send-push error:', e)
    return new Response(JSON.stringify({ errors: [String(e)] }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
