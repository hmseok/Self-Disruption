'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase'

export default function CarRegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // 입력 폼 데이터 (DB 컬럼과 1:1 매칭)
  const [formData, setFormData] = useState({
    number: '',
    brand: '현대',
    model: '',
    trim: '',
    year: new Date().getFullYear(),
    fuel: '가솔린',
    purchase_price: 0,
    acq_date: new Date().toISOString().split('T')[0], // 오늘 날짜 기본
    location: '본사 차고지',
    status: 'available'
  })

  // 입력값 변경 핸들러
  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // 숫자 변환 헬퍼 (콤마 제거)
  const p = (v: string) => Number(v.replace(/,/g, ''))
  // 숫자 포맷 헬퍼 (콤마 추가)
  const f = (n: number) => n.toLocaleString()

  // 저장 버튼 클릭 시 실행
  const handleSubmit = async () => {
    // 1. 유효성 검사
    if (!formData.number) return alert('차량번호는 필수입니다!')
    if (!formData.model) return alert('모델명을 입력해주세요!')

    setLoading(true)

    // 2. Supabase DB에 저장
    const { error } = await supabase.from('cars').insert([
      {
        number: formData.number,
        brand: formData.brand,
        model: formData.model,
        trim: formData.trim,
        year: formData.year,
        fuel: formData.fuel,
        purchase_price: formData.purchase_price,
        acq_date: formData.acq_date,
        location: formData.location,
        status: formData.status
      }
    ])

    setLoading(false)

    // 3. 결과 처리
    if (error) {
      alert('❌ 등록 실패: ' + error.message)
      console.error(error)
    } else {
      alert('✅ 차량이 성공적으로 등록되었습니다!')
      router.push('/') // 메인(목록)으로 이동
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold mb-8 text-gray-900">🚙 신규 차량 등록</h1>

      <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 space-y-6">

        {/* 섹션 1: 기본 정보 */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-700 border-b pb-2">1. 차량 기본 정보</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">브랜드</label>
              <select
                className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.brand}
                onChange={e => handleChange('brand', e.target.value)}
              >
                <option>현대</option><option>기아</option><option>제네시스</option>
                <option>KG모빌리티</option><option>쉐보레</option><option>르노코리아</option>
                <option>BMW</option><option>벤츠</option><option>아우디</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">모델명</label>
              <input
                type="text"
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="예: 그랜저, 카니발"
                value={formData.model}
                onChange={e => handleChange('model', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-blue-600 mb-1">차량번호 (필수)</label>
              <input
                type="text"
                className="w-full p-3 border-2 border-blue-100 rounded-lg font-bold focus:border-blue-500 outline-none"
                placeholder="123가 4567"
                value={formData.number}
                onChange={e => handleChange('number', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">세부등급 (트림)</label>
              <input
                type="text"
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="예: 익스클루시브"
                value={formData.trim}
                onChange={e => handleChange('trim', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* 섹션 2: 제원 및 가격 */}
        <div className="space-y-4 pt-4">
          <h2 className="text-lg font-bold text-gray-700 border-b pb-2">2. 제원 및 가격</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">연식</label>
              <input
                type="number"
                className="w-full p-3 border rounded-lg text-center"
                value={formData.year}
                onChange={e => handleChange('year', Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">연료</label>
              <select
                className="w-full p-3 border rounded-lg bg-gray-50"
                value={formData.fuel}
                onChange={e => handleChange('fuel', e.target.value)}
              >
                <option>가솔린</option><option>디젤</option><option>LPG</option>
                <option>하이브리드</option><option>전기(EV)</option>
              </select>
            </div>
             <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">취득일자</label>
              <input
                type="date"
                className="w-full p-3 border rounded-lg text-center"
                value={formData.acq_date}
                onChange={e => handleChange('acq_date', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">차량 취득가액 (원)</label>
            <input
              type="text"
              className="w-full p-4 border rounded-lg text-right font-bold text-xl tracking-wide focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="0"
              value={f(formData.purchase_price)}
              onChange={e => handleChange('purchase_price', p(e.target.value))}
            />
          </div>
        </div>

        {/* 버튼 영역 */}
        <div className="pt-6 flex gap-3">
          <button
            onClick={() => router.back()}
            className="flex-1 py-4 border border-gray-300 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-[2] py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg disabled:bg-gray-400"
          >
            {loading ? '저장 중...' : '✅ 차량 등록 완료'}
          </button>
        </div>

      </div>
    </div>
  )
}