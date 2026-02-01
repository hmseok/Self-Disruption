import CarRegisterForm from "./CarRegisterForm";

// 👇 이게 핵심입니다! (이 페이지는 빌드할 때 미리 안 만들고, 접속할 때 만듭니다)
export const dynamic = "force-dynamic";

export default function Page() {
  return <CarRegisterForm />;
}