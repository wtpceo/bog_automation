import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function verifyCron(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
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
      // pending 원고가 있는지 확인
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

    return NextResponse.json({ 
      success: true, 
      results,
      processed_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error in auto-confirm:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
