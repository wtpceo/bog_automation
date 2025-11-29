import os
import time
import hmac
import hashlib
import requests
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Supabase 클라이언트
supabase: Client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

# 네이버 클라우드 설정
NCP_ACCESS_KEY = os.getenv('NCP_ACCESS_KEY')
NCP_SECRET_KEY = os.getenv('NCP_SECRET_KEY')
NCP_SERVICE_ID = os.getenv('NCP_SERVICE_ID')  # Biz Message 서비스 ID
KAKAO_CHANNEL_ID = os.getenv('KAKAO_CHANNEL_ID')  # 카카오톡 채널 ID

# 배포된 서비스 URL
SERVICE_URL = os.getenv('SERVICE_URL', 'https://bog-automation.vercel.app')

def make_signature(timestamp, uri):
    """네이버 클라우드 API 서명 생성"""
    secret_key = bytes(NCP_SECRET_KEY, 'UTF-8')
    message = f"POST {uri}\n{timestamp}\n{NCP_ACCESS_KEY}"
    message = bytes(message, 'UTF-8')
    
    signing_key = hmac.new(secret_key, message, digestmod=hashlib.sha256).digest()
    return hashlib.base64.b64encode(signing_key).decode('UTF-8')

def send_alimtalk(phone: str, customer_name: str, confirm_link: str) -> bool:
    """알림톡 발송"""
    timestamp = str(int(time.time() * 1000))
    uri = f"/alimtalk/v2/services/{NCP_SERVICE_ID}/messages"
    
    url = f"https://sens.apigw.ntruss.com{uri}"
    
    headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-iam-access-key': NCP_ACCESS_KEY,
        'x-ncp-apigw-signature-v2': make_signature(timestamp, uri)
    }
    
    # 전화번호 형식 정리 (하이픈 제거)
    phone = phone.replace('-', '')
    
    body = {
        "plusFriendId": KAKAO_CHANNEL_ID,
        "templateCode": "wiplemarketing",  # 템플릿 코드
        "messages": [
            {
                "to": phone,
                "content": f"{customer_name}님, 안녕하세요!\n이번 주 블로그 원고가 준비되었어요.\n\n아래 링크에서 원고를 확인하고 선택해주세요.\n{confirm_link}\n\n3일 내 선택하지 않으시면 첫 번째 원고로 자동 발행됩니다.",
                "buttons": [
                    {
                        "type": "WL",
                        "name": "원고 확인하기",
                        "linkMobile": confirm_link,
                        "linkPc": confirm_link
                    }
                ]
            }
        ]
    }
    
    try:
        response = requests.post(url, json=body, headers=headers)
        result = response.json()
        
        if response.status_code == 202:
            print(f"  ✓ 발송 성공: {customer_name} ({phone})")
            return True
        else:
            print(f"  ✗ 발송 실패: {customer_name} - {result}")
            return False
            
    except Exception as e:
        print(f"  ✗ 에러: {customer_name} - {e}")
        return False

def save_notification_log(customer_id: str, notification_type: str, status: str):
    """알림 발송 기록 저장"""
    week_of = datetime.now().strftime('%Y-%m-%d')
    
    supabase.table('notifications').insert({
        'customer_id': customer_id,
        'week_of': week_of,
        'type': notification_type,
        'status': status
    }).execute()

def send_weekly_notifications():
    """모든 활성 고객에게 주간 알림톡 발송"""
    
    # 이번 주 pending 원고가 있는 고객만 조회
    result = supabase.table('customers') \
        .select('*, drafts(id, status)') \
        .eq('is_active', True) \
        .execute()
    
    customers = result.data if result.data else []
    
    print(f"총 {len(customers)}명 고객 알림톡 발송 시작...")
    print(f"서비스 URL: {SERVICE_URL}")
    print()
    
    success_count = 0
    fail_count = 0
    
    for customer in customers:
        # pending 상태 원고가 있는지 확인
        drafts = customer.get('drafts', [])
        pending_drafts = [d for d in drafts if d.get('status') == 'pending']
        
        if not pending_drafts:
            print(f"[{customer['name']}] pending 원고 없음, 스킵")
            continue
        
        # 컨펌 링크 생성
        confirm_link = f"{SERVICE_URL}/confirm/{customer['confirm_token']}"
        
        # 알림톡 발송
        success = send_alimtalk(
            phone=customer['phone'],
            customer_name=customer['name'],
            confirm_link=confirm_link
        )
        
        # 발송 기록 저장
        save_notification_log(
            customer_id=customer['id'],
            notification_type='initial',
            status='sent' if success else 'failed'
        )
        
        if success:
            success_count += 1
        else:
            fail_count += 1
    
    print()
    print(f"발송 완료! 성공: {success_count}, 실패: {fail_count}")

def send_reminder_notifications():
    """컨펌 안 한 고객에게 리마인드 알림톡 발송"""
    
    # 이번 주 pending 원고가 있는데 컨펌 안 한 고객 조회
    result = supabase.table('customers') \
        .select('*, drafts(id, status, week_of), confirmations(id, week_of)') \
        .eq('is_active', True) \
        .execute()
    
    customers = result.data if result.data else []
    week_of = datetime.now().strftime('%Y-%m-%d')
    
    print("리마인드 알림톡 발송 시작...")
    print()
    
    for customer in customers:
        drafts = customer.get('drafts', [])
        confirmations = customer.get('confirmations', [])
        
        # 이번 주 pending 원고가 있는지
        has_pending = any(d.get('status') == 'pending' for d in drafts)
        
        # 이번 주 컨펌했는지
        has_confirmed = any(c.get('week_of') == week_of for c in confirmations)
        
        if has_pending and not has_confirmed:
            confirm_link = f"{SERVICE_URL}/confirm/{customer['confirm_token']}"
            
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

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == '--reminder':
        send_reminder_notifications()
    else:
        send_weekly_notifications()
