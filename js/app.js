/* =========================================================
   KPI 2027 – Khối IID : Logic ứng dụng
   - Phân quyền 4 cấp nghiêm ngặt (Data Scoping & Privacy):
     + Admin (Giám đốc Khối): Xem & quản trị toàn bộ
     + Manager (Trưởng Bộ phận): Chỉ quản lý trong phạm vi Bộ phận của mình
     + Leader (Trưởng nhóm): Quản lý nhóm & thành viên trực thuộc
     + Staff (Nhân viên): Chỉ xem KPI của mình, bảng nhập liệu của mình,
       review của mình và mục tiêu chung phòng ban để đóng góp
   - Tự động tổng hợp KPI (Auto Roll-up: Staff → Bộ phận → Khối)
   - Lưu trữ localStorage, xuất / nhập JSON
   ========================================================= */
(() => {
  'use strict';

  const STORE = 'kpi2027_iid_v2';
  const REVIEW_STATUS = [
    ['todo', 'Chưa bắt đầu', ''],
    ['self', 'Đã tự đánh giá', 'warn'],
    ['mgr', 'Quản lý đã review', 'iid'],
    ['done', 'Đã chốt', 'good']
  ];
  const RATING_COLOR = { A: 'var(--green)', B: 'var(--sky)', C: 'var(--yellow)', D: 'var(--red)', NA: 'var(--dim)' };

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
    d.reviews = d.reviews || {};
    d.currentMonth = clamp(+d.currentMonth || 12, 1, 12);
    d.users = d.users || [];
    d.currentUserId = d.currentUserId || (d.users[0]?.id || 'u_admin');
    d.iid.forEach(normKpi);
    d.depts.forEach(x => { x.iidLinks = x.iidLinks || []; x.kpis = (x.kpis || []).map(normKpi); });
    d.emps.forEach(x => { x.iidLinks = x.iidLinks || []; x.deptLinks = x.deptLinks || []; x.kpis = (x.kpis || []).map(normKpi); });
    return d;
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) { const d = JSON.parse(raw); if (valid(d)) return normalize(d); }
    } catch (e) { /* ignore */ }
    return normalize(buildSampleData());
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { toast('Không lưu được dữ liệu vào trình duyệt', true); }
    updateBadge();
    updateUserWidget();
  }

  /* ---------- Phân quyền & Giới hạn dữ liệu (RBAC Data Scoping) ---------- */
  function curUser() {
    return S.users.find(u => u.id === S.currentUserId) || S.users[0] || {
      id: 'u_admin', name: 'Giám đốc Khối', role: 'admin', title: 'Giám đốc Khối'
    };
  }
  const roleOf = u => ROLES[u?.role] || ROLES.staff;
  const isAdm = () => curUser().role === 'admin';
  const isMgr = (deptId) => isAdm() || (curUser().role === 'manager' && (!deptId || curUser().deptId === deptId));
  const isStaff = () => curUser().role === 'staff';

  // Lấy các Bộ phận được phép xem
  function getVisibleDepts() {
    const u = curUser();
    if (u.role === 'admin') return S.depts;
    if (u.deptId) return S.depts.filter(d => d.id === u.deptId);
    return S.depts;
  }

  // Lấy danh sách Nhân sự được phép xem
  function getVisibleEmps() {
    const u = curUser();
    if (u.role === 'admin') return S.emps;
    if (u.role === 'manager') return S.emps.filter(e => e.deptId === u.deptId);
    if (u.role === 'leader') return S.emps.filter(e => e.deptId === u.deptId);
    if (u.role === 'staff') return S.emps.filter(e => e.id === u.empId); // Chỉ chính mình!
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
    if (k && k.rollupMode && k.rollupMode !== 'manual') return false; // KPI tự động tổng hợp thì không sửa tay
    if (scope === 'iid') return isAdm();
    if (scope === 'dept') return canManageDept(eid);
    if (scope === 'emp') {
      if (isAdm()) return true;
      const e = empById(eid);
      if (!e) return false;
      if (curUser().empId === eid) return true; // Nhân viên tự nhập số liệu của mình
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
    // 1. Roll-up từ KPI cá nhân lên KPI bộ phận
    S.depts.forEach(d => {
      d.kpis.forEach(k => {
        if (!k.rollupMode || k.rollupMode === 'manual') return;
        const linkedEmpsKpi = [];
        S.emps.filter(e => e.deptId === d.id).forEach(e => {
          e.kpis.filter(ek => ek.linkTo === k.id).forEach(ek => linkedEmpsKpi.push(ek));
        });
        if (!linkedEmpsKpi.length) return;

        // Rollup Target
        if (k.rollupMode === 'rollup_sum') k.target = sum(linkedEmpsKpi.map(x => x.target));
        else if (k.rollupMode === 'rollup_avg') k.target = Math.round(sum(linkedEmpsKpi.map(x => x.target)) / linkedEmpsKpi.length * 100) / 100;

        // Rollup Monthly
        for (let m = 0; m < 12; m++) {
          const vals = linkedEmpsKpi.map(x => x.monthly[m]).filter(isNum).map(Number);
          if (!vals.length) k.monthly[m] = null;
          else if (k.rollupMode === 'rollup_sum') k.monthly[m] = Math.round(sum(vals) * 100) / 100;
          else if (k.rollupMode === 'rollup_avg') k.monthly[m] = Math.round(sum(vals) / vals.length * 100) / 100;
        }
      });
    });

    // 2. Roll-up từ KPI bộ phận lên KPI Tổng IID
    S.iid.forEach(k => {
      if (!k.rollupMode || k.rollupMode === 'manual') return;
      const linkedDeptKpi = [];
      S.depts.forEach(d => {
        d.kpis.filter(dk => dk.linkTo === k.id).forEach(dk => linkedDeptKpi.push(dk));
      });
      if (!linkedDeptKpi.length) return;

      // Rollup Target
      if (k.rollupMode === 'rollup_sum') k.target = sum(linkedDeptKpi.map(x => x.target));
      else if (k.rollupMode === 'rollup_avg') k.target = Math.round(sum(linkedDeptKpi.map(x => x.target)) / linkedDeptKpi.length * 100) / 100;

      // Rollup Monthly
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

  /* ---------- Scoring engine ---------- */
  function actualOf(k, from, to) {
    const vals = [];
    for (let m = from; m <= to; m++) { const v = k.monthly[m - 1]; if (isNum(v)) vals.push(+v); }
    if (!vals.length) return null;
    if (k.aggregation === 'sum') return sum(vals);
    if (k.aggregation === 'avg') return sum(vals) / vals.length;
    return vals[vals.length - 1];
  }
  function targetOf(k, from, to) { return k.aggregation === 'sum' ? k.target * (to - from + 1) / 12 : +k.target; }
  function pctOf(k, from, to) {
    if (!k || from > to) return null;
    const a = actualOf(k, from, to); if (a === null) return null;
    const t = targetOf(k, from, to); if (!t) return null;
    const p = k.direction === 'down' ? (a <= 0 ? RULES.cap : t / a * 100) : a / t * 100;
    return clamp(p, 0, RULES.cap);
  }
  function scoreOf(items, from, to) {
    let sw = 0, s = 0;
    items.forEach(it => {
      if (!it.kpi) return;
      const p = pctOf(it.kpi, from, to);
      if (p === null || !(+it.weight > 0)) return;
      sw += +it.weight; s += p * it.weight;
    });
    return sw ? s / sw : null;
  }
  const ytd = () => [1, S.currentMonth];
  function qRange(q) {
    const Q = QUARTERS[q - 1];
    return [Q.from, Math.min(Q.to, S.currentMonth)];
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
  const iidScore = (from, to) => scoreOf(iidItems(), from, to);
  const deptScore = (d, from, to) => scoreOf(deptItems(d), from, to);
  const empScore = (e, from, to) => scoreOf(empItems(e), from, to);

  /* ---------- Rules engine ---------- */
  function checkRules() {
    const issues = [], oks = [];
    const I = (level, scope, title, msg, nav) => issues.push({ level, scope, title, msg, nav });
    const fieldChecks = (k, sc, nav) => {
      if (!(+k.target > 0) && k.rollupMode === 'manual') I('err', sc, `KPI "${k.name}" chưa có mục tiêu hợp lệ`, 'Mục tiêu năm phải lớn hơn 0.', nav);
      if (!(+k.weight > 0)) I('warn', sc, `KPI "${k.name}" có tỷ trọng 0%`, 'KPI không có tỷ trọng sẽ không được tính điểm.', nav);
    };

    // IID
    let n0 = issues.length;
    const iw = sum(S.iid.map(k => k.weight));
    const navIid = { view: 'iid' };
    if (!S.iid.length) I('err', 'KPI Tổng IID', 'Chưa có KPI Tổng IID', 'Cần thiết lập KPI cấp Khối.', navIid);
    else if (Math.abs(iw - 100) > .01) I('err', 'KPI Tổng IID', 'Tổng tỷ trọng KPI IID phải bằng 100%', `Hiện tại: ${fmt(iw)}%.`, navIid);
    S.iid.forEach(k => fieldChecks(k, 'KPI Tổng IID', navIid));
    if (issues.length === n0) oks.push(['KPI Tổng IID', `${S.iid.length} KPI · tổng tỷ trọng 100%`]);

    // Bộ phận
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

    // Cá nhân
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

  /* ---------- User Widget, Navigation Scoping & Role Banner ---------- */
  function updateUserWidget() {
    const u = curUser();
    const r = roleOf(u);
    $('#current-user-name').textContent = u.name;
    $('#current-user-avatar').textContent = (u.name || '?').slice(0, 2).toUpperCase();
    $('#current-user-role').innerHTML = `<span class="role-pill ${r.id}">${r.badge}</span>`;

    const banner = $('#role-banner');
    if (banner) {
      if (r.id === 'admin') {
        banner.hidden = true;
      } else {
        banner.hidden = false;
        $('#role-banner-text').innerHTML = `Đang xem với vai trò: <b>${esc(u.name)} (${r.badge})</b> – ${esc(u.title || '')}. Dữ liệu được tinh gọn theo đúng phạm vi trách nhiệm.`;
      }
    }

    // 1. Phân quyền hiển thị Menu Sidebar
    const navUsers = $('#nav-users');
    if (navUsers) navUsers.style.display = isAdm() ? '' : 'none';

    const navRules = $('#nav-rules');
    if (navRules) navRules.style.display = (u.role === 'staff') ? 'none' : '';

    const navEmps = $('#nav-emps');
    if (navEmps) {
      if (u.role === 'staff') navEmps.innerHTML = `<i>③</i>KPI của tôi`;
      else if (u.role === 'manager') navEmps.innerHTML = `<i>③</i>KPI phòng ban`;
      else navEmps.innerHTML = `<i>③</i>KPI Cá nhân`;
    }

    const navDepts = $('#nav-depts');
    if (navDepts) {
      if (u.role === 'staff') navDepts.innerHTML = `<i>②</i>Bộ phận của tôi`;
      else navDepts.innerHTML = `<i>②</i>KPI Bộ phận`;
    }

    // 2. Phân quyền các nút thao tác hệ thống trên Topbar
    const btnImport = $('#btn-import');
    if (btnImport) btnImport.style.display = isAdm() ? '' : 'none';
    const btnReset = $('#btn-reset');
    if (btnReset) btnReset.style.display = isAdm() ? '' : 'none';
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
  const avatar = (txt, color, size = 44) => `<div class="avatar" style="background:linear-gradient(135deg, ${color}, ${color}99);width:${size}px;height:${size}px;${size < 40 ? 'font-size:12px;border-radius:9px' : ''}">${esc(txt)}</div>`;
  const empColor = e => deptById(e.deptId)?.color || 'var(--blue)';
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
        g += `<rect class="bar-actual" x="${x}" y="${P.t + ih - h}" width="${w}" height="${h}" rx="4" fill="${ok ? 'url(#gOk)' : 'url(#gBad)'}" opacity="${i < S.currentMonth ? 1 : .35}"><title>${MONTHS[i]}: ${fmt(v)} ${esc(k.unit)} (mục tiêu tháng ${fmt(mt)})</title></rect>`;
      }
      g += `<text x="${P.l + bw * i + bw / 2}" y="${H - 8}" text-anchor="middle">${MONTHS[i]}</text>`;
    });
    const ty = P.t + ih - ih * mt / max;
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${ty}" y2="${ty}" stroke="var(--orange)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    g += `<text x="${W - P.r}" y="${ty - 5}" text-anchor="end" style="fill:var(--orange)">Mục tiêu/tháng ${fmtShort(mt)}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ ${esc(k.name)}">
      <defs>
        <linearGradient id="gOk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38d0f0"/><stop offset="1" stop-color="#2b5cd6"/></linearGradient>
        <linearGradient id="gBad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ff5470"/></linearGradient>
      </defs>${g}</svg>`;
  }

  /* ---------- KPI items table ---------- */
  function itemsTable(groups, [from, to], scope, eid) {
    let rows = '';
    const canEdit = canEditKpi(scope, eid);
    groups.forEach(g => {
      rows += `<tr class="group-row"><td colspan="9">${g.title} · ${fmt(sum(g.items.map(i => i.weight)))}%</td></tr>`;
      if (!g.items.length) rows += `<tr><td colspan="9" class="muted small">Chưa có KPI trong nhóm này</td></tr>`;
      g.items.forEach(it => {
        const k = it.kpi;
        if (!k) {
          rows += `<tr><td><span class="tag bad">Lỗi</span></td><td colspan="7" class="muted">Liên kết tới KPI không còn tồn tại</td><td class="num">${canEdit ? it.actions || '' : ''}</td></tr>`;
          return;
        }
        const p = pctOf(k, from, to), a = actualOf(k, from, to);
        rows += `<tr>
          <td><span class="tag ${g.cls}">${g.tag}</span></td>
          <td><div class="kpi-name">${esc(k.name)} ${rollupBadge(k)}</div><div class="kpi-meta">${typeTag(k)} ${esc(k.owner || '—')} · ${esc(k.source || '—')}</div></td>
          <td class="num">${fmt(k.target)} <span class="muted small">${esc(k.unit)}</span></td>
          <td class="num"><b>${fmt(it.weight)}%</b></td>
          <td>${it.link || '<span class="muted small">—</span>'}</td>
          <td class="num">${fmt(a)}</td>
          <td style="min-width:140px">${pctBar(p)}</td>
          <td>${chip(p)}</td>
          <td class="num" style="white-space:nowrap">${canEdit ? (it.actions || '') : ''}</td>
        </tr>`;
      });
    });
    return `<div class="table-wrap"><table>
      <thead><tr><th>Nguồn</th><th>KPI</th><th class="num">Mục tiêu năm</th><th class="num">Tỷ trọng</th><th>Liên kết lên</th><th class="num">Thực tế YTD</th><th>% hoàn thành</th><th>Đánh giá</th><th></th></tr></thead>
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
    users: ['Phân quyền & Người dùng', 'Quản lý tài khoản, vai trò & phân cấp quản lý']
  };

  /* ---------- Dashboard Tùy biến theo Role ---------- */
  function viewDashboard() {
    const P = ytd(), m = S.currentMonth, curQ = qOf(m);
    const u = curUser(), r = roleOf(u);

    // ==========================================
    // 1. GÓC NHÌN DÀNH CHO NHÂN VIÊN (STAFF)
    // ==========================================
    if (u.role === 'staff') {
      const myEmp = empById(u.empId);
      if (!myEmp) return `<div class="card empty">Chưa tìm thấy hồ sơ cá nhân liên kết với tài khoản này.</div>`;
      const sEmp = empScore(myEmp, ...P);
      const myDept = deptById(myEmp.deptId);
      const sDept = myDept ? deptScore(myDept, ...P) : null;
      const myItems = empItems(myEmp);
      const myRev = S.reviews[reviewKey('emp', myEmp.id, curQ)] || { status: 'todo' };
      const st = REVIEW_STATUS.find(x => x[0] === myRev.status) || REVIEW_STATUS[0];

      return `
      <section class="card hero">
        <div>
          <div class="row" style="margin-bottom:8px">
            <span class="role-pill staff">👤 Nhân viên</span>
            <span class="small muted">Xin chào, <b>${esc(myEmp.name)}</b> – ${esc(myEmp.title || '')} (${esc(myDept?.name || '')})</span>
          </div>
          <h2>Bảng theo dõi KPI <span>Cá nhân</span></h2>
          <p>Chào mừng bạn! Dưới đây là tiến độ thực hiện mục tiêu năm 2027 của riêng bạn. Số liệu bạn cập nhật hàng tháng sẽ tự động đóng góp vào mục tiêu chung của ${esc(myDept?.name || 'phòng ban')}.</p>
          <div class="row mt" style="flex-wrap:wrap">
            <button class="btn" data-action="goto" data-view="tracking">▤ Nhập số liệu tháng ${MONTHS[m - 1]}</button>
            <button class="btn ghost" data-action="review-edit" data-type="emp" data-eid="${myEmp.id}">★ Tự đánh giá Quý ${curQ}</button>
          </div>
        </div>
        <div class="principles">
          <div class="principle">
            <span class="ic" style="background:rgba(47,214,131,.18)">🎯</span>
            <div><b>Điểm KPI của bạn</b><br><span class="muted">${pctTxt(sEmp)} (${chip(sEmp)})</span></div>
          </div>
          <div class="principle">
            <span class="ic" style="background:rgba(61,139,255,.18)">🏢</span>
            <div><b>Tiến độ Bộ phận</b><br><span class="muted">${myDept ? myDept.name : '—'}: ${pctTxt(sDept)}</span></div>
          </div>
          <div class="principle">
            <span class="ic" style="background:rgba(255,197,66,.18)">★</span>
            <div><b>Review Quý ${curQ}</b><br><span class="tag ${st[2]}">${st[1]}</span></div>
          </div>
          <div class="principle">
            <span class="ic" style="background:rgba(56,208,240,.18)">⚡</span>
            <div><b>Đóng góp Roll-up</b><br><span class="muted">Tự động cộng dồn vào team</span></div>
          </div>
        </div>
      </section>

      <section class="grid g-3 mt">
        <div class="card stat">
          <span class="glow" style="background:var(--teal)"></span>
          <div class="label">Điểm KPI Cá nhân YTD</div>
          <div class="value">${pctTxt(sEmp)}</div>
          <div class="hint">Đến ${MONTHS[m - 1]} · ${chip(sEmp)}</div>
        </div>
        <div class="card stat">
          <span class="glow" style="background:var(--blue)"></span>
          <div class="label">Số KPI phụ trách</div>
          <div class="value">${myItems.length}</div>
          <div class="hint">${myEmp.kpis.length} KPI riêng · ${myEmp.iidLinks.length + myEmp.deptLinks.length} nhận từ cấp trên</div>
        </div>
        <div class="card stat">
          <span class="glow" style="background:var(--sky)"></span>
          <div class="label">Tiến độ Bộ phận (${esc(myDept?.name || '')})</div>
          <div class="value">${pctTxt(sDept)}</div>
          <div class="hint">Mục tiêu chung của team bạn</div>
        </div>
      </section>

      <section class="card mt">
        <div class="card-head">
          <span class="section-num emp">3</span>
          <h2>Tiến độ chi tiết từng KPI của bạn</h2>
          <span class="tag">${MONTHS[0]} – ${MONTHS[m - 1]}</span>
        </div>
        <div class="kpi-list">
          ${myItems.map(it => {
            const k = it.kpi;
            if (!k) return '';
            const p = pctOf(k, ...P);
            return `<div class="kpi-line">
              <div class="row">
                <div style="flex:1;min-width:0">
                  <div class="kpi-name">${esc(k.name)} <span class="tag ${it.kind}">${it.kind === 'iid' ? 'Từ Khối' : (it.kind === 'dept' ? 'Từ Bộ phận' : 'KPI riêng')}</span></div>
                  <div class="kpi-meta">Mục tiêu: <b>${fmt(k.target)} ${esc(k.unit)}</b> · Tỷ trọng: <b>${fmt(it.weight)}%</b> · Thực tế YTD: <b>${fmt(actualOf(k, ...P))}</b></div>
                </div>
                ${chip(p)}
              </div>
              <div class="mt-s">${pctBar(p)}</div>
            </div>`;
          }).join('')}
        </div>
      </section>`;
    }

    // ==========================================
    // 2. GÓC NHÌN DÀNH CHO MANAGER (TRƯỞNG BỘ PHẬN)
    // ==========================================
    if (u.role === 'manager' && u.deptId) {
      const myDept = deptById(u.deptId);
      const sDept = myDept ? deptScore(myDept, ...P) : null;
      const deptMembers = S.emps.filter(e => e.deptId === u.deptId);
      const empRows = deptMembers.map(e => ({ e, s: empScore(e, ...P) })).sort((a, b) => b.s - a.s);

      return `
      <section class="card hero">
        <div>
          <div class="row" style="margin-bottom:8px">
            <span class="role-pill manager">💼 Manager</span>
            <span class="small muted">Xin chào, <b>${esc(u.name)}</b> – Trưởng ${esc(myDept?.name || 'Bộ phận')}</span>
          </div>
          <h2>Bảng điều hành <span>${esc(myDept?.name || 'Bộ phận')}</span></h2>
          <p>Quản lý mục tiêu, tiến độ nhập số liệu và đánh giá KPI của toàn thể thành viên trong ${esc(myDept?.name || 'bộ phận')}.</p>
          <div class="row mt" style="flex-wrap:wrap">
            <button class="btn" data-action="goto" data-view="depts" data-dept="${myDept?.id}">② KPI Bộ phận</button>
            <button class="btn ghost" data-action="goto" data-view="review">★ Đánh giá Quý ${curQ} cho team</button>
          </div>
        </div>
        <div class="principles">
          <div class="principle">
            <span class="ic" style="background:rgba(61,139,255,.18)">📊</span>
            <div><b>Điểm Bộ phận</b><br><span class="muted">${pctTxt(sDept)} (${chip(sDept)})</span></div>
          </div>
          <div class="principle">
            <span class="ic" style="background:rgba(22,194,163,.18)">👥</span>
            <div><b>Quy mô nhân sự</b><br><span class="muted">${deptMembers.length} thành viên trực thuộc</span></div>
          </div>
        </div>
      </section>

      <section class="grid g-3 mt">
        <div class="card stat">
          <span class="glow" style="background:var(--blue)"></span>
          <div class="label">Điểm KPI Bộ phận YTD</div>
          <div class="value">${pctTxt(sDept)}</div>
          <div class="hint">Đến ${MONTHS[m - 1]} · ${chip(sDept)}</div>
        </div>
        <div class="card stat">
          <span class="glow" style="background:var(--teal)"></span>
          <div class="label">KPI riêng của bộ phận</div>
          <div class="value">${myDept ? myDept.kpis.length : 0}</div>
          <div class="hint">Tự động Roll-up từ nhân sự</div>
        </div>
        <div class="card stat">
          <span class="glow" style="background:var(--sky)"></span>
          <div class="label">Nhân sự trong phòng</div>
          <div class="value">${deptMembers.length}</div>
          <div class="hint">Đang theo dõi và review</div>
        </div>
      </section>

      <section class="grid g-2 mt">
        <div class="card">
          <div class="card-head">
            <span class="section-num dept">2</span>
            <h2>Tiến độ KPI ${esc(myDept?.name || '')}</h2>
          </div>
          <div class="kpi-list">
            ${myDept ? myDept.kpis.map(k => {
              const p = pctOf(k, ...P);
              return `<div class="kpi-line">
                <div class="row">
                  <div style="flex:1;min-width:0"><div class="kpi-name">${esc(k.name)} ${rollupBadge(k)}</div><div class="kpi-meta">Mục tiêu: ${fmt(k.target)} ${esc(k.unit)} · tỷ trọng ${fmt(k.weight)}%</div></div>
                  ${chip(p)}
                </div>
                <div class="mt-s">${pctBar(p)}</div>
              </div>`;
            }).join('') : ''}
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <span class="section-num emp">3</span>
            <h2>Thành viên trong phòng ban</h2>
          </div>
          <div class="dept-list">
            ${empRows.map(r => `<div class="row person" data-action="goto" data-view="emps" data-emp="${r.e.id}">
              ${avatar(empInitials(r.e), empColor(r.e), 34)}
              <div style="flex:1;min-width:0"><div class="kpi-name">${esc(r.e.name)}</div><div class="kpi-meta">${esc(r.e.title)}</div></div>
              <b class="small">${pctTxt(r.s)}</b>${chip(r.s)}
            </div>`).join('') || '<div class="empty">Chưa có nhân sự</div>'}
          </div>
        </div>
      </section>`;
    }

    // ==========================================
    // 3. GÓC NHÌN ADMIN (GIÁM ĐỐC KHỐI)
    // ==========================================
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
    <section class="card hero">
      <div>
        <div class="row" style="margin-bottom:8px">
          <span class="role-pill admin">👑 Admin</span>
          <span class="small muted">Giám đốc Khối IID – Toàn quyền quản trị hệ thống</span>
        </div>
        <h2>KPI 2027 – <span>Khối IID</span></h2>
        <p>Hệ thống tự động đồng bộ hai chiều: Admin thiết lập mục tiêu Khối (Top-down) và hệ thống tự động tổng hợp số liệu thực tế từ từng cá nhân & bộ phận (Bottom-up Rollup).</p>
        <div class="row mt" style="flex-wrap:wrap">
          <button class="btn" data-action="goto" data-view="tracking" id="hero-tracking">▤ Cập nhật số liệu ${MONTHS[m - 1]}</button>
          <button class="btn ghost" data-action="goto" data-view="review" id="hero-review">★ Review Quý ${curQ}</button>
          <button class="btn ghost" data-action="switch-user-modal">👤 Chuyển đổi vai trò</button>
        </div>
      </div>
      <div class="principles">
        <div class="principle"><span class="ic" style="background:rgba(61,139,255,.18)">👑</span><div><b>Phân quyền 4 cấp</b><br><span class="muted">Admin · Manager · Leader · Staff</span></div></div>
        <div class="principle"><span class="ic" style="background:rgba(22,194,163,.18)">⚡</span><div><b>Tự động Roll-up</b><br><span class="muted">Cá nhân → Bộ phận → Khối</span></div></div>
        <div class="principle"><span class="ic" style="background:rgba(139,123,255,.18)">⚖</span><div><b>Tỷ trọng = 100%</b><br><span class="muted">ở mọi cấp đánh giá</span></div></div>
        <div class="principle"><span class="ic" style="background:rgba(255,138,61,.18)">◷</span><div><b>Đánh giá theo quý</b><br><span class="muted">Quy trình 5 bước minh bạch</span></div></div>
      </div>
    </section>

    <section class="grid g-4 mt">
      <div class="card stat"><span class="glow" style="background:var(--blue)"></span><div class="label">Điểm KPI Tổng IID</div><div class="value">${pctTxt(sIid)}</div><div class="hint">YTD đến ${MONTHS[m - 1]} · ${chip(sIid)}</div></div>
      <div class="card stat"><span class="glow" style="background:var(--teal)"></span><div class="label">Bộ phận</div><div class="value">${S.depts.length}</div><div class="hint">${deptKpiN} KPI riêng · điểm TB ${pctTxt(dScores.length ? sum(dScores) / dScores.length : null)}</div></div>
      <div class="card stat"><span class="glow" style="background:var(--sky)"></span><div class="label">Nhân sự & Tài khoản</div><div class="value">${S.emps.length}</div><div class="hint">${S.users.length} tài khoản phân quyền</div></div>
      <div class="card stat entity" data-action="goto" data-view="rules"><span class="glow" style="background:${rr.errors ? 'var(--red)' : 'var(--green)'}"></span><div class="label">Nguyên tắc</div><div class="value" style="color:${rr.errors ? 'var(--red)' : 'var(--green)'}">${rr.errors ? rr.errors + ' lỗi' : 'Đạt'}</div><div class="hint">${rr.warns} cảnh báo · bấm để xem chi tiết</div></div>
    </section>

    <section class="grid g-21 mt">
      <div class="card">
        <div class="card-head"><span class="section-num">1</span><h2>KPI Tổng IID – tiến độ YTD</h2><span class="tag">${MONTHS[0]} – ${MONTHS[m - 1]}</span></div>
        <div class="kpi-list">
          ${S.iid.map(k => { const p = pctOf(k, ...P); return `<div class="kpi-line">
            <div class="row"><div style="flex:1;min-width:0"><div class="kpi-name">${esc(k.name)} ${rollupBadge(k)}</div><div class="kpi-meta">Mục tiêu ${fmt(k.target)} ${esc(k.unit)} · tỷ trọng ${fmt(k.weight)}% · ${dirTxt(k)}</div></div>${chip(p)}</div>
            <div class="mt-s">${pctBar(p)}</div></div>`; }).join('') || '<div class="empty">Chưa có KPI IID</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="section-num emp">3</span><h2>Phân bố xếp loại cá nhân</h2></div>
        <div class="donut-wrap">
          <div class="donut"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${R0}" stroke="rgba(140,170,255,.1)"/>${circles}</svg>
            <div class="center"><div><b>${S.emps.length}</b><small>nhân sự</small></div></div></div>
          <div class="legend">${legend}</div>
        </div>
      </div>
    </section>

    <section class="grid g-2 mt">
      <div class="card">
        <div class="card-head"><span class="section-num dept">2</span><h2>Điểm KPI theo bộ phận</h2><span class="tag">YTD</span></div>
        <div class="dept-list">
          ${S.depts.map(d => { const s = deptScore(d, ...P); return `<div class="row person" data-action="goto" data-view="depts" data-dept="${d.id}">
            ${ring(s)}<div style="flex:1;min-width:0"><div class="kpi-name">${esc(d.name)}</div><div class="kpi-meta">${esc(d.leader)} · ${d.kpis.length} KPI riêng · ${S.emps.filter(e => e.deptId === d.id).length} nhân sự</div>
            <div class="bar mt-s"><span style="width:${s === null ? 0 : Math.min(s, 100)}%;background:${d.color}"></span></div></div>${chip(s)}</div>`; }).join('') || '<div class="empty">Chưa có bộ phận</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="section-num emp">3</span><h2>Nhân sự nổi bật & cần hỗ trợ</h2></div>
        <div class="small muted" style="margin-bottom:8px">▲ Dẫn đầu</div>
        ${sorted.slice(0, 3).map(personRow).join('') || '<div class="empty">Chưa có dữ liệu</div>'}
        <div class="small muted" style="margin:14px 0 8px">▼ Cần hỗ trợ</div>
        ${sorted.length > 3 ? sorted.slice(-3).reverse().map(personRow).join('') : '<div class="muted small">—</div>'}
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
        <td><div class="kpi-name">${esc(k.name)} ${rollupBadge(k)}</div><div class="kpi-meta">${esc(k.owner || '—')} · ${esc(k.source || '—')}</div></td>
        <td>${typeTag(k)}</td>
        <td class="num">${fmt(k.target)} <span class="muted small">${esc(k.unit)}</span></td>
        <td class="num"><b>${fmt(k.weight)}%</b></td>
        <td class="small muted">${AGGREGATIONS[k.aggregation]}<br>${dirTxt(k)}</td>
        <td class="num">${fmt(actualOf(k, ...P))}</td>
        <td style="min-width:140px">${pctBar(p)}</td>
        <td>${chip(p)}</td>
        <td>${linkedCount(k)}</td>
        <td class="num" style="white-space:nowrap">${canManage ? kpiActions('iid', '', k.id) : '<span class="muted small">Xem</span>'}</td></tr>`;
    }).join('');

    return `
    <section class="grid g-12">
      <div class="card">
        <div class="card-head"><span class="section-num">1</span><h2>Điểm KPI Tổng IID</h2></div>
        <div class="row" style="gap:18px">${ring(s, true)}
          <div><div style="font-size:13px" class="muted">YTD ${MONTHS[0]} – ${MONTHS[S.currentMonth - 1]}</div><div class="mt-s">${chip(s)}</div>
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
      <div class="table-wrap"><table>
        <thead><tr><th>KPI</th><th>Loại</th><th class="num">Mục tiêu năm</th><th class="num">Tỷ trọng</th><th>Cách tính</th><th class="num">Thực tế YTD</th><th>% hoàn thành</th><th>Đánh giá</th><th>Được cascade</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10" class="empty">Chưa có KPI IID</td></tr>'}</tbody>
      </table></div>
    </section>

    <section class="grid g-2 mt">
      ${S.iid.map(k => `<div class="card"><div class="card-head"><h3>${esc(k.name)} ${rollupBadge(k)}</h3><span class="tag">${esc(k.unit)}</span>${chip(pctOf(k, ...P))}</div>${chartSVG(k)}</div>`).join('')}
    </section>`;
  }

  /* ---------- KPI Bộ phận (Chỉ hiển thị bộ phận liên quan) ---------- */
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

  /* ---------- KPI Cá nhân (Staff chỉ xem chính mình) ---------- */
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

    // Nếu là Staff: không hiển thị danh sách hay tabs, chỉ hiện duy nhất KPI của mình
    if (isStaff()) {
      return detail;
    }

    const tabs = isAdm()
      ? [['all', 'Tất cả'], ...S.depts.map(x => [x.id, x.name])].map(([v, l]) => `<button class="${UI.empFilter === v ? 'active' : ''}" data-action="emp-filter" data-val="${v}">${esc(l)}</button>`).join('')
      : '';

    return `
    <div class="row" style="margin-bottom:16px;flex-wrap:wrap">
      ${tabs ? `<div class="tabs">${tabs}</div>` : `<span class="small muted">Danh sách nhân sự thuộc ${esc(deptById(curUser().deptId)?.name || 'đơn vị')}</span>`}
      <span class="spacer"></span>
      ${isAdm() || curUser().role === 'manager' ? '<button class="btn" data-action="add-emp" id="btn-add-emp">＋ Thêm nhân sự</button>' : ''}
    </div>
    <section class="grid g-4">${visibleEmps.map(x => empCard(x, P)).join('')}</section>
    ${detail}`;
  }

  /* ---------- Theo dõi hàng tháng (Tracking Scoped) ---------- */
  function trackTarget() {
    const u = curUser();
    // 1. Staff: khóa chết ở cá nhân mình
    if (u.role === 'staff') {
      const e = empById(u.empId);
      return e ? { scope: 'emp', eid: e.id, kpis: e.kpis, items: empItems(e), name: `Cá nhân: ${e.name}` } : null;
    }
    // 2. Manager: chỉ có IID, Bộ phận mình hoặc nhân sự thuộc bộ phận mình
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
    // 3. Admin: toàn quyền
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
    T.kpis.forEach(k => { for (let m = 0; m < S.currentMonth; m++) { need++; if (isNum(k.monthly[m])) filled++; } });
    const comp = need ? filled / need * 100 : 0;
    return `<div class="row" style="gap:18px">${ring(s, true)}
      <div style="flex:1"><div class="kpi-name">${esc(T.name)}</div><div class="small muted">Điểm tổng hợp YTD (bao gồm cả các chỉ số liên kết & tự động Roll-up)</div><div class="mt-s">${chip(s)}</div></div>
      <div style="min-width:220px"><div class="row small"><span class="muted">Số liệu cập nhật đến ${MONTHS[S.currentMonth - 1]}</span><span class="spacer"></span><b>${fmt(comp, 0)}%</b></div>
      <div class="bar lg mt-s"><span style="width:${comp}%"></span></div><div class="small muted mt-s">${filled}/${need} ô dữ liệu đã nhập</div></div>
    </div>`;
  }
  function trackRowCells(k) {
    const P = ytd(), p = pctOf(k, ...P);
    return { ytd: `${fmt(actualOf(k, ...P))}<div class="kpi-meta">MT kỳ: ${fmt(targetOf(k, ...P))}</div>`, pct: pctBar(p) };
  }
  function viewTracking() {
    const u = curUser();

    // STAFF: Chỉ hiển thị bảng của chính mình!
    if (u.role === 'staff') {
      const T = trackTarget();
      if (!T) return `<div class="card empty">Chưa tìm thấy dữ liệu cá nhân.</div>`;
      const rows = T.kpis.map(k => {
        const c = trackRowCells(k);
        const cells = k.monthly.map((v, m) =>
          `<td><input type="text" inputmode="decimal" class="cell-input ${isNum(v) ? 'filled' : ''} ${m >= S.currentMonth ? 'future' : ''}" value="${isNum(v) ? v : ''}" data-scope="${T.scope}" data-eid="${T.eid}" data-kid="${k.id}" data-m="${m}" aria-label="${esc(k.name)} ${MONTHS[m]}"/></td>`
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
          <thead><tr><th class="sticky-col">KPI</th><th class="num">MT năm</th>${MONTHS.map((m, i) => `<th class="num ${i + 1 === S.currentMonth ? 'cur-month' : ''}">${m}</th>`).join('')}<th class="num">Thực tế YTD</th><th>% hoàn thành</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="16" class="empty">Chưa có KPI riêng</td></tr>`}</tbody>
        </table></div>
        <div class="small muted mt-s">💡 Nhập số liệu thực tế tháng vào ô tương ứng, hệ thống sẽ tự động tính lũy kế và đồng bộ lên phòng ban.</div>
      </section>`;
    }

    // MANAGER / ADMIN:
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
    let body = '<div class="card mt empty">Không có dữ liệu.</div>';
    if (T) {
      const rows = T.kpis.map(k => {
        const c = trackRowCells(k);
        const isRollup = k.rollupMode && k.rollupMode !== 'manual';
        const canInput = canInputMonthly(T.scope, T.eid, k.id);
        const cells = k.monthly.map((v, m) => {
          if (isRollup) {
            return `<td><input type="text" class="cell-input rollup-locked ${isNum(v) ? 'filled' : ''}" value="${isNum(v) ? v : ''}" readonly title="⚡ Số liệu tự động tổng hợp từ cấp dưới" /></td>`;
          }
          return `<td><input type="text" inputmode="decimal" class="cell-input ${isNum(v) ? 'filled' : ''} ${m >= S.currentMonth ? 'future' : ''}" value="${isNum(v) ? v : ''}" ${canInput ? '' : 'disabled title="Bạn không có quyền nhập ô này"'} data-scope="${T.scope}" data-eid="${T.eid}" data-kid="${k.id}" data-m="${m}" aria-label="${esc(k.name)} ${MONTHS[m]}"/></td>`;
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
          <thead><tr><th class="sticky-col">KPI</th><th class="num">MT năm</th>${MONTHS.map((m, i) => `<th class="num ${i + 1 === S.currentMonth ? 'cur-month' : ''}">${m}</th>`).join('')}<th class="num">Thực tế YTD</th><th>% hoàn thành</th></tr></thead>
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

  /* ---------- Review hàng quý (Scoped per Role) ---------- */
  const reviewKey = (type, id, q) => `${type}_${id}_Q${q}`;
  const getReview = (type, id, q) => S.reviews[reviewKey(type, id, q)] || { status: 'todo', self: '', mgr: '', plan: '', adjust: '' };
  const statusIdx = s => REVIEW_STATUS.findIndex(x => x[0] === s);
  function viewReview() {
    if (!UI.reviewQ) UI.reviewQ = qOf(S.currentMonth);
    const q = UI.reviewQ, Q = QUARTERS[q - 1], R = qRange(q), started = Q.from <= S.currentMonth;
    const u = curUser();

    // 1. Phân loại danh sách hiển thị theo quyền
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
      // Admin: Toàn bộ
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

  /* ---------- Kiểm tra nguyên tắc (Dành cho Admin & Manager) ---------- */
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

  /* ---------- Phân quyền & Người dùng (Chỉ Admin) ---------- */
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
            <div><div class="kpi-name">${esc(u.name)} ${isCur ? '<span class="tag good">Đang chọn</span>' : ''}</div>
            <div class="kpi-meta">${esc(u.email || '—')}</div></div>
          </div>
        </td>
        <td><span class="role-pill ${r.id}">${r.badge}</span></td>
        <td>${esc(u.title || '—')}</td>
        <td>${d ? `<span class="tag dept">${esc(d.name)}</span>` : '<span class="muted small">Toàn Khối (Khối IID)</span>'}</td>
        <td class="num">
          <button class="btn sm ${isCur ? 'ghost' : ''}" data-action="switch-user" data-uid="${u.id}">${isCur ? '✓ Đang dùng' : 'Đăng nhập vai trò này'}</button>
          <button class="icon-btn" title="Sửa" data-action="edit-user" data-uid="${u.id}">✎</button>
        </td>
      </tr>`;
    }).join('');

    return `
    <section class="card hero">
      <div>
        <h2>Quản lý Phân quyền & Người dùng</h2>
        <p>Quản trị danh sách tài khoản và phân quyền cho 4 cấp: Admin, Manager, Leader, Staff.</p>
        <div class="row mt">
          <button class="btn" data-action="add-user">＋ Thêm tài khoản</button>
          <button class="btn ghost" data-action="switch-user-modal">👤 Chuyển đổi vai trò nhanh</button>
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
      <div class="card-head">
        <h2>Danh sách tài khoản & vai trò</h2>
        <span class="tag">${S.users.length} tài khoản</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Họ tên & Email</th><th>Vai trò</th><th>Chức danh</th><th>Đơn vị phụ trách</th><th class="num">Thao tác</th></tr></thead>
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
    render(true);
  }

  /* =========================================================
     MODAL & FORMS
     ========================================================= */
  let modalSubmit = null, modalInput = null;
  function openModal(title, html, onSubmit, onInput) {
    $('#modal-title').textContent = title;
    const f = $('#modal-form');
    f.innerHTML = html + `<div class="modal-actions"><button type="button" class="btn ghost" data-action="close-modal" id="modal-cancel">Hủy</button><button type="submit" class="btn" id="modal-save">Lưu</button></div>`;
    modalSubmit = onSubmit; modalInput = onInput || null;
    $('#modal').hidden = false;
    if (modalInput) modalInput(f);
    setTimeout(() => f.querySelector('input:not([type=hidden]), textarea, select')?.focus(), 50);
  }
  function closeModal() { $('#modal').hidden = true; modalSubmit = modalInput = null; }

  const field = (label, inner, full = false, help = '') => `<div class="field ${full ? 'full' : ''}"><label>${label}</label>${inner}${help ? `<span class="help">${help}</span>` : ''}</div>`;
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;

  /* ---------- Switch User Modal ---------- */
  function switchUserModal() {
    const items = S.users.map(u => {
      const r = roleOf(u);
      const d = deptById(u.deptId);
      const isCur = u.id === S.currentUserId;
      return `<div class="user-select-item ${isCur ? 'current' : ''}" data-action="switch-user" data-uid="${u.id}">
        ${avatar((u.name || '?').slice(0, 2).toUpperCase(), d?.color || 'var(--blue)', 38)}
        <div style="flex:1">
          <div class="row"><b>${esc(u.name)}</b> <span class="role-pill ${r.id}">${r.badge}</span></div>
          <div class="small muted">${esc(u.title || '')} · ${d ? esc(d.name) : 'Toàn Khối IID'}</div>
        </div>
        ${isCur ? '<span class="tag good">Đang chọn</span>' : '<button class="btn sm ghost">Chọn</button>'}
      </div>`;
    }).join('');

    openModal('👤 Chuyển đổi tài khoản & Vai trò kiểm thử', `
      <div class="field full"><span class="help">Chọn một tài khoản để kiểm tra giao diện và quyền truy cập thực tế. Dữ liệu sẽ được lọc chính xác theo trách nhiệm của người đó.</span></div>
      <div class="user-select-list">${items}</div>
    `, () => true);
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

    openModal(`${old ? '✎ Sửa' : '＋ Thêm'} ${lvl}`, `
      ${field('Tên KPI *', `<input type="text" name="name" required value="${esc(k.name)}" placeholder="VD: Doanh thu ký mới" id="f-kpi-name">`, true)}
      ${field('Cơ chế thiết lập (Roll-up) *', `<select name="rollupMode">
        ${Object.entries(ROLLUP_MODES).map(([v, l]) => opt(v, l, (k.rollupMode || 'manual') === v)).join('')}
      </select>`, true, 'Nếu chọn Roll-up, mục tiêu và số liệu hàng tháng sẽ được tự động tính từ các KPI con liên kết lên')}
      ${field('Đơn vị', `<input type="text" name="unit" value="${esc(k.unit)}" placeholder="tỷ, %, KH...">`)}
      ${field('Mục tiêu năm *', `<input type="number" step="any" name="target" value="${k.target || ''}" required>`)}
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
      if (!(+v.target > 0) && v.rollupMode === 'manual') { toast('Mục tiêu năm phải lớn hơn 0', true); return false; }
      const patch = {
        name: v.name.trim(), unit: v.unit.trim(), target: +v.target || 0, weight: +v.weight || 0,
        rollupMode: v.rollupMode || 'manual',
        direction: v.direction, aggregation: v.aggregation, type: v.type, frequency: v.frequency,
        owner: v.owner.trim(), source: v.source.trim(), linkTo: linkOpts ? (v.linkTo || null) : null
      };
      if (old) Object.assign(old, patch); else list.push(Object.assign(k, patch));
      computeRollups();
      save(); render(); toast(old ? 'Đã cập nhật KPI' : 'Đã thêm KPI mới');
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
    if (!confirm('Khôi phục dữ liệu mẫu? Toàn bộ dữ liệu hiện tại sẽ bị thay thế.\n(Hãy "Xuất JSON" trước nếu cần sao lưu.)')) return;
    S = normalize(buildSampleData());
    UI.selDept = UI.selEmp = null;
    computeRollups();
    save(); fillMonthSelect(); render(true);
    toast('Đã khôi phục dữ liệu mẫu');
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

  function fillMonthSelect() {
    $('#month-select').innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === S.currentMonth ? 'selected' : ''}>Tháng ${i + 1}/${S.year || 2027}</option>`).join('');
  }

  /* =========================================================
     EVENTS
     ========================================================= */
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-action], .nav-item');
    if (!el) {
      if (ev.target.id === 'modal') closeModal();
      return;
    }
    if (el.classList.contains('nav-item')) { navigate(el.dataset.view); return; }
    const a = el.dataset.action, ds = el.dataset;
    switch (a) {
      case 'export': exportJSON(); break;
      case 'import': $('#import-file').click(); break;
      case 'reset': resetData(); break;
      case 'close-modal': closeModal(); break;
      case 'switch-user-modal': switchUserModal(); break;
      case 'switch-to-admin':
        S.currentUserId = 'u_admin';
        UI.selDept = UI.selEmp = null;
        save(); render(true); toast('Đã chuyển sang vai trò: Admin (Giám đốc Khối)');
        break;
      case 'switch-user': {
        const u = S.users.find(x => x.id === ds.uid);
        if (u) {
          S.currentUserId = u.id;
          UI.selDept = u.deptId || null;
          UI.selEmp = u.empId || null;
          save(); closeModal(); render(true);
          toast(`Đã chuyển sang: ${u.name} (${roleOf(u).badge})`);
        }
        break;
      }
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
    if (t.id === 'month-select') { S.currentMonth = +t.value; save(); render(); toast(`Dữ liệu tính đến Tháng ${t.value}`); }
    else if (t.id === 'track-entity') { if (UI.trackLevel === 'dept') UI.trackDept = t.value; else UI.trackEmp = t.value; render(); }
    else if (t.id === 'import-file') { if (t.files[0]) importJSON(t.files[0]); t.value = ''; }
    else if (t.classList.contains('cell-input')) onCellChange(t);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !$('#modal').hidden) closeModal();
    if (ev.key === 'Enter' && ev.target.classList?.contains('cell-input')) { ev.preventDefault(); ev.target.blur(); }
  });

  const form = $('#modal-form');
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!modalSubmit) return;
    if (modalSubmit(new FormData(form), form) !== false) closeModal();
  });
  form.addEventListener('input', () => { if (modalInput) modalInput(form); });

  $('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (RENDER[h] && h !== UI.view) navigate(h); });

  /* ---------- Init ---------- */
  fillMonthSelect();
  computeRollups();
  const h = location.hash.slice(1);
  UI.view = RENDER[h] ? h : 'dashboard';
  render(true);
})();
