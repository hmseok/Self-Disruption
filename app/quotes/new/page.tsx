import QuoteCalculator from "./QuoteCalculator"; // 파일명 확인!

export const dynamic = "force-dynamic"; // 👈 핵심!

export default function Page() {
  return <QuoteList />;
}