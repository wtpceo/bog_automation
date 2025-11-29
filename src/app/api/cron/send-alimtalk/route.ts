import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const NCP_ACCESS_KEY = process.env.NCP_ACCESS_KEY!
const NCP_SECRET_KEY = process.env.NCP_SECRET_KEY!
const NCP_SERVICE_ID = process.env.NCP_SERVICE_ID!
const KAKAO_CHANNEL_ID = process.env.KAKAO_CHANNEL_ID!
const SERVICE_URL = process.env.SERVICE_URL || 'https://bog-automation.vercel.app'

function verifyCron(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

function makeSignature(timestamp: string, uri: string) {
  const message = `POST ${uri}\n${timestamp}\n${NCP_ACCESS_KEY}`
  const hmac = crypto.createHmac('sha256', NCP_SECRET_KEY)
  hmac.update(message)
  return hmac.digest('base64')
}

async function sendAlimtalk(phone: string, customerName: string, confirmLink: string) {
  const timestamp = Date.now().toString()
  const uri = `/alimtalk/v2/services/${NCP_SERVICE_ID}/messages`
  const url = `https://sens.apigw.ntruss.com${uri}`

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'x-ncp-apigw-timestamp': timestamp,
    'x-ncp-iam-access-key': NCP_ACCESS_KEY,
    'x-ncp-apigw-signature-v2': makeSignature(timestamp, uri)
  }

  const body = {
    plusFriendId: KAKAO_CHANNEL_ID,
    templateCode: 'wiplemarketing',
    messages: [
      {
        to: phone.replace(/-/g, ''),
        content: `${customerName}님, 안녕하세요!\n이번 주 블로그 원고가 준비되었어요.\n\n아래 링크에서 원고를 확인하고 선택해주세요.\n${confirmLink}\n\n3일 내 선택하지 않으시면 첫 번째 원고로 자동 발행됩니다.`,
        buttons: [
          {
            type: 'WL',
            name: '원고 확인하기',
            linkMobile: confirmLink,
            linkPc: confirmLink
          }
        ]
      }
    ]
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
    return response.status === 202
  } catch (error) {
    console.error('Alimtalk error:', error)
    return false
  }
}

function getWeekStart() {
  const today = new Date()
  const day = today.getDay()
  const diff = today.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(today.setDate(diff)).toISOString().split('T')[0]
}

export async function GET(request: NextRequest) {
  if (process.env.CRON_SECRET && !verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const weekStart = getWeekStart()
    const today = new Date().toISOString().split('T')[0]

    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)

    if (customerError) throw customerError

    const results = []

    for (const customer of customers || []) {
      const { data: pendingDrafts } = await supabase
        .from('drafts')
        .select('id')
        .eq('customer_id', customer.id)
        .eq('status', 'pending')
        .gte('week_of', weekStart)

      if (!pendingDrafts || pendingDrafts.length === 0) {
        results.push({ customer: customer.name, status: 'skipped', reason: 'pending 원고 없음' })
        continue
      }

      const confirmLink = `${SERVICE_URL}/confirm/${customer.confirm_token}`
      const success = await sendAlimtalk(customer.phone, customer.name, confirmLink)

      await supabase.from('notifications').insert({
        customer_id: customer.id,
        week_of: today,
        type: 'initial',
        status: success ? 'sent' : 'failed'
      })

      results.push({ customer: customer.name, status: success ? 'sent' : 'failed' })
    }

    return NextResponse.json({ 
      success: true, 
      type: 'initial',
      results,
      sent_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error sending alimtalk:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
