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

// 월요일: 알림톡 발송
async function sendInitialAlimtalk() {
  const weekStart = getWeekStart()
  const today = new Date().toISOString().split('T')[0]

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('is_active', true)

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

  return { task: 'send_alimtalk', results }
}

// 수요일: 리마인드 발송
async function sendReminder() {
  const weekStart = getWeekStart()
  const today = new Date().toISOString().split('T')[0]

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('is_active', true)

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

    // 이미 컨펌했으면 스킵
    const { data: confirmations } = await supabase
      .from('confirmations')
      .select('id')
      .eq('customer_id', customer.id)
      .gte('week_of', weekStart)

    if (confirmations && confirmations.length > 0) {
      results.push({ customer: customer.name, status: 'skipped', reason: '이미 컨펌됨' })
      continue
    }

    const confirmLink = `${SERVICE_URL}/confirm/${customer.confirm_token}`
    const success = await sendAlimtalk(customer.phone, customer.name, confirmLink)

    await supabase.from('notifications').insert({
      customer_id: customer.id,
      week_of: today,
      type: 'reminder',
      status: success ? 'sent' : 'failed'
    })

    results.push({ customer: customer.name, status: success ? 'sent' : 'failed' })
  }

  return { task: 'send_reminder', results }
}

// 목요일: 자동확정
async function autoConfirm() {
  const weekStart = getWeekStart()
  const today = new Date().toISOString().split('T')[0]

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('is_active', true)

  const results = []

  for (const customer of customers || []) {
    const { data: pendingDrafts } = await supabase
      .from('drafts')
      .select('*')
      .eq('customer_id', customer.id)
      .eq('status', 'pending')
      .gte('week_of', weekStart)
      .order('created_at', { ascending: true })

    if (!pendingDrafts || pendingDrafts.length === 0) {
      results.push({ customer: customer.name, status: 'skipped', reason: 'pending 원고 없음' })
      continue
    }

    // 이미 컨펌했으면 스킵
    const { data: confirmations } = await supabase
      .from('confirmations')
      .select('id')
      .eq('customer_id', customer.id)
      .gte('week_of', weekStart)

    if (confirmations && confirmations.length > 0) {
      results.push({ customer: customer.name, status: 'skipped', reason: '이미 컨펌됨' })
      continue
    }

    // 첫 번째 원고로 자동 확정
    const firstDraft = pendingDrafts[0]

    await supabase.from('confirmations').insert({
      customer_id: customer.id,
      draft_id: firstDraft.id,
      week_of: today,
      memo: '자동 확정'
    })

    await supabase
      .from('drafts')
      .update({ status: 'selected' })
      .eq('id', firstDraft.id)

    for (const draft of pendingDrafts.slice(1)) {
      await supabase
        .from('drafts')
        .update({ status: 'rejected' })
        .eq('id', draft.id)
    }

    results.push({ 
      customer: customer.name, 
      status: 'auto_confirmed', 
      draft: firstDraft.title 
    })
  }

  return { task: 'auto_confirm', results }
}

export async function GET(request: NextRequest) {
  if (process.env.CRON_SECRET && !verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // UTC 기준이므로 한국시간으로 변환 (UTC+9)
    const now = new Date()
    const koreaTime = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const dayOfWeek = koreaTime.getDay() // 0=일, 1=월, 2=화, 3=수, 4=목

    let result

    switch (dayOfWeek) {
      case 1: // 월요일: 알림톡 발송
        result = await sendInitialAlimtalk()
        break
      case 3: // 수요일: 리마인드
        result = await sendReminder()
        break
      case 4: // 목요일: 자동확정
        result = await autoConfirm()
        break
      default:
        result = { task: 'none', message: '오늘은 작업이 없습니다' }
    }

    return NextResponse.json({ 
      success: true, 
      dayOfWeek,
      koreaTime: koreaTime.toISOString(),
      ...result,
      processed_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error in daily tasks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
