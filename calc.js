/**
 * 연차 계산 로직 (근로기준법 제60조 기준)
 * - 입사일 기준 / 회계연도(1.1) 기준 모두 지원
 * - 출근율 요건(개근, 80% 이상)은 충족한 것으로 가정
 *
 * 반영된 규정
 *  1) 1년 미만: 1개월 개근 시 1일, 최대 11일 (제60조 제2항)
 *  2) 1년 이상: 15일, 3년 이상부터 최초 1년 초과 매 2년당 1일 가산, 상한 25일 (제60조 제1·4항)
 *  3) 연차는 발생일에 근로관계가 존속해야 발생
 *     → 딱 365일 근무 후 퇴사 시 15일 미발생, 최대 11일 (대법원 2021다227100)
 *  4) 회계연도 기준: 입사 다음 해 1.1에 비례연차(15 × 전년도 재직일수/365) 발생,
 *     퇴직 시 입사일 기준으로 재산정하여 불리하지 않게 정산
 */

// ---------- 날짜 유틸 ----------

/** 월 더하기 (말일 넘침 방지: 1/31 + 1개월 → 2월 말일) */
function addMonths(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), lastDay));
  return d;
}

/** 연 더하기 (2/29 → 평년이면 2/28) */
function addYears(date, n) {
  return addMonths(date, n * 12);
}

/** 두 날짜 차이(일). same day = 0 */
function diffDays(a, b) {
  const MS = 24 * 60 * 60 * 1000;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / MS);
}

function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

// ---------- 공통: 근속 가산 연차 ----------

/** 만 k년 근속 시점의 연차 일수: 15 + floor((k-1)/2), 상한 25 */
function annualDaysForYear(k) {
  return Math.min(15 + Math.floor((k - 1) / 2), 25);
}

// ---------- 1년 미만 월 단위 연차 (양 기준 공통) ----------

/**
 * 1년 미만 기간 월 개근 연차 (최대 11일)
 * 발생일: 입사일 + m개월 (m = 1~11)
 * 발생 조건: 발생일에 재직 중 (lastDay >= 발생일)
 */
function monthlyLeaves(hire, lastDay) {
  const rows = [];
  for (let m = 1; m <= 11; m++) {
    const accrualDate = addMonths(hire, m);
    if (diffDays(accrualDate, lastDay) >= 0) {
      rows.push({ date: accrualDate, days: 1 });
    } else break;
  }
  return rows;
}

// ---------- 입사일 기준 ----------

function calcByHireDate(hire, lastDay) {
  const events = [];

  // 1년 미만 월차
  const monthly = monthlyLeaves(hire, lastDay);
  if (monthly.length > 0) {
    events.push({
      type: 'monthly',
      label: '1년 미만 월 단위 연차',
      date: monthly[0].date,
      dateEnd: monthly[monthly.length - 1].date,
      days: monthly.length,
      note: `입사 후 1개월 개근마다 1일 (${monthly.length}개월분)`,
    });
  }

  // 만 k년 도래분 (발생일 = 입사일 + k년, 그날 재직 중이어야 발생)
  for (let k = 1; ; k++) {
    const anniversary = addYears(hire, k);
    if (diffDays(anniversary, lastDay) < 0) break; // 발생일 전에 근로관계 종료
    events.push({
      type: 'annual',
      label: `만 ${k}년`,
      date: anniversary,
      days: annualDaysForYear(k),
      note: k >= 3 ? '근속 가산 포함' : '',
    });
  }

  return summarize(events, hire, lastDay);
}

// ---------- 회계연도(1.1) 기준 ----------

