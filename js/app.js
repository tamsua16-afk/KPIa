/* =========================================================
   KPI 2027 – Khối IID : Logic ứng dụng
   - Lưu trữ localStorage, xuất / nhập JSON
   - Tính % hoàn thành, điểm KPI, xếp loại
   - Kiểm tra nguyên tắc cascade IID → Bộ phận → Cá nhân
   - Các màn hình: Tổng quan, IID, Bộ phận, Cá nhân, Theo dõi tháng,
     Review quý, Cây liên kết, Kiểm tra nguyên tắc
   ========================================================= */
(() => {
  'use strict';

  const STORE = 'kpi2027_iid_v1';
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
    return k;
  }
  function normalize(d) {
    d.reviews = d.reviews || {};
    d.currentMonth = clamp(+d.currentMonth || 12, 1, 12);
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
      if (!(+k.target > 0)) I('err', sc, `KPI "${k.name}" chưa có mục tiêu hợp lệ`, 'Mục tiêu năm phải lớn hơn 0.', nav);
      if (!(+k.weight > 0)) I('warn', sc, `KPI "${k.name}" có tỷ trọng 0%`, 'KPI không có tỷ trọng sẽ không được tính điểm.', nav);
      if (!String(k.owner || '').trim()) I('warn', sc, `KPI "${k.name}" chưa có người phụ trách`, 'Mỗi KPI cần một người chịu trách nhiệm rõ ràng.', nav);
      if (!String(k.source || '').trim()) I('warn', sc, `KPI "${k.name}" chưa có nguồn dữ liệu`, 'Cần xác định nguồn số liệu để đo lường khách quan.', nav);
    };

    // IID
    let n0 = issues.length;
    const iw = sum(S.iid.map(k => k.weight));
    const navIid = { view: 'iid' };
    if (!S.iid.length) I('err', 'KPI Tổng IID', 'Chưa có KPI Tổng IID', 'Cần thiết lập KPI cấp Khối trước khi cascade.', navIid);
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
      if (Math.abs(a + b - 100) > .01) I('err', sc, 'Tổng tỷ trọng phải bằng 100%', `Hiện tại: ${fmt(a + b)}% (IID ${fmt(a)}% + riêng ${fmt(b)}%).`, nav);
      if (!inRange(d.kpis.length, R.deptKpiCount)) I('err', sc, `Số KPI riêng của bộ phận phải từ ${R.deptKpiCount[0]}–${R.deptKpiCount[1]}`, `Hiện có ${d.kpis.length} KPI.`, nav);
      d.iidLinks.forEach(l => { if (!S.iid.some(k => k.id === l.kpiId)) I('err', sc, 'Liên kết tới KPI IID không tồn tại', 'Cập nhật lại phần "Liên kết KPI IID".', nav); });
      d.kpis.forEach(k => {
        if (!k.linkTo) I('warn', sc, `KPI "${k.name}" chưa liên kết lên KPI IID`, 'Mỗi KPI bộ phận nên đóng góp cho ít nhất một KPI Tổng IID.', nav);
        else if (!S.iid.some(x => x.id === k.linkTo)) I('err', sc, `KPI "${k.name}" liên kết tới KPI IID không tồn tại`, 'Chọn lại KPI IID để liên kết.', nav);
        fieldChecks(k, sc, nav);
      });
      const act = sum(d.kpis.filter(k => k.type === 'activity').map(k => k.weight));
      if (b && act / b > .5) I('warn', sc, 'KPI hoạt động chiếm hơn 50% tỷ trọng KPI riêng', 'Nên ưu tiên KPI kết quả (outcome) thay vì KPI hoạt động.', nav);
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
      e.iidLinks.forEach(l => { if (!S.iid.some(k => k.id === l.kpiId)) I('err', sc, 'Liên kết tới KPI IID không tồn tại', 'Cập nhật lại liên kết.', nav); });
      e.deptLinks.forEach(l => {
        if (!d || !d.kpis.some(k => k.id === l.kpiId)) I('err', sc, 'KPI Bộ phận được nhận không thuộc bộ phận của nhân sự', 'Chỉ nhận KPI từ bộ phận mình trực thuộc.', nav);
      });
      e.kpis.forEach(k => {
        if (!k.linkTo) I('warn', sc, `KPI "${k.name}" chưa liên kết lên KPI Bộ phận`, 'KPI cá nhân nên đóng góp cho KPI của bộ phận.', nav);
        else if (!d || !d.kpis.some(x => x.id === k.linkTo)) I('err', sc, `KPI "${k.name}" liên kết tới KPI không thuộc bộ phận`, 'Chọn lại KPI bộ phận để liên kết.', nav);
        fieldChecks(k, sc, nav);
      });
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
  function itemsTable(groups, [from, to]) {
    let rows = '';
    groups.forEach(g => {
      rows += `<tr class="group-row"><td colspan="9">${g.title} · ${fmt(sum(g.items.map(i => i.weight)))}%</td></tr>`;
      if (!g.items.length) rows += `<tr><td colspan="9" class="muted small">Chưa có KPI trong nhóm này</td></tr>`;
      g.items.forEach(it => {
        const k = it.kpi;
        if (!k) {
          rows += `<tr><td><span class="tag bad">Lỗi</span></td><td colspan="7" class="muted">Liên kết tới KPI không còn tồn tại</td><td class="num">${it.actions || ''}</td></tr>`;
          return;
        }
        const p = pctOf(k, from, to), a = actualOf(k, from, to);
        rows += `<tr>
          <td><span class="tag ${g.cls}">${g.tag}</span></td>
          <td><div class="kpi-name">${esc(k.name)}</div><div class="kpi-meta">${typeTag(k)} ${esc(k.owner || '—')} · ${esc(k.source || '—')}</div></td>
          <td class="num">${fmt(k.target)} <span class="muted small">${esc(k.unit)}</span></td>
          <td class="num"><b>${fmt(it.weight)}%</b></td>
          <td>${it.link || '<span class="muted small">—</span>'}</td>
          <td class="num">${fmt(a)}</td>
          <td style="min-width:140px">${pctBar(p)}</td>
          <td>${chip(p)}</td>
          <td class="num" style="white-space:nowrap">${it.actions || ''}</td>
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
     VIEWS
     ========================================================= */
  const VIEWS = {
    dashboard: ['Tổng quan', 'KPI được triển khai xuyên suốt từ cấp Khối → Bộ phận → Cá nhân'],
    iid: ['① KPI Tổng IID', 'Mục tiêu cấp Khối – điểm xuất phát của toàn bộ hệ thống KPI'],
    depts: ['② KPI Bộ phận', 'Mỗi bộ phận nhận 30–70% từ KPI IID và tự xây dựng 3–5 KPI riêng (30–70%)'],
    emps: ['③ KPI Cá nhân', 'Cá nhân: 20–40% KPI IID · 30–50% KPI Bộ phận · 20–40% KPI riêng · tối đa 8 KPI'],
    tracking: ['Theo dõi hàng tháng', 'Nhập số liệu thực tế theo tháng – hệ thống tự tính lũy kế & % hoàn thành'],
    review: ['Review hàng quý', 'Tự đánh giá → Quản lý review → Chốt kết quả theo từng quý'],
    cascade: ['Cây liên kết KPI', 'Kiểm tra mức độ liên kết IID → Bộ phận → Cá nhân'],
    rules: ['Kiểm tra nguyên tắc', 'Tự động rà soát tỷ trọng, số lượng KPI và liên kết theo quy định']
  };

  /* ---------- Dashboard ---------- */
  function viewDashboard() {
    const P = ytd(), m = S.currentMonth;
    const sIid = iidScore(...P);
    const rr = checkRules();
    const deptKpiN = sum(S.depts.map(d => d.kpis.length));
    const empKpiN = sum(S.emps.map(e => e.kpis.length));
    const dScores = S.depts.map(d => deptScore(d, ...P)).filter(v => v !== null);
    const empRows = S.emps.map(e => ({ e, s: empScore(e, ...P) }));

    // Rating distribution
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

    // Process steps
    const iidOk = S.iid.length && Math.abs(sum(S.iid.map(k => k.weight)) - 100) < .01;
    const deptErr = rr.issues.some(i => i.level === 'err' && i.nav?.view === 'depts');
    const empErr = rr.issues.some(i => i.level === 'err' && i.nav?.view === 'emps');
    const curQ = qOf(m);
    const steps = [
      ['Thiết lập KPI IID', 'Mục tiêu Khối, tỷ trọng = 100%', iidOk],
      ['Cascade Bộ phận', '30–70% IID · 3–5 KPI riêng', iidOk && !deptErr],
      ['Cascade Cá nhân', 'IID · Bộ phận · riêng · ≤ 8 KPI', iidOk && !deptErr && !empErr],
      ['Theo dõi hàng tháng', `Đã có số liệu đến ${MONTHS[m - 1]}`, m === 12],
      ['Review hàng quý', `Đang ở Quý ${curQ}/4`, false]
    ];
    let curSet = false;
    const stepsHtml = steps.map((s, i) => {
      let cls = s[2] ? 'done' : '';
      if (!s[2] && !curSet) { cls = 'current'; curSet = true; }
      return `<div class="step ${cls}"><div class="n">${s[2] ? '✓' : i + 1}</div><h4>${s[0]}</h4><p>${s[1]}</p></div>`;
    }).join('');

    const notes = [
      ['🎯', 'KPI phải <b>SMART</b>: cụ thể, đo lường được, khả thi, liên quan và có thời hạn.'],
      ['📈', 'Ưu tiên <b>KPI kết quả</b> hơn KPI hoạt động; KPI hoạt động chỉ là bổ trợ.'],
      ['👤', 'Mỗi KPI có <b>người phụ trách</b> và <b>nguồn dữ liệu</b> rõ ràng.'],
      ['🔗', 'Mọi KPI cấp dưới đều <b>liên kết lên</b> KPI cấp trên – không có KPI "mồ côi".'],
      ['⚖️', `Tỷ trọng mỗi cấp = <b>100%</b>; ghi nhận tối đa <b>${RULES.cap}%</b> cho 1 KPI.`]
    ].map((n, i) => `<div class="note"><span class="ic">${n[0]}</span>${n[1]}<b>${i + 1}</b></div>`).join('');

    return `
    <section class="card hero">
      <div>
        <h2>KPI 2027 – <span>Khối IID</span></h2>
        <p>Hệ thống KPI được cascade từ mục tiêu chung của Khối xuống từng Bộ phận và từng Cá nhân, theo dõi số liệu hàng tháng và review kết quả hàng quý.</p>
        <div class="row mt" style="flex-wrap:wrap">
          <button class="btn" data-action="goto" data-view="tracking" id="hero-tracking">▤ Cập nhật số liệu ${MONTHS[m - 1]}</button>
          <button class="btn ghost" data-action="goto" data-view="review" id="hero-review">★ Review Quý ${curQ}</button>
        </div>
      </div>
      <div class="principles">
        <div class="principle"><span class="ic" style="background:rgba(61,139,255,.18)">⋔</span><div><b>Cascade xuyên suốt</b><br><span class="muted">IID → Bộ phận → Cá nhân</span></div></div>
        <div class="principle"><span class="ic" style="background:rgba(22,194,163,.18)">⚖</span><div><b>Tỷ trọng = 100%</b><br><span class="muted">ở mọi cấp đánh giá</span></div></div>
        <div class="principle"><span class="ic" style="background:rgba(139,123,255,.18)">#</span><div><b>3–5 KPI bộ phận</b><br><span class="muted">≤ ${RULES.emp.maxKpi} KPI / cá nhân</span></div></div>
        <div class="principle"><span class="ic" style="background:rgba(255,138,61,.18)">◷</span><div><b>Tháng & Quý</b><br><span class="muted">Theo dõi tháng · review quý</span></div></div>
      </div>
    </section>

    <section class="grid g-4 mt">
      <div class="card stat"><span class="glow" style="background:var(--blue)"></span><div class="label">Điểm KPI Tổng IID</div><div class="value">${pctTxt(sIid)}</div><div class="hint">YTD đến ${MONTHS[m - 1]} · ${chip(sIid)}</div></div>
      <div class="card stat"><span class="glow" style="background:var(--teal)"></span><div class="label">Bộ phận</div><div class="value">${S.depts.length}</div><div class="hint">${deptKpiN} KPI riêng · điểm TB ${pctTxt(dScores.length ? sum(dScores) / dScores.length : null)}</div></div>
      <div class="card stat"><span class="glow" style="background:var(--sky)"></span><div class="label">Nhân sự</div><div class="value">${S.emps.length}</div><div class="hint">${empKpiN} KPI cá nhân riêng</div></div>
      <div class="card stat entity" data-action="goto" data-view="rules"><span class="glow" style="background:${rr.errors ? 'var(--red)' : 'var(--green)'}"></span><div class="label">Nguyên tắc</div><div class="value" style="color:${rr.errors ? 'var(--red)' : 'var(--green)'}">${rr.errors ? rr.errors + ' lỗi' : 'Đạt'}</div><div class="hint">${rr.warns} cảnh báo · bấm để xem chi tiết</div></div>
    </section>

    <section class="grid g-21 mt">
      <div class="card">
        <div class="card-head"><span class="section-num">1</span><h2>KPI Tổng IID – tiến độ YTD</h2><span class="tag">${MONTHS[0]} – ${MONTHS[m - 1]}</span></div>
        <div class="kpi-list">
          ${S.iid.map(k => { const p = pctOf(k, ...P); return `<div class="kpi-line">
            <div class="row"><div style="flex:1;min-width:0"><div class="kpi-name">${esc(k.name)}</div><div class="kpi-meta">Mục tiêu ${fmt(k.target)} ${esc(k.unit)} · tỷ trọng ${fmt(k.weight)}% · ${dirTxt(k)}</div></div>${chip(p)}</div>
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
    </section>

    <section class="card mt">
      <div class="card-head"><h2>Quy trình KPI 2027</h2></div>
      <div class="steps">${stepsHtml}</div>
    </section>

    <section class="card mt">
      <div class="card-head"><h2>5 lưu ý khi xây dựng KPI</h2></div>
      <div class="notes">${notes}</div>
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
    const rows = S.iid.map(k => {
      const p = pctOf(k, ...P);
      return `<tr>
        <td><div class="kpi-name">${esc(k.name)}</div><div class="kpi-meta">${esc(k.owner || '—')} · ${esc(k.source || '—')}</div></td>
        <td>${typeTag(k)}</td>
        <td class="num">${fmt(k.target)} <span class="muted small">${esc(k.unit)}</span></td>
        <td class="num"><b>${fmt(k.weight)}%</b></td>
        <td class="small muted">${AGGREGATIONS[k.aggregation]}<br>${dirTxt(k)}</td>
        <td class="num">${fmt(actualOf(k, ...P))}</td>
        <td style="min-width:140px">${pctBar(p)}</td>
        <td>${chip(p)}</td>
        <td>${linkedCount(k)}</td>
        <td class="num" style="white-space:nowrap">${kpiActions('iid', '', k.id)}</td></tr>`;
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
        <div class="card-head"><h2>Vai trò của KPI Tổng IID</h2></div>
        <div class="small muted" style="display:grid;gap:8px">
          <div>• Là <b style="color:var(--text)">mục tiêu chung</b> của toàn Khối – mọi bộ phận và cá nhân đều nhận một phần tỷ trọng từ đây.</div>
          <div>• Bộ phận nhận <b style="color:var(--text)">${RULES.dept.iid[0]}–${RULES.dept.iid[1]}%</b>, cá nhân nhận <b style="color:var(--text)">${RULES.emp.iid[0]}–${RULES.emp.iid[1]}%</b> tỷ trọng từ KPI IID.</div>
          <div>• Số liệu IID được cập nhật hàng tháng tại màn hình <a href="#tracking" class="link">Theo dõi hàng tháng</a>.</div>
          <div>• Mỗi KPI ghi nhận tối đa <b style="color:var(--text)">${RULES.cap}%</b> để tránh bù trừ quá mức.</div>
        </div>
      </div>
    </section>

    <section class="card mt">
      <div class="card-head"><h2>Danh sách KPI Tổng IID</h2><span class="spacer"></span><button class="btn" data-action="add-kpi" data-scope="iid" id="btn-add-iid">＋ Thêm KPI IID</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>KPI</th><th>Loại</th><th class="num">Mục tiêu năm</th><th class="num">Tỷ trọng</th><th>Cách tính</th><th class="num">Thực tế YTD</th><th>% hoàn thành</th><th>Đánh giá</th><th>Được cascade</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10" class="empty">Chưa có KPI – bấm "Thêm KPI IID"</td></tr>'}</tbody>
      </table></div>
    </section>

    <section class="grid g-2 mt">
      ${S.iid.map(k => `<div class="card"><div class="card-head"><h3>${esc(k.name)}</h3><span class="tag">${esc(k.unit)}</span>${chip(pctOf(k, ...P))}</div>${chartSVG(k)}</div>`).join('')}
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
    if (!UI.selDept || !deptById(UI.selDept)) UI.selDept = S.depts[0]?.id || null;
    const d = deptById(UI.selDept);
    let detail = '<div class="card mt empty">Chưa có bộ phận – bấm "Thêm bộ phận" để bắt đầu.</div>';
    if (d) {
      const a = sum(d.iidLinks.map(l => l.weight)), b = sum(d.kpis.map(k => k.weight));
      const items = deptItems(d);
      const groups = [
        { title: 'Nhận từ KPI Tổng IID', cls: 'iid', tag: 'IID', items: items.filter(i => i.kind === 'iid').map(i => ({ ...i, actions: `<button class="icon-btn" title="Sửa liên kết" data-action="dept-links" data-eid="${d.id}">⚙</button>` })) },
        { title: 'KPI riêng của bộ phận', cls: 'dept', tag: 'Bộ phận', items: d.kpis.map(k => ({ kind: 'own', kpi: k, weight: k.weight, link: linkName(k.linkTo), actions: kpiActions('dept', d.id, k.id) })) }
      ];
      const members = S.emps.filter(e => e.deptId === d.id);
      detail = `
      <section class="card mt">
        <div class="card-head" style="flex-wrap:wrap">
          ${avatar(deptInitials(d), d.color)}
          <div><h2 style="font-size:17px">${esc(d.name)}</h2><div class="small muted">Trưởng bộ phận: ${esc(d.leader || '—')} · ${members.length} nhân sự</div></div>
          <span class="spacer"></span>
          <button class="btn ghost sm" data-action="edit-dept" data-eid="${d.id}">✎ Sửa</button>
          <button class="btn ghost sm" data-action="dept-links" data-eid="${d.id}">⚙ Liên kết KPI IID</button>
          <button class="btn sm" data-action="add-kpi" data-scope="dept" data-eid="${d.id}">＋ KPI bộ phận</button>
          <button class="btn ghost sm danger-hover" data-action="del-dept" data-eid="${d.id}">🗑</button>
        </div>
        <div class="grid g-4">
          ${weightStat('Nhận từ KPI IID', a, RULES.dept.iid)}
          ${weightStat('KPI riêng bộ phận', b, RULES.dept.dept)}
          ${countStat('Số KPI riêng', d.kpis.length, RULES.dept.deptKpiCount)}
          ${weightStat('Tổng tỷ trọng', a + b, null)}
        </div>
        <div class="mt">${itemsTable(groups, P)}</div>
        <div class="row mt" style="flex-wrap:wrap;gap:8px"><span class="small muted">Nhân sự:</span>
          ${members.map(e => `<button class="tag emp" data-action="goto" data-view="emps" data-emp="${e.id}">${esc(e.name)} · ${pctTxt(empScore(e, ...P))}</button>`).join('') || '<span class="small muted">Chưa có</span>'}
        </div>
      </section>`;
    }
    return `
    <div class="row" style="margin-bottom:16px"><span class="muted small">Chọn bộ phận để xem & chỉnh sửa chi tiết</span><span class="spacer"></span>
      <button class="btn" data-action="add-dept" id="btn-add-dept">＋ Thêm bộ phận</button></div>
    <section class="grid g-4">${S.depts.map(x => deptCard(x, P)).join('')}</section>
    ${detail}`;
  }

  /* ---------- KPI Cá nhân ---------- */
  function empCard(e, P) {
    const s = empScore(e, ...P), color = empColor(e);
    const a = sum(e.iidLinks.map(l => l.weight)), b = sum(e.deptLinks.map(l => l.weight)), c = sum(e.kpis.map(k => k.weight));
    const cnt = e.iidLinks.length + e.deptLinks.length + e.kpis.length;
    const segColor = { iid: 'var(--blue)', dept: 'var(--teal)', own: 'var(--sky)' };
    const segs = empItems(e).map(it => `<span style="width:${it.weight}%;background:${segColor[it.kind]};border-right:1px solid var(--bg)"></span>`).join('');
    return `<div class="card entity ${UI.selEmp === e.id ? 'selected' : ''}" data-action="sel-emp" data-eid="${e.id}" id="emp-${e.id}">
      <div class="entity-top">${avatar(empInitials(e), color)}<div style="flex:1;min-width:0"><h3>${esc(e.name)}</h3><div class="sub">${esc(e.title || '—')}</div></div>${ring(s)}</div>
      <div class="mini-weights">${segs}</div>
      <div class="entity-foot"><span class="tag iid">IID ${fmt(a)}%</span><span class="tag dept">BP ${fmt(b)}%</span><span class="tag emp">Riêng ${fmt(c)}%</span><span class="tag ${cnt > RULES.emp.maxKpi ? 'bad' : ''}">${cnt} KPI</span></div>
    </div>`;
  }
  function viewEmps() {
    const P = ytd();
    const list = S.emps.filter(e => UI.empFilter === 'all' || e.deptId === UI.empFilter);
    if (!UI.selEmp || !list.some(e => e.id === UI.selEmp)) UI.selEmp = list[0]?.id || null;
    const e = empById(UI.selEmp);
    let detail = '<div class="card mt empty">Không có nhân sự trong bộ lọc này.</div>';
    if (e) {
      const d = deptById(e.deptId);
      const a = sum(e.iidLinks.map(l => l.weight)), b = sum(e.deptLinks.map(l => l.weight)), c = sum(e.kpis.map(k => k.weight));
      const cnt = e.iidLinks.length + e.deptLinks.length + e.kpis.length;
      const items = empItems(e);
      const linkBtn = `<button class="icon-btn" title="Sửa liên kết" data-action="emp-links" data-eid="${e.id}">⚙</button>`;
      const groups = [
        { title: 'Nhận từ KPI Tổng IID', cls: 'iid', tag: 'IID', items: items.filter(i => i.kind === 'iid').map(i => ({ ...i, actions: linkBtn })) },
        { title: 'Nhận từ KPI Bộ phận', cls: 'dept', tag: 'Bộ phận', items: items.filter(i => i.kind === 'dept').map(i => ({ ...i, actions: linkBtn })) },
        { title: 'KPI riêng của cá nhân', cls: 'emp', tag: 'Cá nhân', items: e.kpis.map(k => ({ kind: 'own', kpi: k, weight: k.weight, link: linkName(k.linkTo), actions: kpiActions('emp', e.id, k.id) })) }
      ];
      detail = `
      <section class="card mt">
        <div class="card-head" style="flex-wrap:wrap">
          ${avatar(empInitials(e), empColor(e))}
          <div><h2 style="font-size:17px">${esc(e.name)}</h2><div class="small muted">${esc(e.title || '—')} · ${esc(d?.name || 'Chưa có bộ phận')}</div></div>
          <span class="spacer"></span>
          <button class="btn ghost sm" data-action="edit-emp" data-eid="${e.id}">✎ Sửa</button>
          <button class="btn ghost sm" data-action="emp-links" data-eid="${e.id}">⚙ Liên kết KPI IID / BP</button>
          <button class="btn sm" data-action="add-kpi" data-scope="emp" data-eid="${e.id}">＋ KPI cá nhân</button>
          <button class="btn ghost sm danger-hover" data-action="del-emp" data-eid="${e.id}">🗑</button>
        </div>
        <div class="grid g-4">
          ${weightStat('KPI Tổng IID', a, RULES.emp.iid)}
          ${weightStat('KPI Bộ phận', b, RULES.emp.dept)}
          ${weightStat('KPI riêng', c, RULES.emp.own)}
          <div class="wstat-stack">${weightStat('Tổng tỷ trọng', a + b + c, null)}${countStat('Số KPI', cnt, [0, RULES.emp.maxKpi])}</div>
        </div>
        <div class="mt">${itemsTable(groups, P)}</div>
      </section>`;
    }
    const tabs = [['all', 'Tất cả'], ...S.depts.map(x => [x.id, x.name])]
      .map(([v, l]) => `<button class="${UI.empFilter === v ? 'active' : ''}" data-action="emp-filter" data-val="${v}">${esc(l)}</button>`).join('');
    return `
    <div class="row" style="margin-bottom:16px;flex-wrap:wrap"><div class="tabs">${tabs}</div><span class="spacer"></span>
      <button class="btn" data-action="add-emp" id="btn-add-emp">＋ Thêm nhân sự</button></div>
    <section class="grid g-4">${list.map(x => empCard(x, P)).join('')}</section>
    ${detail}`;
  }

  /* ---------- Theo dõi hàng tháng ---------- */
  function trackTarget() {
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
      <div style="flex:1"><div class="kpi-name">${esc(T.name)}</div><div class="small muted">Điểm tổng hợp YTD (gồm cả KPI được nhận từ cấp trên)</div><div class="mt-s">${chip(s)}</div></div>
      <div style="min-width:220px"><div class="row small"><span class="muted">Mức độ cập nhật số liệu đến ${MONTHS[S.currentMonth - 1]}</span><span class="spacer"></span><b>${fmt(comp, 0)}%</b></div>
      <div class="bar lg mt-s"><span style="width:${comp}%"></span></div><div class="small muted mt-s">${filled}/${need} ô dữ liệu đã nhập</div></div>
    </div>`;
  }
  function trackRowCells(k) {
    const P = ytd(), p = pctOf(k, ...P);
    return { ytd: `${fmt(actualOf(k, ...P))}<div class="kpi-meta">MT kỳ: ${fmt(targetOf(k, ...P))}</div>`, pct: pctBar(p) };
  }
  function viewTracking() {
    const tabs = [['iid', '① KPI Tổng IID'], ['dept', '② Bộ phận'], ['emp', '③ Cá nhân']]
      .map(([v, l]) => `<button class="${UI.trackLevel === v ? 'active' : ''}" data-action="track-level" data-val="${v}">${l}</button>`).join('');
    let picker = '';
    if (UI.trackLevel === 'dept') picker = `<select id="track-entity">${S.depts.map(d => `<option value="${d.id}" ${d.id === UI.trackDept ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`;
    if (UI.trackLevel === 'emp') picker = `<select id="track-entity">${S.depts.map(d => `<optgroup label="${esc(d.name)}">${S.emps.filter(e => e.deptId === d.id).map(e => `<option value="${e.id}" ${e.id === UI.trackEmp ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
    const T = trackTarget();
    if (UI.trackLevel === 'dept' && T) picker = picker.replace(`value="${T.eid}"`, `value="${T.eid}" selected`);
    if (UI.trackLevel === 'emp' && T) picker = picker.replace(`value="${T.eid}"`, `value="${T.eid}" selected`);

    let body = '<div class="card mt empty">Không có dữ liệu.</div>';
    if (T) {
      const rows = T.kpis.map(k => {
        const c = trackRowCells(k);
        const cells = k.monthly.map((v, m) => `<td><input type="text" inputmode="decimal" class="cell-input ${isNum(v) ? 'filled' : ''} ${m >= S.currentMonth ? 'future' : ''}" value="${isNum(v) ? v : ''}" data-scope="${T.scope}" data-eid="${T.eid}" data-kid="${k.id}" data-m="${m}" aria-label="${esc(k.name)} ${MONTHS[m]}"/></td>`).join('');
        return `<tr data-kid="${k.id}">
          <td class="sticky-col"><div class="kpi-name">${esc(k.name)}</div><div class="kpi-meta">${esc(k.unit)} · ${AGGREGATIONS[k.aggregation]} · ${k.direction === 'down' ? '↓' : '↑'}</div></td>
          <td class="num">${fmt(k.target)}</td>${cells}
          <td class="num ytd">${c.ytd}</td><td class="pct" style="min-width:140px">${c.pct}</td></tr>`;
      }).join('');
      const note = T.scope === 'iid' ? '' : `<div class="small muted mt-s">ℹ KPI nhận từ cấp trên (IID / Bộ phận) được cập nhật tại cấp gốc và tự động phản ánh vào điểm của ${T.scope === 'dept' ? 'bộ phận' : 'cá nhân'}.</div>`;
      body = `
      <section class="card mt" id="track-summary">${trackSummary(T)}</section>
      <section class="card mt">
        <div class="card-head"><h2>Số liệu thực tế theo tháng – ${esc(T.name)}</h2><span class="tag">Năm ${S.year || 2027}</span></div>
        <div class="table-wrap"><table class="track-table">
          <thead><tr><th class="sticky-col">KPI</th><th class="num">MT năm</th>${MONTHS.map((m, i) => `<th class="num ${i + 1 === S.currentMonth ? 'cur-month' : ''}">${m}</th>`).join('')}<th class="num">Thực tế YTD</th><th>% hoàn thành</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="16" class="empty">Chưa có KPI riêng ở cấp này</td></tr>`}</tbody>
        </table></div>
        ${note}
        <div class="small muted mt-s">💡 Nhập số rồi nhấn Enter / Tab để lưu. Để trống nếu chưa có số liệu. Cột mờ là các tháng sau "Dữ liệu đến".</div>
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
    save();
    const tr = inp.closest('tr'), c = trackRowCells(k);
    tr.querySelector('.ytd').innerHTML = c.ytd;
    tr.querySelector('.pct').innerHTML = c.pct;
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
    const ents = [
      ...S.depts.map(d => ({ type: 'dept', id: d.id, name: d.name, sub: 'Trưởng BP: ' + (d.leader || '—'), av: avatar(deptInitials(d), d.color, 34), score: started ? deptScore(d, ...R) : null, prev: q > 1 ? deptScore(d, ...qRange(q - 1)) : null })),
      ...S.emps.map(e => ({ type: 'emp', id: e.id, name: e.name, sub: `${e.title || ''} · ${deptById(e.deptId)?.name || ''}`, av: avatar(empInitials(e), empColor(e), 34), score: started ? empScore(e, ...R) : null, prev: q > 1 ? empScore(e, ...qRange(q - 1)) : null }))
    ];
    const shown = ents.filter(x => UI.reviewFilter === 'all' || x.type === UI.reviewFilter);

    // Step status
    const rr = checkRules();
    const allK = [...S.iid, ...S.depts.flatMap(d => d.kpis), ...S.emps.flatMap(e => e.kpis)];
    let need = 0, filled = 0;
    allK.forEach(k => { for (let m = Q.from; m <= Q.to; m++) { need++; if (isNum(k.monthly[m - 1])) filled++; } });
    const fillPct = need ? filled / need * 100 : 0;
    const cntAt = lvl => ents.filter(x => statusIdx(getReview(x.type, x.id, q).status) >= lvl).length;
    const steps = [
      ['Cascade KPI', rr.errors ? `${rr.errors} lỗi nguyên tắc` : 'Đạt nguyên tắc', !rr.errors],
      ['Cập nhật số liệu', `${fmt(fillPct, 0)}% số liệu ${MONTHS[Q.from - 1]}–${MONTHS[Q.to - 1]}`, fillPct >= 99.9],
      ['Tự đánh giá', `${cntAt(1)}/${ents.length} hoàn thành`, ents.length && cntAt(1) === ents.length],
      ['Quản lý review', `${cntAt(2)}/${ents.length} hoàn thành`, ents.length && cntAt(2) === ents.length],
      ['Chốt kết quả', `${cntAt(3)}/${ents.length} đã chốt`, ents.length && cntAt(3) === ents.length]
    ];
    let curSet = false;
    const stepsHtml = steps.map((s, i) => {
      let cls = s[2] ? 'done' : '';
      if (!s[2] && !curSet) { cls = 'current'; curSet = true; }
      return `<div class="step ${cls}"><div class="n">${s[2] ? '✓' : i + 1}</div><h4>${s[0]}</h4><p>${s[1]}</p></div>`;
    }).join('');

    // Final rating distribution
    const finalCode = (x, r) => r.adjust || rating(x.score).code;
    const rows = shown.map(x => {
      const r = getReview(x.type, x.id, q), st = REVIEW_STATUS[Math.max(0, statusIdx(r.status))];
      const fc = finalCode(x, r);
      const delta = x.score !== null && x.prev !== null && q > 1 ? x.score - x.prev : null;
      const trend = delta === null ? '<span class="muted">–</span>' : `<span style="color:${delta >= 0 ? 'var(--green)' : 'var(--red)'}">${delta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(delta), 1)}</span>`;
      return `<tr>
        <td><div class="row">${x.av}<div><div class="kpi-name">${esc(x.name)}</div><div class="kpi-meta">${esc(x.sub)}</div></div></div></td>
        <td><span class="tag ${x.type}">${x.type === 'dept' ? 'Bộ phận' : 'Cá nhân'}</span></td>
        <td class="num"><b>${pctTxt(x.score)}</b></td>
        <td class="num small">${trend}</td>
        <td>${chip(x.score)}</td>
        <td>${fc === 'NA' ? '<span class="muted">–</span>' : `<span class="chip r-${fc}">${fc}${r.adjust ? ' · điều chỉnh' : ''}</span>`}</td>
        <td><span class="tag ${st[2]}">${st[1]}</span></td>
        <td class="num"><button class="btn ghost sm" data-action="review-edit" data-type="${x.type}" data-eid="${x.id}" ${started ? '' : 'disabled'}>★ Đánh giá</button></td>
      </tr>`;
    }).join('');

    const qTabs = QUARTERS.map(x => `<button class="${x.q === q ? 'active' : ''}" data-action="review-q" data-val="${x.q}">Quý ${x.q}</button>`).join('');
    const fTabs = [['all', 'Tất cả'], ['dept', 'Bộ phận'], ['emp', 'Cá nhân']].map(([v, l]) => `<button class="${UI.reviewFilter === v ? 'active' : ''}" data-action="review-filter" data-val="${v}">${l}</button>`).join('');
    const sIid = started ? iidScore(...R) : null;

    return `
    <div class="row" style="flex-wrap:wrap"><div class="tabs">${qTabs}</div><span class="spacer"></span><div class="tabs">${fTabs}</div></div>
    <section class="grid g-12 mt">
      <div class="card">
        <div class="card-head"><span class="section-num">Q${q}</span><h2>KPI Tổng IID – Quý ${q}</h2></div>
        <div class="row" style="gap:18px">${ring(sIid, true)}<div><div class="small muted">${MONTHS[Q.from - 1]} – ${MONTHS[Q.to - 1]}${started && R[1] < Q.to ? ` (số liệu đến ${MONTHS[R[1] - 1]})` : ''}</div><div class="mt-s">${chip(sIid)}</div></div></div>
        ${started ? '' : '<div class="small muted mt">Quý này chưa bắt đầu theo mốc "Dữ liệu đến".</div>'}
      </div>
      <div class="card"><div class="card-head"><h2>Tiến trình review Quý ${q}</h2></div><div class="steps">${stepsHtml}</div></div>
    </section>
    <section class="card mt">
      <div class="card-head"><h2>Kết quả đánh giá Quý ${q}</h2><span class="tag">${shown.length} đối tượng</span></div>
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
    openModal(`★ Review Quý ${q} – ${ent.name}`, `
      <div class="weight-preview">
        <div class="row">${ring(score)}<div><b>Điểm tự động: ${pctTxt(score)}</b><div class="mt-s">${chip(score)}</div></div></div>
        <div class="mt">${breakdown || '<span class="muted">Chưa có KPI</span>'}</div>
      </div>
      <div class="field full"><label for="rv-self">Tự đánh giá (kết quả nổi bật, khó khăn)</label><textarea id="rv-self" name="self">${esc(r.self)}</textarea></div>
      <div class="field full"><label for="rv-mgr">Nhận xét của quản lý</label><textarea id="rv-mgr" name="mgr">${esc(r.mgr)}</textarea></div>
      <div class="field"><label for="rv-adjust">Xếp loại cuối</label><select id="rv-adjust" name="adjust">
        <option value="">Theo điểm (${auto.code === 'NA' ? '–' : auto.code})</option>
        ${RATINGS.map(x => `<option value="${x.code}" ${r.adjust === x.code ? 'selected' : ''}>${x.code} · ${x.label}</option>`).join('')}
      </select><span class="help">Điều chỉnh cần có lý do trong nhận xét của quản lý</span></div>
      <div class="field"><label for="rv-status">Trạng thái</label><select id="rv-status" name="status">
        ${REVIEW_STATUS.map(s => `<option value="${s[0]}" ${r.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
      </select></div>
      <div class="field full"><label for="rv-plan">Kế hoạch hành động quý tiếp theo</label><textarea id="rv-plan" name="plan">${esc(r.plan)}</textarea></div>
    `, fd => {
      const v = Object.fromEntries(fd);
      if (v.adjust && v.adjust !== auto.code && !v.mgr.trim()) { toast('Vui lòng ghi nhận xét của quản lý khi điều chỉnh xếp loại', true); return false; }
      S.reviews[reviewKey(type, id, q)] = { status: v.status, self: v.self, mgr: v.mgr, plan: v.plan, adjust: v.adjust, updatedAt: new Date().toISOString() };
      save(); render(); toast('Đã lưu đánh giá quý ' + q);
    });
  }

  /* ---------- Cây liên kết ---------- */
  function viewCascade() {
    const P = ytd();
    const pct = k => { const p = pctOf(k, ...P); return `<b class="small" style="color:${RATING_COLOR[rating(p).code]}">${pctTxt(p)}</b>`; };
    const leaf = (cls, tag, name, extra) => `<div class="tree-node"><div class="tn-head"><span class="tag ${cls}">${tag}</span><span style="flex:1">${name}</span>${extra || ''}</div></div>`;

    const iidNodes = S.iid.map(k => {
      const kids = [];
      S.depts.forEach(d => {
        const l = d.iidLinks.find(x => x.kpiId === k.id);
        if (l) kids.push(leaf('dept', 'BP nhận trực tiếp', `<b>${esc(d.name)}</b>`, `<span class="tag">${fmt(l.weight)}%</span>`));
      });
      S.depts.forEach(d => d.kpis.filter(dk => dk.linkTo === k.id).forEach(dk => {
        const sub = [];
        S.emps.filter(e => e.deptId === d.id).forEach(e => {
          const l = e.deptLinks.find(x => x.kpiId === dk.id);
          if (l) sub.push(leaf('emp', 'CN nhận trực tiếp', `<b>${esc(e.name)}</b> <span class="muted small">${esc(e.title)}</span>`, `<span class="tag">${fmt(l.weight)}%</span>`));
          e.kpis.filter(ek => ek.linkTo === dk.id).forEach(ek => sub.push(leaf('emp', 'KPI cá nhân', `${esc(ek.name)} <span class="muted small">– ${esc(e.name)}</span>`, `<span class="tag">${fmt(ek.weight)}%</span>${pct(ek)}`)));
        });
        kids.push(`<div class="tree-node ${sub.length ? 'open' : ''}"><div class="tn-head" data-action="toggle"><span class="caret">${sub.length ? '▶' : '•'}</span><span class="tag dept">KPI bộ phận</span><span style="flex:1">${esc(dk.name)} <span class="muted small">– ${esc(d.name)}</span></span><span class="tag">${fmt(dk.weight)}%</span>${pct(dk)}<span class="tag ${sub.length ? 'good' : 'warn'}">${sub.length} liên kết</span></div>
          ${sub.length ? `<div class="tree-children">${sub.join('')}</div>` : ''}</div>`);
      }));
      S.emps.forEach(e => {
        const l = e.iidLinks.find(x => x.kpiId === k.id);
        if (l) kids.push(leaf('emp', 'CN nhận trực tiếp', `<b>${esc(e.name)}</b> <span class="muted small">${esc(deptById(e.deptId)?.name || '')}</span>`, `<span class="tag">${fmt(l.weight)}%</span>`));
      });
      return `<div class="tree-node open"><div class="tn-head" data-action="toggle"><span class="caret">▶</span><span class="tag iid">KPI IID</span><b style="flex:1">${esc(k.name)}</b><span class="tag">${fmt(k.weight)}%</span>${pct(k)}<span class="tag ${kids.length ? 'good' : 'bad'}">${kids.length} liên kết</span></div>
        <div class="tree-children">${kids.join('') || '<div class="small muted">⚠ Chưa có bộ phận / cá nhân nào nhận KPI này</div>'}</div></div>`;
    }).join('');

    const orphans = [];
    S.depts.forEach(d => d.kpis.filter(k => !k.linkTo || !findKpi(k.linkTo)).forEach(k => orphans.push(leaf('dept', 'KPI bộ phận', `${esc(k.name)} <span class="muted small">– ${esc(d.name)}</span>`, `<button class="btn ghost sm" data-action="edit-kpi" data-scope="dept" data-eid="${d.id}" data-kid="${k.id}">Liên kết</button>`))));
    S.emps.forEach(e => e.kpis.filter(k => !k.linkTo || !findKpi(k.linkTo)).forEach(k => orphans.push(leaf('emp', 'KPI cá nhân', `${esc(k.name)} <span class="muted small">– ${esc(e.name)}</span>`, `<button class="btn ghost sm" data-action="edit-kpi" data-scope="emp" data-eid="${e.id}" data-kid="${k.id}">Liên kết</button>`))));

    const totalOwn = sum(S.depts.map(d => d.kpis.length)) + sum(S.emps.map(e => e.kpis.length));
    const alignPct = totalOwn ? (totalOwn - orphans.length) / totalOwn * 100 : 100;

    return `
    <section class="grid g-3">
      <div class="card stat"><span class="glow" style="background:var(--blue)"></span><div class="label">Mức độ liên kết</div><div class="value">${fmt(alignPct, 0)}%</div><div class="hint">KPI bộ phận & cá nhân đã liên kết lên cấp trên</div></div>
      <div class="card stat"><span class="glow" style="background:var(--teal)"></span><div class="label">KPI riêng (BP + CN)</div><div class="value">${totalOwn}</div><div class="hint">${sum(S.depts.map(d => d.kpis.length))} bộ phận · ${sum(S.emps.map(e => e.kpis.length))} cá nhân</div></div>
      <div class="card stat"><span class="glow" style="background:${orphans.length ? 'var(--orange)' : 'var(--green)'}"></span><div class="label">KPI chưa liên kết</div><div class="value">${orphans.length}</div><div class="hint">Nên liên kết hoặc xem xét loại bỏ</div></div>
    </section>
    <section class="card mt">
      <div class="card-head"><h2>Cây cascade KPI 2027</h2><span class="spacer"></span><button class="btn ghost sm" data-action="tree-all" data-val="open">Mở tất cả</button><button class="btn ghost sm" data-action="tree-all" data-val="close">Thu gọn</button></div>
      <div class="tree">
        <div class="tree-node tn-root open"><div class="tn-head" data-action="toggle"><span class="caret">▶</span><div class="brand-logo" style="width:32px;height:32px;border-radius:9px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg></div><b style="flex:1">Khối IID – KPI Tổng</b>${ring(iidScore(...P))}</div>
          <div class="tree-children">${iidNodes || '<div class="muted">Chưa có KPI IID</div>'}</div></div>
        ${orphans.length ? `<div class="tree-node open"><div class="tn-head" data-action="toggle"><span class="caret">▶</span><span class="tag warn">⚠</span><b style="flex:1">KPI chưa liên kết lên cấp trên</b><span class="tag warn">${orphans.length}</span></div><div class="tree-children">${orphans.join('')}</div></div>` : ''}
      </div>
    </section>`;
  }

  /* ---------- Kiểm tra nguyên tắc ---------- */
  function viewRules() {
    const r = checkRules();
    const sorted = [...r.issues].sort((a, b) => (a.level === 'err' ? 0 : 1) - (b.level === 'err' ? 0 : 1));
    const navAttrs = n => n ? `data-action="goto" data-view="${n.view}" ${n.dept ? `data-dept="${n.dept}"` : ''} ${n.emp ? `data-emp="${n.emp}"` : ''}` : '';
    const list = sorted.map(i => `<div class="rule ${i.level}"><span class="ic">${i.level === 'err' ? '!' : '⚠'}</span>
      <div style="flex:1"><h4>${esc(i.title)}</h4><p><b>${esc(i.scope)}</b> · ${esc(i.msg)}</p></div>
      <button class="btn ghost sm" ${navAttrs(i.nav)}>Sửa →</button></div>`).join('');
    const oks = r.oks.map(o => `<div class="rule ok"><span class="ic">✓</span><div><h4>${esc(o[0])}</h4><p>${esc(o[1])}</p></div></div>`).join('');
    const D = RULES.dept, E = RULES.emp;
    return `
    <section class="grid g-3">
      <div class="card stat"><span class="glow" style="background:var(--red)"></span><div class="label">Lỗi bắt buộc sửa</div><div class="value" style="color:${r.errors ? 'var(--red)' : 'var(--green)'}">${r.errors}</div><div class="hint">Vi phạm quy định tỷ trọng / số lượng / liên kết</div></div>
      <div class="card stat"><span class="glow" style="background:var(--yellow)"></span><div class="label">Cảnh báo</div><div class="value" style="color:var(--yellow)">${r.warns}</div><div class="hint">Khuyến nghị để KPI chất lượng hơn</div></div>
      <div class="card stat"><span class="glow" style="background:var(--green)"></span><div class="label">Đạt toàn bộ</div><div class="value" style="color:var(--green)">${r.oks.length}</div><div class="hint">trên ${1 + S.depts.length + S.emps.length} đối tượng (IID, bộ phận, cá nhân)</div></div>
    </section>
    <section class="grid g-21 mt">
      <div class="card">
        <div class="card-head"><h2>Vấn đề cần xử lý</h2><span class="tag ${r.errors ? 'bad' : 'good'}">${r.issues.length}</span></div>
        ${list || '<div class="empty">🎉 Không có vấn đề nào – hệ thống KPI tuân thủ đầy đủ nguyên tắc.</div>'}
      </div>
      <div>
        <div class="card">
          <div class="card-head"><h2>Quy định áp dụng</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Cấp</th><th>Thành phần</th><th class="num">Quy định</th></tr></thead>
            <tbody>
              <tr><td><span class="tag iid">IID</span></td><td>Tổng tỷ trọng</td><td class="num">100%</td></tr>
              <tr><td><span class="tag dept">Bộ phận</span></td><td>Nhận từ KPI IID</td><td class="num">${D.iid[0]}–${D.iid[1]}%</td></tr>
              <tr><td><span class="tag dept">Bộ phận</span></td><td>KPI riêng</td><td class="num">${D.dept[0]}–${D.dept[1]}%</td></tr>
              <tr><td><span class="tag dept">Bộ phận</span></td><td>Số KPI riêng</td><td class="num">${D.deptKpiCount[0]}–${D.deptKpiCount[1]}</td></tr>
              <tr><td><span class="tag emp">Cá nhân</span></td><td>Nhận từ KPI IID</td><td class="num">${E.iid[0]}–${E.iid[1]}%</td></tr>
              <tr><td><span class="tag emp">Cá nhân</span></td><td>Nhận từ KPI Bộ phận</td><td class="num">${E.dept[0]}–${E.dept[1]}%</td></tr>
              <tr><td><span class="tag emp">Cá nhân</span></td><td>KPI riêng</td><td class="num">${E.own[0]}–${E.own[1]}%</td></tr>
              <tr><td><span class="tag emp">Cá nhân</span></td><td>Tổng số KPI</td><td class="num">≤ ${E.maxKpi}</td></tr>
              <tr><td><span class="tag">Chung</span></td><td>Ghi nhận tối đa / KPI</td><td class="num">${RULES.cap}%</td></tr>
              <tr><td><span class="tag">Chung</span></td><td>Xếp loại</td><td class="num small">${RATINGS.filter(x => isFinite(x.min)).map(x => `${x.code} ≥ ${x.min}%`).join(' · ')} · D &lt; 75%</td></tr>
            </tbody></table></div>
        </div>
        <div class="card mt"><div class="card-head"><h2>Đã đạt nguyên tắc</h2><span class="tag good">${r.oks.length}</span></div>${oks || '<div class="muted small">Chưa có đối tượng nào đạt toàn bộ.</div>'}</div>
      </div>
    </section>`;
  }

  const RENDER = { dashboard: viewDashboard, iid: viewIid, depts: viewDepts, emps: viewEmps, tracking: viewTracking, review: viewReview, cascade: viewCascade, rules: viewRules };

  function render(animate = false) {
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
      ${field('Đơn vị', `<input type="text" name="unit" value="${esc(k.unit)}" placeholder="tỷ, %, KH...">`)}
      ${field('Mục tiêu năm *', `<input type="number" step="any" name="target" value="${k.target || ''}" required>`)}
      ${field('Tỷ trọng (%)', `<input type="number" step="any" min="0" max="100" name="weight" value="${k.weight || ''}">`)}
      ${field('Chiều hướng', `<select name="direction">${opt('up', '↑ Càng cao càng tốt', k.direction === 'up')}${opt('down', '↓ Càng thấp càng tốt', k.direction === 'down')}</select>`)}
      ${field('Cách tổng hợp', `<select name="aggregation">${Object.entries(AGGREGATIONS).map(([v, l]) => opt(v, l, k.aggregation === v)).join('')}</select>`, false, 'Cộng dồn: mục tiêu được phân bổ đều 12 tháng')}
      ${field('Loại KPI', `<select name="type">${opt('outcome', 'Kết quả (Outcome)', k.type === 'outcome')}${opt('activity', 'Hoạt động (Activity)', k.type === 'activity')}</select>`)}
      ${field('Tần suất đo', `<select name="frequency">${FREQUENCIES.map(f => opt(f, f, k.frequency === f)).join('')}</select>`)}
      ${field('Người phụ trách', `<input type="text" name="owner" value="${esc(k.owner)}">`)}
      ${field('Nguồn dữ liệu', `<input type="text" name="source" value="${esc(k.source)}" placeholder="CRM, ERP, Báo cáo...">`, true)}
      ${linkOpts ? field(linkLabel, `<select name="linkTo">${opt('', '— Chưa liên kết —', !k.linkTo)}${linkOpts.map(([v, l]) => opt(v, l, k.linkTo === v)).join('')}</select>`, true, 'KPI cấp dưới nên đóng góp trực tiếp cho KPI cấp trên') : ''}
    `, fd => {
      const v = Object.fromEntries(fd);
      if (!v.name.trim()) { toast('Vui lòng nhập tên KPI', true); return false; }
      if (!(+v.target > 0)) { toast('Mục tiêu năm phải lớn hơn 0', true); return false; }
      const patch = {
        name: v.name.trim(), unit: v.unit.trim(), target: +v.target, weight: +v.weight || 0,
        direction: v.direction, aggregation: v.aggregation, type: v.type, frequency: v.frequency,
        owner: v.owner.trim(), source: v.source.trim(), linkTo: linkOpts ? (v.linkTo || null) : null
      };
      if (old) Object.assign(old, patch); else list.push(Object.assign(k, patch));
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
      ${field('Trưởng bộ phận', `<input type="text" name="leader" value="${esc(d.leader)}">`)}
      ${field('Màu nhận diện', `<div class="swatches">${DEPT_COLORS.map(c => `<label class="swatch" style="background:${c}"><input type="radio" name="color" value="${c}" ${c === d.color ? 'checked' : ''}><span></span></label>`).join('')}</div>`)}
    `, fd => {
      const v = Object.fromEntries(fd);
      if (!v.name.trim()) { toast('Vui lòng nhập tên bộ phận', true); return false; }
      if (old) Object.assign(old, { name: v.name.trim(), leader: v.leader.trim(), color: v.color || old.color });
      else {
        const nd = { id: uid('d'), name: v.name.trim(), leader: v.leader.trim(), color: v.color || DEPT_COLORS[0], iidLinks: [], kpis: [] };
        S.depts.push(nd); UI.selDept = nd.id;
      }
      save(); render(); toast(old ? 'Đã cập nhật bộ phận' : 'Đã thêm bộ phận – hãy thiết lập liên kết IID và 3–5 KPI riêng');
    });
  }

  function empModal(id) {
    const old = id ? empById(id) : null;
    const e = old || { name: '', title: '', deptId: UI.empFilter !== 'all' ? UI.empFilter : S.depts[0]?.id };
    if (!S.depts.length) { toast('Cần tạo bộ phận trước khi thêm nhân sự', true); return; }
    openModal(old ? '✎ Sửa nhân sự' : '＋ Thêm nhân sự', `
      ${field('Họ tên *', `<input type="text" name="name" required value="${esc(e.name)}" id="f-emp-name">`, true)}
      ${field('Chức danh', `<input type="text" name="title" value="${esc(e.title)}">`)}
      ${field('Bộ phận', `<select name="deptId">${S.depts.map(d => opt(d.id, d.name, d.id === e.deptId)).join('')}</select>`, false, old ? 'Đổi bộ phận sẽ gỡ các liên kết KPI bộ phận cũ' : '')}
    `, fd => {
      const v = Object.fromEntries(fd);
      if (!v.name.trim()) { toast('Vui lòng nhập họ tên', true); return false; }
      if (old) {
        if (old.deptId !== v.deptId) {
          old.deptLinks = [];
          old.kpis.forEach(k => { k.linkTo = null; });
        }
        Object.assign(old, { name: v.name.trim(), title: v.title.trim(), deptId: v.deptId });
      } else {
        const ne = { id: uid('e'), name: v.name.trim(), title: v.title.trim(), deptId: v.deptId, iidLinks: [], deptLinks: [], kpis: [] };
        S.emps.push(ne); UI.selEmp = ne.id;
      }
      save(); render(); toast(old ? 'Đã cập nhật nhân sự' : 'Đã thêm nhân sự – hãy thiết lập liên kết và KPI riêng');
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
        S = normalize(d); save(); fillMonthSelect(); render(true);
        toast('Đã nhập dữ liệu thành công');
      } catch (e) { toast('File JSON không hợp lệ', true); }
    };
    rd.readAsText(file);
  }
  function resetData() {
    if (!confirm('Khôi phục dữ liệu mẫu? Toàn bộ dữ liệu hiện tại sẽ bị thay thế.\n(Hãy "Xuất JSON" trước nếu cần sao lưu.)')) return;
    S = normalize(buildSampleData());
    UI.selDept = UI.selEmp = null;
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
  const h = location.hash.slice(1);
  UI.view = RENDER[h] ? h : 'dashboard';
  render(true);
})();
