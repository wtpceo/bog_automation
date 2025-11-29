import os
import json
from datetime import datetime, timedelta
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# 클라이언트 초기화
openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
supabase: Client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

def get_used_topics(customer_id: str, months: int = 6) -> list:
    """최근 N개월간 사용한 주제 가져오기"""
    cutoff_date = (datetime.now() - timedelta(days=months * 30)).strftime('%Y-%m-%d')
    
    result = supabase.table('used_topics') \
        .select('title, summary') \
        .eq('customer_id', customer_id) \
        .gte('published_at', cutoff_date) \
        .execute()
    
    return result.data if result.data else []

def generate_blog_drafts(customer: dict, num_drafts: int = 3) -> list:
    """고객 정보 기반으로 브랜드 블로그 원고 생성"""
    
    used_topics = get_used_topics(customer['id'])
    used_titles = [t['title'] for t in used_topics]
    
    exclude_section = ""
    if used_titles:
        exclude_section = f"""
[이미 작성한 주제 - 비슷한 내용 피해줘]
{chr(10).join(f'- {title}' for title in used_titles[-20:])}
"""

    keywords = customer.get('keywords', [])
    main_services = customer.get('main_services', [])
    preferred = customer.get('preferred_expressions', [])
    avoided = customer.get('avoided_expressions', [])

    prompt = f"""너는 10년차 네이버 브랜드 블로그 작가야.
"{customer['name']}" 블로그에 올릴 원고 {num_drafts}개를 써줘.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 업체 정보
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 업체명: {customer['name']}
• 업종: {customer.get('business_type', '')}
• 특장점: {customer.get('specialty', '')}
• 타겟 고객: {customer.get('target_audience', '')}
• 브랜드 컨셉: {customer.get('brand_concept', '')}
• 대표 서비스: {', '.join(main_services) if main_services else ''}
• 가격대: {customer.get('price_range', '')}
• 위치: {customer.get('location_info', '')}
• 타겟 키워드: {', '.join(keywords) if keywords else ''}

※ 제목 작성 시: 위 타겟 키워드 중 하나를 제목 앞부분에 자연스럽게 포함시켜줘
   예시: "여드름 흉터" 키워드 → "여드름 흉터, 레이저 전에 꼭 알아야 할 것들"
   예시: "피부과 추천" 키워드 → "피부과 추천 받기 전 체크리스트 5가지"
• 자주 쓸 표현: {', '.join(preferred) if preferred else ''}
• 피할 표현: {', '.join(avoided) if avoided else ''}

{exclude_section}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 핵심: 이건 광고가 아니라 "정보 콘텐츠"야
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

독자가 이 글을 읽고 "오 진짜 유용하다, 이 블로그 자주 와야겠다" 느끼게 해야 해.
업체 홍보는 글 전체에서 딱 1-2문장만. 그것도 자연스럽게.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 글 구조 (이 흐름대로 써야 함)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1] 후킹 인트로 (200자)
- 독자의 구체적인 상황/고민으로 시작
- "혹시 이런 경험 있으세요?" 패턴 금지 (너무 흔함)
- 대신 구체적인 상황 묘사로 시작
  예: "아침에 중요한 미팅이 있는 날, 거울을 봤는데 턱에 빨간 여드름이 올라와 있으면..."

[2] 본론 - 하나의 주제를 깊이 있게 (1000자)
- 소제목 3개로 나누되, 반드시 논리적으로 연결되어야 함
- 좋은 예: 
  "왜 이런 문제가 생기는지" → "흔한 실수들" → "올바른 해결법"
- 나쁜 예 (절대 금지):
  "서비스A 소개" → "서비스B 소개" → "서비스C 소개"

- 각 소제목은 앞 내용을 받아서 자연스럽게 이어져야 함
- 전환어 활용: "그래서", "근데 여기서 중요한 게", "이걸 알았으니 이제"

[3] 마무리 (200자)
- 핵심 내용 요약
- 업체 언급은 여기서 딱 한 번, 자연스럽게
  예: "저희 OO에서도 이런 상담 많이 받는데요, 궁금하신 점 있으면 편하게 물어봐 주세요~"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✍️ 문체 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[말투]
- ~요체 (습니다체 X)
- 친한 언니/오빠가 꿀팁 알려주는 느낌
- 너무 가볍지도, 너무 무겁지도 않게
- 이모지는 문단당 최대 1개 (없어도 됨)

[문장]
- 한 문장 40자 이내
- 한 문단 4-5문장
- 읽기 쉽게 끊어쓰기

[소제목 형식]
ㅡ
소제목 텍스트
ㅡ

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 절대 하지 말 것
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 매 단락마다 업체명 언급 → 광고 냄새남
2. "저희 OO에서는~" 으로 시작하는 문단 → 금지
3. 서비스 나열식 글 구조 → 정보글이 아님
4. **볼드**, ### 마크다운 → 절대 금지
5. 번호 매기기 (1. 2. 3.) → 금지
6. "혹시 ~ 있으신가요?" 인트로 → 진부함
7. "완치", "100%", "최고" 등 과장 표현

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📏 분량
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- 반드시 1,500자 이상 (공백 포함)
- 2,000자 넘어가도 괜찮음
- 짧으면 안 됨. 정보가 충분해야 함.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 출력 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{
  "drafts": [
    {{
      "title": "제목 (메인키워드가 앞쪽에 자연스럽게 포함, 15-30자)",
      "content": "본문 전체 (1500자 이상)",
      "main_keyword": "메인 키워드"
    }}
  ]
}}

JSON만 출력해. 다른 말 하지 마."""

    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.75,
        max_tokens=6000,
        response_format={"type": "json_object"}
    )
    
    result = json.loads(response.choices[0].message.content)
    return result.get('drafts', [])