function calcByFiscalYear(hire, lastDay) {
  const events = [];

  // 1년 미만 월차 (회계연도 방식이어도 입사일 기준으로 발생 — 고용노동부 행정해석)
  const monthly = monthlyLeaves(hire, lastDay);
  if (monthly.length > 0) {
    events.push({
      type: 'monthly',
      label: '1년 미만 월 단위 연차',
      date: monthly[0].date,
      dateEnd: monthly[monthly.length - 1].date,
      days: monthly.length,
      note: `입사 후 1개월 개근마다 1일 (${monthly.length}개월분)`,
    });
  }

  const hireYear = hire.getFullYear();

  // 입사 다음 해 1.1: 비례연차 = 15 × (입사연도 재직일수 / 365)
  const firstJan1 = new Date(hireYear + 1, 0, 1);
  if (diffDays(firstJan1, lastDay) >= 0) {
    const workedDays = diffDays(hire, new Date(hireYear, 11, 31)) + 1; // 입사일~12.31
    const prorated = Math.round((15 * workedDays / 365) * 100) / 100;
    events.push({
      type: 'prorated',
      label: '비례연차',
      date: firstJan1,
      days: prorated,
      note: `15일 × ${workedDays}일/365일 (소수점 처리는 회사 규정에 따름)`,
    });
  }

  // 이후 매년 1.1: 15일 + 근속 가산
  for (let y = hireYear + 2; ; y++) {
    const jan1 = new Date(y, 0, 1);
    if (diffDays(jan1, lastDay) < 0) break;
    const k = y - hireYear - 1; // 가산 계산용 근속 카운트
    events.push({
      type: 'annual',
      label: `${y}년 부여분`,
      date: jan1,
      days: annualDaysForYear(k),
      note: k >= 3 ? '근속 가산 포함' : '',
    });
  }

  return summarize(events, hire, lastDay);
}

// ---------- 결과 요약 ----------

function summarize(events, hire, lastDay) {
  const total = Math.round(events.reduce((s, e) => s + e.days, 0) * 100) / 100;

  // "현재 연차": 가장 최근 발생한 연 단위(또는 비례) 부여분. 없으면 월차 누적.
  const yearly = events.filter((e) => e.type === 'annual' || e.type === 'prorated');
  const monthlyEvent = events.find((e) => e.type === 'monthly');
  let current, currentLabel;
  if (yearly.length > 0) {
    const latest = yearly[yearly.length - 1];
    current = latest.days;
    currentLabel = `${fmt(latest.date)} 발생분`;
    // 최근 부여분 발생 후에도 1년 미만 월차가 계속 붙는 구간(회계연도 기준) 처리
    if (monthlyEvent && diffDays(latest.date, monthlyEvent.dateEnd) > 0) {
      const extra = monthlyLeaves(hire, lastDay)
        .filter((r) => diffDays(latest.date, r.date) > 0).length;
      if (extra > 0) {
        current = Math.round((current + extra) * 100) / 100;
        currentLabel += ` + 이후 월차 ${extra}일`;
      }
    }
  } else if (monthlyEvent) {
    current = monthlyEvent.days;
    currentLabel = '1년 미만 월 단위 연차 누적';
  } else {
    current = 0;
    currentLabel = '아직 발생한 연차가 없습니다 (입사 1개월 후부터 발생)';
  }

  return {
    current,
    currentLabel,
    total,
    events,
    tenureDays: diffDays(hire, lastDay) + 1,
  };
}

// ---------- 진입점 ----------

/**
 * @param {string} hireStr  입사일 'YYYY-MM-DD'
 * @param {string|null} endStr  마지막 근무일 (null이면 오늘 = 재직 중)
 * @param {'hire'|'fiscal'} method
 */
function calcAnnualLeave(hireStr, endStr, method) {
  const hire = new Date(hireStr + 'T00:00:00');
  const lastDay = endStr ? new Date(endStr + 'T00:00:00') : new Date();
  lastDay.setHours(0, 0, 0, 0);

  if (isNaN(hire)) throw new Error('입사일을 입력해 주세요.');
  if (diffDays(hire, lastDay) < 0) throw new Error('마지막 근무일이 입사일보다 빠릅니다.');

  const result = method === 'fiscal'
    ? calcByFiscalYear(hire, lastDay)
    : calcByHireDate(hire, lastDay);

  // 회계연도 기준 + 퇴사일 입력 시: 입사일 기준 재산정 비교 (퇴직 정산 안내용)
  if (method === 'fiscal' && endStr) {
    result.hireBasisTotal = calcByHireDate(hire, lastDay).total;
  }
  return result;
}

// Node 테스트 환경에서 사용
if (typeof module !== 'undefined') {
  module.exports = { calcAnnualLeave, fmt };
}
