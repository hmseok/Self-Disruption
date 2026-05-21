# HR — 운영 사실 (Rule 25 인터뷰 결과)

> **작성**: 2026-05-16 (hr 세션 / peaceful-laughing-volta — PR-HR-1)
> **출처**: 사용자 인터뷰 + 라이드케어 조직도 v2026.04.29
> **Rule**: CLAUDE.md Rule 25 (운영 사실 인터뷰) — 새 모듈 시작 전 필수 인터뷰의 답변 기록.

---

## 0. 핵심 도메인 사실 — 멀티 회사 구조 ⚠

> **사용자 명시 (2026-05-16)**:
> 「현재는 메인은 에프엠아이 라이드는 외주로해서 셋팅되어있음」

본 ERP 시스템은 **단독 회사** (FMI ERP) 로 시작했지만 **현재 멀티 회사** 가 들어와 운영 중:

| 회사 | 역할 | 사용 테이블 / API |
|------|------|------------------|
| **㈜에프엠아이** | **메인 회사** — 본 ERP 의 본체 | `profiles` (인증) / `departments` (RBAC) / `employees` (RBAC) / `freelancers` (3.3% 사업소득) |
| **라이드케어** | **외주 업체** — 운영/콜센터/사고 처리 등 위탁 | `ride_employees` (49명+) / **`ride_departments` (PR-HR-1 신설)** / `cs_workers` (콜센터 특화) |

**중요**: 두 회사의 부서 시스템은 **완전 분리** 됩니다.
- 「부서 변경」 같은 사용자 액션이 어느 회사 대상인지 항상 명시.
- FMI 본사 부서 = `/api/departments` (RBAC, 권한 부여 대상)
- 라이드케어 부서 = `/api/ride-departments/*` (인사 마스터 전용)

`departments` 테이블 안에 `name='라이드주식회사'` 같은 row 가 있다면, 이는 「외부 매니저」 RBAC 권한 부여용 단일 부서일 뿐, 라이드 49명의 실제 소속 부서가 아님.

---

## 1. 라이드케어 운영 현황 (v2026.04.29 조직도)

### 1.1 인원
- 현원: **49명**
- 상반기 충원 시: 총원 **63명 예상**
- 채용 holding: 사고팀 1, 충전기팀 1, CX 4 (주5=4 / 주4=2 — 추가 2명 별도)

### 1.2 부서 구조 — 4단계 계층

```
박광일 대표
├── 케어 (임성민 이사)                        ─── 본부
│   └── MT운영총괄 (석호민 부장)              ─── 총괄
│       ├── 사고 (8명)                       ─── 부서
│       │   ├── 사고_현장 (3명)              ─── 파트
│       │   └── 사고_손사 (4명)
│       ├── 충전기 (3명)
│       │   └── CX_충전기 (1명, 6월 콜 종료)
│       ├── 법정검사 (4명)
│       ├── 순회정비 (12명)
│       ├── 범칙금 (2명)
│       ├── CX (22명, 전소현 차장팀장)
│       │   ├── CX_주4 (5명, 안경희 파트장)
│       │   ├── CX_주5 (11명, 정지은 파트장+교육)
│       │   └── CX_야간 (6명, 윤민진 파트장)
│       ├── 부품 (1명)
│       ├── IT인프라 (4명)
│       └── 영업기획(가명) (3명, 석호민 부장 겸업)
└── 영업 (정봉선 이사)                       ─── 본부
```

총 17 entry (본부 2 + 총괄 1 + 부서 9 + 파트 5).

### 1.3 직급 9단계

- 대표
- 이사
- 부장
- 차장
- 과장
- 대리
- 주임
- 사원
- 프리랜서

---

## 2. 인터뷰 답변 정리 (Rule 25)

