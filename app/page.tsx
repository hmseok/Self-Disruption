import HomePage from "./HomePage"; // 파일명 맞는지 확인!

export const dynamic = "force-dynamic"; // 👈 핵심!

export default function Page() {
  return <HomePage />;
}