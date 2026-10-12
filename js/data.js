/* =========================================================
   KPI 2027 – Khối IID : Mô hình dữ liệu, phân quyền & Roll-up
   ========================================================= */

const ROLES = {
  admin: {
    id: 'admin',
    name: 'Admin',
    title: 'Giám đốc Khối IID',
    level: 4,
    badge: '👑 Admin',
    desc: 'Toàn quyền: Setup KPI IID Khối, phê duyệt chốt kỳ, quản lý bộ phận & phân quyền toàn hệ thống.'
  },
  manager: {
    id: 'manager',
    name: 'Manager',
    title: 'Trưởng Bộ phận',
    level: 3,
    badge: '💼 Manager',
    desc: 'Quản lý toàn bộ KPI bộ phận, phân bổ mục tiêu cho Leader/Staff, đánh giá quý và theo dõi tiến độ team.'
  },
  leader: {
    id: 'leader',
    name: 'Leader',
    title: 'Trưởng nhóm / Lead',
    level: 2,
    badge: '🎖️ Leader',
    desc: 'Quản lý mục tiêu nhóm, cập nhật & rà soát số liệu thực tế của thành viên, review sơ bộ.'
  },
  staff: {
    id: 'staff',
    name: 'Staff',
    title: 'Nhân viên',
    level: 1,
    badge: '👤 Staff',
    desc: 'Xem KPI cá nhân, tự nhập số liệu thực tế hàng tháng và thực hiện tự đánh giá (Self-review) theo quý.'
  }
};

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
const ROLLUP_MODES = {
  manual: 'Nhập trực tiếp (Setup cố định)',
  rollup_sum: '⚡ Tự động tổng hợp (Tổng SUM từ cấp dưới)',
  rollup_avg: '⚡ Tự động tổng hợp (Trung bình AVG từ cấp dưới)'
};
const DEPT_COLORS = ['#0068b7', '#0284c7', '#7c3aed', '#059669', '#ea580c', '#e11d48', '#d97706', '#10b981'];

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
    id: uid(), name: '', desc: '', unit: '', target: 0, direction: 'up', aggregation: 'sum',
    type: 'outcome', owner: '', source: '', frequency: 'Hàng tháng', weight: 0, linkTo: null,
    rollupMode: 'manual', // 'manual' | 'rollup_sum' | 'rollup_avg'
    monthly: Array(12).fill(null)
  }, o);
}

