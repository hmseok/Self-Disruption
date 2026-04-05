# 코드 패턴 축적 (Researcher → 자동 기록)

> 이 파일은 Researcher가 조사 중 발견한 반복 패턴을 자동으로 기록합니다.
> 새 기능 개발 시 이 패턴들을 먼저 참조하여 일관성을 유지합니다.

---

## API 라우트 패턴

### 표준 CRUD 라우트 구조
```typescript
// src/app/api/[resource]/route.ts — GET(목록), POST(생성)
// src/app/api/[resource]/[id]/route.ts — GET(상세), PUT(수정), DELETE(삭제)

// 인증 체크
const session = await getServerSession(authOptions);
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// 권한 체크
if (!hasPermission(session.user.role as any, Permission.VIEW_COMPANIES)) { ... }

// 테넌트 필터
const tenantId = getTenantId(session);
const where: any = { tenantId };
```

### Prisma Decimal 필드 처리
```typescript
// ❌ 잘못된 방법: BigInt() 사용
latitude: BigInt(payload.latitude)

// ✅ 올바른 방법: number 직접 전달
latitude: payload.latitude ?? undefined
```

### BigInt JSON 직렬화 (필수)
```typescript
// prisma.ts에 BigInt toJSON 패치 필요
// BigInt는 JSON.stringify에서 에러 발생
(BigInt.prototype as any).toJSON = function() { return Number(this); };
```

### Prisma 새 모델 사용 시 캐스팅
```typescript
// prisma generate 전까지 타입이 없는 새 모델은 (prisma as any)로 캐스팅
const result = await (prisma as any).companyRelationship.create({ ... });
```

---

## 프론트엔드 패턴

### 페이지 기본 구조 (투톤 제목)
```tsx
<h1 className="text-2xl font-bold text-slate-800">
  키워드 <span className="text-blue-600">관리</span>
</h1>
```

### Suspense 필요 훅
```tsx
// useSearchParams()는 반드시 Suspense로 감싸기
<Suspense fallback={<Loading />}>
  <ComponentUsingSearchParams />
</Suspense>
```

### 모달 닫기 — onMouseDown 패턴
```tsx
// ❌ onClick: 모달 내 텍스트 드래그 시 의도치 않게 닫힘
<div onClick={() => setOpen(false)}>

// ✅ onMouseDown + e.target === e.currentTarget: 배경 직접 클릭만 닫힘
<div onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
```

### 카테고리별 색상 테마 (CAT_THEME 패턴)
```typescript
const CAT_THEME: Record<string, { label: string; bar: string; bg: string; text: string; border: string; gradient: string; }> = {
  CAPITAL: { label: '캐피탈사', bar: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', gradient: 'from-blue-500 to-blue-600' },
  CARD:    { label: '카드사',   bar: 'bg-violet-500', ... },
  INSURANCE: { label: '보험사', bar: 'bg-teal-500', ... },
  LEASE:   { label: '리스사',  bar: 'bg-amber-500', ... },
  RENTAL:  { label: '렌터카사', bar: 'bg-emerald-500', ... },
  MT:      { label: 'MT사',    bar: 'bg-orange-500', ... },
};
```

### 회사 목록 3-Case 렌더링
```
Case A: 소유주(비직접) → 계약사(직접) — GroupRow(thin bar) + DirectRow(big card)
Case B: 직접계약사 → 직접계약사(자회사) — 둘 다 DirectRow
Case C: 독립 계약사 — 단독 DirectRow
```

### 3-View 모드 (리스트/트리/카드)
```tsx
const [viewMode, setViewMode] = useState<'list' | 'tree' | 'card'>('list');
// LayoutList, Network, LayoutGrid 아이콘으로 전환
```

---

## 빌드/배포 패턴

### Docker 빌드 최적화
- .dockerignore에 cafe24_source (4.9GB) 반드시 포함
- npm ci (devDependencies 포함) — prisma CLI 필요
- ignoreBuildErrors: true (현재 30+ enum 불일치 때문에 필요)

### Git Push 제한
- Sandbox 환경에서 DNS 해석 실패로 git push 불가
- 해결: 사용자가 로컬에서 push → GitHub Actions가 자동 배포

---

## 데이터 모델 패턴

### 회사 관계 구조
```
소유주 (is_direct_contract=false)
  └─ MANAGED → 계약사 (is_direct_contract=true)
                └─ 차량 관리, 검사 실행

R 라이드 (RIDE)
  └─ 모든 계약사와 최종 연결
```

### 관계 쿼리 패턴 (Prisma include)
```typescript
include: {
  primaryParent: { select: { id: true, name: true, contractCategory: true } },
  childCompanies: { select: { id: true, name: true, isActive: true } },
  parentRelations: { include: { fromCompany: { select: {...} } } },
  childRelations: { include: { toCompany: { select: {...} } } },
}
```

---

_마지막 업데이트: 2026-04-04_
