import QuoteListMain from "./QuoteListMain"; // 방금 만든 파일 이름

// 👇 목록 페이지도 이게 없으면 에러 납니다!
export const dynamic = "force-dynamic";

export default function Page() {
  return <QuoteListMain />;
}