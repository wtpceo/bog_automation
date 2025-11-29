'use client'

import { useEffect, useState } from 'react'
import { supabase, Customer, Draft } from '@/lib/supabase'

interface CustomerWithDrafts extends Customer {
  drafts: Draft[]
  confirmations: { id: string; week_of: string; confirmed_at: string }[]
}

export default function AdminPage() {
  const [customers, setCustomers] = useState<CustomerWithDrafts[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'customers' | 'add'>('dashboard')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithDrafts | null>(null)

  useEffect(() => {
    fetchCustomers()
  }, [])

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*, drafts(*), confirmations(*)')
      .order('created_at', { ascending: false })

    if (data) {
      setCustomers(data)
    }
    setLoading(false)
  }

  // 이번 주 시작일
  const getWeekStart = () => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(today.setDate(diff)).toISOString().split('T')[0]
  }

  const weekStart = getWeekStart()

  // 통계 계산
  const stats = {
    total: customers.length,
    active: customers.filter(c => c.is_active).length,
    confirmedThisWeek: customers.filter(c => 
      c.confirmations?.some(conf => conf.week_of >= weekStart)
    ).length,
    pendingThisWeek: customers.filter(c => 
      c.drafts?.some(d => d.status === 'pending' && d.week_of >= weekStart)
    ).length
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 헤더 */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">블로그 자동화 관리자</h1>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'dashboard' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            대시보드
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'customers' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            고객 관리
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'add' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            고객 추가
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && (
          <DashboardView stats={stats} customers={customers} weekStart={weekStart} />
        )}
        {activeTab === 'customers' && (
          <CustomersView 
            customers={customers} 
            onSelect={setSelectedCustomer}
            onRefresh={fetchCustomers}
          />
        )}
        {activeTab === 'add' && (
          <AddCustomerView onSuccess={() => {
            fetchCustomers()
            setActiveTab('customers')
          }} />
        )}
      </main>

      {/* 고객 상세 모달 */}
      {selectedCustomer && (
        <CustomerDetailModal 
          customer={selectedCustomer} 
          onClose={() => setSelectedCustomer(null)}
          onUpdate={fetchCustomers}
        />
      )}
    </div>
  )
}

