import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })
}

// Vercel Cron 인증 체크
function verifyCron(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(request: NextRequest) {
  // Vercel Cron은 GET으로 호출됨
  if (process.env.CRON_SECRET && !verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)

    if (customerError) throw customerError

    const results = []
    const today = new Date().toISOString().split('T')[0]

    for (const customer of customers || []) {
      const { data: existingDrafts } = await supabase
        .from('drafts')
        .select('id')
        .eq('customer_id', customer.id)
        .gte('week_of', today)

      if (existingDrafts && existingDrafts.length > 0) {
        results.push({ customer: customer.name, status: 'skipped', reason: '이미 원고 존재' })
        continue
      }

      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      
      const { data: usedTopics } = await supabase
        .from('used_topics')
        .select('title')
        .eq('customer_id', customer.id)
        .gte('published_at', sixMonthsAgo.toISOString().split('T')[0])

      const usedTitles = usedTopics?.map(t => t.title) || []
      
      const drafts = await generateDrafts(customer, usedTitles)
      
      if (drafts.length > 0) {
        for (const draft of drafts) {
          await supabase.from('drafts').insert({
            customer_id: customer.id,
            week_of: today,
            title: draft.title,
            content: draft.content,
            images: [],
            status: 'pending'
          })
        }
        results.push({ customer: customer.name, status: 'success', count: drafts.length })
      } else {
        results.push({ customer: customer.name, status: 'failed' })
      }
    }

    return NextResponse.json({ 
      success: true, 
      results,
      generated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error generating drafts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function generateDrafts(customer: any, usedTitles: string[]) {
  const keywords = customer.keywords || []
  const mainServices = customer.main_services || []
  const preferred = customer.preferred_expressions || []
  const avoided = customer.avoided_expressions || []

  const excludeSection = usedTitles.length > 0 
    ? `\n[이미 작성한 주제 - 비슷한 내용 피해줘]\n${usedTitles.slice(-20).map(t => `- ${t}`).join('\n')}`
    : ''

  const prompt = `너는 10년차 네이버 브랜드 블로그 작가야.
"${customer.name}" 블로그에 올릴 원고 3개를 써줘.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 업체 정보
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 업체명: ${customer.name}
• 업종: ${customer.business_type || ''}
• 특장점: ${customer.specialty || ''}
• 타겟 고객: ${customer.target_audience || ''}
• 브랜드 컨셉: ${customer.brand_concept || ''}
• 대표 서비스: ${mainServices.join(', ')}
• 가격대: ${customer.price_range || ''}
• 위치: ${customer.location_info || ''}
• 타겟 키워드: ${keywords.join(', ')}

※ 제목 작성 시: 위 타겟 키워드 중 하나를 제목 앞부분에 자연스럽게 포함시켜줘
• 자주 쓸 표현: ${preferred.join(', ') || '없음'}
• 피할 표현: ${avoided.join(', ') || '없음'}

${excludeSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 핵심: 이건 광고가 아니라 "정보 콘텐츠"야
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

독자가 이 글을 읽고 "오 진짜 유용하다" 느끼게 해야 해.
업체 홍보는 글 전체에서 딱 1-2문장만.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 글 구조
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1] 후킹 인트로 (200자) - 구체적인 상황 묘사로 시작
[2] 본론 (1000자) - 소제목 3개, 논리적으로 연결
[3] 마무리 (200자) - 요약 + 업체 언급 딱 한 번

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✍️ 문체: ~요체, 친한 언니/오빠 느낌
🚫 금지: **볼드**, ### 마크다운, 번호 매기기
📏 분량: 반드시 1,500자 이상

[소제목 형식]
ㅡ
소제목 텍스트
ㅡ

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 출력: JSON만
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "drafts": [
    { "title": "제목", "content": "본문", "main_keyword": "키워드" }
  ]
}`

  try {
    const openai = getOpenAI()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.75,
      max_tokens: 6000,
      response_format: { type: 'json_object' }
    })

    const result = JSON.parse(response.choices[0].message.content || '{}')
    return result.drafts || []
  } catch (error) {
    console.error('OpenAI error:', error)
    return []
  }
}
