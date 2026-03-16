'use client'

import { useState, useMemo } from 'react'

type Props = {
  operations: any[]
  schedules: any[]
  cars: any[]
  getCar: (id: any) => any
  getCustomer: (id: any) => any
  onOperationClick: (op: any) => void
}

export default function CalendarView({ operations, schedules, cars, getCar, getCustomer, onOperationClick }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewType, setViewType] = useState<'month' | 'week'>('month')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // ============================================
  // Calendar Data Generation
  // ============================================
  const calendarDays = useMemo(() => {
    // 로컬 날짜를 YYYY-MM-DD 형식으로 변환 (UTC 변환 없이)
    const toLocalDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    if (viewType === 'month') {
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      const startOffset = firstDay.getDay()
      const days: { date: string; inMonth: boolean; isToday: boolean }[] = []
      const today = toLocalDateStr(new Date())

      // Previous month filler
      for (let i = startOffset - 1; i >= 0; i--) {
        const d = new Date(year, month, -i)
        days.push({ date: toLocalDateStr(d), inMonth: false, isToday: false })
      }
      // Current month
      for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        days.push({ date: dateStr, inMonth: true, isToday: dateStr === today })
      }
      // Next month filler (to complete 6 rows)
      while (days.length < 42) {
        const d = new Date(year, month + 1, days.length - startOffset - lastDay.getDate() + 1)
        days.push({ date: toLocalDateStr(d), inMonth: false, isToday: false })
      }
      return days
    } else {
      // Week view
      const today = toLocalDateStr(new Date())
      const startOfWeek = new Date(currentDate)
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      const days: { date: string; inMonth: boolean; isToday: boolean }[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek)
        d.setDate(d.getDate() + i)
        days.push({ date: toLocalDateStr(d), inMonth: true, isToday: toLocalDateStr(d) === today })
      }
      return days
    }
  }, [year, month, viewType, currentDate])

  // Map operations and schedules to dates
  const dateEvents = useMemo(() => {
    const map: Record<string, { deliveries: number; returns: number; schedules: any[]; operations: any[] }> = {}

    operations.forEach(op => {
      if (op.status === 'cancelled') return
      const date = op.scheduled_date
      if (!map[date]) map[date] = { deliveries: 0, returns: 0, schedules: [], operations: [] }
      map[date].operations.push(op)
      if (op.operation_type === 'delivery') map[date].deliveries++
      else map[date].returns++
    })

    schedules.forEach(sched => {
      const start = new Date(sched.start_date)
      const end = new Date(sched.end_date)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0]
        if (!map[dateStr]) map[dateStr] = { deliveries: 0, returns: 0, schedules: [], operations: [] }
        map[dateStr].schedules.push(sched)
      }
    })

    return map
  }, [operations, schedules])

  // Selected date details
  const selectedDetails = useMemo(() => {
    if (!selectedDate) return null
    return dateEvents[selectedDate] || { deliveries: 0, returns: 0, schedules: [], operations: [] }
  }, [selectedDate, dateEvents])

  // ============================================
  // Navigation
  // ============================================
  const navigate = (dir: 'prev' | 'next' | 'today') => {
    if (dir === 'today') {
      setCurrentDate(new Date())
    } else if (viewType === 'month') {
      const d = new Date(currentDate)
      d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1))
      setCurrentDate(d)
    } else {
      const d = new Date(currentDate)
      d.setDate(d.getDate() + (dir === 'next' ? 7 : -7))
      setCurrentDate(d)
    }
  }

  // ============================================
  // Render
  // ============================================
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('prev')} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold hover:bg-gray-50">←</button>
            <button onClick={() => navigate('today')} className="px-3 py-1.5 bg-steel-600 text-white rounded-lg text-sm font-bold hover:bg-steel-700">오늘</button>
            <button onClick={() => navigate('next')} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold hover:bg-gray-50">→</button>
            <h2 className="text-lg font-black text-gray-900 ml-2">
              {year}년 {month + 1}월
            </h2>
          </div>
          <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
            <button onClick={() => setViewType('month')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold ${viewType === 'month' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              월간
            </button>
            <button onClick={() => setViewType('week')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold ${viewType === 'week' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              주간
            </button>
          </div>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
            <div key={day} className={`p-2 text-center text-xs font-bold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500'}`}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className={`grid grid-cols-7 ${viewType === 'week' ? '' : ''}`}>
          {calendarDays.map((day, idx) => {
            const events = dateEvents[day.date]
            const hasDelivery = events && events.deliveries > 0
            const hasReturn = events && events.returns > 0
            const hasSchedule = events && events.schedules.length > 0
            const isSelected = selectedDate === day.date
            const dayNum = new Date(day.date).getDate()
            const dayOfWeek = new Date(day.date).getDay()

            return (
              <div
                key={day.date}
                onClick={() => setSelectedDate(isSelected ? null : day.date)}
                className={`
                  border-b border-r border-gray-100 cursor-pointer transition-colors
                  ${viewType === 'week' ? 'min-h-[120px]' : 'min-h-[80px] md:min-h-[90px]'}
                  ${!day.inMonth ? 'bg-gray-50/50' : ''}
                  ${day.isToday ? 'bg-blue-50/50' : ''}
                  ${isSelected ? 'bg-steel-50 ring-2 ring-steel-400 ring-inset' : 'hover:bg-gray-50'}
                `}
              >
                <div className="p-1.5">
                  <span className={`text-xs font-bold inline-block w-6 h-6 leading-6 text-center rounded-full
                    ${day.isToday ? 'bg-steel-600 text-white' : ''}
                    ${!day.inMonth ? 'text-gray-300' : dayOfWeek === 0 ? 'text-red-400' : dayOfWeek === 6 ? 'text-blue-400' : 'text-gray-700'}
                  `}>
                    {dayNum}
                  </span>

                  {/* Event indicators */}
                  <div className="mt-0.5 space-y-0.5">
                    {hasDelivery && (
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></span>
                        <span className="text-[10px] text-blue-600 font-bold truncate">출고 {events!.deliveries}</span>
                      </div>
                    )}
                    {hasReturn && (
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
                        <span className="text-[10px] text-amber-600 font-bold truncate">반납 {events!.returns}</span>
                      </div>
                    )}
                    {hasSchedule && !hasDelivery && !hasReturn && (
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0"></span>
                        <span className="text-[10px] text-purple-600 font-bold truncate">스케줄 {events!.schedules.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected Date Detail Panel */}
      {selectedDate && selectedDetails && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">
              {new Date(selectedDate).getMonth() + 1}월 {new Date(selectedDate).getDate()}일 배차 현황
            </h3>
            <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">×</button>
          </div>

          {selectedDetails.operations.length === 0 && selectedDetails.schedules.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">이 날짜에 등록된 배차가 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Operations */}
              {selectedDetails.operations.map((op: any) => {
                const car = getCar(op.car_id)
                const cust = getCustomer(op.customer_id)
                return (
                  <div key={op.id} className="p-4 hover:bg-gray-50 cursor-pointer" onClick={() => onOperationClick(op)}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${op.operation_type === 'delivery' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {op.operation_type === 'delivery' ? '출고' : '반납'}
                        </span>
                        <span className="text-sm font-bold text-gray-800">{op.scheduled_time}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        op.status === 'completed' ? 'bg-green-100 text-green-700' :
                        op.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {op.status === 'scheduled' ? '예정' : op.status === 'completed' ? '완료' : op.status === 'cancelled' ? '취소' : '진행중'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-bold">{car?.number || '-'}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      {car?.brand} {car?.model}
                      {cust && <><span className="text-gray-400 mx-1">·</span>{cust.name}</>}
                    </div>
                    {op.location && <div className="text-xs text-gray-400 mt-0.5">{op.location}</div>}
                  </div>
                )
              })}

              {/* Schedules without operations */}
              {selectedDetails.schedules
                .filter((s: any) => !selectedDetails.operations.some((op: any) => op.contract_id === s.contract_id && op.scheduled_date === selectedDate))
                .slice(0, 10)
                .map((sched: any) => {
                  const car = getCar(sched.car_id)
                  return (
                    <div key={sched.id} className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sched.color || '#6b7280' }}></span>
                        <span className="text-sm font-bold text-gray-800">{sched.title || sched.schedule_type}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {car?.number || '-'} · {car?.brand} {car?.model}
                        <span className="text-gray-400 ml-2">{sched.start_date} ~ {sched.end_date}</span>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
