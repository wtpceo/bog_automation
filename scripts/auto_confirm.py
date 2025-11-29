import os
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv
from send_alimtalk import send_alimtalk, save_notification_log

load_dotenv()

# Supabase 클라이언트
supabase: Client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

SERVICE_URL = os.getenv('SERVICE_URL', 'https://bog-automation.vercel.app')

def get_customers_without_confirmation():
    """이번 주 원고는 있는데 컨펌 안 한 고객 조회"""
    
    # 이번 주 시작일 (월요일 기준)
    today = datetime.now()
    week_start = today - timedelta(days=today.weekday())
    week_start_str = week_start.strftime('%Y-%m-%d')
    
    # 모든 활성 고객 조회
    result = supabase.table('customers') \
        .select('*') \
        .eq('is_active', True) \
        .execute()
    
    customers = result.data if result.data else []
    unconfirmed = []
    
    for customer in customers:
        # 이번 주 pending 원고가 있는지 확인
        drafts_result = supabase.table('drafts') \
            .select('*') \
            .eq('customer_id', customer['id']) \
            .eq('status', 'pending') \
            .gte('week_of', week_start_str) \
            .execute()
        
        if not drafts_result.data:
            continue
        
        # 이번 주 컨펌했는지 확인
        confirm_result = supabase.table('confirmations') \
            .select('*') \
            .eq('customer_id', customer['id']) \
            .gte('week_of', week_start_str) \
            .execute()
        
        if not confirm_result.data:
            customer['pending_drafts'] = drafts_result.data
            unconfirmed.append(customer)
    
    return unconfirmed

def send_reminder():
    """컨펌 안 한 고객에게 리마인드 알림톡 발송"""
    
    unconfirmed = get_customers_without_confirmation()
    
    print(f"컨펌 미완료 고객: {len(unconfirmed)}명")
    print()
    
    if not unconfirmed:
        print("모든 고객이 컨펌 완료했습니다!")
        return
    
    for customer in unconfirmed:
        confirm_link = f"{SERVICE_URL}/confirm/{customer['confirm_token']}"
        
        print(f"[{customer['name']}] 리마인드 발송 중...")
        
        success = send_alimtalk(
            phone=customer['phone'],
            customer_name=customer['name'],
            confirm_link=confirm_link
        )
        
        save_notification_log(
            customer_id=customer['id'],
            notification_type='reminder',
            status='sent' if success else 'failed'
        )
    
    print()
    print("리마인드 발송 완료!")

def auto_confirm():
    """컨펌 안 한 고객의 첫 번째 원고로 자동 확정"""
    
    unconfirmed = get_customers_without_confirmation()
    
    print(f"자동 확정 대상 고객: {len(unconfirmed)}명")
    print()
    
    if not unconfirmed:
        print("자동 확정할 고객이 없습니다!")
        return
    
    for customer in unconfirmed:
        pending_drafts = customer.get('pending_drafts', [])
        
        if not pending_drafts:
            continue
        
        # 첫 번째 원고 선택
        first_draft = pending_drafts[0]
        
        print(f"[{customer['name']}] 자동 확정: {first_draft['title'][:30]}...")
        
        # 컨펌 기록 저장
        supabase.table('confirmations').insert({
            'customer_id': customer['id'],
            'draft_id': first_draft['id'],
            'week_of': datetime.now().strftime('%Y-%m-%d'),
            'memo': '자동 확정'
        }).execute()
        
        # 선택된 원고 상태 변경
        supabase.table('drafts') \
            .update({'status': 'selected'}) \
            .eq('id', first_draft['id']) \
            .execute()
        
        # 나머지 원고 rejected 처리
        for draft in pending_drafts[1:]:
            supabase.table('drafts') \
                .update({'status': 'rejected'}) \
                .eq('id', draft['id']) \
                .execute()
        
        # 알림 기록
        save_notification_log(
            customer_id=customer['id'],
            notification_type='auto_confirm',
            status='sent'
        )
    
    print()
    print("자동 확정 완료!")

def check_and_process():
    """
    자동 처리 로직:
    - 원고 발송 후 2일: 리마인드 발송
    - 원고 발송 후 3일: 자동 확정
    """
    
    today = datetime.now()
    week_start = today - timedelta(days=today.weekday())
    days_since_monday = today.weekday()
    
    print(f"오늘: {today.strftime('%Y-%m-%d %A')}")
    print(f"이번 주 시작: {week_start.strftime('%Y-%m-%d')}")
    print(f"월요일로부터 {days_since_monday}일 경과")
    print()
    
    # 수요일 (2일 경과): 리마인드
    if days_since_monday == 2:
        print("=== 리마인드 발송 ===")
        send_reminder()
    
    # 목요일 (3일 경과): 자동 확정
    elif days_since_monday >= 3:
        print("=== 자동 확정 처리 ===")
        auto_confirm()
    
    else:
        print("아직 리마인드/자동확정 시점이 아닙니다.")
        print("- 수요일: 리마인드 발송")
        print("- 목요일: 자동 확정")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == '--reminder':
            send_reminder()
        elif sys.argv[1] == '--auto-confirm':
            auto_confirm()
        elif sys.argv[1] == '--check':
            check_and_process()
    else:
        check_and_process()
