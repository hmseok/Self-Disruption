'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs' // 점 2개
import { useRouter } from 'next/navigation'

export default function RegistrationListPage() {
  const router = useRouter()
  const [cars, setCars] = useState<any[]>([])

  // 📝 신규 등록 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newCar, setNewCar] = useState({
    number: '',
    brand: '',
    model: '',
    year: new Date().getFullYear() // 기본값: 올해
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchList()
  }, [])

  const fetchList = async () => {
    // 최근 등록된 순서대로 조회
    const { data } = await supabase.from('cars').select('*').order('created_at', { ascending: false })
    setCars(data || [])
  }

  // ✨ 신규 차량 DB 생성 (Insert)
  const handleRegister = async () => {
    if (!newCar.number || !newCar.model) return alert('차량번호와 차종은 필수입니다.')

    setCreating(true)

    // 1. 중복 확인
    const { data: exist } = await supabase.from('cars').select('id').eq('number', newCar.number).single()
    if (exist) {
        alert('이미 등록된 차량번호입니다.')
        setCreating(false)
        return
    }

    // 2. DB에 추가 (status 기본값: available)
    const { data, error } = await supabase.from('cars').insert([{
        number: newCar.number,
        brand: newCar.brand,
        model: newCar.model,
        year: newCar.year,
        status: 'available' // 기본 상태: 대기중
    }]).select().single()

    if (error) {
        alert('등록 실패: ' + error.message)
    } else {
        alert('✅ 신규 차량이 등록되었습니다. 상세 정보를 입력해주세요.')
        router.push(`/registration/${data.id}`) // 상세 페이지로 이동
    }
    setCreating(false)
  }

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black">📄 차량 등록증 및 제원</h1>
        <button onClick={() => setIsModalOpen(true)} className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 shadow-lg transition-transform hover:-translate-y-1">
            + 신규 차량 등록
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-bold border-b">
            <tr>
              <th className="p-4">차량번호</th>
              <th className="p-4">브랜드</th>
              <th className="p-4">모델명</th>
              <th className="p-4">연식</th>
              <th className="p-4">소유자</th>
              <th className="p-4 text-center">등록증 파일</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cars.map((car) => (
              <tr key={car.id} onClick={() => router.push(`/registration/${car.id}`)} className="hover:bg-gray-50 cursor-pointer">
                <td className="p-4 font-bold text-lg">{car.number}</td>
                <td className="p-4 text-gray-500">{car.brand}</td>
                <td className="p-4 font-bold">{car.model}</td>
                <td className="p-4 text-gray-500">{car.year}년식</td>
                <td className="p-4">{car.owner_name || '-'}</td>
                <td className="p-4 text-center">
                  {car.registration_image_url ? '✅' : <span className="text-gray-300">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ✨ 신규 등록 모달 (검색 아님, 입력창임) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-2xl font-black">🚙 신규 차량 등록</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-2xl font-bold text-gray-400 hover:text-black">×</button>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">차량 번호 (필수)</label>
                <input autoFocus className="w-full p-3 border-2 border-gray-200 rounded-xl font-bold text-lg focus:border-black outline-none"
                    placeholder="예: 123가 4567"
                    value={newCar.number}
                    onChange={e => setNewCar({...newCar, number: e.target.value})}
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">브랜드</label>
                    <input className="w-full p-3 border rounded-xl bg-gray-50 font-bold outline-none"
                        placeholder="예: 현대"
                        value={newCar.brand}
                        onChange={e => setNewCar({...newCar, brand: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">모델명 (필수)</label>
                    <input className="w-full p-3 border rounded-xl bg-gray-50 font-bold outline-none"
                        placeholder="예: 아반떼"
                        value={newCar.model}
                        onChange={e => setNewCar({...newCar, model: e.target.value})}
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">연식</label>
                <input type="number" className="w-full p-3 border rounded-xl bg-gray-50 font-bold outline-none"
                    value={newCar.year}
                    onChange={e => setNewCar({...newCar, year: Number(e.target.value)})}
                />
            </div>

            <button
                onClick={handleRegister}
                disabled={creating}
                className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-800 mt-4 shadow-lg"
            >
                {creating ? '등록 중...' : '등록하고 상세정보 입력 →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}