| 질문 | 답변 | 결정 / 적용 |
|------|------|------------|
| [A-1] 부서 종류 | 조직도 17 entry + 「대차팀」은 라이드 아닌 FMI 소속 | ride_departments 시드에 대차팀 X |
| [A-2] 부서 트리 | 계층 필요 | parent_id FK 필수 (4단계) |
| [A-3] 부서장 | 필요 | leader_employee_id FK (ride_employees.id 옵셔널) — meetings 세션과 컬럼명 통일 (2026-05-16 합의) |
| [A-4] 부서 색상 | Glass 5색 자동 매핑 | red/amber/green/blue/violet/slate — 의미 기반 시드 |
| [B-1] 인사 흐름 | 입사→배정→변경→퇴사 | 4단계 — `is_active`/`hire_date`/`resign_date` |
| [B-2] 보직변경 이력 | 기존 데이터만 문제 없으면 안 함 | history 테이블 미신설 (현재 상태만) |
| [B-3] 일괄 부서 변경 | 없으면 셋팅 힘듦 | `POST /api/ride-employees/bulk-assign` 신설 |
| [B-4] 퇴사 처리 | 상세 X. 단 퇴사 시 물품/규약 정리 필요 | `is_active=0` + `resign_date`. 퇴사 체크리스트 Phase 3. |
| [C] 권한 | 본인정보 + HR 담당자 + admin (3단계) | 부서장은 일반 직원 권한 + 자기 부서 read |
| [D] 연계 모듈 | Phase 1 = ride_departments + ride_employees.department_id 만 | meetings / cs_workers 통합은 Phase 2+ |
| [E-2] focus=<id> | 필수 — Phase 1 | URL param + 자동 스크롤 + highlight |
| [E-3] /hr/org 레이아웃 | 좌측 트리 + 우측 직원 list | `/hr/page.tsx` 「외부 인력」 탭 안에서 동일 패턴 |
| 파트장 처리 | CX_주4/주5/야간 자체를 하위 부서로 | ride_departments 4단계 계층 (파트장 = 부서 leader_employee_id) |
| 겸업 처리 | primary department_id + 다대다 assignments | `ride_employee_assignments` 신설 (Phase 1) |
| 채용중 placeholder | 등록 X — 입사 확정 시만 | ride_employees 시드에 「채용중」 row X |
| 직급 마스터 | VARCHAR + lib/positions.ts 상수 | (Phase 2) — Phase 1 은 VARCHAR 그대로 |
| 승진 대상 표시 | `ride_employees.promotion_target VARCHAR` | Phase 1 마이그 포함 |
| 부서 삭제 | Soft delete + 직원 남아있으면 차단 | `DELETE /api/ride-departments/[id]` 가드 2중 |
| /hr 대시보드 | 활성 49 / 부서 17 / 입사·퇴사 / 승진대상 | DcStatStrip 4칸 (5번째는 향후) |

---

## 3. PR-B1 (2026-05-05) 통합 페이지 의도 + 본 세션 작업 영역

> 사용자 명시 (PR-B1):
> 「한페이지를 해서 직원관리, 초대관리, 조직, 권한, 부서, 직급, 직원 프리랜서 급여설정 기타 등등 한곳에서 기본설정값들」

`/hr/page.tsx` 통합 1 페이지 안 5 탭 구조:

1. **직원 관리** (`topTab='employees'`) — FMI 본사 정직원 + 외부 매니저 + admin (RBAC)
2. **부서·직급** (`topTab='org'`) — FMI 본사 부서/직급 (departments / positions API)
3. **초대 관리** (`topTab='invites'`)
4. **외부 인력** (`topTab='external'`) — freelancers + ride_employees (라이드 외주) ★ 본 세션 작업 영역
5. **급여 운영** (`topTab='payroll'`) — PayrollOps 컴포넌트

본 hr 세션 (peaceful-laughing-volta) 작업 영역 = **「외부 인력」 탭 안 라이드 인력 영역**.

---

## 4. 퇴사 처리 — 향후 (Phase 3 후보)

사용자 명시:
> 「퇴사 시 뭐 물품이라던가 규약이라던가 정리할게 필요하긴 하겠네요」

향후 Phase 3 에서 검토:
- 퇴사 체크리스트 (자산 회수 / 권한 회수 / 마지막 급여 / 퇴직금 등)
- offboarding 테이블 (선택)

현재는 `is_active=0` + `resign_date` 만으로 운영.

---

## 5. 다음 단계 (PR-HR-2 / Phase 2)

### PR-HR-2 — UI 보강
- `/hr/page.tsx` 「외부 인력」 탭 안 라이드 인력 영역:
  - DcStatStrip 5칸 (활성 49 / 부서 17 / 이번달 입사 / 퇴사예정 / 승진대상)
  - 좌측 부서 트리 + 우측 NeuDataTable
  - 부서장 지정 UI / 일괄 부서 변경 / focus=<id> highlight
  - Glass 5색 자동 매핑 + 승진 대상 노랑 배지
  - 결과 글래스 패널 (Rule 20)

### Phase 2 — meetings 협업
- `meetings.department_id` FK 마이그
- V2-Dept-FK — meetings 세션과 동기화
- (별도 세션 — hr 세션 종료 후)

### Phase 3 — 옵션
- ride_employees 49명 시드 자동 입력 (조직도 기반)
- 퇴사 체크리스트
- ride_positions 마스터 (현재 VARCHAR)
- 보직변경 이력 (필요 시)

---

본 문서는 운영 사실 변경 시 갱신 (Rule 22).
