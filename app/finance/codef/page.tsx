'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../utils/supabase'
import DarkHeader from '../../components/DarkHeader'

interface Connection {
  id: string
  connected_id: string
  org_type: 'bank' | 'card'
  org_code: string
  org_name: string
  account_number: string | null
  is_active: boolean
  created_at: string
}

interface SyncLog {
  id: string
  sync_type: string
  org_name: string | null
  fetched: number
  inserted: number
  status: string
  error_message: string | null
  synced_at: string
}

export default function CodefPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    action: 'create',
    orgCode: '0020',
    loginType: '0',      // '0' = 공동인증서, '1' = ID/비밀번호
    loginId: '',
    accountNumber: '',
    password: '',
    certPassword: '',
    connectedId: '',
  })
  const [certFile, setCertFile] = useState<string>('')     // signCert.der → base64
  const [keyFile, setKeyFile] = useState<string>('')       // signPri.key → base64

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  })

  // Load connections and logs
  useEffect(() => {
    fetchConnections()
    fetchLogs()
  }, [])

  const fetchConnections = async () => {
    try {
      const { data, error } = await supabase.from('codef_connections').select('*').eq('is_active', true)

      if (error) throw error
      setConnections(data || [])
    } catch (error) {
      console.error('Failed to fetch connections:', error)
      setMessage({ type: 'error', text: '연동 계정을 불러오는데 실패했습니다.' })
    }
  }

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('codef_sync_logs')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setLogs(data || [])
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    } finally {
      setLoading(false)
    }
  }

  // 파일을 base64 문자열로 읽기
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // data:...;base64, 접두사 제거
        const base64 = result.split(',')[1] || result
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleCertFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'cert' | 'key') => {
    const file = e.target.files?.[0]
    if (!file) return
    const base64 = await readFileAsBase64(file)
    if (type === 'cert') setCertFile(base64)
    else setKeyFile(base64)
  }

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const isCert = form.loginType === '0'

    if (isCert) {
      if (!form.orgCode || !certFile || !keyFile || !form.certPassword || !form.accountNumber) {
        setMessage({ type: 'error', text: '기관, 인증서 파일(2개), 인증서 비밀번호, 계좌/카드번호를 모두 입력해주세요.' })
        return
      }
    } else {
      if (!form.orgCode || !form.loginId || !form.accountNumber || !form.password) {
        setMessage({ type: 'error', text: '모든 필드를 입력해주세요.' })
        return
      }
    }

    try {
      const res = await fetch('/api/codef/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: form.action === 'create' ? 'create' : 'add',
          orgCode: form.orgCode,
          loginType: form.loginType,
          // 인증서 방식
          certFile: isCert ? certFile : undefined,
          keyFile: isCert ? keyFile : undefined,
          certPassword: isCert ? form.certPassword : undefined,
          // ID/비밀번호 방식
          loginId: !isCert ? form.loginId : undefined,
          password: !isCert ? form.password : undefined,
          // 공통
          accountNumber: form.accountNumber,
          connectedId: form.action === 'add' ? form.connectedId : undefined,
        }),
      })

      const result = await res.json()

      if (result.success) {
        setMessage({ type: 'success', text: result.message })
        setForm({ action: 'create', orgCode: '0020', loginType: '0', loginId: '', accountNumber: '', password: '', certPassword: '', connectedId: '' })
        setCertFile('')
        setKeyFile('')
        setShowForm(false)
        await fetchConnections()
      } else {
        setMessage({ type: 'error', text: result.error || '연동에 실패했습니다.' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '오류가 발생했습니다.' })
    }
  }

  const handleRemoveConnection = async (id: string) => {
    if (!confirm('이 계정을 해제하시겠습니까?')) return

    try {
      const res = await fetch('/api/codef/connect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      const result = await res.json()

      if (result.success) {
        setMessage({ type: 'success', text: result.message })
        await fetchConnections()
      } else {
        setMessage({ type: 'error', text: result.error || '해제에 실패했습니다.' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '오류가 발생했습니다.' })
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setMessage(null)

    try {
      const res = await fetch('/api/codef/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
      })

      const result = await res.json()

      if (result.success) {
        const { banks, cards, errors } = result.summary
        let message = `동기화 완료\n\n은행 거래: ${banks.fetched}건 조회, ${banks.inserted}건 저장\n카드 승인: ${cards.fetched}건 조회, ${cards.inserted}건 저장`

        if (errors.length > 0) {
          message += `\n\n오류:\n${errors.join('\n')}`
        }

        setMessage({ type: errors.length > 0 ? 'error' : 'success', text: message })
        await fetchLogs()
      } else {
        setMessage({ type: 'error', text: result.error || '동기화에 실패했습니다.' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '오류가 발생했습니다.' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <DarkHeader icon="Building2" title="은행/카드 자동연동" subtitle="Codef API로 거래내역을 자동 수집합니다" />

      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">Codef 금융 데이터 연동</h1>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-900 border border-green-700 text-green-200'
                : 'bg-red-900 border border-red-700 text-red-200'
            }`}
          >
            {message.text.split('\n').map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        )}

        {/* Add Connection Form */}
        {showForm && (
          <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-6">계정 연동 추가</h2>

            <form onSubmit={handleAddConnection} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">연동 유형</label>
                <select
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="create">새로운 연동 생성</option>
                  <option value="add">기존 연동에 추가</option>
                </select>
              </div>

              {form.action === 'add' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">기존 연동 ID</label>
                  <select
                    value={form.connectedId}
                    onChange={(e) => setForm({ ...form, connectedId: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  >
                    <option value="">선택...</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.connected_id}>
                        {c.org_name} ({c.account_number})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">기관</label>
                <select
                  value={form.orgCode}
                  onChange={(e) => setForm({ ...form, orgCode: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <optgroup label="은행">
                    <option value="0020">우리은행</option>
                    <option value="0004">국민은행</option>
                  </optgroup>
                  <optgroup label="카드">
                    <option value="0019">우리카드</option>
                    <option value="0381">국민카드</option>
                    <option value="0041">현대카드</option>
                  </optgroup>
                </select>
              </div>

              {/* 로그인 방식 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">로그인 방식</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, loginType: '0' })}
                    className={`flex-1 py-2 px-4 rounded font-medium text-sm border ${
                      form.loginType === '0'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    🔐 공동인증서
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, loginType: '1' })}
                    className={`flex-1 py-2 px-4 rounded font-medium text-sm border ${
                      form.loginType === '1'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    🔑 ID/비밀번호
                  </button>
                </div>
              </div>

              {/* 공동인증서 방식 */}
              {form.loginType === '0' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">인증서 파일 (signCert.der)</label>
                    <p className="text-xs text-gray-500 mb-2">NPKI 폴더 안의 signCert.der 파일을 선택하세요</p>
                    <input
                      type="file"
                      accept=".der"
                      onChange={(e) => handleCertFileChange(e, 'cert')}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white"
                    />
                    {certFile && <p className="text-xs text-green-400 mt-1">✓ 인증서 파일 로드됨</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">개인키 파일 (signPri.key)</label>
                    <p className="text-xs text-gray-500 mb-2">NPKI 폴더 안의 signPri.key 파일을 선택하세요</p>
                    <input
                      type="file"
                      accept=".key"
                      onChange={(e) => handleCertFileChange(e, 'key')}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white"
                    />
                    {keyFile && <p className="text-xs text-green-400 mt-1">✓ 개인키 파일 로드됨</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">인증서 비밀번호</label>
                    <input
                      type="password"
                      value={form.certPassword}
                      onChange={(e) => setForm({ ...form, certPassword: e.target.value })}
                      placeholder="공동인증서 비밀번호 (암호화되어 전송됩니다)"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                    />
                  </div>
                </>
              )}

              {/* ID/비밀번호 방식 */}
              {form.loginType === '1' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">인터넷뱅킹 아이디</label>
                    <input
                      type="text"
                      value={form.loginId}
                      onChange={(e) => setForm({ ...form, loginId: e.target.value })}
                      placeholder="인터넷뱅킹 로그인 아이디"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">인터넷뱅킹 비밀번호</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="인터넷뱅킹 로그인 비밀번호 (암호화되어 전송됩니다)"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">계좌/카드번호</label>
                <input
                  type="text"
                  value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  placeholder="계좌번호 또는 카드번호"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                  연동하기
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Connected Accounts */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">연동된 계정</h2>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              {showForm ? '접기' : '계정 추가'}
            </button>
          </div>

          {connections.length === 0 ? (
            <p className="text-gray-400">연동된 계정이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">기관명</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">유형</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">계좌/카드번호</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">연동일</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">상태</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((conn) => (
                    <tr key={conn.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                      <td className="py-3 px-4 text-white font-medium">{conn.org_name}</td>
                      <td className="py-3 px-4 text-gray-300">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            conn.org_type === 'bank'
                              ? 'bg-blue-900 text-blue-200'
                              : 'bg-purple-900 text-purple-200'
                          }`}
                        >
                          {conn.org_type === 'bank' ? '은행' : '카드'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-300">{conn.account_number || '—'}</td>
                      <td className="py-3 px-4 text-gray-400">
                        {new Date(conn.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-green-900 text-green-200">
                          활성
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleRemoveConnection(conn.id)}
                          className="text-red-400 hover:text-red-300 font-medium"
                        >
                          해제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sync Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-6">거래 동기화</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">시작일</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">종료일</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing || connections.length === 0}
            className={`w-full py-3 px-4 rounded font-bold text-white ${
              syncing || connections.length === 0
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {syncing ? '동기화 중...' : '지금 동기화'}
          </button>
        </div>

        {/* Sync Logs */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-6">동기화 기록</h2>

          {logs.length === 0 ? (
            <p className="text-gray-400">동기화 기록이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="border border-gray-700 rounded p-4 bg-gray-700/30">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-white font-semibold">
                        {log.sync_type === 'bank' ? '은행' : log.sync_type === 'card' ? '카드' : '전체'} 동기화
                        {log.org_name && ` - ${log.org_name}`}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {new Date(log.synced_at).toLocaleString('ko-KR')}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        log.status === 'success'
                          ? 'bg-green-900 text-green-200'
                          : 'bg-red-900 text-red-200'
                      }`}
                    >
                      {log.status === 'success' ? '성공' : '실패'}
                    </span>
                  </div>

                  <div className="flex gap-6 text-sm text-gray-300">
                    <span>조회: {log.fetched}건</span>
                    <span>저장: {log.inserted}건</span>
                  </div>

                  {log.error_message && (
                    <p className="mt-2 text-sm text-red-400">{log.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