// 대시보드 뷰
function DashboardView({ stats, customers, weekStart }: { 
  stats: { total: number; active: number; confirmedThisWeek: number; pendingThisWeek: number }
  customers: CustomerWithDrafts[]
  weekStart: string 
}) {
  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow">
          <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-gray-500">전체 고객</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow">
          <div className="text-3xl font-bold text-green-600">{stats.active}</div>
          <div className="text-gray-500">활성 고객</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow">
          <div className="text-3xl font-bold text-blue-600">{stats.confirmedThisWeek}</div>
          <div className="text-gray-500">이번 주 컨펌 완료</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow">
          <div className="text-3xl font-bold text-orange-500">{stats.pendingThisWeek}</div>
          <div className="text-gray-500">컨펌 대기중</div>
        </div>
      </div>

      {/* 이번 주 컨펌 현황 */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-bold">이번 주 컨펌 현황</h2>
        </div>
        <div className="divide-y">
          {customers.filter(c => c.is_active).map(customer => {
            const thisWeekDrafts = customer.drafts?.filter(d => d.week_of >= weekStart) || []
            const thisWeekConfirm = customer.confirmations?.find(c => c.week_of >= weekStart)
            const selectedDraft = thisWeekDrafts.find(d => d.status === 'selected')
            
            let status = 'pending'
            let statusText = '대기중'
            let statusColor = 'bg-yellow-100 text-yellow-800'
            
            if (thisWeekConfirm || selectedDraft) {
              status = 'confirmed'
              statusText = '컨펌 완료'
              statusColor = 'bg-green-100 text-green-800'
            } else if (thisWeekDrafts.length === 0) {
              status = 'no_draft'
              statusText = '원고 없음'
              statusColor = 'bg-gray-100 text-gray-800'
            }

            return (
              <div key={customer.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{customer.name}</div>
                  <div className="text-sm text-gray-500">{customer.business_type}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-sm ${statusColor}`}>
                    {statusText}
                  </span>
                  {selectedDraft && (
                    <span className="text-sm text-gray-500 max-w-xs truncate">
                      {selectedDraft.title}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// 고객 목록 뷰
function CustomersView({ customers, onSelect, onRefresh }: { 
  customers: CustomerWithDrafts[]
  onSelect: (customer: CustomerWithDrafts) => void
  onRefresh: () => void
}) {
  const toggleActive = async (customer: CustomerWithDrafts) => {
    await supabase
      .from('customers')
      .update({ is_active: !customer.is_active })
      .eq('id', customer.id)
    onRefresh()
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">업체명</th>
            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">업종</th>
            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">연락처</th>
            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">상태</th>
            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">원고 수</th>
            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">액션</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {customers.map(customer => (
            <tr key={customer.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 font-medium">{customer.name}</td>
              <td className="px-6 py-4 text-gray-500">{customer.business_type}</td>
              <td className="px-6 py-4 text-gray-500">{customer.phone}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded text-sm ${
                  customer.is_active 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {customer.is_active ? '활성' : '비활성'}
                </span>
              </td>
              <td className="px-6 py-4 text-gray-500">
                {customer.drafts?.length || 0}개
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => onSelect(customer)}
                    className="text-blue-500 hover:text-blue-700 text-sm"
                  >
                    상세
                  </button>
                  <button
                    onClick={() => toggleActive(customer)}
                    className="text-gray-500 hover:text-gray-700 text-sm"
                  >
                    {customer.is_active ? '비활성화' : '활성화'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 고객 추가 뷰
function AddCustomerView({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    business_type: '',
    keywords: '',
    tone: '친근',
    specialty: '',
    target_audience: '',
    brand_concept: '',
    main_services: '',
    price_range: '',
    location_info: '',
    preferred_expressions: '',
    avoided_expressions: ''
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const { error } = await supabase.from('customers').insert({
      name: form.name,
      phone: form.phone,
      business_type: form.business_type,
      keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
      tone: form.tone,
      specialty: form.specialty,
      target_audience: form.target_audience,
      brand_concept: form.brand_concept,
      main_services: form.main_services.split(',').map(k => k.trim()).filter(Boolean),
      price_range: form.price_range,
      location_info: form.location_info,
      preferred_expressions: form.preferred_expressions.split(',').map(k => k.trim()).filter(Boolean),
      avoided_expressions: form.avoided_expressions.split(',').map(k => k.trim()).filter(Boolean),
      is_active: true
    })

    setSaving(false)

    if (!error) {
      alert('고객이 추가되었습니다!')
      onSuccess()
    } else {
      alert('오류가 발생했습니다: ' + error.message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 max-w-2xl">
      <h2 className="text-xl font-bold mb-6">새 고객 추가</h2>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">업체명 *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">연락처 *</label>
            <input
              type="text"
              required
              value={form.phone}
              onChange={e => setForm({...form, phone: e.target.value})}
              placeholder="010-0000-0000"
              className="w-full p-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">업종 *</label>
            <input
              type="text"
              required
              value={form.business_type}
              onChange={e => setForm({...form, business_type: e.target.value})}
              placeholder="예: 음식점, 병원, 미용실"
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">톤앤매너</label>
            <select
              value={form.tone}
              onChange={e => setForm({...form, tone: e.target.value})}
              className="w-full p-2 border rounded-lg"
            >
              <option value="친근">친근</option>
              <option value="전문적">전문적</option>
              <option value="캐주얼">캐주얼</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">타겟 키워드</label>
          <input
            type="text"
            value={form.keywords}
            onChange={e => setForm({...form, keywords: e.target.value})}
            placeholder="쉼표로 구분 (예: 강남피부과, 여드름치료, 리프팅)"
            className="w-full p-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">업체 특장점</label>
          <textarea
            value={form.specialty}
            onChange={e => setForm({...form, specialty: e.target.value})}
            placeholder="예: 15년 경력 전문의, 최신 장비 보유"
            className="w-full p-2 border rounded-lg"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">타겟 고객층</label>
          <input
            type="text"
            value={form.target_audience}
            onChange={e => setForm({...form, target_audience: e.target.value})}
            placeholder="예: 20-40대 직장인 여성"
            className="w-full p-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">브랜드 컨셉</label>
          <input
            type="text"
            value={form.brand_concept}
            onChange={e => setForm({...form, brand_concept: e.target.value})}
            placeholder="예: 친근하고 편안한 동네 피부과"
            className="w-full p-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">대표 서비스/메뉴</label>
          <input
            type="text"
            value={form.main_services}
            onChange={e => setForm({...form, main_services: e.target.value})}
            placeholder="쉼표로 구분 (예: 여드름치료, 리프팅, 보톡스)"
            className="w-full p-2 border rounded-lg"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">가격대</label>
            <input
              type="text"
              value={form.price_range}
              onChange={e => setForm({...form, price_range: e.target.value})}
              placeholder="예: 중저가"
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">위치 정보</label>
            <input
              type="text"
              value={form.location_info}
              onChange={e => setForm({...form, location_info: e.target.value})}
              placeholder="예: 강남역 3번출구 도보 5분"
              className="w-full p-2 border rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">자주 쓸 표현</label>
          <input
            type="text"
            value={form.preferred_expressions}
            onChange={e => setForm({...form, preferred_expressions: e.target.value})}
            placeholder="쉼표로 구분 (예: 부담없이, 편하게, 꼼꼼하게)"
            className="w-full p-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">피할 표현</label>
          <input
            type="text"
            value={form.avoided_expressions}
            onChange={e => setForm({...form, avoided_expressions: e.target.value})}
            placeholder="쉼표로 구분 (예: 완치, 100%, 최저가)"
            className="w-full p-2 border rounded-lg"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="mt-6 w-full py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300"
      >
        {saving ? '저장 중...' : '고객 추가'}
      </button>
    </form>
  )
}

// 고객 상세 모달
function CustomerDetailModal({ customer, onClose, onUpdate }: {
  customer: CustomerWithDrafts
  onClose: () => void
  onUpdate: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone,
    business_type: customer.business_type,
    keywords: customer.keywords?.join(', ') || '',
    tone: customer.tone || '친근',
    specialty: customer.specialty || '',
    target_audience: customer.target_audience || '',
    brand_concept: customer.brand_concept || '',
    main_services: customer.main_services?.join(', ') || '',
    price_range: customer.price_range || '',
    location_info: customer.location_info || '',
    preferred_expressions: customer.preferred_expressions?.join(', ') || '',
    avoided_expressions: customer.avoided_expressions?.join(', ') || ''
  })

  const handleSave = async () => {
    await supabase.from('customers').update({
      name: form.name,
      phone: form.phone,
      business_type: form.business_type,
      keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
      tone: form.tone,
      specialty: form.specialty,
      target_audience: form.target_audience,
      brand_concept: form.brand_concept,
      main_services: form.main_services.split(',').map(k => k.trim()).filter(Boolean),
      price_range: form.price_range,
      location_info: form.location_info,
      preferred_expressions: form.preferred_expressions.split(',').map(k => k.trim()).filter(Boolean),
      avoided_expressions: form.avoided_expressions.split(',').map(k => k.trim()).filter(Boolean)
    }).eq('id', customer.id)

    setEditing(false)
    onUpdate()
  }

  const confirmLink = `https://bog-automation.vercel.app/confirm/${customer.confirm_token}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">{customer.name}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 컨펌 링크 */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-sm text-blue-600 font-medium mb-1">컨펌 링크</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={confirmLink}
                readOnly
                className="flex-1 p-2 bg-white border rounded text-sm"
              />
              <button
                onClick={() => navigator.clipboard.writeText(confirmLink)}
                className="px-3 py-2 bg-blue-500 text-white rounded text-sm"
              >
                복사
              </button>
            </div>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="업체명"
                  className="p-2 border rounded"
                />
                <input
                  value={form.phone}
                  onChange={e => setForm({...form, phone: e.target.value})}
                  placeholder="연락처"
                  className="p-2 border rounded"
                />
              </div>
              <input
                value={form.business_type}
                onChange={e => setForm({...form, business_type: e.target.value})}
                placeholder="업종"
                className="w-full p-2 border rounded"
              />
              <input
                value={form.keywords}
                onChange={e => setForm({...form, keywords: e.target.value})}
                placeholder="키워드 (쉼표 구분)"
                className="w-full p-2 border rounded"
              />
              <textarea
                value={form.specialty}
                onChange={e => setForm({...form, specialty: e.target.value})}
                placeholder="특장점"
                className="w-full p-2 border rounded"
                rows={2}
              />
              <input
                value={form.target_audience}
                onChange={e => setForm({...form, target_audience: e.target.value})}
                placeholder="타겟 고객층"
                className="w-full p-2 border rounded"
              />
              <input
                value={form.brand_concept}
                onChange={e => setForm({...form, brand_concept: e.target.value})}
                placeholder="브랜드 컨셉"
                className="w-full p-2 border rounded"
              />
              <input
                value={form.main_services}
                onChange={e => setForm({...form, main_services: e.target.value})}
                placeholder="대표 서비스 (쉼표 구분)"
                className="w-full p-2 border rounded"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  저장
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 bg-gray-200 rounded"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">업종:</span> {customer.business_type}
                </div>
                <div>
                  <span className="text-gray-500">연락처:</span> {customer.phone}
                </div>
                <div>
                  <span className="text-gray-500">톤:</span> {customer.tone}
                </div>
                <div>
                  <span className="text-gray-500">상태:</span> {customer.is_active ? '활성' : '비활성'}
                </div>
              </div>
              
              {customer.keywords?.length > 0 && (
                <div>
                  <span className="text-gray-500 text-sm">키워드:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {customer.keywords.map((k, i) => (
                      <span key={i} className="px-2 py-1 bg-gray-100 rounded text-sm">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              {customer.specialty && (
                <div className="text-sm">
                  <span className="text-gray-500">특장점:</span> {customer.specialty}
                </div>
              )}

              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 bg-gray-100 rounded text-sm"
              >
                수정하기
              </button>
            </div>
          )}

          {/* 원고 이력 */}
          <div className="border-t pt-4 mt-4">
            <h3 className="font-bold mb-3">원고 이력</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {customer.drafts?.length > 0 ? (
                customer.drafts.map(draft => (
                  <div key={draft.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div className="font-medium text-sm">{draft.title}</div>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        draft.status === 'selected' ? 'bg-green-100 text-green-800' :
                        draft.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {draft.status === 'selected' ? '선택됨' :
                         draft.status === 'pending' ? '대기중' : '미선택'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{draft.week_of}</div>
                  </div>
                ))
              ) : (
                <div className="text-gray-500 text-sm">원고 이력이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
