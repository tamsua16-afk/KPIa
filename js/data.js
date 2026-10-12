/* =========================================================
   KPI 2027 – Khối IID : Mô hình dữ liệu, quy tắc & dữ liệu mẫu
   ========================================================= */

const RULES = {
  dept: { iid: [30, 70], dept: [30, 70], deptKpiCount: [3, 5] },
  emp: { iid: [20, 40], dept: [30, 50], own: [20, 40], maxKpi: 8 },
  cap: 120 // % tối đa ghi nhận cho 1 KPI
};

const RATINGS = [
  { code: 'A', min: 100, label: 'Vượt mục tiêu' },
  { code: 'B', min: 90, label: 'Đạt' },
  { code: 'C', min: 75, label: 'Cần cải thiện' },
  { code: 'D', min: -Infinity, label: 'Không đạt' }
];

const MONTHS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
const QUARTERS = [
  { q: 1, from: 1, to: 3 }, { q: 2, from: 4, to: 6 },
  { q: 3, from: 7, to: 9 }, { q: 4, from: 10, to: 12 }
];
const FREQUENCIES = ['Hàng tháng', 'Hàng quý', 'Hàng tuần'];
const AGGREGATIONS = { sum: 'Cộng dồn (lũy kế)', avg: 'Trung bình', last: 'Giá trị kỳ gần nhất' };
const DEPT_COLORS = ['#3d8bff', '#16c2a3', '#8b7bff', '#ff8a3d', '#38d0f0', '#ff5470', '#ffc542', '#2fd683'];

const uid = (p = 'k') => p + Math.random().toString(36).slice(2, 9);

/* ---------- Seeded random cho dữ liệu mẫu ổn định ---------- */
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function genMonthly(kpi, rnd, months = 9, bias = 0) {
  const arr = Array(12).fill(null);
  for (let m = 0; m < months; m++) {
    const f = 0.86 + rnd() * 0.26 + bias + m * 0.004;
    let v;
    if (kpi.aggregation === 'sum') v = (kpi.target / 12) * f;
    else if (kpi.direction === 'down') v = kpi.target * (2 - f);
    else v = kpi.target * f;
    arr[m] = Math.round(v * 100) / 100;
  }
  return arr;
}

function kpi(o) {
  return Object.assign({
    id: uid(), name: '', unit: '', target: 0, direction: 'up', aggregation: 'sum',
    type: 'outcome', owner: '', source: '', frequency: 'Hàng tháng', weight: 0, linkTo: null,
    monthly: Array(12).fill(null)
  }, o);
}

