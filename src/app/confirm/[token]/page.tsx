'use client'

import { useEffect, useState } from 'react'
import { supabase, Customer, Draft } from '@/lib/supabase'

interface PageProps {
  params: Promise<{ token: string }>
}

export default function ConfirmPage({ params }: PageProps) {
  const [token, setToken] = useState<string>('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null)
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null)
  const [memo, setMemo] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then(p => setToken(p.token))
  }, [params])

  useEffect(() => {
    if (!token) return
    
    async function fetchData() {
      try {
        // 토큰으로 고객 찾기
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('*')
          .eq('confirm_token', token)
          .single()

        if (customerError || !customerData) {
          setError('유효하지 않은 링크입니다.')
          setLoading(false)
          return
        }

        setCustomer(customerData)

        // 이번 주 원고 가져오기
        const { data: draftsData, error: draftsError } = await supabase
          .from('drafts')
          .select('*')
          .eq('customer_id', customerData.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })

        if (draftsError) {
          setError('원고를 불러오는 데 실패했습니다.')
          setLoading(false)
          return
        }

        // 이미 컨펌된 건이 있는지 확인
        const { data: confirmData } = await supabase
          .from('confirmations')
          .select('*')
          .eq('customer_id', customerData.id)
          .order('confirmed_at', { ascending: false })
          .limit(1)

        if (confirmData && confirmData.length > 0) {
          const lastConfirm = new Date(confirmData[0].confirmed_at)
          const now = new Date()
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          
          if (lastConfirm > weekAgo) {
            setSubmitted(true)
          }
        }

        setDrafts(draftsData || [])
        setLoading(false)
      } catch (err) {
        setError('오류가 발생했습니다.')
        setLoading(false)
      }
    }

    fetchData()
  }, [token])

  const handleSubmit = async () => {
    if (!selectedDraft || !customer) return

    setSubmitting(true)

    try {
      const { error: confirmError } = await supabase
        .from('confirmations')
        .insert({
          customer_id: customer.id,
          draft_id: selectedDraft,
          week_of: new Date().toISOString().split('T')[0],
          memo: memo || null
        })

      if (confirmError) throw confirmError

      await supabase
        .from('drafts')
        .update({ status: 'selected' })
        .eq('id', selectedDraft)

      await supabase
        .from('drafts')
        .update({ status: 'rejected' })
        .eq('customer_id', customer.id)
        .eq('status', 'pending')
        .neq('id', selectedDraft)

      setSubmitted(true)
    } catch (err) {
      setError('저장 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // 마크다운 스타일 텍스트를 HTML로 변환
  const formatContent = (content: string) => {
    return content
      .split('\n')
      .map((line, i) => {
        // ### 헤더 처리
        if (line.startsWith('### ')) {
          return <h3 key={i} className="text-lg font-bold mt-4 mb-2">{line.replace('### ', '')}</h3>
        }
        // ## 헤더 처리
        if (line.startsWith('## ')) {
          return <h2 key={i} className="text-xl font-bold mt-4 mb-2">{line.replace('## ', '')}</h2>
        }
        // 빈 줄
        if (line.trim() === '') {
          return <br key={i} />
        }
        // 일반 텍스트
        return <p key={i} className="mb-2">{line}</p>
      })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">컨펌 완료!</h1>
          <p className="text-gray-600">
            선택하신 원고로 블로그 포스팅이 진행됩니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">
            {customer?.name}님, 안녕하세요!
          </h1>
          <p className="text-gray-600">
            이번 주 블로그 원고를 확인해주세요. 마음에 드는 원고 하나를 선택하시면 됩니다.
          </p>
        </div>

        {/* 원고 리스트 */}
        <div className="space-y-4 mb-6">
          {drafts.map((draft, index) => {
            const isExpanded = expandedDraft === draft.id
            const isSelected = selectedDraft === draft.id
            
            return (
              <div
                key={draft.id}
                className={`bg-white rounded-2xl shadow-lg overflow-hidden transition-all ${
                  isSelected ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                {/* 헤더 영역 - 클릭하면 선택 */}
                <div
                  onClick={() => setSelectedDraft(draft.id)}
                  className={`p-6 cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-blue-600 font-medium mb-1">
                        원고 {index + 1}
                      </div>
                      <h2 className="text-lg font-bold text-gray-800">
                        {draft.title}
                      </h2>
                    </div>
                  </div>
                </div>

                {/* 미리보기 / 전체보기 토글 */}
                <div className="px-6 pb-4">
                  <div className={`text-gray-600 text-sm leading-relaxed ${!isExpanded ? 'line-clamp-3' : ''}`}>
                    {isExpanded ? (
                      <div className="prose prose-sm max-w-none">
                        {formatContent(draft.content)}
                      </div>
                    ) : (
                      <p>{draft.content.slice(0, 150)}...</p>
                    )}
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpandedDraft(isExpanded ? null : draft.id)
                    }}
                    className="mt-3 text-blue-500 text-sm font-medium hover:text-blue-600"
                  >
                    {isExpanded ? '접기 ▲' : '전체 보기 ▼'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* 메모 입력 */}
        {selectedDraft && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              수정 요청사항 (선택)
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="수정이 필요한 부분이 있다면 적어주세요..."
              className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
            />
          </div>
        )}

        {/* 제출 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={!selectedDraft || submitting}
          className={`w-full py-4 rounded-2xl font-bold text-lg transition-all ${
            selectedDraft && !submitting
              ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {submitting ? '처리 중...' : '이 원고로 결정하기'}
        </button>

        {/* 안내 문구 */}
        <p className="text-center text-gray-400 text-sm mt-4">
          선택하지 않으시면 3일 후 첫 번째 원고로 자동 확정됩니다.
        </p>
      </div>
    </div>
  )
}
