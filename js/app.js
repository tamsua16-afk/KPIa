/* =========================================================
   KPI 2027 – Khối IID : Logic ứng dụng
   - Phân quyền 4 cấp nghiêm ngặt (Data Scoping & Privacy):
     + Admin (Giám đốc Khối): Xem & quản trị toàn bộ
     + Manager (Trưởng Bộ phận): Chỉ quản lý trong phạm vi Bộ phận của mình
     + Leader (Trưởng nhóm): Quản lý nhóm & thành viên trực thuộc
     + Staff (Nhân viên): Chỉ xem KPI của mình, bảng nhập liệu của mình,
       review của mình và mục tiêu chung phòng ban để đóng góp
   - Xác thực Email & Mật khẩu (Authentication & Change Password):
     + Cấp tài khoản theo Email + Mật khẩu
     + Cá nhân tự đổi mật khẩu được
     + Admin có quyền reset mật khẩu
     + Màn hình đăng nhập & Đăng xuất
   - Tự động tổng hợp KPI (Auto Roll-up: Staff → Bộ phận → Khối)
   - Lưu trữ localStorage, xuất / nhập JSON
   ========================================================= */
(() => {
  'use strict';

  const STORE = 'kpi2027_iid_v5';
  const ADMIN_ORIGIN_KEY = 'kpi2027_admin_origin';
  const REVIEW_STATUS = [
    ['todo', 'Chưa bắt đầu', ''],
    ['self', 'Đã tự đánh giá', 'warn'],
    ['mgr', 'Quản lý đã review', 'iid'],
    ['done', 'Đã chốt', 'good']
  ];
  const RATING_COLOR = { A: '#10b981', B: '#0068b7', C: '#f59e0b', D: '#ef4444', NA: '#94a3b8' };

  /* ---------- Helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sum = a => a.reduce((x, y) => x + (+y || 0), 0);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const isNum = v => v !== null && v !== '' && v !== undefined && !isNaN(v);
  const fmt = (n, d = 2) => (n === null || n === undefined || isNaN(n)) ? '–' : (+n).toLocaleString('vi-VN', { maximumFractionDigits: d });
  const pctTxt = p => p === null || p === undefined ? '–' : fmt(p, 1) + '%';
  const fmtShort = v => v >= 1000 ? fmt(v / 1000, 1) + 'k' : fmt(v, v < 10 ? 2 : 0);
  const inRange = (v, [lo, hi]) => v >= lo - 1e-9 && v <= hi + 1e-9;
  const qOf = m => Math.ceil(m / 3);

  /* ---------- State ---------- */
  let S = load();
  const UI = {
    view: 'dashboard', selDept: null, selEmp: null, empFilter: 'all',
    trackLevel: 'iid', trackDept: null, trackEmp: null,
    reviewQ: null, reviewFilter: 'all'
  };

  function valid(d) { return d && Array.isArray(d.iid) && Array.isArray(d.depts) && Array.isArray(d.emps); }
  function normKpi(k) {
    const m = Array.isArray(k.monthly) ? k.monthly.slice(0, 12) : [];
    while (m.length < 12) m.push(null);
    k.monthly = m.map(v => isNum(v) ? +v : null);
    k.weight = +k.weight || 0; k.target = +k.target || 0;
    k.rollupMode = k.rollupMode || 'manual';
    return k;
  }
  function normalize(d) {
    d.version = 5;
    d.reviews = d.reviews || {};
    d.currentMonth = clamp(+d.currentMonth || 1, 1, 12);
    if (!Array.isArray(d.selectedMonths) || !d.selectedMonths.length) {
      d.selectedMonths = [];
      for (let i = 1; i <= d.currentMonth; i++) d.selectedMonths.push(i);
    } else {
      d.selectedMonths = d.selectedMonths.map(Number).filter(m => m >= 1 && m <= 12).sort((a, b) => a - b);
      if (!d.selectedMonths.length) d.selectedMonths = [d.currentMonth];
    }
    d.users = d.users || [];
    d.users.forEach(u => { u.password = u.password || 'password123'; });
    d.currentUserId = d.currentUserId || (d.users[0]?.id || 'u_admin');
    d.iid.forEach(normKpi);
    d.depts.forEach(x => { x.iidLinks = x.iidLinks || []; x.kpis = (x.kpis || []).map(normKpi); });
    d.emps.forEach(x => { x.iidLinks = x.iidLinks || []; x.deptLinks = x.deptLinks || []; x.kpis = (x.kpis || []).map(normKpi); });
    return d;
  }
  function isImpersonating() {
    return false;
  }

  function load() {
    try {
      ['kpi2027_iid_v4', 'kpi2027_iid_v3', 'kpi2027_iid_v2', 'kpi2027_iid_v1', 'kpi2027_admin_origin', 'kpi2027_admin_impersonating'].forEach(k => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const d = JSON.parse(raw);
        if (valid(d)) return normalize(d);
      }
    } catch (e) { /* ignore */ }
    return normalize(typeof buildCleanData === 'function' ? buildCleanData() : buildSampleData());
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { toast('Không lưu được dữ liệu vào trình duyệt', true); }
    updateBadge();
    updateUserWidget();
  }

  /* ---------- Phân quyền & Giới hạn dữ liệu (RBAC Data Scoping) ---------- */
  function curUser() {
    return S.users.find(u => u.id === S.currentUserId) || S.users[0] || {
      id: 'u_admin', name: 'Giám đốc Khối', email: 'director.iid@gmo.vn', password: 'password123', role: 'admin', title: 'Giám đốc Khối'
    };
  }
  const roleOf = u => ROLES[u?.role] || ROLES.staff;
  const isAdm = () => curUser().role === 'admin';
  const isMgr = (deptId) => isAdm() || (curUser().role === 'manager' && (!deptId || curUser().deptId === deptId));
  const isStaff = () => curUser().role === 'staff';

  function getVisibleDepts() {
    const u = curUser();
    if (u.role === 'admin') return S.depts;
    if (u.deptId) return S.depts.filter(d => d.id === u.deptId);
    return S.depts;
  }

  function getVisibleEmps() {
    const u = curUser();
    if (u.role === 'admin') return S.emps;
    if (u.role === 'manager') return S.emps.filter(e => e.deptId === u.deptId);
    if (u.role === 'leader') return S.emps.filter(e => e.deptId === u.deptId);
    if (u.role === 'staff') return S.emps.filter(e => e.id === u.empId);
    return [];
  }

  function canManageIid() { return isAdm(); }
  function canManageDept(deptId) { return isAdm() || (curUser().role === 'manager' && curUser().deptId === deptId); }
  function canManageEmp(empId) {
    if (isAdm()) return true;
    const e = empById(empId);
    if (!e) return false;
    if (curUser().role === 'manager' && curUser().deptId === e.deptId) return true;
    return curUser().empId === empId;
  }
  function canEditKpi(scope, eid) {
    if (scope === 'iid') return isAdm();
    if (scope === 'dept') return canManageDept(eid);
    return canManageEmp(eid);
  }
  function canInputMonthly(scope, eid, kid) {
    const k = container(scope, eid)?.find(x => x.id === kid);
    if (k && k.rollupMode && k.rollupMode !== 'manual') return false;
    if (scope === 'iid') return isAdm();
    if (scope === 'dept') return canManageDept(eid);
    if (scope === 'emp') {
      if (isAdm()) return true;
      const e = empById(eid);
      if (!e) return false;
      if (curUser().empId === eid) return true;
      if (curUser().role === 'manager' && curUser().deptId === e.deptId) return true;
      if (curUser().role === 'leader' && curUser().deptId === e.deptId) return true;
    }
    return false;
  }
  function canReviewSelf(type, eid) {
    if (isAdm()) return true;
    if (type === 'dept') return curUser().role === 'manager' && curUser().deptId === eid;
    return curUser().empId === eid || (curUser().role === 'manager' && deptById(empById(eid)?.deptId)?.id === curUser().deptId);
  }
  function canReviewMgr(type, eid) {
    if (isAdm()) return true;
    if (type === 'emp') {
      const e = empById(eid);
      return curUser().role === 'manager' && curUser().deptId === e?.deptId;
    }
    return false;
  }
  function canFinalizeReview() { return isAdm(); }

  /* ---------- Auto Roll-up Engine ---------- */
  function computeRollups() {
    S.depts.forEach(d => {
      d.kpis.forEach(k => {
        if (!k.rollupMode || k.rollupMode === 'manual') return;
        const linkedEmpsKpi = [];
        S.emps.filter(e => e.deptId === d.id).forEach(e => {
          e.kpis.filter(ek => ek.linkTo === k.id).forEach(ek => linkedEmpsKpi.push(ek));
        });
        if (!linkedEmpsKpi.length) return;

        if (k.rollupMode === 'rollup_sum') k.target = sum(linkedEmpsKpi.map(x => x.target));
        else if (k.rollupMode === 'rollup_avg') k.target = Math.round(sum(linkedEmpsKpi.map(x => x.target)) / linkedEmpsKpi.length * 100) / 100;

        for (let m = 0; m < 12; m++) {
          const vals = linkedEmpsKpi.map(x => x.monthly[m]).filter(isNum).map(Number);
          if (!vals.length) k.monthly[m] = null;
          else if (k.rollupMode === 'rollup_sum') k.monthly[m] = Math.round(sum(vals) * 100) / 100;
          else if (k.rollupMode === 'rollup_avg') k.monthly[m] = Math.round(sum(vals) / vals.length * 100) / 100;
        }
      });
    });

    S.iid.forEach(k => {
      if (!k.rollupMode || k.rollupMode === 'manual') return;
      const linkedDeptKpi = [];
      S.depts.forEach(d => {
        d.kpis.filter(dk => dk.linkTo === k.id).forEach(dk => linkedDeptKpi.push(dk));
      });
      if (!linkedDeptKpi.length) return;

      if (k.rollupMode === 'rollup_sum') k.target = sum(linkedDeptKpi.map(x => x.target));
      else if (k.rollupMode === 'rollup_avg') k.target = Math.round(sum(linkedDeptKpi.map(x => x.target)) / linkedDeptKpi.length * 100) / 100;

      for (let m = 0; m < 12; m++) {
        const vals = linkedDeptKpi.map(x => x.monthly[m]).filter(isNum).map(Number);
        if (!vals.length) k.monthly[m] = null;
        else if (k.rollupMode === 'rollup_sum') k.monthly[m] = Math.round(sum(vals) * 100) / 100;
        else if (k.rollupMode === 'rollup_avg') k.monthly[m] = Math.round(sum(vals) / vals.length * 100) / 100;
      }
    });
  }

  /* ---------- Lookups ---------- */
  const deptById = id => S.depts.find(d => d.id === id);
  const empById = id => S.emps.find(e => e.id === id);
  const getCurEmp = () => {
    const u = curUser();
    if (u.empId) { const e = empById(u.empId); if (e) return e; }
    return S.emps.find(e => e.name.toLowerCase() === u.name.toLowerCase()) || null;
  };
  function findKpi(id) {
    if (!id) return null;
    let k = S.iid.find(x => x.id === id);
    if (k) return { kpi: k, level: 'iid' };
    for (const d of S.depts) { k = d.kpis.find(x => x.id === id); if (k) return { kpi: k, level: 'dept', dept: d }; }
    for (const e of S.emps) { k = e.kpis.find(x => x.id === id); if (k) return { kpi: k, level: 'emp', emp: e }; }
    return null;
  }
  function container(scope, eid) {
    if (scope === 'iid') return S.iid;
    if (scope === 'dept') return deptById(eid)?.kpis;
    return empById(eid)?.kpis;
  }

  /* ---------- Period & Months Filtering Engine ---------- */
  function getSelectedMonths() {
    if (Array.isArray(S?.selectedMonths) && S.selectedMonths.length) {
      return S.selectedMonths.slice().map(Number).sort((a, b) => a - b);
    }
    const cur = clamp(+S?.currentMonth || 1, 1, 12);
    const arr = [];
    for (let i = 1; i <= cur; i++) arr.push(i);
    return arr;
  }

  function resolveMonths(...args) {
    if (!args.length || args[0] === undefined || args[0] === null) {
      return getSelectedMonths();
    }
    if (Array.isArray(args[0])) {
      return args[0].slice().map(Number).sort((a, b) => a - b);
    }
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
      const from = Math.min(+args[0], +args[1]), to = Math.max(+args[0], +args[1]);
      const arr = [];
      for (let i = from; i <= to; i++) arr.push(i);
      return arr;
    }
    if (args.every(isNum)) {
      return args.map(Number).sort((a, b) => a - b);
    }
    return getSelectedMonths();
  }

  function formatMonthsLabel(months) {
    const list = resolveMonths(months);
    if (!list.length) return 'Chưa chọn tháng';
    if (list.length === 12) return 'Tất cả 12 tháng';
    if (list.length === 1) return `Tháng ${list[0]}`;

    // Kiểm tra có phải là 1 Quý chuẩn không
    const isQ = (q, f, t) => list.length === 3 && list[0] === f && list[1] === f + 1 && list[2] === t;
    if (isQ(1, 1, 3)) return 'Quý 1 (T1–T3)';
    if (isQ(2, 4, 6)) return 'Quý 2 (T4–T6)';
    if (isQ(3, 7, 9)) return 'Quý 3 (T7–T9)';
    if (isQ(4, 10, 12)) return 'Quý 4 (T10–T12)';

    // Kiểm tra có liên tục từ T1 không
    let isContigFrom1 = true;
    for (let i = 0; i < list.length; i++) {
      if (list[i] !== i + 1) { isContigFrom1 = false; break; }
    }
    if (isContigFrom1) return `T1 – T${list[list.length - 1]} (${list.length} tháng)`;

    // Kiểm tra có liên tục bất kỳ
    let isContig = true;
    for (let i = 1; i < list.length; i++) {
      if (list[i] !== list[i - 1] + 1) { isContig = false; break; }
    }
    if (isContig) return `T${list[0]} – T${list[list.length - 1]} (${list.length} tháng)`;

    // Rời rạc
    if (list.length <= 4) return list.map(m => 'T' + m).join(', ');
    return `${list.slice(0, 3).map(m => 'T' + m).join(', ')}... (${list.length} tháng)`;
  }

  function isMonthSelected(m) {
    return getSelectedMonths().includes(+m);
  }

  /* ---------- Scoring engine ---------- */
  function actualOf(k, ...args) {
    if (!k) return null;
    const months = resolveMonths(...args);
    const vals = [];
    months.forEach(m => {
      const v = k.monthly?.[m - 1];
      if (isNum(v)) vals.push(+v);
    });
    if (!vals.length) return null;
    if (k.aggregation === 'sum') return sum(vals);
    if (k.aggregation === 'avg') return sum(vals) / vals.length;
    return vals[vals.length - 1];
  }

  function targetOf(k, ...args) {
    if (!k) return 0;
    const months = resolveMonths(...args);
    if (k.aggregation === 'sum') return k.target * (months.length / 12);
    return +k.target || 0;
  }

  function pctOf(k, ...args) {
    if (!k) return null;
    const a = actualOf(k, ...args);
    if (a === null) return null;
    const t = targetOf(k, ...args);
    if (!t) return null;
    const p = k.direction === 'down' ? (a <= 0 ? RULES.cap : t / a * 100) : (a / t * 100);
    return clamp(p, 0, RULES.cap);
  }

  function scoreOf(items, ...args) {
    let sw = 0, s = 0;
    items.forEach(it => {
      if (!it.kpi) return;
      const p = pctOf(it.kpi, ...args);
      if (p === null || !(+it.weight > 0)) return;
      sw += +it.weight;
      s += p * it.weight;
    });
    return sw ? s / sw : null;
  }

  const ytd = () => getSelectedMonths();
  function qRange(q) {
    const Q = QUARTERS[q - 1];
    return [Q.from, Q.to];
  }
  function rating(score) {
    if (score === null || score === undefined) return { code: 'NA', label: 'Chưa có dữ liệu' };
    return RATINGS.find(r => score >= r.min);
  }

  const iidItems = () => S.iid.map(k => ({ kpi: k, weight: k.weight }));
  function deptItems(d) {
    return [
      ...d.iidLinks.map(l => ({ kind: 'iid', kpi: findKpi(l.kpiId)?.kpi, weight: l.weight, kpiId: l.kpiId })),
      ...d.kpis.map(k => ({ kind: 'own', kpi: k, weight: k.weight }))
    ];
  }
  function empItems(e) {
    return [
      ...e.iidLinks.map(l => ({ kind: 'iid', kpi: findKpi(l.kpiId)?.kpi, weight: l.weight, kpiId: l.kpiId })),
      ...e.deptLinks.map(l => ({ kind: 'dept', kpi: findKpi(l.kpiId)?.kpi, weight: l.weight, kpiId: l.kpiId })),
      ...e.kpis.map(k => ({ kind: 'own', kpi: k, weight: k.weight }))
    ];
  }
  const iidScore = (...args) => scoreOf(iidItems(), ...args);
  const deptScore = (d, ...args) => scoreOf(deptItems(d), ...args);
  const empScore = (e, ...args) => scoreOf(empItems(e), ...args);

  /* ---------- Rules engine ---------- */
  function checkRules() {
    const issues = [], oks = [];
    const I = (level, scope, title, msg, nav) => issues.push({ level, scope, title, msg, nav });
    const fieldChecks = (k, sc, nav) => {
      if (!(+k.target > 0) && k.rollupMode === 'manual') I('err', sc, `KPI "${k.name}" chưa có mục tiêu hợp lệ`, 'Mục tiêu năm phải lớn hơn 0.', nav);
      if (!(+k.weight > 0)) I('warn', sc, `KPI "${k.name}" có tỷ trọng 0%`, 'KPI không có tỷ trọng sẽ không được tính điểm.', nav);
    };

    let n0 = issues.length;
    const iw = sum(S.iid.map(k => k.weight));
    const navIid = { view: 'iid' };
    if (!S.iid.length) I('err', 'KPI Tổng IID', 'Chưa có KPI Tổng IID', 'Cần thiết lập KPI cấp Khối.', navIid);
    else if (Math.abs(iw - 100) > .01) I('err', 'KPI Tổng IID', 'Tổng tỷ trọng KPI IID phải bằng 100%', `Hiện tại: ${fmt(iw)}%.`, navIid);
    S.iid.forEach(k => fieldChecks(k, 'KPI Tổng IID', navIid));
    if (issues.length === n0) oks.push(['KPI Tổng IID', `${S.iid.length} KPI · tổng tỷ trọng 100%`]);

    const R = RULES.dept;
    S.depts.forEach(d => {
      n0 = issues.length;
      const nav = { view: 'depts', dept: d.id }, sc = 'Bộ phận: ' + d.name;
      const a = sum(d.iidLinks.map(l => l.weight)), b = sum(d.kpis.map(k => k.weight));
      if (!inRange(a, R.iid)) I('err', sc, `Tỷ trọng nhận từ KPI IID phải trong ${R.iid[0]}–${R.iid[1]}%`, `Hiện tại: ${fmt(a)}%.`, nav);
      if (!inRange(b, R.dept)) I('err', sc, `Tỷ trọng KPI riêng phải trong ${R.dept[0]}–${R.dept[1]}%`, `Hiện tại: ${fmt(b)}%.`, nav);
      if (Math.abs(a + b - 100) > .01) I('err', sc, 'Tổng tỷ trọng phải bằng 100%', `Hiện tại: ${fmt(a + b)}%.`, nav);
      if (!inRange(d.kpis.length, R.deptKpiCount)) I('err', sc, `Số KPI riêng của bộ phận phải từ ${R.deptKpiCount[0]}–${R.deptKpiCount[1]}`, `Hiện có ${d.kpis.length} KPI.`, nav);
      d.kpis.forEach(k => fieldChecks(k, sc, nav));
      if (issues.length === n0) oks.push([sc, `IID ${fmt(a)}% · riêng ${fmt(b)}% · ${d.kpis.length} KPI`]);
    });

    const E = RULES.emp;
    S.emps.forEach(e => {
      n0 = issues.length;
      const nav = { view: 'emps', emp: e.id }, sc = 'Cá nhân: ' + e.name;
      const d = deptById(e.deptId);
      if (!d) I('err', sc, 'Nhân sự chưa thuộc bộ phận nào', 'Gán nhân sự vào một bộ phận để cascade KPI.', nav);
      const a = sum(e.iidLinks.map(l => l.weight)), b = sum(e.deptLinks.map(l => l.weight)), c = sum(e.kpis.map(k => k.weight));
      const cnt = e.iidLinks.length + e.deptLinks.length + e.kpis.length;
      if (!inRange(a, E.iid)) I('err', sc, `Tỷ trọng KPI IID phải trong ${E.iid[0]}–${E.iid[1]}%`, `Hiện tại: ${fmt(a)}%.`, nav);
      if (!inRange(b, E.dept)) I('err', sc, `Tỷ trọng KPI Bộ phận phải trong ${E.dept[0]}–${E.dept[1]}%`, `Hiện tại: ${fmt(b)}%.`, nav);
      if (!inRange(c, E.own)) I('err', sc, `Tỷ trọng KPI riêng phải trong ${E.own[0]}–${E.own[1]}%`, `Hiện tại: ${fmt(c)}%.`, nav);
      if (Math.abs(a + b + c - 100) > .01) I('err', sc, 'Tổng tỷ trọng phải bằng 100%', `Hiện tại: ${fmt(a + b + c)}%.`, nav);
      if (cnt > E.maxKpi) I('err', sc, `Tối đa ${E.maxKpi} KPI / cá nhân`, `Hiện có ${cnt} KPI.`, nav);
      e.kpis.forEach(k => fieldChecks(k, sc, nav));
      if (issues.length === n0) oks.push([sc, `IID ${fmt(a)}% · BP ${fmt(b)}% · riêng ${fmt(c)}% · ${cnt} KPI`]);
    });

    return {
      issues, oks,
      errors: issues.filter(i => i.level === 'err').length,
      warns: issues.filter(i => i.level === 'warn').length
    };
  }
  function updateBadge() {
    const r = checkRules(), b = $('#rules-badge');
    if (!b) return;
    b.textContent = r.errors ? r.errors : '✓';
    b.classList.toggle('ok', !r.errors);
  }

  /* ---------- User Widget & Navigation Scoping ---------- */
  function updateUserWidget() {
    const u = curUser();
    const r = roleOf(u);
    const topName = $('#current-user-name');
    if (topName) topName.textContent = u.name;
    const topAvatar = $('#current-user-avatar');
    if (topAvatar) topAvatar.textContent = userInitials(u);
    const topRole = $('#current-user-role');
    if (topRole) topRole.innerHTML = `<span class="role-pill ${r.id}">${r.badge}</span>`;

    const sbName = $('#sidebar-user-name');
    if (sbName) sbName.textContent = u.name;
    const sbAvatar = $('#sidebar-user-avatar');
    if (sbAvatar) sbAvatar.textContent = userInitials(u);
    const sbRole = $('#sidebar-user-role');
    if (sbRole) sbRole.innerHTML = `<span class="role-pill ${r.id}">${r.badge}</span>`;

    const show = (sel, on) => { const el = $(sel); if (el) el.style.display = on ? '' : 'none'; };
    show('#nav-users', isAdm());
    show('#nav-sep-admin', isAdm());
    show('#nav-rules', u.role !== 'staff');
    show('#nav-cascade', u.role !== 'staff');
    show('#btn-export', isAdm());
    show('#btn-import', isAdm());
    show('#btn-reset', isAdm());

    const navEmps = $('#nav-emps');
    if (navEmps) navEmps.innerHTML = `<i>③</i>${u.role === 'staff' ? 'KPI của tôi' : 'KPI Cá nhân'}`;
    const navDepts = $('#nav-depts');
    if (navDepts) navDepts.innerHTML = `<i>②</i>${u.role === 'staff' ? 'Bộ phận của tôi' : 'KPI Bộ phận'}`;
  }

  function joinUserAsAdmin(uid) {
    const target = S.users.find(u => u.id === uid);
    if (!target) return;
    try { localStorage.removeItem(ADMIN_ORIGIN_KEY); } catch (_) {}
    S.currentUserId = uid;
    UI.selDept = target.deptId || null;
    UI.selEmp = target.empId || null;
    save();
    navigate('dashboard');
    toast(`Đang xem góc nhìn của: ${target.name} (${roleOf(target).badge})`);
  }

  function exitImpersonate() {
    try { localStorage.removeItem(ADMIN_ORIGIN_KEY); } catch (_) {}
    S.currentUserId = 'u_admin';
    UI.selDept = UI.selEmp = null;
    save();
    navigate('dashboard');
    toast('✅ Đã quay lại quyền Admin (Giám đốc Khối)');
  }

  /* ---------- UI atoms ---------- */
  function chip(score) {
    const r = rating(score);
    return `<span class="chip r-${r.code}">${r.code === 'NA' ? '–' : r.code} · ${r.label}</span>`;
  }
  function ring(score, lg = false) {
    const r = rating(score);
    return `<div class="ring ${lg ? 'lg' : ''}" style="--p:${score === null ? 0 : Math.min(score, 100)};--c:${RATING_COLOR[r.code]}"><span>${score === null ? '–' : fmt(score, 0)}</span></div>`;
  }
  function pctBar(p) {
    const c = RATING_COLOR[rating(p).code];
    return `<div class="row"><div class="bar" style="flex:1"><span style="width:${p === null ? 0 : Math.min(p, 100)}%;background:${c}"></span></div><b class="small" style="min-width:50px;text-align:right">${pctTxt(p)}</b></div>`;
  }
  function wordInitials(words) { return words.slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
  const letterWords = s => String(s).split(/\s+/).filter(w => /^\p{L}/u.test(w));
  const deptInitials = d => { const w = letterWords(d.name); return w.length > 1 ? wordInitials(w) : (w[0] || '?').slice(0, 2).toUpperCase(); };
  const empInitials = e => { const w = letterWords(e.name); return w.length > 1 ? wordInitials(w.slice(-2)) : (w[0] || '?').slice(0, 2).toUpperCase(); };
  const userInitials = u => {
    if (!u) return '?';
    if (u.id === 'u_admin' || u.role === 'admin') return 'AD';
    const w = letterWords(u.name || '');
    return w.length > 1 ? wordInitials(w.slice(-2)) : (u.name || '?').slice(0, 2).toUpperCase();
  };
  const empColor = e => deptById(e?.deptId)?.color || '#0068b7';
  const avatar = (txt, color = '#0068b7', size = 44) => {
    let c = String(color || '#0068b7').trim();
    if (c.startsWith('var(') || !c) c = '#0068b7';
    return `<div class="avatar" style="background:${c};color:#ffffff;width:${size}px;height:${size}px;min-width:${size}px;min-height:${size}px;font-size:${size < 40 ? 12 : 14}px;border-radius:${size < 40 ? 9 : 12}px;display:grid;place-items:center;font-weight:800;flex-shrink:0">${esc(txt)}</div>`;
  };
  const typeTag = k => `<span class="tag ${k.type}">${k.type === 'activity' ? 'Hoạt động' : 'Kết quả'}</span>`;
  const dirTxt = k => k.direction === 'down' ? '↓ càng thấp càng tốt' : '↑ càng cao càng tốt';
  const rollupBadge = k => {
    if (!k.rollupMode || k.rollupMode === 'manual') return '';
    return `<span class="rollup-tag ${k.rollupMode === 'rollup_sum' ? 'sum' : ''}" title="${ROLLUP_MODES[k.rollupMode]}">${k.rollupMode === 'rollup_sum' ? '⚡ Tổng SUM' : '⚡ TB AVG'}</span>`;
  };

  function weightStat(label, val, range, extra = '') {
    const ok = range ? inRange(val, range) : Math.abs(val - 100) < .01;
    const rng = range ? `${range[0]}–${range[1]}%` : '= 100%';
    return `<div class="wstat">
      <div class="row small"><span class="muted">${label}</span><span class="spacer"></span><b>${fmt(val)}%</b><span class="tag ${ok ? 'good' : 'bad'}">${rng}</span></div>
      <div class="bar mt-s"><span style="width:${Math.min(val, 100)}%;background:${ok ? 'var(--g-brand)' : 'var(--red)'}"></span></div>${extra}
    </div>`;
  }
  function countStat(label, val, range) {
    const ok = inRange(val, range);
    const rng = range[0] === 0 ? `≤ ${range[1]}` : `${range[0]}–${range[1]}`;
    return `<div class="wstat">
      <div class="row small"><span class="muted">${label}</span><span class="spacer"></span><b>${val}</b><span class="tag ${ok ? 'good' : 'bad'}">${rng}</span></div>
      <div class="bar mt-s"><span style="width:${Math.min(val / range[1] * 100, 100)}%;background:${ok ? 'var(--g-brand)' : 'var(--red)'}"></span></div>
    </div>`;
  }

  /* ---------- Chart (SVG) ---------- */
  function chartSVG(k) {
    const W = 640, H = 220, P = { l: 46, r: 12, t: 14, b: 26 };
    const mt = k.aggregation === 'sum' ? k.target / 12 : +k.target;
    const vals = k.monthly.map(v => isNum(v) ? +v : null);
    const max = (Math.max(mt, ...vals.filter(v => v !== null)) * 1.15) || 1;
    const iw = W - P.l - P.r, ih = H - P.t - P.b, bw = iw / 12;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = P.t + ih * i / 4;
      g += `<line class="grid-line" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/><text x="${P.l - 6}" y="${y + 3}" text-anchor="end">${fmtShort(max * (1 - i / 4))}</text>`;
    }
    vals.forEach((v, i) => {
      const x = P.l + bw * i + bw * .2, w = bw * .6;
      if (v !== null) {
        const h = Math.max(ih * v / max, 1);
        const ok = k.direction === 'down' ? v <= mt : v >= mt;
        g += `<rect class="bar-actual" x="${x}" y="${P.t + ih - h}" width="${w}" height="${h}" rx="4" fill="${ok ? 'url(#gOk)' : 'url(#gBad)'}" opacity="${isMonthSelected(i + 1) ? 1 : .3}"><title>${MONTHS[i]}: ${fmt(v)} ${esc(k.unit)} (mục tiêu tháng ${fmt(mt)})</title></rect>`;
      }
      g += `<text x="${P.l + bw * i + bw / 2}" y="${H - 8}" text-anchor="middle" style="${isMonthSelected(i + 1) ? 'font-weight:700;fill:var(--primary)' : 'fill:var(--muted)'}">${MONTHS[i]}</text>`;
    });
    const ty = P.t + ih - ih * mt / max;
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${ty}" y2="${ty}" stroke="var(--orange)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    g += `<text x="${W - P.r}" y="${ty - 5}" text-anchor="end" style="fill:var(--orange)">Mục tiêu/tháng ${fmtShort(mt)}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ ${esc(k.name)}">
      <defs>
        <linearGradient id="gOk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26a5e4"/><stop offset="1" stop-color="#0068b7"/></linearGradient>
        <linearGradient id="gBad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#ef4444"/></linearGradient>
      </defs>${g}</svg>`;
  }

  /* ---------- KPI items table ---------- */
  function itemsTable(groups, period, scope, eid) {
    let rows = '';
    const canEdit = canEditKpi(scope, eid);
    const months = resolveMonths(period);
    groups.forEach(g => {
      rows += `<tr class="group-row"><td colspan="9">${g.title} · ${fmt(sum(g.items.map(i => i.weight)))}%</td></tr>`;
      if (!g.items.length) rows += `<tr><td colspan="9" class="muted small">Chưa có KPI trong nhóm này</td></tr>`;
      g.items.forEach(it => {
        const k = it.kpi;
        if (!k) {
          rows += `<tr><td><span class="tag bad">Lỗi</span></td><td colspan="7" class="muted">Liên kết tới KPI không còn tồn tại</td><td class="num">${canEdit ? it.actions || '' : ''}</td></tr>`;
          return;
        }
        const p = pctOf(k, months), a = actualOf(k, months);
        rows += `<tr>
          <td class="col-source"><span class="tag ${g.cls}">${g.tag}</span></td>
          <td class="kpi-col-cell">
            <div class="kpi-name">${esc(k.name)} ${rollupBadge(k)}</div>
            ${k.desc ? `<div class="kpi-desc">${esc(k.desc)}</div>` : ''}
            <div class="kpi-meta">${typeTag(k)} <span>👤 ${esc(k.owner || '—')}</span> · <span>📁 ${esc(k.source || '—')}</span></div>
          </td>
          <td class="num col-target"><b>${fmt(k.target)}</b> <span class="muted small">${esc(k.unit)}</span></td>
          <td class="num col-weight"><b>${fmt(it.weight)}%</b></td>
          <td class="col-link">${it.link || '<span class="muted small">—</span>'}</td>
          <td class="num col-actual"><b>${fmt(a)}</b> <span class="muted small">${esc(k.unit)}</span></td>
          <td class="col-pct">${pctBar(p)}</td>
          <td class="col-rating">${chip(p)}</td>
          <td class="num col-act">${canEdit ? (it.actions || '') : ''}</td>
        </tr>`;
      });
    });
    return `<div class="table-wrap"><table class="kpi-table">
      <colgroup>
        <col style="width: 76px">
        <col style="min-width: 320px; width: 34%">
        <col style="width: 120px">
        <col style="width: 90px">
        <col style="width: 150px">
        <col style="width: 125px">
        <col style="width: 160px">
        <col style="width: 135px">
        <col style="width: 65px">
      </colgroup>
      <thead><tr>
        <th class="col-source">Nguồn</th>
        <th class="col-kpi">KPI & Mô tả mục tiêu</th>
        <th class="num col-target">Mục tiêu năm</th>
        <th class="num col-weight">Tỷ trọng</th>
        <th class="col-link">Liên kết lên</th>
        <th class="num col-actual">Thực tế YTD</th>
        <th class="col-pct">% hoàn thành</th>
        <th class="col-rating">Đánh giá</th>
        <th class="col-act"></th>
      </tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }
  const kpiActions = (scope, eid, kid) =>
    `<button class="icon-btn" title="Sửa" data-action="edit-kpi" data-scope="${scope}" data-eid="${eid || ''}" data-kid="${kid}">✎</button>` +
    `<button class="icon-btn del" title="Xóa" data-action="del-kpi" data-scope="${scope}" data-eid="${eid || ''}" data-kid="${kid}">🗑</button>`;
  const linkName = id => { const f = findKpi(id); return f ? `<span class="tag ${f.level}">${esc(f.kpi.name)}</span>` : (id ? '<span class="tag bad">Không tồn tại</span>' : ''); };

  /* =========================================================
     VIEWS TÙY BIẾN THEO VAI TRÒ
     ========================================================= */
  const VIEWS = {
    dashboard: ['Tổng quan', 'Bảng điều khiển theo dõi tiến độ mục tiêu'],
    iid: ['① KPI Tổng IID', 'Mục tiêu cấp Khối – điểm xuất phát của toàn bộ hệ thống KPI'],
    depts: ['② KPI Bộ phận', 'Mục tiêu cấp bộ phận & liên kết cascade'],
    emps: ['③ KPI Cá nhân', 'Thiết lập & theo dõi mục tiêu cá nhân'],
    tracking: ['Theo dõi hàng tháng', 'Nhập số liệu thực tế theo tháng & tự động Roll-up'],
    review: ['Review hàng quý', 'Tự đánh giá → Quản lý review → Chốt kết quả theo quý'],
    cascade: ['Cây liên kết KPI', 'Kiểm tra liên kết đa chiều: Cascade mục tiêu & Roll-up thực tế'],
    rules: ['Kiểm tra nguyên tắc', 'Rà soát tỷ trọng, số lượng KPI và liên kết theo quy định'],
    users: ['Phân quyền & Người dùng', 'Quản lý tài khoản, mật khẩu & phân cấp quản lý']
  };

  /* ---------- Dashboard ---------- */
  function viewDashboard() {
    const P = ytd(), m = S.currentMonth, curQ = qOf(m);
    const u = curUser(), r = roleOf(u);

    // ==========================================
    // GÓC NHÌN TỔNG QUAN CHO CÁC VAI TRÒ (NGOẠI TRỪ ADMIN: MANAGER, LEADER, STAFF)
    // Công thức: KPI = KPI Khối + KPI Bộ phận + KPI Cá nhân (Tổng trọng số chuẩn là 100 điểm)
    // Tổng quan chỉ hiển thị kết quả 3 trụ cột & thanh tiến độ. Bấm vào từng trụ cột mới mở ra xem chi tiết!
    // ==========================================
    if (u.role !== 'admin') {
      const myEmp = getCurEmp();
      if (!myEmp) {
        return `<section class="card empty" style="padding:48px 24px;text-align:center">
          <div style="font-size:42px;margin-bottom:12px">👤</div>
          <h3>Chưa tìm thấy hồ sơ nhân sự liên kết</h3>
          <p class="muted">Tài khoản <b>${esc(u.name)}</b> (${esc(u.email)}) chưa được gắn với mã nhân sự nào trong hệ thống.</p>
          <div class="row mt" style="justify-content:center">
            <button class="btn ghost" data-action="change-pwd-modal">🔑 Đổi mật khẩu</button>
          </div>
        </section>`;
      }

      const myDept = deptById(myEmp.deptId) || (u.deptId ? deptById(u.deptId) : null);

      // 1. KPI Khối (IID)
      const itemsIid = myEmp.iidLinks.map(l => ({ kind: 'iid', kpi: findKpi(l.kpiId)?.kpi, weight: +l.weight || 0, kpiId: l.kpiId }));
      const wIid = sum(itemsIid.map(x => x.weight));
      const pctIid = scoreOf(itemsIid, ...P);
      const ptsIid = (pctIid !== null && wIid > 0) ? Math.round((pctIid * wIid / 100) * 10) / 10 : (wIid === 0 ? 0 : null);

      // 2. KPI Bộ phận
      const itemsDept = myEmp.deptLinks.map(l => ({ kind: 'dept', kpi: findKpi(l.kpiId)?.kpi, weight: +l.weight || 0, kpiId: l.kpiId }));
      const wDept = sum(itemsDept.map(x => x.weight));
      const pctDept = scoreOf(itemsDept, ...P);
      const ptsDept = (pctDept !== null && wDept > 0) ? Math.round((pctDept * wDept / 100) * 10) / 10 : (wDept === 0 ? 0 : null);

      // 3. KPI Cá nhân
      const itemsOwn = myEmp.kpis.map(k => ({ kind: 'own', kpi: k, weight: +k.weight || 0 }));
      const wOwn = sum(itemsOwn.map(x => x.weight));
      const pctOwn = scoreOf(itemsOwn, ...P);
      const ptsOwn = (pctOwn !== null && wOwn > 0) ? Math.round((pctOwn * wOwn / 100) * 10) / 10 : (wOwn === 0 ? 0 : null);

      // Tổng điểm (Chuẩn 100 điểm)
      const totalSetPts = Math.round((wIid + wDept + wOwn) * 10) / 10 || 100;
      const validEarned = (ptsIid || 0) + (ptsDept || 0) + (ptsOwn || 0);
      const totalEarnedPts = Math.round(validEarned * 10) / 10;
      const overallPct = totalSetPts > 0 ? Math.round((totalEarnedPts / totalSetPts * 100) * 10) / 10 : null;
      const rat = rating(overallPct);

      // Trạng thái review quý
      const myRev = S.reviews[reviewKey('emp', myEmp.id, curQ)] || { status: 'todo' };
      const st = REVIEW_STATUS.find(x => x[0] === myRev.status) || REVIEW_STATUS[0];

      // Role badge info
      const roleMap = {
        manager: { label: '💼 Manager (Trưởng bộ phận)', pillClass: 'manager' },
        leader: { label: '⭐ Leader (Trưởng nhóm)', pillClass: 'leader' },
        staff: { label: '👤 Nhân viên', pillClass: 'staff' }
      };
      const curRoleInfo = roleMap[u.role] || roleMap.staff;

      // Danh sách thành viên nếu là Manager hoặc Leader
      const deptMembers = (u.role === 'manager' || u.role === 'leader') && myDept
        ? S.emps.filter(e => e.deptId === myDept.id)
        : [];
      const empRows = deptMembers.map(e => ({ e, s: empScore(e, ...P) })).sort((a, b) => b.s - a.s);

      return `
      <section class="card dash-head">
        <div style="min-width:0">
          <div class="small muted">
            <span class="role-pill ${curRoleInfo.pillClass}">${curRoleInfo.label}</span>
            ${esc(myEmp.title || u.title || '')} · ${esc(myDept?.name || 'Chưa gán bộ phận')}
          </div>
          <h2>Xin chào, ${esc(myEmp.name)}</h2>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:8px">
          <button class="btn" data-action="goto" data-view="tracking">▤ Nhập số liệu ${MONTHS[m - 1]}</button>
          <button class="btn ghost" data-action="review-edit" data-type="emp" data-eid="${myEmp.id}">★ Tự đánh giá Q${curQ} <span class="tag ${st[2]}" style="margin-left:4px">${st[1]}</span></button>
        </div>
      </section>

      <section class="card mt">
        <div class="score-head">
          <div>
            <div class="label-caps">Tổng điểm KPI · ${formatMonthsLabel(P)}</div>
            <div class="score-big">${totalEarnedPts}<span>/ ${totalSetPts} điểm</span></div>
          </div>
          <div style="text-align:right">
            ${chip(overallPct)}
            <div class="small muted" style="margin-top:6px">= Khối ${wIid}đ + Bộ phận ${wDept}đ + Cá nhân ${wOwn}đ</div>
          </div>
        </div>

        <!-- Stacked 100-pt bar -->
        <div class="stacked-kpi-bar" title="Khối: ${ptsIid || 0}đ | Bộ phận: ${ptsDept || 0}đ | Cá nhân: ${ptsOwn || 0}đ">
          <div class="stacked-seg iid" style="width:${Math.max(0, Math.min(ptsIid || 0, 100))}%" title="KPI Khối: ${ptsIid || 0}/${wIid} điểm">
            ${(ptsIid || 0) >= 8 ? `Khối: ${ptsIid}đ` : ''}
          </div>
          <div class="stacked-seg dept" style="width:${Math.max(0, Math.min(ptsDept || 0, 100))}%" title="KPI Bộ phận: ${ptsDept || 0}/${wDept} điểm">
            ${(ptsDept || 0) >= 8 ? `Bộ phận: ${ptsDept}đ` : ''}
          </div>
          <div class="stacked-seg own" style="width:${Math.max(0, Math.min(ptsOwn || 0, 100))}%" title="KPI Cá nhân: ${ptsOwn || 0}/${wOwn} điểm">
            ${(ptsOwn || 0) >= 8 ? `Cá nhân: ${ptsOwn}đ` : ''}
          </div>
        </div>

        <div class="stacked-legend">
          <div class="stacked-legend-item">
            <span class="stacked-dot" style="background:var(--primary)"></span>
            <span><b>KPI Khối:</b> ${ptsIid !== null ? ptsIid : '—'} / ${wIid} đ (${pctTxt(pctIid)})</span>
          </div>
          <div class="stacked-legend-item">
            <span class="stacked-dot" style="background:var(--teal)"></span>
            <span><b>KPI Bộ phận:</b> ${ptsDept !== null ? ptsDept : '—'} / ${wDept} đ (${pctTxt(pctDept)})</span>
          </div>
          <div class="stacked-legend-item">
            <span class="stacked-dot" style="background:var(--sky)"></span>
            <span><b>KPI Cá nhân:</b> ${ptsOwn !== null ? ptsOwn : '—'} / ${wOwn} đ (${pctTxt(pctOwn)})</span>
          </div>
        </div>
      </section>

      <!-- 3. Ba Thẻ Trụ Cột (Nhấn vào để xem chi tiết từng mục) -->
      <section class="pillar-grid">
        <!-- Trụ 1: KPI Khối -->
        <div class="pillar-card iid">
          <div class="pillar-head">
            <div class="pillar-badge-title">
              <span class="section-num iid" style="margin:0">1</span>
              <span>KPI Khối IID</span>
            </div>
            <span class="pillar-target-weight">Tỷ trọng: ${wIid} điểm</span>
          </div>
          <div class="pillar-metric-row">
            <div>
              <div class="pillar-big-score">${ptsIid !== null ? ptsIid : '—'} <span style="font-size:14px;color:var(--muted)">/ ${wIid} đ</span></div>
              <div class="pillar-pct-tag" style="margin-top:2px">Hoàn thành: <b>${pctTxt(pctIid)}</b> ${chip(pctIid)}</div>
            </div>
          </div>
          <div class="pillar-foot">
            <span class="small muted">${itemsIid.length} chỉ số</span>
            <button class="btn ghost sm" data-action="goto" data-view="iid">Xem chi tiết →</button>
          </div>
        </div>

        <!-- Trụ 2: KPI Bộ Phận -->
        <div class="pillar-card dept">
          <div class="pillar-head">
            <div class="pillar-badge-title">
              <span class="section-num dept" style="margin:0">2</span>
              <span>KPI Bộ phận</span>
            </div>
            <span class="pillar-target-weight">Tỷ trọng: ${wDept} điểm</span>
          </div>
          <div class="pillar-metric-row">
            <div>
              <div class="pillar-big-score">${ptsDept !== null ? ptsDept : '—'} <span style="font-size:14px;color:var(--muted)">/ ${wDept} đ</span></div>
              <div class="pillar-pct-tag" style="margin-top:2px">Hoàn thành: <b>${pctTxt(pctDept)}</b> ${chip(pctDept)}</div>
            </div>
          </div>
          <div class="pillar-foot">
            <span class="small muted">${itemsDept.length} chỉ số</span>
            <button class="btn ghost sm" data-action="goto" data-view="depts" ${myDept ? `data-dept="${myDept.id}"` : ''}>Xem chi tiết →</button>
          </div>
        </div>

        <!-- Trụ 3: KPI Cá Nhân -->
        <div class="pillar-card own">
          <div class="pillar-head">
            <div class="pillar-badge-title">
              <span class="section-num emp" style="margin:0">3</span>
              <span>KPI Cá nhân</span>
            </div>
            <span class="pillar-target-weight">Tỷ trọng: ${wOwn} điểm</span>
          </div>
          <div class="pillar-metric-row">
            <div>
              <div class="pillar-big-score">${ptsOwn !== null ? ptsOwn : '—'} <span style="font-size:14px;color:var(--muted)">/ ${wOwn} đ</span></div>
              <div class="pillar-pct-tag" style="margin-top:2px">Hoàn thành: <b>${pctTxt(pctOwn)}</b> ${chip(pctOwn)}</div>
            </div>
          </div>
          <div class="pillar-foot">
            <span class="small muted">${itemsOwn.length} chỉ số</span>
            <button class="btn ghost sm" data-action="goto" data-view="emps" data-emp="${myEmp.id}">Xem chi tiết →</button>
          </div>
        </div>
      </section>

      <!-- 4. Danh sách thành viên (Nếu là Manager hoặc Leader) -->
      ${deptMembers.length > 0 ? `
      <section class="card mt">
        <div class="card-head">
          <div>
            <div class="row" style="gap:8px">
              <span class="section-num dept">👥</span>
              <h2>Nhân sự trong ${esc(myDept?.name || 'Bộ phận')}</h2>
              <span class="tag">${deptMembers.length} thành viên</span>
            </div>
          </div>
          <button class="btn ghost small" data-action="goto" data-view="review">★ Đánh giá Quý ${curQ} cho team</button>
        </div>
        <div class="dept-list mt">
          ${empRows.map(r => `<div class="row person" data-action="goto" data-view="emps" data-emp="${r.e.id}">
            ${avatar(empInitials(r.e), empColor(r.e), 34)}
            <div style="flex:1;min-width:0">
              <div class="kpi-name">${esc(r.e.name)}</div>
              <div class="kpi-meta">${esc(r.e.title)}</div>
            </div>
            <b class="small">${pctTxt(r.s)}</b>${chip(r.s)}
          </div>`).join('')}
        </div>
      </section>
      ` : ''}
      `;
    }

    // 3. GÓC NHÌN ADMIN (GIÁM ĐỐC KHỐI)
    const sIid = iidScore(...P);
    const rr = checkRules();
    const deptKpiN = sum(S.depts.map(d => d.kpis.length));
    const empKpiN = sum(S.emps.map(e => e.kpis.length));
    const dScores = S.depts.map(d => deptScore(d, ...P)).filter(v => v !== null);
    const empRows = S.emps.map(e => ({ e, s: empScore(e, ...P) }));

    const dist = { A: 0, B: 0, C: 0, D: 0, NA: 0 };
    empRows.forEach(r => dist[rating(r.s).code]++);
    const total = S.emps.length || 1, R0 = 60, C = 2 * Math.PI * R0;
    let off = 0, circles = '';
    ['A', 'B', 'C', 'D', 'NA'].forEach(code => {
      const len = dist[code] / total * C;
      if (len > 0) circles += `<circle cx="75" cy="75" r="${R0}" stroke="${RATING_COLOR[code]}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`;
      off += len;
    });
    const rngTxt = { A: '≥ 100%', B: '90 – <100%', C: '75 – <90%', D: '< 75%', NA: 'Chưa có số liệu' };
    const legend = [...RATINGS.map(r => r.code), 'NA'].filter(c => c !== 'NA' || dist.NA).map(code => {
      const r = RATINGS.find(x => x.code === code) || { label: 'Chưa có dữ liệu' };
      return `<div class="legend-item ${code === 'D' && dist.D ? 'bad' : ''}"><span class="dot" style="background:${RATING_COLOR[code]}"></span><div><div>${code === 'NA' ? '–' : code} · ${r.label}</div><div class="rng">${rngTxt[code]}</div></div><b>${dist[code]}</b></div>`;
    }).join('');

    const sorted = empRows.filter(r => r.s !== null).sort((a, b) => b.s - a.s);
    const personRow = r => `<div class="row person" data-action="goto" data-view="emps" data-emp="${r.e.id}">
        ${avatar(empInitials(r.e), empColor(r.e), 34)}
        <div style="flex:1;min-width:0"><div class="kpi-name">${esc(r.e.name)}</div><div class="kpi-meta">${esc(r.e.title)} · ${esc(deptById(r.e.deptId)?.name || '—')}</div></div>
        <b class="small">${pctTxt(r.s)}</b>${chip(r.s)}
      </div>`;

    return `
    <section class="card dash-head">
      <div style="min-width:0">
        <div class="small muted">Xin chào, <b>${esc(u.name)}</b> · Số liệu: ${formatMonthsLabel(P)}/${S.year || 2027}</div>
        <h2>Tổng quan Khối IID</h2>
      </div>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="btn" data-action="goto" data-view="tracking" id="hero-tracking">▤ Nhập số liệu ${MONTHS[m - 1]}</button>
        <button class="btn ghost" data-action="goto" data-view="review" id="hero-review">★ Review Quý ${curQ}</button>
      </div>
    </section>

    <section class="grid g-4 mt">
      <div class="card stat"><span class="glow" style="background:var(--blue)"></span><div class="label">Điểm KPI Tổng IID</div><div class="value">${pctTxt(sIid)}</div><div class="hint">${formatMonthsLabel(P)} · ${chip(sIid)}</div></div>
      <div class="card stat"><span class="glow" style="background:var(--teal)"></span><div class="label">Bộ phận</div><div class="value">${S.depts.length}</div><div class="hint">${deptKpiN} KPI riêng · điểm TB ${pctTxt(dScores.length ? sum(dScores) / dScores.length : null)}</div></div>
      <div class="card stat"><span class="glow" style="background:var(--sky)"></span><div class="label">Nhân sự & Tài khoản</div><div class="value">${S.emps.length}</div><div class="hint">${S.users.length} tài khoản cấp email & MK</div></div>
      <div class="card stat entity" data-action="goto" data-view="rules"><span class="glow" style="background:${rr.errors ? 'var(--red)' : 'var(--green)'}"></span><div class="label">Nguyên tắc</div><div class="value" style="color:${rr.errors ? 'var(--red)' : 'var(--green)'}">${rr.errors ? rr.errors + ' lỗi' : 'Đạt'}</div><div class="hint">${rr.warns} cảnh báo · bấm để xem chi tiết</div></div>
    </section>

    <section class="grid g-21 mt">
      <div class="card">
        <div class="card-head"><span class="section-num">1</span><h2>KPI Tổng IID – tiến độ lũy kế</h2><span class="tag">${formatMonthsLabel(P)}</span></div>
        <div class="kpi-list">
          ${S.iid.map(k => {
            const p = pctOf(k, ...P), a = actualOf(k, ...P);
            return `<div class="kpi-line">
            <div class="row"><div style="flex:1;min-width:0">
              <div class="kpi-name">${esc(k.name)} ${rollupBadge(k)}</div>
              <div class="kpi-meta" style="margin-top:3px">Mục tiêu năm: <b>${fmt(k.target)} ${esc(k.unit)}</b> · Thực tế YTD: <b>${fmt(a)} ${esc(k.unit)}</b> · Tỷ trọng: <b>${fmt(k.weight)}%</b></div>
            </div>${chip(p)}</div>
            <div class="mt-s">${pctBar(p)}</div></div>`;
          }).join('') || '<div class="empty">Chưa có KPI IID</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="section-num emp">3</span><h2>Phân bố xếp loại cá nhân</h2></div>
        ${S.emps.length ? `
        <div class="donut-wrap">
          <div class="donut"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${R0}" stroke="#e2e8f0"/>${circles}</svg>
            <div class="center"><div><b>${S.emps.length}</b><small>nhân sự</small></div></div></div>
          <div class="legend">${legend}</div>
        </div>` : `
        <div style="padding:22px 12px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">👥</div>
          <h3 style="font-size:15px;color:var(--navy);font-weight:700">Hệ thống sẵn sàng áp dụng</h3>
          <p class="muted small" style="margin:6px auto 16px;max-width:320px;line-height:1.5">Chưa có hồ sơ nhân sự nào. Bạn có thể thêm nhân sự hoặc Import file CSV để bắt đầu phân bổ KPI.</p>
          <div class="row" style="justify-content:center;gap:8px">
            <button class="btn sm" data-action="import-users-modal">📥 Import nhân sự</button>
            <button class="btn sm ghost" data-action="goto" data-view="users">👥 Quản lý người dùng</button>
          </div>
        </div>`}
      </div>
    </section>

    <section class="grid g-2 mt">
      <div class="card">
        <div class="card-head"><span class="section-num dept">2</span><h2>Điểm KPI theo bộ phận</h2><span class="tag">YTD</span></div>
        <div class="dept-list">
          ${S.depts.map(d => { const s = deptScore(d, ...P); return `<div class="row person" data-action="goto" data-view="depts" data-dept="${d.id}">
            ${ring(s)}<div style="flex:1;min-width:0"><div class="kpi-name">${esc(d.name)}</div><div class="kpi-meta">${esc(d.leader || 'Chưa gán trưởng BP')} · ${d.kpis.length} KPI riêng · ${S.emps.filter(e => e.deptId === d.id).length} nhân sự</div>
            <div class="bar mt-s"><span style="width:${s === null ? 0 : Math.min(s, 100)}%;background:${d.color}"></span></div></div>${chip(s)}</div>`; }).join('') || '<div class="empty">Chưa có bộ phận</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="section-num emp">3</span><h2>Nhân sự nổi bật & cần hỗ trợ</h2></div>
        ${S.emps.length ? `
        <div class="small muted" style="margin-bottom:8px">▲ Dẫn đầu</div>
        ${sorted.slice(0, 3).map(personRow).join('') || '<div class="empty">Chưa có dữ liệu</div>'}
        <div class="small muted" style="margin:14px 0 8px">▼ Cần hỗ trợ</div>
        ${sorted.length > 3 ? sorted.slice(-3).reverse().map(personRow).join('') : '<div class="muted small">—</div>'}
        ` : `
        <div style="padding:28px 12px;text-align:center" class="muted small">
          <div style="font-size:26px;margin-bottom:8px">📊</div>
          <div>Bảng xếp hạng nhân sự dẫn đầu và cần hỗ trợ sẽ tự động hiển thị tại đây khi có dữ liệu đánh giá.</div>
        </div>`}
      </div>
    </section>`;
  }

  /* ---------- KPI Tổng IID ---------- */
  function viewIid() {
    const P = ytd(), s = iidScore(...P), tw = sum(S.iid.map(k => k.weight));
    const linkedCount = k => {
      const d = S.depts.filter(x => x.iidLinks.some(l => l.kpiId === k.id) || x.kpis.some(y => y.linkTo === k.id)).length;
      const e = S.emps.filter(x => x.iidLinks.some(l => l.kpiId === k.id)).length;
      return `<span class="tag dept">${d} BP</span> <span class="tag emp">${e} CN</span>`;
    };
    const canManage = canManageIid();
    const rows = S.iid.map(k => {
      const p = pctOf(k, ...P);
      return `<tr>
        <td class="kpi-col-cell">
          <div class="kpi-name">${esc(k.name)} ${rollupBadge(k)}</div>
          ${k.desc ? `<div class="kpi-desc">${esc(k.desc)}</div>` : ''}
          <div class="kpi-meta">👤 ${esc(k.owner || '—')} · 📁 ${esc(k.source || '—')}</div>
        </td>
        <td class="col-type">${typeTag(k)}</td>
        <td class="num col-target"><b>${fmt(k.target)}</b> <span class="muted small">${esc(k.unit)}</span></td>
        <td class="num col-weight"><b>${fmt(k.weight)}%</b></td>
        <td class="small muted col-calc">${AGGREGATIONS[k.aggregation]}<br>${dirTxt(k)}</td>
        <td class="num col-actual"><b>${fmt(actualOf(k, ...P))}</b> <span class="muted small">${esc(k.unit)}</span></td>
        <td class="col-pct">${pctBar(p)}</td>
        <td class="col-rating">${chip(p)}</td>
        <td class="col-cascade">${linkedCount(k)}</td>
        <td class="num col-act">${canManage ? kpiActions('iid', '', k.id) : '<span class="muted small">Xem</span>'}</td></tr>`;
    }).join('');

    return `
    <section class="grid g-12">
      <div class="card">
        <div class="card-head"><span class="section-num">1</span><h2>Điểm KPI Tổng IID</h2></div>
        <div class="row" style="gap:18px">${ring(s, true)}
          <div><div style="font-size:13px" class="muted">Lũy kế ${formatMonthsLabel(getSelectedMonths())}</div><div class="mt-s">${chip(s)}</div>
          <div class="small muted mt-s">${S.iid.length} KPI · tổng tỷ trọng <b style="color:${Math.abs(tw - 100) < .01 ? 'var(--green)' : 'var(--red)'}">${fmt(tw)}%</b></div></div>
        </div>
        <div class="mt">${weightStat('Tổng tỷ trọng KPI IID', tw, null)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Cơ chế Setup & Roll-up KPI IID</h2></div>
        <div class="small muted" style="display:grid;gap:8px">
          <div>• <b>Mục tiêu Khối</b>: Điểm xuất phát để toàn bộ khối và các phòng ban hướng tới.</div>
          <div>• <b>⚡ Tự động Roll-up</b>: Tự động cộng dồn doanh số và các chỉ số từ các phòng ban.</div>
          <div>• <b>Quyền hạn</b>: ${canManage ? '<span class="tag good">Bạn có quyền Admin để điều chỉnh mục tiêu khối</span>' : '<span class="tag">Chế độ xem định hướng chung</span>'}</div>
        </div>
      </div>
    </section>

    <section class="card mt">
      <div class="card-head">
        <h2>Danh sách KPI Tổng IID</h2>
        <span class="spacer"></span>
        ${canManage ? '<button class="btn" data-action="add-kpi" data-scope="iid" id="btn-add-iid">＋ Thêm KPI IID</button>' : ''}
      </div>
      <div class="table-wrap"><table class="kpi-table">
        <colgroup>
          <col style="min-width: 320px; width: 32%">
          <col style="width: 100px">
          <col style="width: 120px">
          <col style="width: 90px">
          <col style="width: 130px">
          <col style="width: 125px">
          <col style="width: 160px">
          <col style="width: 135px">
          <col style="width: 110px">
          <col style="width: 65px">
        </colgroup>
        <thead><tr>
          <th class="col-kpi">KPI Tổng IID & Mô tả</th>
          <th class="col-type">Loại</th>
          <th class="num col-target">Mục tiêu năm</th>
          <th class="num col-weight">Tỷ trọng</th>
          <th class="col-calc">Cách tính</th>
          <th class="num col-actual">Thực tế YTD</th>
          <th class="col-pct">% hoàn thành</th>
          <th class="col-rating">Đánh giá</th>
          <th class="col-cascade">Được cascade</th>
          <th class="col-act"></th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="10" class="empty">Chưa có KPI IID</td></tr>'}</tbody>
      </table></div>
    </section>

    <section class="grid g-2 mt">
      ${S.iid.map(k => `<div class="card"><div class="card-head"><h3>${esc(k.name)} ${rollupBadge(k)}</h3><span class="tag">${esc(k.unit)}</span>${chip(pctOf(k, ...P))}</div>${chartSVG(k)}</div>`).join('')}
    </section>`;
  }

  /* ---------- KPI Bộ phận ---------- */
  function deptCard(d, P) {
    const s = deptScore(d, ...P);
    const a = sum(d.iidLinks.map(l => l.weight)), b = sum(d.kpis.map(k => k.weight));
    const segs = deptItems(d).map(it => `<span style="width:${it.weight}%;background:${it.kind === 'iid' ? 'var(--blue)' : d.color};opacity:${it.kind === 'iid' ? .9 : .65};border-right:1px solid var(--bg)"></span>`).join('');
    return `<div class="card entity ${UI.selDept === d.id ? 'selected' : ''}" data-action="sel-dept" data-eid="${d.id}" id="dept-${d.id}">
      <div class="entity-top">${avatar(deptInitials(d), d.color)}<div style="flex:1;min-width:0"><h3>${esc(d.name)}</h3><div class="sub">${esc(d.leader || '—')}</div></div>${ring(s)}</div>
      <div class="mini-weights">${segs}</div>
      <div class="entity-foot"><span class="tag iid">IID ${fmt(a)}%</span><span class="tag dept">Riêng ${fmt(b)}%</span><span class="tag">${d.kpis.length} KPI</span>${chip(s)}</div>
    </div>`;
  }
  function viewDepts() {
    const P = ytd();
    const visibleDepts = getVisibleDepts();
    if (!UI.selDept || !visibleDepts.some(d => d.id === UI.selDept)) {
      UI.selDept = visibleDepts[0]?.id || null;
    }
    const d = deptById(UI.selDept);
    let detail = '<div class="card mt empty">Chưa có thông tin bộ phận.</div>';
    if (d) {
      const canManage = canManageDept(d.id);
      const a = sum(d.iidLinks.map(l => l.weight)), b = sum(d.kpis.map(k => k.weight));
      const items = deptItems(d);
      const groups = [
        { title: 'Nhận từ KPI Tổng IID', cls: 'iid', tag: 'IID', items: items.filter(i => i.kind === 'iid').map(i => ({ ...i, actions: canManage ? `<button class="icon-btn" title="Sửa liên kết" data-action="dept-links" data-eid="${d.id}">⚙</button>` : '' })) },
        { title: 'KPI riêng của bộ phận', cls: 'dept', tag: 'Bộ phận', items: d.kpis.map(k => ({ kind: 'own', kpi: k, weight: k.weight, link: linkName(k.linkTo), actions: kpiActions('dept', d.id, k.id) })) }
      ];
      const members = S.emps.filter(e => e.deptId === d.id);
      detail = `
      <section class="card mt">
        <div class="card-head" style="flex-wrap:wrap">
          ${avatar(deptInitials(d), d.color)}
          <div><h2 style="font-size:17px">${esc(d.name)}</h2><div class="small muted">Trưởng bộ phận: ${esc(d.leader || '—')} · ${members.length} nhân sự</div></div>
          <span class="spacer"></span>
          ${canManage ? `
            <button class="btn ghost sm" data-action="edit-dept" data-eid="${d.id}">✎ Sửa BP</button>
            <button class="btn ghost sm" data-action="dept-links" data-eid="${d.id}">⚙ Liên kết KPI IID</button>
            <button class="btn sm" data-action="add-kpi" data-scope="dept" data-eid="${d.id}">＋ KPI bộ phận</button>
            ${isAdm() ? `<button class="btn ghost sm danger-hover" data-action="del-dept" data-eid="${d.id}">🗑</button>` : ''}
          ` : '<span class="tag">Mục tiêu chung phòng ban</span>'}
        </div>
        <div class="grid g-4">
          ${weightStat('Nhận từ KPI IID', a, RULES.dept.iid)}
          ${weightStat('KPI riêng bộ phận', b, RULES.dept.dept)}
          ${countStat('Số KPI riêng', d.kpis.length, RULES.dept.deptKpiCount)}
          ${weightStat('Tổng tỷ trọng', a + b, null)}
        </div>
        <div class="mt">${itemsTable(groups, P, 'dept', d.id)}</div>
        <div class="row mt" style="flex-wrap:wrap;gap:8px"><span class="small muted">Nhân sự trong phòng:</span>
          ${members.map(e => `<button class="tag emp" data-action="goto" data-view="emps" data-emp="${e.id}">${esc(e.name)} · ${pctTxt(empScore(e, ...P))}</button>`).join('') || '<span class="small muted">Chưa có</span>'}
        </div>
      </section>`;
    }
    return `
    <div class="row" style="margin-bottom:16px">
      <span class="muted small">${isAdm() ? 'Danh sách các bộ phận trong Khối IID' : 'Bộ phận của bạn'}</span>
      <span class="spacer"></span>
      ${isAdm() ? '<button class="btn" data-action="add-dept" id="btn-add-dept">＋ Thêm bộ phận</button>' : ''}
    </div>
    <section class="grid ${visibleDepts.length > 2 ? 'g-4' : 'g-2'}">${visibleDepts.map(x => deptCard(x, P)).join('')}</section>
    ${detail}`;
  }

  /* ---------- KPI Cá nhân ---------- */
  function empCard(e, P) {
    const s = empScore(e, ...P), color = empColor(e);
    const a = sum(e.iidLinks.map(l => l.weight)), b = sum(e.deptLinks.map(l => l.weight)), c = sum(e.kpis.map(k => k.weight));
    const cnt = e.iidLinks.length + e.deptLinks.length + e.kpis.length;
    const segColor = { iid: 'var(--blue)', dept: 'var(--teal)', own: 'var(--sky)' };
    const segs = empItems(e).map(it => `<span style="width:${it.weight}%;background:${segColor[it.kind]};border-right:1px solid var(--bg)"></span>`).join('');
    const r = ROLES[e.role] || ROLES.staff;
    return `<div class="card entity ${UI.selEmp === e.id ? 'selected' : ''}" data-action="sel-emp" data-eid="${e.id}" id="emp-${e.id}">
      <div class="entity-top">${avatar(empInitials(e), color)}<div style="flex:1;min-width:0"><h3>${esc(e.name)}</h3><div class="sub"><span class="role-pill ${r.id}" style="font-size:10px;padding:1px 5px">${r.badge}</span> ${esc(e.title || '—')}</div></div>${ring(s)}</div>
      <div class="mini-weights">${segs}</div>
      <div class="entity-foot"><span class="tag iid">IID ${fmt(a)}%</span><span class="tag dept">BP ${fmt(b)}%</span><span class="tag emp">Riêng ${fmt(c)}%</span><span class="tag ${cnt > RULES.emp.maxKpi ? 'bad' : ''}">${cnt} KPI</span></div>
    </div>`;
  }
  function viewEmps() {
    const P = ytd();
    const visibleEmps = getVisibleEmps();
    if (!UI.selEmp || !visibleEmps.some(e => e.id === UI.selEmp)) {
      UI.selEmp = visibleEmps[0]?.id || null;
    }
    const e = empById(UI.selEmp);
    let detail = '<div class="card mt empty">Không có dữ liệu nhân sự.</div>';
    if (e) {
      const canManage = canManageEmp(e.id);
      const d = deptById(e.deptId);
      const a = sum(e.iidLinks.map(l => l.weight)), b = sum(e.deptLinks.map(l => l.weight)), c = sum(e.kpis.map(k => k.weight));
      const cnt = e.iidLinks.length + e.deptLinks.length + e.kpis.length;
      const items = empItems(e);
      const linkBtn = canManage ? `<button class="icon-btn" title="Sửa liên kết" data-action="emp-links" data-eid="${e.id}">⚙</button>` : '';
      const groups = [
        { title: 'Nhận từ KPI Tổng IID', cls: 'iid', tag: 'IID', items: items.filter(i => i.kind === 'iid').map(i => ({ ...i, actions: linkBtn })) },
        { title: 'Nhận từ KPI Bộ phận', cls: 'dept', tag: 'Bộ phận', items: items.filter(i => i.kind === 'dept').map(i => ({ ...i, actions: linkBtn })) },
        { title: 'KPI riêng của cá nhân', cls: 'emp', tag: 'Cá nhân', items: e.kpis.map(k => ({ kind: 'own', kpi: k, weight: k.weight, link: linkName(k.linkTo), actions: kpiActions('emp', e.id, k.id) })) }
      ];
      detail = `
      <section class="card mt">
        <div class="card-head" style="flex-wrap:wrap">
          ${avatar(empInitials(e), empColor(e))}
          <div><h2 style="font-size:17px">${esc(e.name)}</h2><div class="small muted">${esc(e.title || '—')} · ${esc(d?.name || 'Chưa có bộ phận')} · <span class="role-pill ${e.role || 'staff'}">${ROLES[e.role || 'staff']?.badge}</span></div></div>
          <span class="spacer"></span>
          ${canManage ? `
            <button class="btn ghost sm" data-action="edit-emp" data-eid="${e.id}">✎ Sửa thông tin</button>
            <button class="btn ghost sm" data-action="emp-links" data-eid="${e.id}">⚙ Liên kết KPI</button>
            <button class="btn sm" data-action="add-kpi" data-scope="emp" data-eid="${e.id}">＋ KPI cá nhân</button>
            ${isAdm() ? `<button class="btn ghost sm danger-hover" data-action="del-emp" data-eid="${e.id}">🗑</button>` : ''}
          ` : '<span class="tag">Chế độ xem</span>'}
        </div>
        <div class="grid g-4">
          ${weightStat('KPI Tổng IID', a, RULES.emp.iid)}
          ${weightStat('KPI Bộ phận', b, RULES.emp.dept)}
          ${weightStat('KPI riêng', c, RULES.emp.own)}
          <div class="wstat-stack">${weightStat('Tổng tỷ trọng', a + b + c, null)}${countStat('Số KPI', cnt, [0, RULES.emp.maxKpi])}</div>
        </div>
        <div class="mt">${itemsTable(groups, P, 'emp', e.id)}</div>
      </section>`;
    }

    if (isStaff()) return detail;

    const tabs = isAdm()
      ? [['all', 'Tất cả'], ...S.depts.map(x => [x.id, x.name])].map(([v, l]) => `<button class="${UI.empFilter === v ? 'active' : ''}" data-action="emp-filter" data-val="${v}">${esc(l)}</button>`).join('')
      : '';

    const contentHtml = visibleEmps.length
      ? `<section class="grid g-4">${visibleEmps.map(x => empCard(x, P)).join('')}</section>${detail}`
      : `<section class="card empty" style="padding:40px 20px;text-align:center">
          <div style="font-size:36px;margin-bottom:10px">👥</div>
          <h3>Chưa có hồ sơ nhân sự nào</h3>
          <p class="muted small" style="max-width:540px;margin:6px auto 16px">Hệ thống đang ở trạng thái sạch sẵn sàng áp dụng. Bạn có thể thêm từng nhân sự hoặc Import danh sách hàng loạt từ file Excel/CSV.</p>
          <div class="row" style="justify-content:center;gap:10px">
            <button class="btn" data-action="add-emp">＋ Thêm nhân sự</button>
            <button class="btn ghost" data-action="import-users-modal">📥 Import danh sách nhân sự</button>
          </div>
        </section>`;

    return `
    <div class="row" style="margin-bottom:16px;flex-wrap:wrap">
      ${tabs ? `<div class="tabs">${tabs}</div>` : `<span class="small muted">Danh sách nhân sự thuộc ${esc(deptById(curUser().deptId)?.name || 'đơn vị')}</span>`}
      <span class="spacer"></span>
      ${isAdm() || curUser().role === 'manager' ? '<button class="btn" data-action="add-emp" id="btn-add-emp">＋ Thêm nhân sự</button>' : ''}
    </div>
    ${contentHtml}`;
  }

  /* ---------- Theo dõi hàng tháng ---------- */
  function trackTarget() {
    const u = curUser();
    if (u.role === 'staff') {
      const e = empById(u.empId);
      return e ? { scope: 'emp', eid: e.id, kpis: e.kpis, items: empItems(e), name: `Cá nhân: ${e.name}` } : null;
    }
    if (u.role === 'manager') {
      if (UI.trackLevel === 'iid') return { scope: 'iid', eid: '', kpis: S.iid, items: iidItems(), name: 'KPI Tổng IID (Xem)' };
      if (UI.trackLevel === 'dept') {
        const d = deptById(u.deptId);
        return d ? { scope: 'dept', eid: d.id, kpis: d.kpis, items: deptItems(d), name: d.name } : null;
      }
      const myEmps = S.emps.filter(e => e.deptId === u.deptId);
      if (!myEmps.some(e => e.id === UI.trackEmp)) UI.trackEmp = myEmps[0]?.id;
      const e = empById(UI.trackEmp);
      return e ? { scope: 'emp', eid: e.id, kpis: e.kpis, items: empItems(e), name: e.name } : null;
    }
    if (UI.trackLevel === 'iid') return { scope: 'iid', eid: '', kpis: S.iid, items: iidItems(), name: 'KPI Tổng IID' };
    if (UI.trackLevel === 'dept') {
      if (!deptById(UI.trackDept)) UI.trackDept = S.depts[0]?.id;
      const d = deptById(UI.trackDept);
      return d ? { scope: 'dept', eid: d.id, kpis: d.kpis, items: deptItems(d), name: d.name } : null;
    }
    if (!empById(UI.trackEmp)) UI.trackEmp = S.emps[0]?.id;
    const e = empById(UI.trackEmp);
    return e ? { scope: 'emp', eid: e.id, kpis: e.kpis, items: empItems(e), name: e.name } : null;
  }
  function trackSummary(T) {
    const P = ytd(), s = scoreOf(T.items, ...P);
    let filled = 0, need = 0;
    T.kpis.forEach(k => { P.forEach(m => { need++; if (isNum(k.monthly[m - 1])) filled++; }); });
    const comp = need ? filled / need * 100 : 0;
    return `<div class="row" style="gap:18px">${ring(s, true)}
      <div style="flex:1"><div class="kpi-name">${esc(T.name)}</div><div class="small muted">Điểm tổng hợp (bao gồm cả các chỉ số liên kết & tự động Roll-up)</div><div class="mt-s">${chip(s)}</div></div>
      <div style="min-width:220px"><div class="row small"><span class="muted">Dữ liệu: ${formatMonthsLabel(P)}</span><span class="spacer"></span><b>${fmt(comp, 0)}%</b></div>
      <div class="bar lg mt-s"><span style="width:${comp}%"></span></div><div class="small muted mt-s">${filled}/${need} ô dữ liệu đã nhập</div></div>
    </div>`;
  }
  function trackRowCells(k) {
    const P = ytd(), p = pctOf(k, ...P);
    return { ytd: `${fmt(actualOf(k, ...P))}<div class="kpi-meta">MT kỳ: ${fmt(targetOf(k, ...P))}</div>`, pct: pctBar(p) };
  }
  function viewTracking() {
    const u = curUser();

    if (u.role === 'staff') {
      const T = trackTarget();
      if (!T) return `<div class="card empty">Chưa tìm thấy dữ liệu cá nhân.</div>`;
      const rows = T.kpis.map(k => {
        const c = trackRowCells(k);
        const cells = k.monthly.map((v, m) =>
          `<td><input type="text" inputmode="decimal" class="cell-input ${isNum(v) ? 'filled' : ''} ${isMonthSelected(m + 1) ? '' : 'future'}" value="${isNum(v) ? v : ''}" data-scope="${T.scope}" data-eid="${T.eid}" data-kid="${k.id}" data-m="${m}" aria-label="${esc(k.name)} ${MONTHS[m]}"/></td>`
        ).join('');
        return `<tr data-kid="${k.id}">
          <td class="sticky-col"><div class="kpi-name">${esc(k.name)}</div><div class="kpi-meta">${esc(k.unit)} · ${AGGREGATIONS[k.aggregation]} · ${k.direction === 'down' ? '↓' : '↑'}</div></td>
          <td class="num">${fmt(k.target)}</td>${cells}
          <td class="num ytd">${c.ytd}</td><td class="pct" style="min-width:140px">${c.pct}</td></tr>`;
      }).join('');

      return `
      <section class="card" id="track-summary">${trackSummary(T)}</section>
      <section class="card mt">
        <div class="card-head">
          <h2>Nhập số liệu thực tế hàng tháng của bạn</h2>
          <span class="tag">Năm ${S.year || 2027}</span>
        </div>
        <div class="table-wrap"><table class="track-table">
          <thead><tr><th class="sticky-col">KPI</th><th class="num">MT năm</th>${MONTHS.map((m, i) => `<th class="num ${isMonthSelected(i + 1) ? 'cur-month' : ''}">${m}</th>`).join('')}<th class="num">Thực tế YTD</th><th>% hoàn thành</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="16" class="empty">Chưa có KPI riêng</td></tr>`}</tbody>
        </table></div>
        <div class="small muted mt-s">💡 Nhập số liệu thực tế tháng vào ô tương ứng, hệ thống sẽ tự động tính lũy kế và đồng bộ lên phòng ban.</div>
      </section>`;
    }

    let tabs = '';
    if (isAdm()) {
      tabs = [['iid', '① KPI Tổng IID'], ['dept', '② Bộ phận'], ['emp', '③ Cá nhân']]
        .map(([v, l]) => `<button class="${UI.trackLevel === v ? 'active' : ''}" data-action="track-level" data-val="${v}">${l}</button>`).join('');
    } else {
      tabs = [['dept', '② Bộ phận của tôi'], ['emp', '③ Nhân sự trong phòng']]
        .map(([v, l]) => `<button class="${UI.trackLevel === v ? 'active' : ''}" data-action="track-level" data-val="${v}">${l}</button>`).join('');
    }

    let picker = '';
    if (UI.trackLevel === 'dept' && isAdm()) {
      picker = `<select id="track-entity">${S.depts.map(d => `<option value="${d.id}" ${d.id === UI.trackDept ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`;
    } else if (UI.trackLevel === 'emp') {
      const myEmps = isAdm() ? S.emps : S.emps.filter(e => e.deptId === u.deptId);
      picker = `<select id="track-entity">${myEmps.map(e => `<option value="${e.id}" ${e.id === UI.trackEmp ? 'selected' : ''}>${esc(e.name)} (${e.title})</option>`).join('')}</select>`;
    }

    const T = trackTarget();
    let body = (UI.trackLevel === 'emp' && !S.emps.length)
      ? '<div class="card mt empty" style="padding:32px 16px;text-align:center"><h3>Chưa có nhân sự nào trong hệ thống</h3><p class="muted small" style="margin-top:6px">Vui lòng thêm nhân sự hoặc Import danh sách từ mục <b>Phân quyền & Người dùng</b> để bắt đầu theo dõi.</p></div>'
      : '<div class="card mt empty">Không có dữ liệu.</div>';
    if (T) {
      const rows = T.kpis.map(k => {
        const c = trackRowCells(k);
        const isRollup = k.rollupMode && k.rollupMode !== 'manual';
        const canInput = canInputMonthly(T.scope, T.eid, k.id);
        const cells = k.monthly.map((v, m) => {
          if (isRollup) {
            return `<td><input type="text" class="cell-input rollup-locked ${isNum(v) ? 'filled' : ''}" value="${isNum(v) ? v : ''}" readonly title="⚡ Số liệu tự động tổng hợp từ cấp dưới" /></td>`;
          }
          return `<td><input type="text" inputmode="decimal" class="cell-input ${isNum(v) ? 'filled' : ''} ${isMonthSelected(m + 1) ? '' : 'future'}" value="${isNum(v) ? v : ''}" ${canInput ? '' : 'disabled title="Bạn không có quyền nhập ô này"'} data-scope="${T.scope}" data-eid="${T.eid}" data-kid="${k.id}" data-m="${m}" aria-label="${esc(k.name)} ${MONTHS[m]}"/></td>`;
        }).join('');

        return `<tr data-kid="${k.id}">
          <td class="sticky-col"><div class="kpi-name">${esc(k.name)} ${rollupBadge(k)}</div><div class="kpi-meta">${esc(k.unit)} · ${AGGREGATIONS[k.aggregation]} · ${k.direction === 'down' ? '↓' : '↑'}</div></td>
          <td class="num">${fmt(k.target)}</td>${cells}
          <td class="num ytd">${c.ytd}</td><td class="pct" style="min-width:140px">${c.pct}</td></tr>`;
      }).join('');

      body = `
      <section class="card mt" id="track-summary">${trackSummary(T)}</section>
      <section class="card mt">
        <div class="card-head">
          <h2>Số liệu thực tế theo tháng – ${esc(T.name)}</h2>
          <span class="tag">Năm ${S.year || 2027}</span>
        </div>
        <div class="table-wrap"><table class="track-table">
          <thead><tr><th class="sticky-col">KPI</th><th class="num">MT năm</th>${MONTHS.map((m, i) => `<th class="num ${isMonthSelected(i + 1) ? 'cur-month' : ''}">${m}</th>`).join('')}<th class="num">Thực tế YTD</th><th>% hoàn thành</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="16" class="empty">Chưa có KPI riêng ở cấp này</td></tr>`}</tbody>
        </table></div>
      </section>`;
    }
    return `<div class="row" style="flex-wrap:wrap"><div class="tabs">${tabs}</div>${picker}</div>${body}`;
  }
  function onCellChange(inp) {
    const { scope, eid, kid, m } = inp.dataset;
    const k = container(scope, eid)?.find(x => x.id === kid);
    if (!k) return;
    const raw = inp.value.trim().replace(/\s/g, '').replace(',', '.');
    const v = raw === '' ? null : Number(raw);
    if (raw !== '' && isNaN(v)) { inp.classList.add('invalid'); toast('Giá trị không hợp lệ – vui lòng nhập số', true); return; }
    inp.classList.remove('invalid');
    k.monthly[+m] = v;
    inp.classList.toggle('filled', v !== null);

    computeRollups();
    save();

    const tr = inp.closest('tr'), c = trackRowCells(k);
    if (tr) {
      tr.querySelector('.ytd').innerHTML = c.ytd;
      tr.querySelector('.pct').innerHTML = c.pct;
    }
    const T = trackTarget(), box = $('#track-summary');
    if (T && box) box.innerHTML = trackSummary(T);
  }

  /* ---------- Review hàng quý ---------- */
  const reviewKey = (type, id, q) => `${type}_${id}_Q${q}`;
  const getReview = (type, id, q) => S.reviews[reviewKey(type, id, q)] || { status: 'todo', self: '', mgr: '', plan: '', adjust: '' };
  const statusIdx = s => REVIEW_STATUS.findIndex(x => x[0] === s);
  function viewReview() {
    if (!UI.reviewQ) UI.reviewQ = qOf(S.currentMonth);
    const q = UI.reviewQ, Q = QUARTERS[q - 1], R = qRange(q), started = Q.from <= S.currentMonth;
    const u = curUser();

    let ents = [];
    if (u.role === 'staff') {
      const e = empById(u.empId);
      if (e) ents = [{ type: 'emp', id: e.id, name: e.name, sub: `${e.title || ''} · ${deptById(e.deptId)?.name || ''}`, av: avatar(empInitials(e), empColor(e), 34), score: started ? empScore(e, ...R) : null, prev: q > 1 ? empScore(e, ...qRange(q - 1)) : null }];
    } else if (u.role === 'manager') {
      const d = deptById(u.deptId);
      if (d) ents.push({ type: 'dept', id: d.id, name: d.name, sub: 'Trưởng BP: ' + (d.leader || '—'), av: avatar(deptInitials(d), d.color, 34), score: started ? deptScore(d, ...R) : null, prev: q > 1 ? deptScore(d, ...qRange(q - 1)) : null });
      S.emps.filter(e => e.deptId === u.deptId).forEach(e => {
        ents.push({ type: 'emp', id: e.id, name: e.name, sub: `${e.title || ''}`, av: avatar(empInitials(e), empColor(e), 34), score: started ? empScore(e, ...R) : null, prev: q > 1 ? empScore(e, ...qRange(q - 1)) : null });
      });
    } else {
      ents = [
        ...S.depts.map(d => ({ type: 'dept', id: d.id, name: d.name, sub: 'Trưởng BP: ' + (d.leader || '—'), av: avatar(deptInitials(d), d.color, 34), score: started ? deptScore(d, ...R) : null, prev: q > 1 ? deptScore(d, ...qRange(q - 1)) : null })),
        ...S.emps.map(e => ({ type: 'emp', id: e.id, name: e.name, sub: `${e.title || ''} · ${deptById(e.deptId)?.name || ''}`, av: avatar(empInitials(e), empColor(e), 34), score: started ? empScore(e, ...R) : null, prev: q > 1 ? empScore(e, ...qRange(q - 1)) : null }))
      ];
    }

    const shown = (u.role === 'staff') ? ents : ents.filter(x => UI.reviewFilter === 'all' || x.type === UI.reviewFilter);
    const finalCode = (x, r) => r.adjust || rating(x.score).code;
    const rows = shown.map(x => {
      const r = getReview(x.type, x.id, q), st = REVIEW_STATUS[Math.max(0, statusIdx(r.status))];
      const fc = finalCode(x, r);
      const delta = x.score !== null && x.prev !== null && q > 1 ? x.score - x.prev : null;
      const trend = delta === null ? '<span class="muted">–</span>' : `<span style="color:${delta >= 0 ? 'var(--green)' : 'var(--red)'}">${delta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(delta), 1)}</span>`;
      const btnText = (u.role === 'staff') ? '★ Tự đánh giá' : (u.role === 'manager' && x.type === 'emp' ? '★ Quản lý Review' : '★ Đánh giá');
      return `<tr>
        <td><div class="row">${x.av}<div><div class="kpi-name">${esc(x.name)}</div><div class="kpi-meta">${esc(x.sub)}</div></div></div></td>
        <td><span class="tag ${x.type}">${x.type === 'dept' ? 'Bộ phận' : 'Cá nhân'}</span></td>
        <td class="num"><b>${pctTxt(x.score)}</b></td>
        <td class="num small">${trend}</td>
        <td>${chip(x.score)}</td>
        <td>${fc === 'NA' ? '<span class="muted">–</span>' : `<span class="chip r-${fc}">${fc}${r.adjust ? ' · điều chỉnh' : ''}</span>`}</td>
        <td><span class="tag ${st[2]}">${st[1]}</span></td>
        <td class="num"><button class="btn ghost sm" data-action="review-edit" data-type="${x.type}" data-eid="${x.id}" ${started ? '' : 'disabled'}>${btnText}</button></td>
      </tr>`;
    }).join('');

    const qTabs = QUARTERS.map(x => `<button class="${x.q === q ? 'active' : ''}" data-action="review-q" data-val="${x.q}">Quý ${x.q}</button>`).join('');
    const fTabs = (u.role === 'staff') ? '' : [['all', 'Tất cả'], ['dept', 'Bộ phận'], ['emp', 'Cá nhân']].map(([v, l]) => `<button class="${UI.reviewFilter === v ? 'active' : ''}" data-action="review-filter" data-val="${v}">${l}</button>`).join('');

    return `
    <div class="row" style="flex-wrap:wrap"><div class="tabs">${qTabs}</div><span class="spacer"></span>${fTabs ? `<div class="tabs">${fTabs}</div>` : ''}</div>
    <section class="card mt">
      <div class="card-head">
        <h2>${u.role === 'staff' ? `Đánh giá Quý ${q} của bạn` : `Kết quả đánh giá Quý ${q}`}</h2>
        <span class="tag">${shown.length} đối tượng</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Đối tượng</th><th>Cấp</th><th class="num">Điểm quý</th><th class="num">So quý trước</th><th>Xếp loại theo điểm</th><th>Xếp loại cuối</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8" class="empty">Không có dữ liệu</td></tr>'}</tbody>
      </table></div>
    </section>`;
  }
  function reviewModal(type, id) {
    const q = UI.reviewQ, R = qRange(q);
    const ent = type === 'dept' ? deptById(id) : empById(id);
    if (!ent) return;
    const score = type === 'dept' ? deptScore(ent, ...R) : empScore(ent, ...R);
    const auto = rating(score), r = getReview(type, id, q);
    const items = type === 'dept' ? deptItems(ent) : empItems(ent);
    const breakdown = items.filter(i => i.kpi).map(i => {
      const p = pctOf(i.kpi, ...R);
      return `<div class="row small" style="padding:4px 0;border-bottom:1px solid var(--line)"><span style="flex:1">${esc(i.kpi.name)}</span><span class="muted">${fmt(i.weight)}%</span><b style="min-width:60px;text-align:right">${pctTxt(p)}</b></div>`;
    }).join('');

    const canSelf = canReviewSelf(type, id);
    const canMgr = canReviewMgr(type, id);
    const canFinal = canFinalizeReview();

    openModal(`★ Review Quý ${q} – ${ent.name}`, `
      <div class="weight-preview">
        <div class="row">${ring(score)}<div><b>Điểm tự động: ${pctTxt(score)}</b><div class="mt-s">${chip(score)}</div></div></div>
        <div class="mt">${breakdown || '<span class="muted">Chưa có KPI</span>'}</div>
      </div>
      <div class="field full"><label for="rv-self">Tự đánh giá (Nhân sự tự điền) ${canSelf ? '' : '<span class="tag">Chỉ đọc</span>'}</label>
        <textarea id="rv-self" name="self" ${canSelf ? '' : 'readonly'}>${esc(r.self)}</textarea></div>
      <div class="field full"><label for="rv-mgr">Nhận xét của quản lý ${canMgr ? '' : '<span class="tag">Chỉ đọc</span>'}</label>
        <textarea id="rv-mgr" name="mgr" ${canMgr ? '' : 'readonly'}>${esc(r.mgr)}</textarea></div>
      <div class="field"><label for="rv-adjust">Xếp loại cuối ${canMgr ? '' : '<span class="tag">Chỉ đọc</span>'}</label>
        <select id="rv-adjust" name="adjust" ${canMgr ? '' : 'disabled'}>
          <option value="">Theo điểm (${auto.code === 'NA' ? '–' : auto.code})</option>
          ${RATINGS.map(x => `<option value="${x.code}" ${r.adjust === x.code ? 'selected' : ''}>${x.code} · ${x.label}</option>`).join('')}
        </select></div>
      <div class="field"><label for="rv-status">Trạng thái phê duyệt</label>
        <select id="rv-status" name="status">
          ${REVIEW_STATUS.map(s => {
            const dis = (s[0] === 'done' && !canFinal) ? 'disabled' : '';
            return `<option value="${s[0]}" ${r.status === s[0] ? 'selected' : ''} ${dis}>${s[1]}</option>`;
          }).join('')}
        </select></div>
      <div class="field full"><label for="rv-plan">Kế hoạch hành động quý tiếp theo</label>
        <textarea id="rv-plan" name="plan">${esc(r.plan)}</textarea></div>
    `, fd => {
      const v = Object.fromEntries(fd);
      if (v.adjust && v.adjust !== auto.code && !v.mgr?.trim()) {
        toast('Vui lòng ghi nhận xét của quản lý khi điều chỉnh xếp loại', true);
        return false;
      }
      S.reviews[reviewKey(type, id, q)] = {
        status: v.status || r.status,
        self: v.self ?? r.self,
        mgr: v.mgr ?? r.mgr,
        plan: v.plan ?? r.plan,
        adjust: v.adjust ?? r.adjust,
        updatedAt: new Date().toISOString()
      };
      save(); render(); toast('Đã lưu đánh giá quý ' + q);
    });
  }

  /* ---------- Cây liên kết KPI ---------- */
  function viewCascade() {
    const P = ytd();
    const pct = k => { const p = pctOf(k, ...P); return `<b class="small" style="color:${RATING_COLOR[rating(p).code]}">${pctTxt(p)}</b>`; };
    const leaf = (cls, tag, name, extra) => `<div class="tree-node"><div class="tn-head"><span class="tag ${cls}">${tag}</span><span style="flex:1">${name}</span>${extra || ''}</div></div>`;

    const visibleDepts = getVisibleDepts();
    const iidNodes = S.iid.map(k => {
      const kids = [];
      visibleDepts.forEach(d => {
        const l = d.iidLinks.find(x => x.kpiId === k.id);
        if (l) kids.push(leaf('dept', 'BP nhận trực tiếp', `<b>${esc(d.name)}</b>`, `<span class="tag">${fmt(l.weight)}%</span>`));
      });
      visibleDepts.forEach(d => d.kpis.filter(dk => dk.linkTo === k.id).forEach(dk => {
        const sub = [];
        const visibleEmps = getVisibleEmps().filter(e => e.deptId === d.id);
        visibleEmps.forEach(e => {
          const l = e.deptLinks.find(x => x.kpiId === dk.id);
          if (l) sub.push(leaf('emp', 'CN nhận trực tiếp', `<b>${esc(e.name)}</b> <span class="muted small">${esc(e.title)}</span>`, `<span class="tag">${fmt(l.weight)}%</span>`));
          e.kpis.filter(ek => ek.linkTo === dk.id).forEach(ek => sub.push(leaf('emp', 'KPI cá nhân', `${esc(ek.name)} <span class="muted small">– ${esc(e.name)}</span>`, `<span class="tag">${fmt(ek.weight)}%</span>${pct(ek)}`)));
        });
        kids.push(`<div class="tree-node ${sub.length ? 'open' : ''}"><div class="tn-head" data-action="toggle"><span class="caret">${sub.length ? '▶' : '•'}</span><span class="tag dept">KPI bộ phận</span><span style="flex:1">${esc(dk.name)} ${rollupBadge(dk)} <span class="muted small">– ${esc(d.name)}</span></span><span class="tag">${fmt(dk.weight)}%</span>${pct(dk)}<span class="tag ${sub.length ? 'good' : 'warn'}">${sub.length} liên kết</span></div>
          ${sub.length ? `<div class="tree-children">${sub.join('')}</div>` : ''}</div>`);
      }));
      return `<div class="tree-node open"><div class="tn-head" data-action="toggle"><span class="caret">▶</span><span class="tag iid">KPI IID</span><b style="flex:1">${esc(k.name)} ${rollupBadge(k)}</b><span class="tag">${fmt(k.weight)}%</span>${pct(k)}<span class="tag ${kids.length ? 'good' : 'bad'}">${kids.length} liên kết</span></div>
        <div class="tree-children">${kids.join('') || '<div class="small muted">⚠ Chưa có bộ phận liên kết</div>'}</div></div>`;
    }).join('');

    return `
    <section class="card">
      <div class="card-head">
        <h2>Cây liên kết đa chiều (Cascade & Roll-up)</h2>
        <span class="spacer"></span>
        <button class="btn ghost sm" data-action="tree-all" data-val="open">Mở tất cả</button>
        <button class="btn ghost sm" data-action="tree-all" data-val="close">Thu gọn</button>
      </div>
      <div class="tree">
        <div class="tree-node tn-root open"><div class="tn-head" data-action="toggle"><span class="caret">▶</span><div class="brand-logo" style="width:32px;height:32px;border-radius:9px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg></div><b style="flex:1">Khối IID – Mục tiêu Khối 2027</b>${ring(iidScore(...P))}</div>
          <div class="tree-children">${iidNodes || '<div class="muted">Chưa có KPI IID</div>'}</div></div>
      </div>
    </section>`;
  }

  /* ---------- Kiểm tra nguyên tắc ---------- */
  function viewRules() {
    if (isStaff()) return `<div class="card empty">Trang kiểm tra nguyên tắc dành cho cấp Quản lý và Giám đốc Khối.</div>`;
    const r = checkRules();
    const sorted = [...r.issues].sort((a, b) => (a.level === 'err' ? 0 : 1) - (b.level === 'err' ? 0 : 1));
    const navAttrs = n => n ? `data-action="goto" data-view="${n.view}" ${n.dept ? `data-dept="${n.dept}"` : ''} ${n.emp ? `data-emp="${n.emp}"` : ''}` : '';
    const list = sorted.map(i => `<div class="rule ${i.level}"><span class="ic">${i.level === 'err' ? '!' : '⚠'}</span>
      <div style="flex:1"><h4>${esc(i.title)}</h4><p><b>${esc(i.scope)}</b> · ${esc(i.msg)}</p></div>
      <button class="btn ghost sm" ${navAttrs(i.nav)}>Sửa →</button></div>`).join('');
    const oks = r.oks.map(o => `<div class="rule ok"><span class="ic">✓</span><div><h4>${esc(o[0])}</h4><p>${esc(o[1])}</p></div></div>`).join('');
    return `
    <section class="grid g-3">
      <div class="card stat"><span class="glow" style="background:var(--red)"></span><div class="label">Lỗi bắt buộc sửa</div><div class="value" style="color:${r.errors ? 'var(--red)' : 'var(--green)'}">${r.errors}</div><div class="hint">Vi phạm quy định tỷ trọng / số lượng / liên kết</div></div>
      <div class="card stat"><span class="glow" style="background:var(--yellow)"></span><div class="label">Cảnh báo</div><div class="value" style="color:var(--yellow)">${r.warns}</div><div class="hint">Khuyến nghị để KPI chất lượng hơn</div></div>
      <div class="card stat"><span class="glow" style="background:var(--green)"></span><div class="label">Đạt toàn bộ</div><div class="value" style="color:var(--green)">${r.oks.length}</div><div class="hint">đối tượng tuân thủ 100% nguyên tắc</div></div>
    </section>
    <section class="card mt">
      <div class="card-head"><h2>Vấn đề cần xử lý</h2><span class="tag ${r.errors ? 'bad' : 'good'}">${r.issues.length}</span></div>
      ${list || '<div class="empty">🎉 Không có vấn đề nào – hệ thống KPI tuân thủ đầy đủ nguyên tắc.</div>'}
    </section>
    <section class="card mt"><div class="card-head"><h2>Đã đạt nguyên tắc</h2><span class="tag good">${r.oks.length}</span></div>${oks}</div>`;
  }

  /* ---------- Phân quyền, Tài khoản & Mật khẩu ---------- */
  function viewUsers() {
    if (!isAdm()) return `<div class="card empty">Tính năng quản trị người dùng chỉ dành cho Admin (Giám đốc Khối).</div>`;
    const rolesList = Object.values(ROLES);
    const userRows = S.users.map(u => {
      const r = roleOf(u);
      const d = deptById(u.deptId);
      const isCur = u.id === S.currentUserId;
      return `<tr>
        <td>
          <div class="row">
            ${avatar((u.name || '?').slice(0, 2).toUpperCase(), d?.color || 'var(--blue)', 34)}
            <div><div class="kpi-name">${esc(u.name)} ${isCur ? '<span class="tag good">Đang dùng</span>' : ''}</div>
            <div class="kpi-meta">${esc(u.email || '—')}</div></div>
          </div>
        </td>
        <td><span class="role-pill ${r.id}">${r.badge}</span></td>
        <td>${esc(u.title || '—')}</td>
        <td>${d ? `<span class="tag dept">${esc(d.name)}</span>` : '<span class="muted small">Toàn Khối (Khối IID)</span>'}</td>
        <td><span class="tag">••••••••</span></td>
        <td class="num" style="white-space:nowrap">
          ${!isCur ? `<button class="btn sm" data-action="admin-join-user" data-uid="${u.id}" title="Đăng nhập ngay dưới góc nhìn của tài khoản này">🚀 Join / Xem góc nhìn</button>` : '<span class="tag good" style="font-weight:700">✓ Đang dùng</span>'}
          <button class="btn ghost sm" title="Đặt lại mật khẩu về password123" data-action="admin-reset-pwd" data-uid="${u.id}">Reset MK</button>
          <button class="icon-btn" title="Sửa tài khoản" data-action="edit-user" data-uid="${u.id}">✎</button>
          ${(!isCur && u.id !== 'u_admin') ? `<button class="icon-btn del" title="Xóa tài khoản" data-action="del-user" data-uid="${u.id}">🗑</button>` : ''}
        </td>
      </tr>`;
    }).join('');

    return `
    <section class="card hero">
      <div>
        <h2>Quản lý Tài khoản & Phân quyền</h2>
        <p>Cấp tài khoản theo Email và Mật khẩu cho từng nhân sự. Cho phép import danh sách nhân sự hàng loạt theo file mẫu Excel/CSV để khởi tạo hệ thống nhanh chóng.</p>
        <div class="row mt" style="flex-wrap:wrap;gap:8px">
          <button class="btn" data-action="add-user">＋ Cấp tài khoản mới</button>
          <button class="btn ghost" data-action="import-users-modal" id="btn-import-users">📥 Import danh sách nhân sự</button>
          <button class="btn ghost" data-action="download-user-template">📋 Tải file mẫu CSV</button>
          <button class="btn ghost" data-action="account-modal">👤 Tài khoản của tôi</button>
        </div>
      </div>
      <div class="principles">
        ${rolesList.map(r => `<div class="principle">
          <span class="role-pill ${r.id}" style="margin-right:6px">${r.badge}</span>
          <div><b>${r.title}</b><br><span class="muted" style="font-size:11px">${r.desc}</span></div>
        </div>`).join('')}
      </div>
    </section>
    <section class="card mt">
      <div class="card-head" style="flex-wrap:wrap;gap:8px">
        <h2>Danh sách tài khoản cấp Email & Mật khẩu</h2>
        <span class="spacer"></span>
        <button class="btn sm ghost" data-action="download-user-template">📋 Tải mẫu CSV</button>
        <button class="btn sm" data-action="import-users-modal">📥 Import nhân sự</button>
        <span class="tag" style="margin-left:4px">${S.users.length} tài khoản</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Họ tên & Email</th><th>Vai trò</th><th>Chức danh</th><th>Đơn vị phụ trách</th><th>Mật khẩu</th><th class="num">Thao tác</th></tr></thead>
        <tbody>${userRows}</tbody>
      </table></div>
    </section>`;
  }

  const RENDER = {
    dashboard: viewDashboard, iid: viewIid, depts: viewDepts, emps: viewEmps,
    tracking: viewTracking, review: viewReview, cascade: viewCascade,
    rules: viewRules, users: viewUsers
  };

  function render(animate = false) {
    computeRollups();
    updateUserWidget();
    updateMonthFilterWidget();
    if (!RENDER[UI.view]) UI.view = 'dashboard';
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === UI.view));
    const [t, s] = VIEWS[UI.view];
    $('#page-title').textContent = t;
    $('#page-sub').textContent = s;
    document.title = `${t} | KPI 2027 – Khối IID`;
    const v = $('#view');
    const y = window.scrollY;
    v.innerHTML = RENDER[UI.view]();
    if (animate) { v.style.animation = 'none'; void v.offsetHeight; v.style.animation = ''; window.scrollTo(0, 0); }
    else window.scrollTo(0, y);
    updateBadge();
  }
  function navigate(view) {
    UI.view = view;
    if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
    $('#sidebar').classList.remove('open');
    $('#sidebar-backdrop')?.classList.remove('show');
    render(true);
  }

  /* =========================================================
     MODAL & FORMS (ĐỔI MẬT KHẨU, ACCOUNT, V.V.)
     ========================================================= */
  let modalSubmit = null, modalInput = null;
  function openModal(title, html, onSubmit, onInput, opts = {}) {
    $('#modal-title').textContent = title;
    const f = $('#modal-form');
    const isViewOnly = Boolean(opts.viewOnly || !onSubmit);
    const saveText = opts.saveText || 'Lưu';

    let actionsHtml = '';
    if (isViewOnly) {
      actionsHtml = `<div class="modal-actions"><button type="button" class="btn ghost" data-action="close-modal" id="modal-cancel">Đóng</button></div>`;
    } else {
      actionsHtml = `<div class="modal-actions"><button type="button" class="btn ghost" data-action="close-modal" id="modal-cancel">Hủy</button><button type="submit" class="btn" id="modal-save">${saveText}</button></div>`;
    }

    f.innerHTML = html + actionsHtml;
    modalSubmit = isViewOnly ? null : onSubmit;
    modalInput = onInput || null;
    $('#modal').hidden = false;
    if (modalInput) modalInput(f);
    setTimeout(() => f.querySelector('input:not([type=hidden]), textarea, select')?.focus(), 50);
  }
  function closeModal() { $('#modal').hidden = true; modalSubmit = modalInput = null; }

  const field = (label, inner, full = false, help = '') => `<div class="field ${full ? 'full' : ''}"><label>${label}</label>${inner}${help ? `<span class="help">${help}</span>` : ''}</div>`;
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;

  /* ---------- Modal Quản lý Tài khoản Cá nhân (Account Modal) ---------- */
  function accountModal() {
    const u = curUser();
    const r = roleOf(u);
    const d = deptById(u.deptId);
    const c = d?.color || '#0068b7';

    openModal('👤 Tài khoản của bạn', `
      <div class="field full">
        <div class="profile-modal-card">
          ${avatar(userInitials(u), c, 48)}
          <div style="flex:1;min-width:0">
            <h3 style="font-size:16px;font-weight:700;color:var(--text)">${esc(u.name)}</h3>
            <div class="small muted" style="margin-top:2px">${esc(u.email)}</div>
            <div class="row" style="margin-top:6px;gap:6px;flex-wrap:wrap">
              <span class="role-pill ${r.id}">${r.badge}</span>
              <span class="tag">${esc(u.title || '')}</span>
              ${d ? `<span class="tag dept">${esc(d.name)}</span>` : '<span class="tag iid">Toàn Khối IID</span>'}
            </div>
          </div>
        </div>
      </div>
      <div class="field full">
        <div class="profile-actions-grid" style="${isAdm() ? '' : 'grid-template-columns:1fr'}">
          <button type="button" class="btn" data-action="change-pwd-modal">🔑 Đổi mật khẩu của tôi</button>
          ${isAdm() ? '<button type="button" class="btn ghost" data-action="switch-user-modal">👥 Chuyển góc nhìn (Admin)</button>' : ''}
          <button type="button" class="btn ghost danger-hover" data-action="do-logout" style="grid-column: 1 / -1">🚪 Đăng xuất khỏi hệ thống</button>
        </div>
      </div>
    `, null, null, { viewOnly: true });
  }

  /* ---------- Modal Đổi Mật Khẩu (Change Password) ---------- */
  function changePasswordModal() {
    const u = curUser();
    openModal('🔑 Đổi mật khẩu cá nhân', `
      <div class="field full"><span class="help">Đổi mật khẩu cho tài khoản <b>${esc(u.email)}</b> (${esc(u.name)}).</span></div>
      ${field('Mật khẩu hiện tại *', `<input type="password" name="oldPassword" required placeholder="Nhập mật khẩu hiện tại" autocomplete="current-password" id="f-old-pwd">`, true)}
      ${field('Mật khẩu mới (tối thiểu 6 ký tự) *', `<input type="password" name="newPassword" required minlength="6" placeholder="Nhập mật khẩu mới" autocomplete="new-password" id="f-new-pwd">`, true)}
      ${field('Xác nhận mật khẩu mới *', `<input type="password" name="confirmPassword" required minlength="6" placeholder="Nhập lại mật khẩu mới" autocomplete="new-password" id="f-confirm-pwd">`, true)}
    `, fd => {
      const oldPass = fd.get('oldPassword');
      const newPass = fd.get('newPassword');
      const confirmPass = fd.get('confirmPassword');

      if (oldPass !== u.password) {
        toast('Mật khẩu hiện tại không chính xác!', true);
        return false;
      }
      if (!newPass || newPass.length < 6) {
        toast('Mật khẩu mới phải có ít nhất 6 ký tự!', true);
        return false;
      }
      if (newPass !== confirmPass) {
        toast('Mật khẩu mới và xác nhận mật khẩu không khớp!', true);
        return false;
      }

      u.password = newPass;
      save();
      toast('✅ Đã đổi mật khẩu thành công! Mật khẩu mới đã được cập nhật.');
      return true;
    });
  }

  /* ---------- Màn hình Đăng nhập (Login Overlay) ---------- */
  function showLoginOverlay() {
    const overlay = $('#login-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    overlay.removeAttribute('hidden');
    overlay.style.display = 'flex';

    // Render danh sách tài khoản tiện ích
    const demoGrid = $('#demo-accounts-grid');
    if (demoGrid) {
      demoGrid.innerHTML = S.users.slice(0, 4).map(u => {
        const r = roleOf(u);
        return `<button type="button" class="demo-acc-btn" data-action="quick-login" data-email="${esc(u.email)}">
          <span class="role-pill ${r.id}" style="font-size:10px;padding:1px 6px">${r.badge}</span>
          <div><b>${esc(u.name)}</b><span>${esc(u.email)} (MK: password123)</span></div>
        </button>`;
      }).join('');
    }

    $('#login-email')?.focus();
  }
  function hideLoginOverlay() {
    const overlay = $('#login-overlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('hidden', '');
      overlay.style.display = 'none';
    }
  }

  function handleLogin(email, password) {
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const u = S.users.find(x => x.email.toLowerCase() === trimmedEmail);
    if (!u) {
      toast('Email không tồn tại trong hệ thống!', true);
      return false;
    }
    if (u.password !== password) {
      toast('Mật khẩu không chính xác! Vui lòng thử lại.', true);
      return false;
    }

    try { localStorage.removeItem(ADMIN_ORIGIN_KEY); } catch (_) {}
    S.currentUserId = u.id;
    save();
    hideLoginOverlay();
    render(true);
    toast(`✅ Đăng nhập thành công! Xin chào ${u.name}`);
    return true;
  }

  /* ---------- Switch User Modal (Chỉ dành cho Admin) ---------- */
  function switchUserModal() {
    if (!isAdm()) {
      return accountModal();
    }
    const items = S.users.map(u => {
      const r = roleOf(u);
      const d = deptById(u.deptId);
      const isCur = u.id === S.currentUserId;
      const c = d?.color || '#0068b7';
      const av = avatar(userInitials(u), c, 40);
      return `<div class="user-select-item ${isCur ? 'current' : ''}" data-action="switch-user" data-uid="${u.id}">
        ${av}
        <div class="user-select-info">
          <div class="user-select-title-row">
            <span class="user-select-name">${esc(u.name)}</span>
            <span class="role-pill ${r.id}">${r.badge}</span>
          </div>
          <div class="user-select-sub">${esc(u.email)} · ${d ? esc(d.name) : 'Toàn Khối IID'} (${esc(u.title || '')})</div>
        </div>
        ${isCur ? '<span class="tag good">Đang chọn</span>' : '<button type="button" class="btn sm ghost">Chọn</button>'}
      </div>`;
    }).join('');

    openModal('👥 Chuyển đổi tài khoản (Demo kiểm thử)', `
      <div class="field full"><span class="help">Chọn nhanh tài khoản để kiểm tra góc nhìn và quyền hạn tương ứng.</span></div>
      <div class="user-select-list">${items}</div>
    `, null, null, { viewOnly: true });
  }

  function userModal(uidToEdit) {
    if (!isAdm()) return;
    const old = uidToEdit ? S.users.find(x => x.id === uidToEdit) : null;
    const u = old || { name: '', email: '', password: 'password123', role: 'staff', title: '', deptId: S.depts[0]?.id };

    openModal(old ? '✎ Sửa thông tin tài khoản' : '＋ Cấp tài khoản mới', `
      ${field('Họ và tên *', `<input type="text" name="name" required value="${esc(u.name)}" placeholder="VD: Nguyễn Văn A">`, true)}
      ${field('Email công việc *', `<input type="email" name="email" required value="${esc(u.email)}" placeholder="VD: an.nv@gmo.vn">`, true)}
      ${field('Mật khẩu khởi tạo *', `<input type="text" name="password" required value="${esc(u.password || 'password123')}" placeholder="Mật khẩu khởi tạo">`, true, 'Người dùng có thể tự đổi mật khẩu sau khi đăng nhập')}
      ${field('Vai trò phân quyền *', `<select name="role">
        ${Object.values(ROLES).map(r => opt(r.id, `${r.badge} (${r.title})`, u.role === r.id)).join('')}
      </select>`)}
      ${field('Chức danh công việc', `<input type="text" name="title" value="${esc(u.title)}" placeholder="VD: Chuyên viên kinh doanh">`)}
      ${field('Bộ phận trực thuộc', `<select name="deptId">
        <option value="">— Toàn Khối (Khối IID) —</option>
        ${S.depts.map(d => opt(d.id, d.name, d.id === u.deptId)).join('')}
      </select>`, true)}
    `, fd => {
      const v = Object.fromEntries(fd);
      if (!v.name.trim() || !v.email.trim() || !v.password.trim()) {
        toast('Vui lòng điền đầy đủ Họ tên, Email và Mật khẩu!', true);
        return false;
      }
      if (old) {
        Object.assign(old, {
          name: v.name.trim(), email: v.email.trim(), password: v.password.trim(),
          role: v.role, title: v.title.trim(), deptId: v.deptId || null
        });
      } else {
        const nu = {
          id: uid('u'), name: v.name.trim(), email: v.email.trim(), password: v.password.trim(),
          role: v.role, title: v.title.trim(), deptId: v.deptId || null, empId: null
        };
        S.users.push(nu);
      }
      save(); render(); toast(old ? 'Đã cập nhật tài khoản!' : 'Đã cấp tài khoản thành công!');
    });
  }

  /* ---------- Tải file mẫu danh sách nhân sự (CSV) ---------- */
  function downloadUserTemplate() {
    const header = 'Họ và tên,Email công việc,Chức danh,Phòng ban,Vai trò,Mật khẩu khởi tạo\r\n';
    const sampleRows = [
      'Nguyễn Văn An,an.nv@gmo.vn,Chuyên viên Sales,Kinh doanh (Sales),staff,password123',
      'Trần Thị Bích,bich.tt@gmo.vn,Customer Success Lead,Customer Success & Hỗ trợ,leader,password123',
      'Lê Hoàng Cường,cuong.lh@gmo.vn,Chuyên viên Marketing,Marketing & Tăng trưởng,staff,password123',
      'Phạm Đình Dũng,dung.pd@gmo.vn,Kỹ sư Hệ thống Cloud,Vận hành & Kỹ thuật Hệ thống,staff,password123',
      'Hoàng Mai Hương,huong.hm@gmo.vn,Phó phòng Kinh doanh,Kinh doanh (Sales),manager,password123'
    ].join('\r\n');
    const notes = '\r\n# Hướng dẫn:\r\n# - Phòng ban có thể điền tên phòng hoặc mã: Kinh doanh (Sales), Customer Success & Hỗ trợ, Marketing & Tăng trưởng, Vận hành & Kỹ thuật Hệ thống\r\n# - Vai trò chấp nhận: admin, manager, leader, staff\r\n# - Mật khẩu để trống sẽ tự động lấy mặc định là: password123\r\n';

    // Thêm UTF-8 BOM (\uFEFF) để Excel hiển thị tiếng Việt có dấu chuẩn xác
    const blob = new Blob(['\uFEFF' + header + sampleRows + notes], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Mau_Danh_Sach_Nhan_Su_Tenten_KPI.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('✅ Đã tải file mẫu CSV danh sách nhân sự');
  }

  /* ---------- Modal Import danh sách nhân sự & Cấp tài khoản ---------- */
  function importUsersModal() {
    if (!isAdm()) return;

    let parsedList = [];

    function updatePreviewTable(container) {
      const pCount = container.querySelector('#import-preview-count');
      const pTbody = container.querySelector('#import-preview-tbody');
      const btnSave = $('#modal-save');

      if (!parsedList.length) {
        if (pCount) pCount.textContent = 'Chưa có dữ liệu hợp lệ';
        if (pTbody) pTbody.innerHTML = '<tr><td colspan="6" class="muted small center" style="padding:18px">Dán nội dung bảng tính hoặc chọn tệp CSV để xem trước danh sách...</td></tr>';
        if (btnSave) btnSave.disabled = true;
        return;
      }

      const okN = parsedList.filter(x => x.status === 'ok').length;
      const upN = parsedList.filter(x => x.status === 'update').length;
      const errN = parsedList.filter(x => x.status === 'err').length;

      if (pCount) pCount.innerHTML = `Đã nhận diện <b>${parsedList.length}</b> dòng (${okN} tạo mới, ${upN} cập nhật, ${errN} lỗi)`;

      if (pTbody) {
        pTbody.innerHTML = parsedList.map(item => {
          let badge = '<span class="import-badge-ok">＋ Tạo mới</span>';
          if (item.status === 'update') badge = '<span class="import-badge-warn">✎ Cập nhật</span>';
          if (item.status === 'err') badge = `<span class="import-badge-err">⚠️ ${esc(item.errMsg)}</span>`;
          const dObj = deptById(item.deptId);
          const rObj = ROLES[item.role] || ROLES.staff;

          return `<tr>
            <td><b>${esc(item.name || '—')}</b></td>
            <td><code>${esc(item.email || '—')}</code></td>
            <td>${esc(item.title || '—')}</td>
            <td>${dObj ? `<span class="tag dept">${esc(dObj.name)}</span>` : (item.deptId ? esc(item.deptId) : '<span class="muted small">Toàn Khối</span>')}</td>
            <td><span class="role-pill ${rObj.id}">${rObj.badge}</span></td>
            <td>${badge}</td>
          </tr>`;
        }).join('');
      }
      if (btnSave) btnSave.disabled = !parsedList.some(x => x.status !== 'err');
    }

    function parseInputText(text) {
      if (!text || !text.trim()) { parsedList = []; return; }
      text = text.trim();

      // Hỗ trợ JSON mảng
      if (text.startsWith('[') && text.endsWith(']')) {
        try {
          const arr = JSON.parse(text);
          if (Array.isArray(arr)) {
            parsedList = arr.map(mapUserRow);
            return;
          }
        } catch (_) {}
      }

      // Phân tách dòng (CSV, TSV, Semicolon)
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      if (!lines.length) { parsedList = []; return; }

      // Nhận diện phân cách: Tab (Excel paste), Semicolon hoặc Phẩy
      const first = lines[0];
      let sep = ',';
      if (first.includes('\t')) sep = '\t';
      else if (first.includes(';') && (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length) sep = ';';

      const parseLine = line => {
        if (sep === '\t') return line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
        const arr = []; let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"' || ch === "'") inQ = !inQ;
          else if (ch === sep && !inQ) { arr.push(cur.trim().replace(/^["']|["']$/g, '')); cur = ''; }
          else cur += ch;
        }
        arr.push(cur.trim().replace(/^["']|["']$/g, ''));
        return arr;
      };

      const rows = lines.map(parseLine);
      const h0 = (rows[0][0] || '').toLowerCase(), h1 = (rows[0][1] || '').toLowerCase();
      const isHeader = h0.includes('tên') || h0.includes('name') || h1.includes('email') || h1.includes('mail');
      const dataRows = isHeader ? rows.slice(1) : rows;

      parsedList = dataRows.map(r => mapUserRow({
        name: r[0] || '',
        email: r[1] || '',
        title: r[2] || '',
        dept: r[3] || '',
        role: r[4] || 'staff',
        password: r[5] || 'password123'
      })).filter(r => r.name || r.email);
    }

    function mapUserRow(r) {
      const name = (r.name || '').trim();
      const email = (r.email || '').trim().toLowerCase();
      const title = (r.title || '').trim();
      const deptRaw = (r.dept || r.department || r.deptId || '').trim();
      const roleRaw = (r.role || 'staff').trim().toLowerCase();
      const password = (r.password || 'password123').trim();

      // Nhận diện phòng ban thông minh
      let deptId = null;
      if (deptRaw) {
        const dLow = deptRaw.toLowerCase();
        const found = S.depts.find(d => d.id.toLowerCase() === dLow || d.name.toLowerCase() === dLow);
        if (found) deptId = found.id;
        else if (dLow.includes('sale') || dLow.includes('kinh doanh')) deptId = 'd_sales';
        else if (dLow.includes('cs') || dLow.includes('customer') || dLow.includes('hỗ trợ') || dLow.includes('support')) deptId = 'd_cs';
        else if (dLow.includes('mkt') || dLow.includes('marketing') || dLow.includes('tăng trưởng')) deptId = 'd_mkt';
        else if (dLow.includes('ops') || dLow.includes('vận hành') || dLow.includes('kỹ thuật')) deptId = 'd_ops';
        else deptId = S.depts[0]?.id || null;
      } else {
        deptId = S.depts[0]?.id || null;
      }

      // Nhận diện vai trò
      let role = 'staff';
      if (roleRaw.includes('admin') || roleRaw.includes('giám đốc')) role = 'admin';
      else if (roleRaw.includes('mgr') || roleRaw.includes('manager') || roleRaw.includes('trưởng')) role = 'manager';
      else if (roleRaw.includes('lead') || roleRaw.includes('trưởng nhóm')) role = 'leader';

      // Kiểm tra tính hợp lệ
      let status = 'ok', errMsg = '';
      if (!email || !email.includes('@')) {
        status = 'err'; errMsg = 'Email không hợp lệ';
      } else if (!name) {
        status = 'err'; errMsg = 'Thiếu họ tên';
      } else {
        const exists = S.users.some(u => u.email.toLowerCase() === email);
        if (exists) status = 'update';
      }

      return { name, email, title, deptId, role, password, status, errMsg };
    }

    const defaultSample = [
      'Nguyễn Văn An\tan.nv@gmo.vn\tChuyên viên Sales\tKinh doanh (Sales)\tstaff\tpassword123',
      'Trần Thị Bích\tbich.tt@gmo.vn\tCustomer Success Lead\tCustomer Success & Hỗ trợ\tleader\tpassword123',
      'Lê Hoàng Cường\tcuong.lh@gmo.vn\tChuyên viên Marketing\tMarketing & Tăng trưởng\tstaff\tpassword123',
      'Phạm Đình Dũng\tdung.pd@gmo.vn\tKỹ sư Hệ thống Cloud\tVận hành & Kỹ thuật Hệ thống\tstaff\tpassword123'
    ].join('\n');

    openModal('📥 Import danh sách nhân sự & Cấp tài khoản', `
      <div class="field full">
        <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <span class="help">Tạo nhanh hàng loạt nhân sự và cấp tài khoản đăng nhập theo định dạng bảng tính.</span>
          <button type="button" class="btn sm ghost" data-action="download-user-template">📋 Tải file mẫu CSV</button>
        </div>
      </div>

      <div class="field full">
        <label>Cách 1: Chọn tệp tải lên (.CSV, .TXT, .JSON)</label>
        <input type="file" id="import-users-file-input" accept=".csv,.txt,.tsv,.json" style="padding:6px;font-size:12.5px" />
      </div>

      <div class="field full">
        <label for="import-users-textarea">Cách 2: Hoặc copy & paste trực tiếp từ bảng tính Excel / Google Sheets</label>
        <textarea id="import-users-textarea" rows="5" style="font-family:monospace;font-size:12px;white-space:pre" placeholder="Họ và tên&#9;Email&#9;Chức danh&#9;Phòng ban&#9;Vai trò&#9;Mật khẩu">${esc(defaultSample)}</textarea>
        <span class="help">Thứ tự cột: <code>Họ và tên</code> · <code>Email công việc</code> · <code>Chức danh</code> · <code>Phòng ban</code> · <code>Vai trò</code> (staff/leader/manager/admin) · <code>Mật khẩu</code> (mặc định: password123)</span>
      </div>

      <div class="field full">
        <label id="import-preview-count">Xem trước danh sách</label>
        <div class="import-preview-wrap" id="import-preview-wrap">
          <table class="import-preview-table">
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Email</th>
                <th>Chức danh</th>
                <th>Phòng ban</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody id="import-preview-tbody"></tbody>
          </table>
        </div>
      </div>
    `, () => {
      const validItems = parsedList.filter(x => x.status !== 'err');
      if (!validItems.length) {
        toast('Không có nhân sự hợp lệ nào để import!', true);
        return false;
      }

      let createdN = 0, updatedN = 0;
      validItems.forEach(item => {
        // 1. Cập nhật hoặc tạo tài khoản S.users
        let u = S.users.find(x => x.email.toLowerCase() === item.email.toLowerCase());
        if (u) {
          u.name = item.name;
          u.title = item.title || u.title;
          u.role = item.role;
          if (item.deptId) u.deptId = item.deptId;
          if (item.password) u.password = item.password;
          updatedN++;
        } else {
          u = {
            id: uid('u'),
            name: item.name,
            email: item.email,
            password: item.password || 'password123',
            role: item.role,
            title: item.title,
            deptId: item.deptId || null,
            empId: null
          };
          S.users.push(u);
          createdN++;
        }

        // 2. Cập nhật hoặc tạo hồ sơ nhân sự S.emps (KPI cá nhân)
        let e = null;
        if (u.empId) e = empById(u.empId);
        if (!e) e = S.emps.find(x => x.name.toLowerCase() === item.name.toLowerCase());

        if (e) {
          e.title = item.title || e.title;
          e.role = item.role;
          if (item.deptId) e.deptId = item.deptId;
          u.empId = e.id;
        } else {
          const ne = {
            id: uid('e'),
            name: item.name,
            title: item.title,
            role: item.role,
            deptId: item.deptId || S.depts[0]?.id,
            iidLinks: [],
            deptLinks: [],
            kpis: []
          };
          S.emps.push(ne);
          u.empId = ne.id;
        }
      });

      save();
      render();
      toast(`✅ Đã import thành công: ${createdN} tài khoản mới, cập nhật ${updatedN} tài khoản!`);
      return true;
    }, f => {
      const ta = f.querySelector('#import-users-textarea');
      const fi = f.querySelector('#import-users-file-input');

      // Khởi tạo preview từ textarea
      if (ta) {
        parseInputText(ta.value);
        updatePreviewTable(f);

        ta.addEventListener('input', () => {
          parseInputText(ta.value);
          updatePreviewTable(f);
        });
      }

      if (fi) {
        fi.addEventListener('change', () => {
          const file = fi.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => {
            const content = ev.target.result;
            if (ta) ta.value = content;
            parseInputText(content);
            updatePreviewTable(f);
            toast(`Đã đọc tệp: ${file.name}`);
          };
          reader.readAsText(file, 'utf-8');
        });
      }
    }, { saveText: 'Tiến hành Import' });
  }

  function kpiModal(scope, eid, kid) {
    const list = container(scope, eid);
    if (!list) return;
    const old = kid ? list.find(k => k.id === kid) : null;
    let ownerDefault = '';
    if (scope === 'dept') ownerDefault = deptById(eid)?.leader || '';
    if (scope === 'emp') ownerDefault = empById(eid)?.name || '';
    const k = old || kpi({ owner: ownerDefault });
    let linkOpts = null, linkLabel = '';
    if (scope === 'dept') { linkOpts = S.iid.map(x => [x.id, x.name]); linkLabel = 'Liên kết lên KPI Tổng IID'; }
    if (scope === 'emp') { const d = deptById(empById(eid)?.deptId); linkOpts = (d?.kpis || []).map(x => [x.id, x.name]); linkLabel = `Liên kết lên KPI Bộ phận${d ? ' (' + d.name + ')' : ''}`; }
    const lvl = { iid: 'KPI Tổng IID', dept: 'KPI bộ phận', emp: 'KPI cá nhân' }[scope];

    const calcRollup = (mode) => {
      if (!kid) return null;
      let linked = [];
      if (scope === 'iid') {
        S.depts.forEach(d => d.kpis.filter(dk => dk.linkTo === kid).forEach(dk => linked.push(dk)));
      } else if (scope === 'dept') {
        S.emps.filter(e => e.deptId === eid).forEach(e => e.kpis.filter(ek => ek.linkTo === kid).forEach(ek => linked.push(ek)));
      }
      if (!linked.length) return null;
      if (mode === 'rollup_sum') return sum(linked.map(x => x.target));
      if (mode === 'rollup_avg') return Math.round(sum(linked.map(x => x.target)) / linked.length * 100) / 100;
      return null;
    };

    openModal(`${old ? '✎ Sửa' : '＋ Thêm'} ${lvl}`, `
      ${field('Tên KPI *', `<input type="text" name="name" required value="${esc(k.name)}" placeholder="VD: Doanh thu ký mới" id="f-kpi-name">`, true)}
      ${field('Cơ chế thiết lập (Roll-up) *', `<select name="rollupMode" id="f-rollup-mode">
        ${Object.entries(ROLLUP_MODES).map(([v, l]) => opt(v, l, (k.rollupMode || 'manual') === v)).join('')}
      </select>`, true, '<span id="f-rollup-help" class="small">Nếu chọn Roll-up, mục tiêu và số liệu hàng tháng sẽ được tự động tính từ các KPI con liên kết lên. Chọn "Nhập thủ công" để tự đặt mục tiêu.</span>')}
      ${field('Đơn vị', `<input type="text" name="unit" value="${esc(k.unit)}" placeholder="tỷ, %, KH...">`)}
      ${field('Mục tiêu năm *', `<input type="number" step="any" name="target" id="f-target" value="${k.target || ''}" required><div id="f-target-hint" class="small" style="margin-top:4px"></div>`)}
      ${field('Tỷ trọng (%)', `<input type="number" step="any" min="0" max="100" name="weight" value="${k.weight || ''}">`)}
      ${field('Chiều hướng', `<select name="direction">${opt('up', '↑ Càng cao càng tốt', k.direction === 'up')}${opt('down', '↓ Càng thấp càng tốt', k.direction === 'down')}</select>`)}
      ${field('Cách tổng hợp', `<select name="aggregation">${Object.entries(AGGREGATIONS).map(([v, l]) => opt(v, l, k.aggregation === v)).join('')}</select>`, false, 'Cộng dồn: mục tiêu được phân bổ đều 12 tháng')}
      ${field('Loại KPI', `<select name="type">${opt('outcome', 'Kết quả (Outcome)', k.type === 'outcome')}${opt('activity', 'Hoạt động (Activity)', k.type === 'activity')}</select>`)}
      ${field('Tần suất đo', `<select name="frequency">${FREQUENCIES.map(f => opt(f, f, k.frequency === f)).join('')}</select>`)}
      ${field('Người phụ trách', `<input type="text" name="owner" value="${esc(k.owner)}">`)}
      ${field('Nguồn dữ liệu', `<input type="text" name="source" value="${esc(k.source)}" placeholder="CRM, ERP, Báo cáo...">`, true)}
      ${linkOpts ? field(linkLabel, `<select name="linkTo">${opt('', '— Chưa liên kết —', !k.linkTo)}${linkOpts.map(([v, l]) => opt(v, l, k.linkTo === v)).join('')}</select>`, true, 'KPI cấp dưới đóng góp cho KPI cấp trên') : ''}
    `, fd => {
      const v = Object.fromEntries(fd);
      if (!v.name.trim()) { toast('Vui lòng nhập tên KPI', true); return false; }
      let targetVal = +v.target || 0;
      let rollupMode = v.rollupMode || 'manual';
      const autoVal = calcRollup(rollupMode);
      if (rollupMode !== 'manual' && autoVal !== null && Math.abs(targetVal - autoVal) > 1e-6) {
        rollupMode = 'manual';
      }
      if (!(targetVal > 0) && rollupMode === 'manual') { toast('Mục tiêu năm phải lớn hơn 0', true); return false; }
      const patch = {
        name: v.name.trim(), unit: v.unit.trim(), target: targetVal, weight: +v.weight || 0,
        rollupMode,
        direction: v.direction, aggregation: v.aggregation, type: v.type, frequency: v.frequency,
        owner: v.owner.trim(), source: v.source.trim(), linkTo: linkOpts ? (v.linkTo || null) : null
      };
      if (old) Object.assign(old, patch); else list.push(Object.assign(k, patch));
      computeRollups();
      save(); render();
      toast(old ? (rollupMode === 'manual' && v.rollupMode !== 'manual' ? `Đã lưu mục tiêu: ${fmt(targetVal)} (chuyển sang Thủ công)` : 'Đã cập nhật KPI thành công') : 'Đã thêm KPI mới');
    }, f => {
      const modeSel = $('#f-rollup-mode', f);
      const targetInp = $('#f-target', f);
      const hint = $('#f-target-hint', f);
      const updateHint = () => {
        const mode = modeSel?.value || 'manual';
        const auto = calcRollup(mode);
        if (mode !== 'manual' && auto !== null) {
          hint.innerHTML = `<span style="color:var(--blue)">⚡ Tự động tính từ các KPI cấp dưới: <b>${fmt(auto)}</b>. Nếu sửa ô này, hệ thống sẽ chuyển sang "Nhập thủ công" để bảo toàn mục tiêu.</span>`;
        } else if (mode !== 'manual') {
          hint.innerHTML = `<span class="muted">Chưa có KPI cấp dưới liên kết. Dùng mục tiêu bạn nhập.</span>`;
        } else {
          hint.innerHTML = `<span class="muted">Mục tiêu cố định do bạn tự thiết lập.</span>`;
        }
      };
      modeSel?.addEventListener('change', () => {
        const mode = modeSel.value;
        const auto = calcRollup(mode);
        if (auto !== null && targetInp) targetInp.value = auto;
        updateHint();
      });
      targetInp?.addEventListener('input', () => {
        const mode = modeSel?.value;
        const auto = calcRollup(mode);
        if (mode && mode !== 'manual' && auto !== null && Math.abs(+targetInp.value - auto) > 1e-6) {
          modeSel.value = 'manual';
          hint.innerHTML = `<span style="color:var(--green)">✓ Đã chuyển sang "Nhập thủ công" để bảo toàn mục tiêu bạn vừa nhập.</span>`;
        }
      });
      updateHint();
    });
  }

  function deleteKpi(scope, eid, kid) {
    const list = container(scope, eid);
    const idx = list?.findIndex(k => k.id === kid);
    if (idx === undefined || idx < 0) return;
    const k = list[idx];
    if (!confirm(`Xóa KPI "${k.name}"?\nCác liên kết từ cấp dưới tới KPI này cũng sẽ được gỡ bỏ.`)) return;
    list.splice(idx, 1);
    let cleaned = 0;
    S.depts.forEach(d => {
      const n = d.iidLinks.length; d.iidLinks = d.iidLinks.filter(l => l.kpiId !== kid); cleaned += n - d.iidLinks.length;
      d.kpis.forEach(x => { if (x.linkTo === kid) { x.linkTo = null; cleaned++; } });
    });
    S.emps.forEach(e => {
      let n = e.iidLinks.length + e.deptLinks.length;
      e.iidLinks = e.iidLinks.filter(l => l.kpiId !== kid); e.deptLinks = e.deptLinks.filter(l => l.kpiId !== kid);
      cleaned += n - e.iidLinks.length - e.deptLinks.length;
      e.kpis.forEach(x => { if (x.linkTo === kid) { x.linkTo = null; cleaned++; } });
    });
    computeRollups();
    save(); render(); toast(`Đã xóa KPI${cleaned ? ` · gỡ ${cleaned} liên kết liên quan` : ''}`);
  }

  function weightInputs(prefix, kpis, links) {
    return kpis.map(k => {
      const w = links.find(l => l.kpiId === k.id)?.weight || '';
      return `<div class="field"><label title="${esc(k.name)}">${esc(k.name)}</label><input type="number" step="any" min="0" max="100" name="${prefix}${k.id}" value="${w}" placeholder="0" class="w-input"></div>`;
    }).join('');
  }
  const readWeights = (fd, prefix) => [...fd.entries()].filter(([n, v]) => n.startsWith(prefix) && +v > 0).map(([n, v]) => ({ kpiId: n.slice(prefix.length), weight: +v }));
  const previewLine = (label, val, range) => {
    const ok = range ? inRange(val, range) : Math.abs(val - 100) < .01;
    return `<div class="row"><span>${label}</span><span class="spacer"></span><b style="color:${ok ? 'var(--green)' : 'var(--red)'}">${fmt(val)}%</b><span class="muted small" style="min-width:70px;text-align:right">${range ? range[0] + '–' + range[1] + '%' : '= 100%'}</span></div>`;
  };

  function deptLinksModal(id) {
    const d = deptById(id); if (!d) return;
    const own = sum(d.kpis.map(k => k.weight));
    openModal(`⚙ Liên kết KPI IID – ${d.name}`, `
      <div class="field full"><span class="help">Nhập tỷ trọng (%) bộ phận nhận từ từng KPI Tổng IID. Để trống / 0 nếu không nhận.</span></div>
      ${weightInputs('i_', S.iid, d.iidLinks)}
      <div class="weight-preview" id="wp"></div>`,
    fd => {
      d.iidLinks = readWeights(fd, 'i_');
      save(); render(); toast('Đã cập nhật liên kết KPI IID');
    },
    f => {
      const a = sum($$('input[name^="i_"]', f).map(i => i.value));
      $('#wp', f).innerHTML = previewLine('Nhận từ KPI IID', a, RULES.dept.iid) + previewLine('KPI riêng bộ phận (hiện tại)', own, RULES.dept.dept) + previewLine('Tổng', a + own, null);
    });
  }

  function empLinksModal(id) {
    const e = empById(id); if (!e) return;
    const d = deptById(e.deptId);
    const own = sum(e.kpis.map(k => k.weight));
    openModal(`⚙ Liên kết KPI – ${e.name}`, `
      <div class="field full"><b class="small">① Nhận từ KPI Tổng IID</b><span class="help">Quy định ${RULES.emp.iid[0]}–${RULES.emp.iid[1]}%</span></div>
      ${weightInputs('i_', S.iid, e.iidLinks)}
      <div class="field full"><b class="small">② Nhận từ KPI Bộ phận ${d ? '– ' + esc(d.name) : ''}</b><span class="help">Quy định ${RULES.emp.dept[0]}–${RULES.emp.dept[1]}%</span></div>
      ${d ? weightInputs('d_', d.kpis, e.deptLinks) : '<div class="field full muted small">Nhân sự chưa thuộc bộ phận nào.</div>'}
      <div class="weight-preview" id="wp"></div>`,
    fd => {
      e.iidLinks = readWeights(fd, 'i_');
      e.deptLinks = readWeights(fd, 'd_');
      save(); render(); toast('Đã cập nhật liên kết KPI');
    },
    f => {
      const iI = $$('input[name^="i_"]', f), dI = $$('input[name^="d_"]', f);
      const a = sum(iI.map(i => i.value)), b = sum(dI.map(i => i.value));
      const cnt = iI.filter(i => +i.value > 0).length + dI.filter(i => +i.value > 0).length + e.kpis.length;
      $('#wp', f).innerHTML = previewLine('KPI Tổng IID', a, RULES.emp.iid) + previewLine('KPI Bộ phận', b, RULES.emp.dept) + previewLine('KPI riêng (hiện tại)', own, RULES.emp.own) + previewLine('Tổng', a + b + own, null) +
        `<div class="row"><span>Số KPI</span><span class="spacer"></span><b style="color:${cnt <= RULES.emp.maxKpi ? 'var(--green)' : 'var(--red)'}">${cnt}</b><span class="muted small" style="min-width:70px;text-align:right">≤ ${RULES.emp.maxKpi}</span></div>`;
    });
  }

  function deptModal(id) {
    const old = id ? deptById(id) : null;
    const d = old || { name: '', leader: '', color: DEPT_COLORS[S.depts.length % DEPT_COLORS.length] };
    openModal(old ? `✎ Sửa bộ phận` : '＋ Thêm bộ phận', `
      ${field('Tên bộ phận *', `<input type="text" name="name" required value="${esc(d.name)}" id="f-dept-name">`, true)}
      ${field('Trưởng bộ phận (Manager)', `<input type="text" name="leader" value="${esc(d.leader)}">`)}
      ${field('Màu nhận diện', `<div class="swatches">${DEPT_COLORS.map(c => `<label class="swatch" style="background:${c}"><input type="radio" name="color" value="${c}" ${c === d.color ? 'checked' : ''}><span></span></label>`).join('')}</div>`)}
    `, fd => {
      const v = Object.fromEntries(fd);
      if (!v.name.trim()) { toast('Vui lòng nhập tên bộ phận', true); return false; }
      if (old) Object.assign(old, { name: v.name.trim(), leader: v.leader.trim(), color: v.color || old.color });
      else {
        const nd = { id: uid('d'), name: v.name.trim(), leader: v.leader.trim(), color: v.color || DEPT_COLORS[0], iidLinks: [], kpis: [] };
        S.depts.push(nd); UI.selDept = nd.id;
      }
      save(); render(); toast(old ? 'Đã cập nhật bộ phận' : 'Đã thêm bộ phận mới');
    });
  }

  function empModal(id) {
    const old = id ? empById(id) : null;
    const e = old || { name: '', title: '', role: 'staff', deptId: UI.empFilter !== 'all' ? UI.empFilter : S.depts[0]?.id };
    if (!S.depts.length) { toast('Cần tạo bộ phận trước khi thêm nhân sự', true); return; }
    openModal(old ? '✎ Sửa nhân sự' : '＋ Thêm nhân sự', `
      ${field('Họ tên *', `<input type="text" name="name" required value="${esc(e.name)}" id="f-emp-name">`, true)}
      ${field('Chức danh', `<input type="text" name="title" value="${esc(e.title)}">`)}
      ${field('Vai trò phân quyền', `<select name="role">
        ${Object.values(ROLES).map(r => opt(r.id, `${r.badge} (${r.title})`, (e.role || 'staff') === r.id)).join('')}
      </select>`)}
      ${field('Bộ phận', `<select name="deptId">${S.depts.map(d => opt(d.id, d.name, d.id === e.deptId)).join('')}</select>`, false, old ? 'Đổi bộ phận sẽ gỡ các liên kết KPI bộ phận cũ' : '')}
    `, fd => {
      const v = Object.fromEntries(fd);
      if (!v.name.trim()) { toast('Vui lòng nhập họ tên', true); return false; }
      if (old) {
        if (old.deptId !== v.deptId) {
          old.deptLinks = [];
          old.kpis.forEach(k => { k.linkTo = null; });
        }
        Object.assign(old, { name: v.name.trim(), title: v.title.trim(), role: v.role, deptId: v.deptId });
      } else {
        const ne = { id: uid('e'), name: v.name.trim(), title: v.title.trim(), role: v.role, deptId: v.deptId, iidLinks: [], deptLinks: [], kpis: [] };
        S.emps.push(ne); UI.selEmp = ne.id;
      }
      save(); render(); toast(old ? 'Đã cập nhật nhân sự' : 'Đã thêm nhân sự');
    });
  }

  /* =========================================================
     IMPORT / EXPORT / RESET
     ========================================================= */
  function exportJSON() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `KPI2027_IID_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Đã xuất dữ liệu JSON');
  }
  function importJSON(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!valid(d)) throw new Error('invalid');
        S = normalize(d); computeRollups(); save(); fillMonthSelect(); render(true);
        toast('Đã nhập dữ liệu thành công');
      } catch (e) { toast('File JSON không hợp lệ', true); }
    };
    rd.readAsText(file);
  }
  function resetData() {
    openModal('⚙ Quản lý & Làm sạch dữ liệu', `
      <div class="field full">
        <p class="muted small" style="margin-bottom:14px">Bạn có thể chọn làm sạch toàn bộ dữ liệu mẫu để áp dụng cho đội nhóm thật, hoặc nạp lại dữ liệu demo mẫu để trải nghiệm thử.</p>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="border:1px solid var(--line);border-radius:12px;padding:16px;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div>
              <b style="color:var(--navy);font-size:14px">🧹 Làm sạch dữ liệu để ÁP DỤNG THỰC TẾ</b>
              <div class="muted small" style="margin-top:4px">Xóa toàn bộ nhân sự mẫu, xóa toàn bộ tài khoản mẫu (chỉ giữ lại tài khoản Admin <code>director.iid@gmo.vn</code>), làm trống số liệu thực tế theo tháng và đánh giá quý.</div>
            </div>
            <button type="button" class="btn sm" data-action="do-clean-reset">Làm sạch ngay</button>
          </div>
          <div style="border:1px solid var(--line);border-radius:12px;padding:16px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div>
              <b style="color:var(--text);font-size:14px">📦 Nạp lại dữ liệu demo mẫu</b>
              <div class="muted small" style="margin-top:4px">Nạp lại 10 tài khoản demo mẫu (Leader, Manager, Staff) và số liệu giả lập để trải nghiệm thử.</div>
            </div>
            <button type="button" class="btn ghost sm" data-action="do-sample-reset">Nạp dữ liệu mẫu</button>
          </div>
        </div>
      </div>
    `, null, null, { viewOnly: true });
  }

  /* ---------- Toast ---------- */
  function toast(msg, err = false) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s, transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateX(30px)'; }, 2800);
    setTimeout(() => t.remove(), 3200);
  }

  /* ---------- Month Filter Dropdown Widget ---------- */
  function updateMonthFilterWidget() {
    const months = getSelectedMonths();
    const label = formatMonthsLabel(months);
    const disp = $('#month-filter-display');
    if (disp) disp.textContent = label;

    const countEl = $('#month-menu-count');
    if (countEl) countEl.textContent = `Đã chọn ${months.length}/12 tháng`;

    const tagEl = $('#month-summary-tag');
    if (tagEl) {
      if (months.length === 12) tagEl.textContent = '💡 Đang tính lũy kế cả năm (12 tháng)';
      else tagEl.textContent = `💡 Đang tính ${months.length} tháng (${label})`;
    }

    const grid = $('#month-checkbox-grid');
    if (grid) {
      grid.innerHTML = MONTHS.map((name, i) => {
        const m = i + 1;
        const checked = months.includes(m);
        return `<label class="month-check-card ${checked ? 'active' : ''}" for="m-cb-${m}">
          <input type="checkbox" class="month-cb" id="m-cb-${m}" data-month="${m}" ${checked ? 'checked' : ''} />
          <span class="month-name">T${m}</span>
        </label>`;
      }).join('');
    }

    // Cập nhật trạng thái active của các nút chọn nhanh
    $$('.month-quick-btns button, .month-quarters-row button').forEach(btn => {
      const mode = btn.dataset.mode;
      let isActive = false;
      if (mode === 'all') isActive = months.length === 12;
      else if (mode === 'q1') isActive = months.length === 3 && months.join(',') === '1,2,3';
      else if (mode === 'q2') isActive = months.length === 3 && months.join(',') === '4,5,6';
      else if (mode === 'q3') isActive = months.length === 3 && months.join(',') === '7,8,9';
      else if (mode === 'q4') isActive = months.length === 3 && months.join(',') === '10,11,12';
      btn.classList.toggle('active', isActive);
    });
  }

  function toggleMonthMenu(force) {
    const pop = $('#month-menu-popover');
    const btn = $('#btn-month-filter');
    if (!pop || !btn) return;
    const isHidden = force !== undefined ? !force : !pop.hidden;
    pop.hidden = isHidden;
    btn.setAttribute('aria-expanded', String(!isHidden));
  }

  function handleMonthToggle(monthNum) {
    const m = +monthNum;
    if (!m || m < 1 || m > 12) return;
    let months = getSelectedMonths().slice();
    if (months.includes(m)) {
      if (months.length <= 1) {
        toast('Vui lòng chọn ít nhất 1 tháng để tính KPI', true);
        updateMonthFilterWidget();
        return;
      }
      months = months.filter(x => x !== m);
    } else {
      months.push(m);
      months.sort((a, b) => a - b);
    }
    S.selectedMonths = months;
    S.currentMonth = Math.max(...months);
    save();
    computeRollups();
    render();
    toast(`Dữ liệu tính theo: ${formatMonthsLabel(months)}`);
  }

  function handleMonthQuick(mode) {
    let list = [];
    switch (mode) {
      case 'all':
        list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        break;
      case 'ytd': {
        const curCal = new Date().getMonth() + 1;
        const targetM = Math.max(1, Math.min(12, curCal));
        list = [];
        for (let i = 1; i <= targetM; i++) list.push(i);
        break;
      }
      case 'clear':
        list = [S.currentMonth || 1];
        break;
      case 'q1': list = [1, 2, 3]; break;
      case 'q2': list = [4, 5, 6]; break;
      case 'q3': list = [7, 8, 9]; break;
      case 'q4': list = [10, 11, 12]; break;
      default: return;
    }
    if (!list.length) list = [1];
    S.selectedMonths = list;
    S.currentMonth = Math.max(...list);
    save();
    computeRollups();
    render();
    toast(`Đã chọn: ${formatMonthsLabel(list)}`);
  }

  function fillMonthSelect() {
    const sel = $('#month-select');
    if (sel) {
      sel.innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === S.currentMonth ? 'selected' : ''}>Tháng ${i + 1}/${S.year || 2027}</option>`).join('');
    }
    updateMonthFilterWidget();
  }

  /* =========================================================
     EVENTS
     ========================================================= */
  document.addEventListener('click', ev => {
    // Đóng popover chọn tháng khi click ra ngoài
    const pop = $('#month-menu-popover');
    if (pop && !pop.hidden && !ev.target.closest('#month-filter-dropdown')) {
      toggleMonthMenu(false);
    }

    const el = ev.target.closest('[data-action], .nav-item');
    if (!el) {
      if (ev.target.id === 'modal') closeModal();
      if (ev.target.id === 'login-overlay') hideLoginOverlay();
      return;
    }
    if (el.classList.contains('nav-item')) { navigate(el.dataset.view); return; }
    const a = el.dataset.action, ds = el.dataset;
    switch (a) {
      case 'open-login':
        closeModal();
        showLoginOverlay();
        break;
      case 'close-login':
        hideLoginOverlay();
        break;
      case 'toggle-month-menu': toggleMonthMenu(); break;
      case 'close-month-menu': toggleMonthMenu(false); break;
      case 'month-quick': handleMonthQuick(ds.mode); break;
      case 'export': exportJSON(); break;
      case 'import': $('#import-file').click(); break;
      case 'reset': resetData(); break;
      case 'do-clean-reset': {
        closeModal();
        if (!confirm('Xác nhận làm sạch toàn bộ dữ liệu mẫu?\n- Xóa toàn bộ nhân sự mẫu\n- Chỉ giữ lại duy nhất tài khoản Admin (director.iid@gmo.vn)\n- Làm trống số liệu thực tế theo tháng\n(Hãy "Xuất JSON" nếu bạn cần sao lưu trước khi xóa).')) break;
        S = normalize(typeof buildCleanData === 'function' ? buildCleanData() : buildSampleData());
        UI.selDept = UI.selEmp = null;
        computeRollups();
        save(); fillMonthSelect(); render(true);
        toast('Đã làm sạch dữ liệu – Hệ thống sẵn sàng áp dụng cho đội nhóm!');
        break;
      }
      case 'do-sample-reset': {
        closeModal();
        if (!confirm('Khôi phục dữ liệu demo mẫu? Toàn bộ dữ liệu hiện tại sẽ bị thay thế.')) break;
        S = normalize(buildSampleData());
        UI.selDept = UI.selEmp = null;
        computeRollups();
        save(); fillMonthSelect(); render(true);
        toast('Đã nạp lại dữ liệu demo mẫu');
        break;
      }
      case 'close-modal': closeModal(); break;

      // Tài khoản & Mật khẩu
      case 'account-modal': accountModal(); break;
      case 'change-pwd-modal': changePasswordModal(); break;
      case 'switch-user-modal': switchUserModal(); break;
      case 'do-logout':
        closeModal();
        showLoginOverlay();
        toast('Đã đăng xuất khỏi tài khoản.');
        break;
      case 'switch-to-admin':
        if (!isAdm()) {
          toast('Bạn không có quyền chuyển sang Admin!', true);
          break;
        }
        exitImpersonate();
        break;
      case 'admin-join-user':
        closeModal();
        if (!isAdm()) {
          toast('Chỉ tài khoản Admin mới có quyền truy cập góc nhìn tài khoản khác!', true);
          break;
        }
        joinUserAsAdmin(ds.uid);
        break;
      case 'switch-user': {
        closeModal();
        if (!isAdm()) {
          toast('Chỉ tài khoản Admin mới có quyền chuyển đổi góc nhìn!', true);
          break;
        }
        try { localStorage.removeItem(ADMIN_ORIGIN_KEY); } catch (_) {}
        const u = S.users.find(x => x.id === ds.uid);
        if (u) {
          S.currentUserId = u.id;
          UI.selDept = u.deptId || null;
          UI.selEmp = u.empId || null;
          save(); render(true);
          toast(`Đã chuyển sang: ${u.name} (${roleOf(u).badge})`);
        }
        break;
      }
      case 'admin-reset-pwd': {
        if (!isAdm()) break;
        const u = S.users.find(x => x.id === ds.uid);
        if (u && confirm(`Đặt lại mật khẩu cho tài khoản "${u.name}" (${u.email}) về "password123"?`)) {
          u.password = 'password123';
          save(); render();
          toast(`Đã đặt lại mật khẩu của ${u.name} về "password123"`);
        }
        break;
      }
      case 'add-user': userModal(); break;
      case 'edit-user': userModal(ds.uid); break;
      case 'import-users-modal': importUsersModal(); break;
      case 'download-user-template': downloadUserTemplate(); break;
      case 'del-user': {
        if (!isAdm()) break;
        const u = S.users.find(x => x.id === ds.uid);
        if (!u) break;
        if (u.id === 'u_admin' || u.id === S.currentUserId) {
          toast('Không thể xóa tài khoản Admin đang hoạt động!', true);
          break;
        }
        if (confirm(`Bạn có chắc muốn xóa tài khoản "${u.name}" (${u.email})?`)) {
          S.users = S.users.filter(x => x.id !== u.id);
          save(); render();
          toast(`Đã xóa tài khoản ${u.name}`);
        }
        break;
      }

      // Quick login từ màn hình đăng nhập
      case 'quick-login': {
        const email = ds.email;
        $('#login-email').value = email;
        $('#login-password').value = 'password123';
        handleLogin(email, 'password123');
        break;
      }

      // KPI & Bộ phận
      case 'add-kpi': kpiModal(ds.scope, ds.eid); break;
      case 'edit-kpi': kpiModal(ds.scope, ds.eid, ds.kid); break;
      case 'del-kpi': deleteKpi(ds.scope, ds.eid, ds.kid); break;
      case 'add-dept': deptModal(); break;
      case 'edit-dept': deptModal(ds.eid); break;
      case 'del-dept': {
        const d = deptById(ds.eid); if (!d) break;
        if (S.emps.some(e => e.deptId === d.id)) { toast('Bộ phận còn nhân sự – hãy chuyển hoặc xóa nhân sự trước', true); break; }
        if (!confirm(`Xóa bộ phận "${d.name}" cùng ${d.kpis.length} KPI?`)) break;
        S.depts = S.depts.filter(x => x !== d); UI.selDept = null;
        save(); render(); toast('Đã xóa bộ phận');
        break;
      }
      case 'sel-dept': UI.selDept = ds.eid; render(); break;
      case 'dept-links': deptLinksModal(ds.eid); break;
      case 'add-emp': empModal(); break;
      case 'edit-emp': empModal(ds.eid); break;
      case 'del-emp': {
        const e = empById(ds.eid); if (!e) break;
        if (!confirm(`Xóa nhân sự "${e.name}"?`)) break;
        S.emps = S.emps.filter(x => x !== e);
        Object.keys(S.reviews).forEach(k => { if (k.startsWith(`emp_${e.id}_`)) delete S.reviews[k]; });
        UI.selEmp = null; save(); render(); toast('Đã xóa nhân sự');
        break;
      }
      case 'sel-emp': UI.selEmp = ds.eid; render(); break;
      case 'emp-links': empLinksModal(ds.eid); break;
      case 'emp-filter': UI.empFilter = ds.val; UI.selEmp = null; render(); break;
      case 'track-level': UI.trackLevel = ds.val; render(); break;
      case 'review-q': UI.reviewQ = +ds.val; render(); break;
      case 'review-filter': UI.reviewFilter = ds.val; render(); break;
      case 'review-edit': reviewModal(ds.type, ds.eid); break;
      case 'toggle': el.parentElement.classList.toggle('open'); break;
      case 'tree-all': $$('.tree .tree-node').forEach(n => { if (n.querySelector(':scope > .tree-children')) n.classList.toggle('open', ds.val === 'open'); }); break;
      case 'goto':
        if (ds.dept) UI.selDept = ds.dept;
        if (ds.emp) { UI.selEmp = ds.emp; UI.empFilter = 'all'; }
        navigate(ds.view);
        if (ds.dept || ds.emp) setTimeout(() => $(`#${ds.dept ? 'dept-' + ds.dept : 'emp-' + ds.emp}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
        break;
    }
  });

  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.classList.contains('month-cb')) {
      handleMonthToggle(t.dataset.month);
    }
    else if (t.id === 'month-select') {
      S.currentMonth = +t.value;
      S.selectedMonths = [];
      for (let i = 1; i <= S.currentMonth; i++) S.selectedMonths.push(i);
      save(); render(); toast(`Dữ liệu tính đến Tháng ${t.value}`);
    }
    else if (t.id === 'track-entity') { if (UI.trackLevel === 'dept') UI.trackDept = t.value; else UI.trackEmp = t.value; render(); }
    else if (t.id === 'import-file') { if (t.files[0]) importJSON(t.files[0]); t.value = ''; }
    else if (t.classList.contains('cell-input')) onCellChange(t);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      if (!$('#modal').hidden) closeModal();
      if (!$('#login-overlay')?.hidden) hideLoginOverlay();
    }
    if (ev.key === 'Enter' && ev.target.classList?.contains('cell-input')) { ev.preventDefault(); ev.target.blur(); }
  });

  // Login form submission
  $('#login-form')?.addEventListener('submit', ev => {
    ev.preventDefault();
    const email = $('#login-email')?.value;
    const pwd = $('#login-password')?.value;
    handleLogin(email, pwd);
  });

  // Toggle password visibility
  $('#btn-toggle-pwd')?.addEventListener('click', () => {
    const inp = $('#login-password');
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  const form = $('#modal-form');
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!modalSubmit) return;
    if (modalSubmit(new FormData(form), form) !== false) closeModal();
  });
  form.addEventListener('input', () => { if (modalInput) modalInput(form); });

  // Sidebar toggle cho cả Desktop (thu gọn sidebar) và Mobile/Tablet (drawer)
  const toggleSidebar = () => {
    if (window.innerWidth <= 1024) {
      const isOpen = $('#sidebar').classList.toggle('open');
      const backdrop = $('#sidebar-backdrop');
      if (backdrop) backdrop.classList.toggle('show', isOpen);
    } else {
      document.body.classList.toggle('sidebar-collapsed');
    }
  };
  $('#menu-btn')?.addEventListener('click', toggleSidebar);
  $('#sidebar-backdrop')?.addEventListener('click', () => {
    $('#sidebar').classList.remove('open');
    $('#sidebar-backdrop')?.classList.remove('show');
  });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (RENDER[h] && h !== UI.view) navigate(h); });

  /* ---------- Init ---------- */
  fillMonthSelect();
  computeRollups();
  const h = location.hash.slice(1);
  UI.view = RENDER[h] ? h : 'dashboard';
  render(true);
})();