function buildSampleData() {
  const rnd = seeded(2027);

  // 1. KPI Cấp Khối IID (Admin setup & điều phối)
  const iid = [
    kpi({
      id: 'iid_rev', name: 'Doanh thu Toàn Khối (Revenue)',
      desc: 'Tổng doanh thu từ Tên miền, Hosting, Email Server, Cloud VPS, SSL và Hóa đơn điện tử Tenten',
      unit: 'tỷ', target: 1200, aggregation: 'sum', rollupMode: 'rollup_sum',
      owner: 'Giám đốc Khối IID', source: 'Hệ thống ERP / Tổng hợp Sales'
    }),
    kpi({
      id: 'iid_gp', name: 'Lợi nhuận gộp (Gross Profit - GP)',
      desc: 'Doanh thu trừ giá vốn nhà đăng ký tên miền & hạ tầng trung tâm dữ liệu',
      unit: 'tỷ', target: 360, aggregation: 'sum', rollupMode: 'manual',
      owner: 'Giám đốc Khối IID', source: 'Báo cáo Tài chính P&L'
    }),
    kpi({
      id: 'iid_gm', name: 'Tỷ suất lợi nhuận gộp (Gross Margin - GM%)',
      desc: 'Tỷ lệ GP / Doanh thu, phản ánh biên lợi nhuận cốt lõi của các dòng sản phẩm hosting & cloud',
      unit: '%', target: 30, aggregation: 'avg', rollupMode: 'manual',
      owner: 'Giám đốc Tài chính Khối', source: 'Báo cáo Tài chính P&L'
    }),
    kpi({
      id: 'iid_nrr', name: 'Tỷ lệ duy trì doanh thu (NRR)',
      desc: 'Net Revenue Retention: Tỷ lệ giữ chân và mở rộng giá trị hợp đồng từ khách hàng hiện hữu (Mục tiêu > 100%)',
      unit: '%', target: 110, aggregation: 'avg', rollupMode: 'manual',
      owner: 'Giám đốc Khối IID', source: 'CRM & Hệ thống Billing Tenten'
    }),
    kpi({
      id: 'iid_churn', name: 'Tỷ lệ khách hàng rời bỏ (Churn Rate)',
      desc: 'Tỷ lệ khách hàng không gia hạn tên miền/hosting sau khi hết hạn chu kỳ (Càng thấp càng tốt)',
      unit: '%', target: 4.5, aggregation: 'avg', direction: 'down', rollupMode: 'manual',
      owner: 'Trưởng CS Khối', source: 'CRM Tenten'
    })
  ];
  [30, 25, 15, 15, 15].forEach((w, i) => { iid[i].weight = w; });
  iid.forEach(k => { k.monthly = genMonthly(k, rnd); });

  // 2. Bộ phận (Manager quản lý)
  const depts = [
    {
      id: 'd_sales', name: 'Kinh doanh (Sales)', leader: 'Nguyễn Minh Tuấn', managerId: 'u_mgr_sales', color: DEPT_COLORS[0],
      iidLinks: [{ kpiId: 'iid_rev', weight: 30 }, { kpiId: 'iid_gp', weight: 20 }],
      kpis: [
        kpi({
          id: 'dk_sales_rev', name: 'Doanh số ký mới (New Sales)',
          desc: 'Doanh thu ký hợp đồng mới tên miền, web hosting, email server và cloud VPS trong năm',
          unit: 'tỷ', target: 480, weight: 20, linkTo: 'iid_rev', rollupMode: 'rollup_sum',
          owner: 'Trưởng phòng KD', source: 'Tổng hợp từ cá nhân Sales'
        }),
        kpi({
          id: 'dk_sales_deal', name: 'Số lượng khách hàng mới',
          desc: 'Số lượng doanh nghiệp & cá nhân đăng ký mới tài khoản dịch vụ trên Tenten.vn',
          unit: 'KH', target: 240, weight: 15, linkTo: 'iid_rev', rollupMode: 'rollup_sum',
          owner: 'Trưởng phòng KD', source: 'CRM Pipeline Tenten'
        }),
        kpi({
          id: 'dk_sales_cr', name: 'Tỷ lệ chốt hợp đồng (Win Rate)',
          desc: 'Tỷ lệ cơ hội kinh doanh chuyển đổi thành hợp đồng thành công',
          unit: '%', target: 25, aggregation: 'avg', weight: 15, linkTo: 'iid_rev', rollupMode: 'manual',
          owner: 'Sales Operations', source: 'CRM Pipeline'
        })
      ]
    },
    {
      id: 'd_cs', name: 'Customer Success & Hỗ trợ', leader: 'Trần Thu Hà', managerId: 'u_mgr_cs', color: DEPT_COLORS[1],
      iidLinks: [{ kpiId: 'iid_nrr', weight: 25 }, { kpiId: 'iid_churn', weight: 20 }],
      kpis: [
        kpi({
          id: 'dk_cs_upsell', name: 'Doanh thu Nâng cấp (Upsell & Cross-sell)',
          desc: 'Doanh số từ việc khách hàng nâng cấp gói hosting, chuyển lên Cloud VPS hoặc mua thêm SSL/Email',
          unit: 'tỷ', target: 150, weight: 20, linkTo: 'iid_nrr', rollupMode: 'rollup_sum',
          owner: 'Trưởng CS', source: 'Billing CS Tenten'
        }),
        kpi({
          id: 'dk_cs_ret', name: 'Tỷ lệ gia hạn dịch vụ (Renewal Rate)',
          desc: 'Tỷ lệ khách hàng đồng ý tái ký và gia hạn tên miền, hosting, server khi đến hạn',
          unit: '%', target: 92, aggregation: 'avg', weight: 20, linkTo: 'iid_churn', rollupMode: 'manual',
          owner: 'Trưởng CS', source: 'CRM Tenten'
        }),
        kpi({
          id: 'dk_cs_csat', name: 'Điểm hài lòng khách hàng (CSAT)',
          desc: 'Điểm đánh giá chất lượng hỗ trợ kỹ thuật và chăm sóc khách hàng Tenten (thang 5.0)',
          unit: 'điểm', target: 4.8, aggregation: 'avg', weight: 15, linkTo: 'iid_churn', rollupMode: 'manual',
          owner: 'CS Operations', source: 'Khảo sát sau hỗ trợ ticket/livechat'
        })
      ]
    },
    {
      id: 'd_mkt', name: 'Marketing & Tăng trưởng', leader: 'Lê Hoàng Nam', managerId: 'u_mgr_mkt', color: DEPT_COLORS[2],
      iidLinks: [{ kpiId: 'iid_rev', weight: 30 }],
      kpis: [
        kpi({
          id: 'dk_mkt_mql', name: 'Khách hàng tiềm năng chất lượng (MQL)',
          desc: 'Số lượng lead đăng ký dùng thử hoặc yêu cầu báo giá đủ tiêu chuẩn chuyển cho Sales',
          unit: 'lead', target: 3600, weight: 25, linkTo: 'iid_rev', rollupMode: 'manual',
          owner: 'Trưởng Marketing', source: 'HubSpot / CRM Tenten'
        }),
        kpi({
          id: 'dk_mkt_pipe', name: 'Giá trị cơ hội tạo ra (Pipeline Generated)',
          desc: 'Tổng giá trị tiềm năng của các lead được Marketing mang về cho đội Sales',
          unit: 'tỷ', target: 900, weight: 25, linkTo: 'iid_rev', rollupMode: 'manual',
          owner: 'Trưởng Marketing', source: 'CRM Tenten'
        }),
        kpi({
          id: 'dk_mkt_cpl', name: 'Chi phí trên một Lead (CPL)',
          desc: 'Chi phí quảng cáo và chiến dịch chia cho số lượng MQL mang về (Càng thấp càng tốt)',
          unit: 'triệu', target: 0.8, aggregation: 'avg', direction: 'down', weight: 10, linkTo: 'iid_gm', rollupMode: 'manual',
          owner: 'Performance Lead', source: 'Báo cáo chi phí quảng cáo'
        }),
        kpi({
          id: 'dk_mkt_content', name: 'Chiến dịch truyền thông & Nội dung',
          desc: 'Số lượng bài viết SEO, case study khách hàng và chiến dịch thương hiệu Tenten thực hiện',
          unit: 'bài', target: 240, type: 'activity', weight: 10, rollupMode: 'rollup_sum',
          owner: 'Content Lead', source: 'Kế hoạch Marketing Tenten'
        })
      ]
    },
    {
      id: 'd_ops', name: 'Vận hành & Kỹ thuật Hệ thống', leader: 'Phạm Quốc Bảo', managerId: 'u_mgr_ops', color: DEPT_COLORS[3],
      iidLinks: [{ kpiId: 'iid_gm', weight: 25 }, { kpiId: 'iid_churn', weight: 15 }],
      kpis: [
        kpi({
          id: 'dk_ops_uptime', name: 'Độ sẵn sàng hệ thống (Uptime)',
          desc: 'Tỷ lệ thời gian máy chủ hosting, DNS tên miền và cloud hoạt động không gián đoạn (SLA)',
          unit: '%', target: 99.95, aggregation: 'avg', weight: 25, linkTo: 'iid_churn', rollupMode: 'manual',
          owner: 'Trưởng Vận hành', source: 'Hệ thống giám sát Datacenter'
        }),
        kpi({
          id: 'dk_ops_cost', name: 'Tối ưu chi phí hạ tầng / Doanh thu',
          desc: 'Tỷ lệ chi phí điện, mạng và phần cứng trên tổng doanh thu tạo ra (Tối ưu biên lợi nhuận)',
          unit: '%', target: 18, aggregation: 'avg', direction: 'down', weight: 20, linkTo: 'iid_gm', rollupMode: 'manual',
          owner: 'Trưởng Vận hành', source: 'Báo cáo chi phí Datacenter'
        }),
        kpi({
          id: 'dk_ops_mttr', name: 'Thời gian khắc phục sự cố (MTTR)',
          desc: 'Thời gian trung bình để phát hiện và xử lý xong sự cố kỹ thuật (Mean Time To Recovery)',
          unit: 'giờ', target: 2, aggregation: 'avg', direction: 'down', weight: 15, linkTo: 'iid_churn', rollupMode: 'manual',
          owner: 'SRE Lead', source: 'Hệ thống Jira Service Management'
        })
      ]
    }
  ];
  depts.forEach((d, i) => d.kpis.forEach(k => { k.monthly = genMonthly(k, rnd, 9, i === 2 ? -0.06 : 0); }));

  const E = (o) => Object.assign({ id: uid('e'), role: 'staff', iidLinks: [], deptLinks: [], kpis: [] }, o);

  // 3. Nhân sự (bao gồm Manager, Leader, Staff)
  const emps = [
    // --- PHÒNG KINH DOANH ---
    E({
      id: 'emp_tuan', name: 'Nguyễn Minh Tuấn', title: 'Trưởng phòng Kinh doanh', role: 'manager', deptId: 'd_sales',
      iidLinks: [{ kpiId: 'iid_rev', weight: 30 }], deptLinks: [{ kpiId: 'dk_sales_rev', weight: 25 }, { kpiId: 'dk_sales_deal', weight: 15 }],
      kpis: [
        kpi({ name: 'Doanh số Key account', unit: 'tỷ', target: 200, weight: 20, linkTo: 'dk_sales_rev', owner: 'Nguyễn Minh Tuấn', source: 'CRM' }),
        kpi({ name: 'Tỷ lệ đạt quota của team', unit: '%', target: 90, aggregation: 'avg', weight: 10, linkTo: 'dk_sales_rev', owner: 'Nguyễn Minh Tuấn', source: 'CRM' })
      ]
    }),
    E({
      id: 'emp_lan', name: 'Đỗ Thị Lan', title: 'Account Executive', role: 'staff', deptId: 'd_sales',
      iidLinks: [{ kpiId: 'iid_rev', weight: 20 }], deptLinks: [{ kpiId: 'dk_sales_rev', weight: 30 }, { kpiId: 'dk_sales_deal', weight: 10 }],
      kpis: [
        kpi({
          name: 'Doanh số Tên miền & Web Hosting',
          desc: 'Chỉ tiêu doanh số ký mới dịch vụ Tên miền và Web Hosting cá nhân phụ trách',
          unit: 'tỷ', target: 140, weight: 25, linkTo: 'dk_sales_rev', owner: 'Đỗ Thị Lan', source: 'CRM Tenten'
        }),
        kpi({
          name: 'Số hợp đồng ký mới (Đỗ Thị Lan)',
          desc: 'Số lượng hợp đồng đăng ký mới dịch vụ hoàn tất trong năm',
          unit: 'HĐ', target: 120, weight: 15, linkTo: 'dk_sales_deal', owner: 'Đỗ Thị Lan', source: 'CRM Tenten'
        })
      ]
    }),
    E({
      id: 'emp_huy', name: 'Trần Quốc Huy', title: 'Senior Sales Representative', role: 'staff', deptId: 'd_sales',
      iidLinks: [{ kpiId: 'iid_rev', weight: 20 }], deptLinks: [{ kpiId: 'dk_sales_rev', weight: 30 }, { kpiId: 'dk_sales_deal', weight: 10 }],
      kpis: [
        kpi({
          name: 'Doanh số Cloud VPS & Email Server',
          desc: 'Chỉ tiêu doanh số ký mới hạ tầng máy chủ ảo Cloud VPS và giải pháp Email Doanh nghiệp',
          unit: 'tỷ', target: 140, weight: 25, linkTo: 'dk_sales_rev', owner: 'Trần Quốc Huy', source: 'CRM Tenten'
        }),
        kpi({
          name: 'Số hợp đồng ký mới (Trần Quốc Huy)',
          desc: 'Số lượng hợp đồng khách hàng doanh nghiệp ký kết trong năm',
          unit: 'HĐ', target: 120, weight: 15, linkTo: 'dk_sales_deal', owner: 'Trần Quốc Huy', source: 'CRM Tenten'
        })
      ]
    }),

    // --- CUSTOMER SUCCESS ---
    E({
      id: 'emp_ha', name: 'Trần Thu Hà', title: 'Trưởng Customer Success', role: 'manager', deptId: 'd_cs',
      iidLinks: [{ kpiId: 'iid_nrr', weight: 20 }, { kpiId: 'iid_churn', weight: 10 }], deptLinks: [{ kpiId: 'dk_cs_upsell', weight: 20 }, { kpiId: 'dk_cs_ret', weight: 20 }],
      kpis: [
        kpi({ name: 'Số tài khoản có kế hoạch thành công', unit: 'TK', target: 120, weight: 30, type: 'activity', linkTo: 'dk_cs_ret', owner: 'Trần Thu Hà', source: 'CRM' })
      ]
    }),
    E({
      id: 'emp_anh', name: 'Vũ Đức Anh', title: 'CS Lead', role: 'leader', deptId: 'd_cs',
      iidLinks: [{ kpiId: 'iid_churn', weight: 25 }], deptLinks: [{ kpiId: 'dk_cs_ret', weight: 25 }, { kpiId: 'dk_cs_csat', weight: 15 }],
      kpis: [
        kpi({ name: 'Upsell danh mục CS Team', unit: 'tỷ', target: 150, weight: 20, linkTo: 'dk_cs_upsell', owner: 'Vũ Đức Anh', source: 'Billing' }),
        kpi({ name: 'Số QBR với khách hàng', unit: 'buổi', target: 48, type: 'activity', weight: 15, linkTo: 'dk_cs_ret', owner: 'Vũ Đức Anh', source: 'Lịch làm việc' })
      ]
    }),

    // --- MARKETING ---
    E({
      id: 'emp_nam', name: 'Lê Hoàng Nam', title: 'Trưởng Marketing', role: 'manager', deptId: 'd_mkt',
      iidLinks: [{ kpiId: 'iid_rev', weight: 25 }], deptLinks: [{ kpiId: 'dk_mkt_mql', weight: 25 }, { kpiId: 'dk_mkt_pipe', weight: 25 }],
      kpis: [
        kpi({ name: 'ROI chiến dịch', unit: 'lần', target: 5, aggregation: 'avg', weight: 25, linkTo: 'dk_mkt_pipe', owner: 'Lê Hoàng Nam', source: 'Báo cáo Marketing' })
      ]
    }),
    E({
      id: 'emp_linh', name: 'Hoàng Mai Linh', title: 'Content Lead', role: 'leader', deptId: 'd_mkt',
      iidLinks: [], deptLinks: [{ kpiId: 'dk_mkt_mql', weight: 30 }, { kpiId: 'dk_mkt_content', weight: 30 }],
      kpis: [
        kpi({ name: 'Số bài viết xuất bản', unit: 'bài', target: 240, type: 'activity', weight: 25, linkTo: 'dk_mkt_content', owner: 'Hoàng Mai Linh', source: 'CMS' }),
        kpi({ name: 'Lượt truy cập organic', unit: 'nghìn', target: 600, weight: 15, linkTo: 'dk_mkt_mql', owner: 'Hoàng Mai Linh', source: 'GA4' })
      ]
    }),

    // --- VẬN HÀNH & KỸ THUẬT ---
    E({
      id: 'emp_bao', name: 'Phạm Quốc Bảo', title: 'Trưởng Vận hành', role: 'manager', deptId: 'd_ops',
      iidLinks: [{ kpiId: 'iid_gm', weight: 25 }], deptLinks: [{ kpiId: 'dk_ops_uptime', weight: 25 }, { kpiId: 'dk_ops_cost', weight: 20 }],
      kpis: [
        kpi({ name: 'Tiết kiệm chi phí hạ tầng', unit: 'tỷ', target: 12, weight: 30, linkTo: 'dk_ops_cost', owner: 'Phạm Quốc Bảo', source: 'Báo cáo chi phí' })
      ]
    }),
    E({
      id: 'emp_son', name: 'Ngô Thanh Sơn', title: 'SRE Lead', role: 'leader', deptId: 'd_ops',
      iidLinks: [{ kpiId: 'iid_churn', weight: 20 }], deptLinks: [{ kpiId: 'dk_ops_uptime', weight: 25 }, { kpiId: 'dk_ops_mttr', weight: 25 }],
      kpis: [
        kpi({ name: 'Số sự cố P1', unit: 'sự cố', target: 12, direction: 'down', weight: 20, linkTo: 'dk_ops_uptime', owner: 'Ngô Thanh Sơn', source: 'Jira Service' }),
        kpi({ name: 'Tự động hóa runbook', unit: 'runbook', target: 24, weight: 10, linkTo: 'dk_ops_mttr', owner: 'Ngô Thanh Sơn', source: 'Git' })
      ]
    })
  ];
  emps.forEach((e, i) => e.kpis.forEach(k => { k.monthly = genMonthly(k, rnd, 9, (i % 3 - 1) * 0.04); }));

  // 4. Danh sách tài khoản người dùng đăng nhập
  const users = [
    { id: 'u_admin', name: 'Giám đốc Khối IID', email: 'director.iid@gmo.vn', password: 'password123', role: 'admin', title: 'Giám đốc Khối IID', deptId: null, empId: null },
    { id: 'u_mgr_sales', name: 'Nguyễn Minh Tuấn', email: 'tuan.nm@gmo.vn', password: 'password123', role: 'manager', title: 'Trưởng phòng Kinh doanh', deptId: 'd_sales', empId: 'emp_tuan' },
    { id: 'u_mgr_cs', name: 'Trần Thu Hà', email: 'ha.tt@gmo.vn', password: 'password123', role: 'manager', title: 'Trưởng Customer Success', deptId: 'd_cs', empId: 'emp_ha' },
    { id: 'u_mgr_mkt', name: 'Lê Hoàng Nam', email: 'nam.lh@gmo.vn', password: 'password123', role: 'manager', title: 'Trưởng Marketing', deptId: 'd_mkt', empId: 'emp_nam' },
    { id: 'u_mgr_ops', name: 'Phạm Quốc Bảo', email: 'bao.pq@gmo.vn', password: 'password123', role: 'manager', title: 'Trưởng Vận hành', deptId: 'd_ops', empId: 'emp_bao' },
    { id: 'u_lead_cs', name: 'Vũ Đức Anh', email: 'anh.vd@gmo.vn', password: 'password123', role: 'leader', title: 'CS Lead', deptId: 'd_cs', empId: 'emp_anh' },
    { id: 'u_lead_mkt', name: 'Hoàng Mai Linh', email: 'linh.hm@gmo.vn', password: 'password123', role: 'leader', title: 'Content Lead', deptId: 'd_mkt', empId: 'emp_linh' },
    { id: 'u_lead_ops', name: 'Ngô Thanh Sơn', email: 'son.nt@gmo.vn', password: 'password123', role: 'leader', title: 'SRE Lead', deptId: 'd_ops', empId: 'emp_son' },
    { id: 'u_staff_lan', name: 'Đỗ Thị Lan', email: 'lan.dt@gmo.vn', password: 'password123', role: 'staff', title: 'Account Executive', deptId: 'd_sales', empId: 'emp_lan' },
    { id: 'u_staff_huy', name: 'Trần Quốc Huy', email: 'huy.tq@gmo.vn', password: 'password123', role: 'staff', title: 'Senior Sales Rep', deptId: 'd_sales', empId: 'emp_huy' }
  ];

  return {
    version: 3,
    year: 2027,
    currentMonth: 9,
    currentUserId: 'u_admin', // mặc định là Admin
    users,
    iid,
    depts,
    emps,
    reviews: {}
  };
}
