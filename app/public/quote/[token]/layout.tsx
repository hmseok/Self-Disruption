export const metadata = {
  title: '견적서 확인 및 서명',
  description: '장기렌트 견적서를 확인하고 전자서명으로 계약을 체결하세요.',
}

export default function PublicQuoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-lg mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  )
}
