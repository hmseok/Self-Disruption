'use client'
import { Suspense } from "react";
import ShortTermReplacementBuilder from "./ShortTermReplacementBuilder";

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-steel-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 font-bold">페이지 로드 중...</p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ShortTermReplacementBuilder />
    </Suspense>
  );
}
