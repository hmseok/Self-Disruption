import MarketPricesManager from './MarketPricesManager'

export const dynamic = 'force-dynamic'

export default function AdminMarketPricesPage() {
  return (
    <div className="max-w-6xl mx-auto py-4">
      <MarketPricesManager />
    </div>
  )
}
