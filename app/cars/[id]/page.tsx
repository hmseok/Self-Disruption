import CarDetail from "./CarDetail"; // 방금 만든 파일

// 👇 상세 페이지는 ID에 따라 내용이 바뀌므로 필수입니다!
export const dynamic = "force-dynamic";

export default function Page() {
  return <CarDetail />;
}