def save_drafts_to_db(customer_id: str, drafts: list) -> bool:
    """생성된 원고를 DB에 저장"""
    week_of = datetime.now().strftime('%Y-%m-%d')
    
    for draft in drafts:
        supabase.table('drafts').insert({
            'customer_id': customer_id,
            'week_of': week_of,
            'title': draft['title'],
            'content': draft['content'],
            'images': [],
            'status': 'pending'
        }).execute()
    
    return True

def generate_for_all_customers():
    """모든 활성 고객에 대해 원고 생성"""
    result = supabase.table('customers') \
        .select('*') \
        .eq('is_active', True) \
        .execute()
    
    customers = result.data if result.data else []
    
    print(f"총 {len(customers)}개 업체 원고 생성 시작...")
    
    for customer in customers:
        print(f"\n[{customer['name']}] 원고 생성 중...")
        
        try:
            week_of = datetime.now().strftime('%Y-%m-%d')
            existing = supabase.table('drafts') \
                .select('id') \
                .eq('customer_id', customer['id']) \
                .gte('week_of', week_of) \
                .execute()
            
            if existing.data:
                print(f"  → 이미 이번 주 원고가 있습니다. 스킵.")
                continue
            
            drafts = generate_blog_drafts(customer, num_drafts=3)
            
            if drafts:
                save_drafts_to_db(customer['id'], drafts)
                print(f"  → {len(drafts)}개 원고 생성 완료!")
                for i, d in enumerate(drafts, 1):
                    char_count = len(d['content'])
                    print(f"     {i}. {d['title']} ({char_count}자)")
            else:
                print(f"  → 원고 생성 실패")
                
        except Exception as e:
            print(f"  → 에러 발생: {e}")
    
    print("\n모든 원고 생성 완료!")

def generate_for_customer(customer_id: str):
    """특정 고객에 대해서만 원고 생성"""
    result = supabase.table('customers') \
        .select('*') \
        .eq('id', customer_id) \
        .single() \
        .execute()
    
    if not result.data:
        print("고객을 찾을 수 없습니다.")
        return
    
    customer = result.data
    print(f"[{customer['name']}] 원고 생성 중...")
    
    drafts = generate_blog_drafts(customer, num_drafts=3)
    
    if drafts:
        save_drafts_to_db(customer['id'], drafts)
        print(f"→ {len(drafts)}개 원고 생성 완료!")
        for i, draft in enumerate(drafts, 1):
            char_count = len(draft['content'])
            print(f"  {i}. {draft['title']} ({char_count}자)")
            print(f"     미리보기: {draft['content'][:100]}...")
            print()
    else:
        print("원고 생성 실패")

def regenerate_all():
    """모든 pending 원고 삭제 후 전체 재생성"""
    supabase.table('drafts').delete().eq('status', 'pending').execute()
    print("기존 pending 원고 삭제 완료\n")
    generate_for_all_customers()

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == '--regenerate':
            regenerate_all()
        else:
            generate_for_customer(sys.argv[1])
    else:
        generate_for_all_customers()
