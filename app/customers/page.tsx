import CustomerList from "./CustomerList";

export const dynamic = "force-dynamic"; // 👈 이게 핵심!

export default function Page() {
  return <CustomerList />;
}