function buildSampleData() {
  const rnd = seeded(2027);

  const iid = [
    kpi({ id: 'iid_rev', name: 'Revenue', unit: 'tỷ', target: 1200, aggregation: 'sum', owner: 'Giám đốc Khối IID', source: 'Hệ thống ERP / Kế toán' }),
    kpi({ id: 'iid_gp', name: 'Gross Profit (GP)', unit: 'tỷ', target: 360, aggregation: 'sum', owner: 'Giám đốc Khối IID', source: 'Báo cáo P&L' }),
    kpi({ id: 'iid_gm', name: 'Gross Margin (GM%)', unit: '%', target: 30, aggregation: 'avg', owner: 'Giám đốc Tài chính Khối', source: 'Báo cáo P&L' }),
    kpi({ id: 'iid_nrr', name: 'Net Revenue Retention (NRR)', unit: '%', target: 110, aggregation: 'avg', owner: 'Giám đốc Khối IID', source: 'CRM / Billing' }),
    kpi({ id: 'iid_churn', name: 'Churn rate', unit: '%', target: 5, aggregation: 'avg', direction: 'down', owner: 'Trưởng CS', source: 'CRM / Billing' })
  ];
  [30, 25, 15, 15, 15].forEach((w, i) => { iid[i].weight = w; });
  iid.forEach(k => { k.monthly = genMonthly(k, rnd); });

  const depts = [
    {
      id: 'd_sales', name: 'Kinh doanh (Sales)', leader: 'Nguyễn Minh Tuấn', color: DEPT_COLORS[0],
      iidLinks: [{ kpiId: 'iid_rev', weight: 30 }, { kpiId: 'iid_gp', weight: 20 }],
      kpis: [
        kpi({ name: 'Doanh số ký mới', unit: 'tỷ', target: 480, weight: 20, linkTo: 'iid_rev', owner: 'Trưởng phòng KD', source: 'CRM' }),
        kpi({ name: 'Số khách hàng mới', unit: 'KH', target: 240, weight: 15, linkTo: 'iid_rev', owner: 'Trưởng phòng KD', source: 'CRM' }),
        kpi({ name: 'Tỷ lệ chuyển đổi cơ hội', unit: '%', target: 25, aggregation: 'avg', weight: 15, linkTo: 'iid_rev', owner: 'Sales Ops', source: 'CRM pipeline' })
      ]
    },
    {
      id: 'd_cs', name: 'Customer Success', leader: 'Trần Thu Hà', color: DEPT_COLORS[1],
      iidLinks: [{ kpiId: 'iid_nrr', weight: 25 }, { kpiId: 'iid_churn', weight: 20 }],
      kpis: [
        kpi({ name: 'Doanh thu Upsell / Cross-sell', unit: 'tỷ', target: 150, weight: 20, linkTo: 'iid_nrr', owner: 'Trưởng CS', source: 'Billing' }),
        kpi({ name: 'Tỷ lệ gia hạn hợp đồng', unit: '%', target: 92, aggregation: 'avg', weight: 20, linkTo: 'iid_churn', owner: 'Trưởng CS', source: 'CRM' }),
        kpi({ name: 'CSAT', unit: 'điểm', target: 4.5, aggregation: 'avg', weight: 15, linkTo: 'iid_churn', owner: 'CS Ops', source: 'Khảo sát khách hàng' })
      ]
    },
    {
      id: 'd_mkt', name: 'Marketing', leader: 'Lê Hoàng Nam', color: DEPT_COLORS[2],
      iidLinks: [{ kpiId: 'iid_rev', weight: 30 }],
      kpis: [
        kpi({ name: 'Số lead đủ điều kiện (MQL)', unit: 'lead', target: 3600, weight: 25, linkTo: 'iid_rev', owner: 'Trưởng Marketing', source: 'HubSpot' }),
        kpi({ name: 'Pipeline tạo từ Marketing', unit: 'tỷ', target: 900, weight: 25, linkTo: 'iid_rev', owner: 'Trưởng Marketing', source: 'CRM' }),
        kpi({ name: 'Chi phí / lead (CPL)', unit: 'triệu', target: 0.8, aggregation: 'avg', direction: 'down', weight: 10, linkTo: 'iid_gm', owner: 'Performance Lead', source: 'Ads Manager' }),
        kpi({ name: 'Số bài viết / chiến dịch', unit: 'bài', target: 240, type: 'activity', weight: 10, owner: 'Content Lead', source: 'Lịch nội dung' })
      ]
    },
    {
      id: 'd_ops', name: 'Vận hành & Kỹ thuật', leader: 'Phạm Quốc Bảo', color: DEPT_COLORS[3],
      iidLinks: [{ kpiId: 'iid_gm', weight: 25 }, { kpiId: 'iid_churn', weight: 15 }],
      kpis: [
        kpi({ name: 'Uptime dịch vụ', unit: '%', target: 99.9, aggregation: 'avg', weight: 25, linkTo: 'iid_churn', owner: 'Trưởng Vận hành', source: 'Monitoring' }),
        kpi({ name: 'Chi phí hạ tầng / doanh thu', unit: '%', target: 18, aggregation: 'avg', direction: 'down', weight: 20, linkTo: 'iid_gm', owner: 'Trưởng Vận hành', source: 'Báo cáo chi phí' }),
        kpi({ name: 'Thời gian xử lý sự cố (MTTR)', unit: 'giờ', target: 4, aggregation: 'avg', direction: 'down', weight: 15, linkTo: 'iid_churn', owner: 'SRE Lead', source: 'Jira Service' })
      ]
    }
  ];
  depts.forEach((d, i) => d.kpis.forEach(k => { k.monthly = genMonthly(k, rnd, 9, i === 2 ? -0.06 : 0); }));

  const E = (o) => Object.assign({ id: uid('e'), iidLinks: [], deptLinks: [], kpis: [] }, o);
  const dk = (deptId, idx) => depts.find(d => d.id === deptId).kpis[idx].id;

  const emps = [
    E({ name: 'Nguyễn Minh Tuấn', title: 'Trưởng phòng Kinh doanh', deptId: 'd_sales',
      iidLinks: [{ kpiId: 'iid_rev', weight: 30 }], deptLinks: [{ kpiId: dk('d_sales', 0), weight: 25 }, { kpiId: dk('d_sales', 1), weight: 15 }],
      kpis: [kpi({ name: 'Doanh số Key account', unit: 'tỷ', target: 200, weight: 20, linkTo: dk('d_sales', 0), owner: 'Nguyễn Minh Tuấn', source: 'CRM' }),
        kpi({ name: 'Tỷ lệ đạt quota của team', unit: '%', target: 90, aggregation: 'avg', weight: 10, linkTo: dk('d_sales', 0), owner: 'Nguyễn Minh Tuấn', source: 'CRM' })] }),
    E({ name: 'Đỗ Thị Lan', title: 'Account Executive', deptId: 'd_sales',
      iidLinks: [{ kpiId: 'iid_rev', weight: 20 }], deptLinks: [{ kpiId: dk('d_sales', 0), weight: 30 }, { kpiId: dk('d_sales', 2), weight: 10 }],
      kpis: [kpi({ name: 'Doanh số cá nhân', unit: 'tỷ', target: 60, weight: 25, linkTo: dk('d_sales', 0), owner: 'Đỗ Thị Lan', source: 'CRM' }),
        kpi({ name: 'Số hợp đồng ký mới', unit: 'HĐ', target: 36, weight: 15, linkTo: dk('d_sales', 1), owner: 'Đỗ Thị Lan', source: 'CRM' })] }),
    E({ name: 'Trần Thu Hà', title: 'Trưởng Customer Success', deptId: 'd_cs',
      iidLinks: [{ kpiId: 'iid_nrr', weight: 20 }, { kpiId: 'iid_churn', weight: 10 }], deptLinks: [{ kpiId: dk('d_cs', 0), weight: 20 }, { kpiId: dk('d_cs', 1), weight: 20 }],
      kpis: [kpi({ name: 'Số tài khoản có kế hoạch thành công', unit: 'TK', target: 120, weight: 30, type: 'activity', linkTo: dk('d_cs', 1), owner: 'Trần Thu Hà', source: 'CRM' })] }),
    E({ name: 'Vũ Đức Anh', title: 'CS Manager', deptId: 'd_cs',
      iidLinks: [{ kpiId: 'iid_churn', weight: 25 }], deptLinks: [{ kpiId: dk('d_cs', 1), weight: 25 }, { kpiId: dk('d_cs', 2), weight: 15 }],
      kpis: [kpi({ name: 'Upsell danh mục phụ trách', unit: 'tỷ', target: 30, weight: 20, linkTo: dk('d_cs', 0), owner: 'Vũ Đức Anh', source: 'Billing' }),
        kpi({ name: 'Số QBR với khách hàng', unit: 'buổi', target: 48, type: 'activity', weight: 15, linkTo: dk('d_cs', 1), owner: 'Vũ Đức Anh', source: 'Lịch làm việc' })] }),
    E({ name: 'Lê Hoàng Nam', title: 'Trưởng Marketing', deptId: 'd_mkt',
      iidLinks: [{ kpiId: 'iid_rev', weight: 25 }], deptLinks: [{ kpiId: dk('d_mkt', 0), weight: 25 }, { kpiId: dk('d_mkt', 1), weight: 25 }],
      kpis: [kpi({ name: 'ROI chiến dịch', unit: 'lần', target: 5, aggregation: 'avg', weight: 25, linkTo: dk('d_mkt', 1), owner: 'Lê Hoàng Nam', source: 'Báo cáo Marketing' })] }),
    E({ name: 'Hoàng Mai Linh', title: 'Content Lead', deptId: 'd_mkt',
      iidLinks: [], deptLinks: [{ kpiId: dk('d_mkt', 0), weight: 30 }, { kpiId: dk('d_mkt', 3), weight: 30 }],
      kpis: [kpi({ name: 'Số bài viết xuất bản', unit: 'bài', target: 180, type: 'activity', weight: 25, owner: 'Hoàng Mai Linh', source: 'CMS' }),
        kpi({ name: 'Lượt truy cập organic', unit: 'nghìn', target: 600, weight: 15, linkTo: dk('d_mkt', 0), owner: 'Hoàng Mai Linh', source: 'GA4' })] }),
    E({ name: 'Phạm Quốc Bảo', title: 'Trưởng Vận hành', deptId: 'd_ops',
      iidLinks: [{ kpiId: 'iid_gm', weight: 25 }], deptLinks: [{ kpiId: dk('d_ops', 0), weight: 25 }, { kpiId: dk('d_ops', 1), weight: 20 }],
      kpis: [kpi({ name: 'Tiết kiệm chi phí hạ tầng', unit: 'tỷ', target: 12, weight: 30, linkTo: dk('d_ops', 1), owner: 'Phạm Quốc Bảo', source: 'Báo cáo chi phí' })] }),
    E({ name: 'Ngô Thanh Sơn', title: 'SRE Engineer', deptId: 'd_ops',
      iidLinks: [{ kpiId: 'iid_churn', weight: 20 }], deptLinks: [{ kpiId: dk('d_ops', 0), weight: 25 }, { kpiId: dk('d_ops', 2), weight: 25 }],
      kpis: [kpi({ name: 'Số sự cố P1', unit: 'sự cố', target: 12, direction: 'down', weight: 20, linkTo: dk('d_ops', 0), owner: 'Ngô Thanh Sơn', source: 'Jira Service' }),
        kpi({ name: 'Tự động hóa runbook', unit: 'runbook', target: 24, weight: 10, linkTo: dk('d_ops', 2), owner: 'Ngô Thanh Sơn', source: 'Git' })] })
  ];
  emps.forEach((e, i) => e.kpis.forEach(k => { k.monthly = genMonthly(k, rnd, 9, (i % 3 - 1) * 0.04); }));

  return { version: 1, year: 2027, currentMonth: 9, iid, depts, emps, reviews: {} };
}
