// admin/js/reports.js
(() => {
  const sb = window.supabaseClient;
  if (!sb) throw new Error('window.supabaseClient missing');

  // ===== CONFIG =====
  const LOGO_URL = "../assets/images/katsina-irs-logo.png";

  // Branding
  const BRAND_RED = [223, 38, 39];   // #df2627
  const BRAND_GREEN = [67, 140, 80]; // #438c50
  const BRAND_BLACK = [8, 6, 5];     // #080605

  const MONTHS = [
    { key: 'Jan', idx: 0 }, { key: 'Feb', idx: 1 }, { key: 'Mar', idx: 2 }, { key: 'Apr', idx: 3 },
    { key: 'May', idx: 4 }, { key: 'Jun', idx: 5 }, { key: 'Jul', idx: 6 }, { key: 'Aug', idx: 7 },
    { key: 'Sep', idx: 8 }, { key: 'Oct', idx: 9 }, { key: 'Nov', idx: 10 }, { key: 'Dec', idx: 11 },
  ];

  // ===== Elements =====
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const logoutBtn = document.getElementById('logoutBtn');

  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');

  const yearPicker = document.getElementById('yearPicker');
  const viewMode = document.getElementById('viewMode');

  const lgaFilter = document.getElementById('lgaFilter');
  const streamFilter = document.getElementById('streamFilter');
  const searchBox = document.getElementById('searchBox');
  const refreshBtn = document.getElementById('refreshBtn');

  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');

  const cardYear = document.getElementById('cardYear');
  const cardScope = document.getElementById('cardScope');
  const cardLgas = document.getElementById('cardLgas');
  const cardStreams = document.getElementById('cardStreams');
  const cardTotalCollected = document.getElementById('cardTotalCollected');

  const tableSubtitle = document.getElementById('tableSubtitle');
  const rowCount = document.getElementById('rowCount');
  const annualTableHead = document.getElementById('annualTableHead');
  const annualTableBody = document.getElementById('annualTableBody');

  // ===== Helpers =====
  function safeText(s) {
    return String(s ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  // Export and table: numbers only (avoid ₦ encoding issues)
  function formatNumber(n) {
    const v = Number(n || 0);
    return v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function nowStamp() {
    return new Date().toLocaleString();
  }

  function yearTitle(y) {
    return `YEAR ${y}`;
  }

  async function fetchAsDataURL(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Logo fetch failed: ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function setLoading(msg) {
    if (tableSubtitle) tableSubtitle.textContent = msg || 'Loading…';
    if (annualTableBody) {
      annualTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td class="px-3 py-4 text-center" colspan="16">${safeText(msg || 'Loading…')}</td>
        </tr>`;
    }
  }

  function populateYearSelect(el) {
    const now = new Date().getFullYear();
    const years = [now - 1, now, now + 1, now + 2];
    el.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    el.value = String(now);
  }

  function fillSelect(el, placeholder, rows, getValue, getLabel) {
    el.innerHTML = [
      `<option value="all">${placeholder}</option>`,
      ...rows.map(r => `<option value="${safeText(getValue(r))}">${safeText(getLabel(r))}</option>`)
    ].join('');
  }

  function debounce(fn, wait = 250) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // ===== State =====
  let selectedYear = new Date().getFullYear();
  let selectedView = 'collected'; // collected | budget | both

  let allLgas = [];
  let allStreams = [];
  let activeStreams = [];
  let allCodes = [];

  let streamNameById = new Map();
  let lgaNameById = new Map();
  let codeToStream = new Map();

  // streamId => { annual, monthly }
  let budgetsByStreamYear = new Map();

  // Matrix rows (cartesian of LGAs × Streams) with values per month
  // { lgaId, streamId, lgaName, streamName, collected[12], budget[12], collectedTotal, budgetTotal }
  let matrixRows = [];

  // ===== Auth =====
  async function requireAdmin() {
    const { data: sessionData } = await sb.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) { window.location.href = '../index.html'; return null; }

    const { data: profile } = await sb
      .from('profiles')
      .select('full_name, global_role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.global_role !== 'admin') {
      window.location.href = '../index.html';
      return null;
    }

    const name = (profile.full_name || '').trim() || user.email || 'Admin User';
    if (topbarUserName) topbarUserName.textContent = name;
    if (topbarUserInitial) topbarUserInitial.textContent = name.charAt(0).toUpperCase();
    return { user, profile };
  }

  // ===== Sidebar =====
  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('-translate-x-full');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('hidden');
  }
  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('-translate-x-full');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
  }
  function setupSidebar() {
    if (sidebarToggle) sidebarToggle.addEventListener('click', () => {
      if (sidebar.classList.contains('-translate-x-full')) openSidebar();
      else closeSidebar();
    });
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 640) {
        if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
        if (sidebar) sidebar.classList.remove('-translate-x-full');
      } else {
        if (sidebar) sidebar.classList.add('-translate-x-full');
      }
    });
  }

  async function logout() {
    await sb.auth.signOut();
    window.location.href = '../index.html';
  }

  // ===== Data loaders =====
  async function loadGlobals() {
    const [{ data: lgas, error: lErr }, { data: streams, error: sErr }, { data: codes, error: cErr }] =
      await Promise.all([
        sb.from('lgas').select('id, name, is_active').order('name', { ascending: true }),
        sb.from('revenue_streams').select('id, name, is_active').order('name', { ascending: true }),
        sb.from('economic_codes').select('id, revenue_stream_id, code, name, is_active').eq('is_active', true)
      ]);

    if (lErr) throw lErr;
    if (sErr) throw sErr;
    if (cErr) throw cErr;

    allLgas = (lgas || []).filter(x => x.is_active === true);
    allStreams = streams || [];
    activeStreams = allStreams.filter(s => s.is_active === true);
    allCodes = codes || [];

    lgaNameById = new Map(allLgas.map(l => [l.id, l.name]));
    streamNameById = new Map(allStreams.map(s => [s.id, s.name]));
    codeToStream = new Map(allCodes.map(c => [c.id, c.revenue_stream_id]));

    fillSelect(lgaFilter, 'All LGAs', allLgas, r => r.id, r => r.name);
    fillSelect(streamFilter, 'All Streams', activeStreams, r => r.id, r => r.name);
  }

  async function loadBudgets(year) {
    budgetsByStreamYear = new Map();

    const { data, error } = await sb
      .from('revenue_stream_budgets')
      .select('revenue_stream_id, year, annual_budget, monthly_target')
      .eq('year', year);

    if (error) {
      console.warn('Budget load error:', error);
      return;
    }

    (data || []).forEach(b => {
      budgetsByStreamYear.set(b.revenue_stream_id, {
        annual: Number(b.annual_budget || 0),
        monthly: Number(b.monthly_target || 0)
      });
    });
  }

  async function loadCollections(year) {
    const start = `${year}-01-01`;
    const end = `${Number(year) + 1}-01-01`;

    const { data, error } = await sb
      .from('collections')
      .select('lga_id, economic_code_id, month_year, amount_collected')
      .gte('month_year', start)
      .lt('month_year', end);

    if (error) {
      console.warn('Collections load error:', error);
      return [];
    }
    return data || [];
  }

  // ===== Build matrix =====
  function buildEmptyMatrix() {
    const rows = [];

    for (const lga of allLgas) {
      for (const stream of activeStreams) {
        const b = budgetsByStreamYear.get(stream.id) || { annual: 0, monthly: 0 };

        // Monthly budget defaults to the stream monthly_target for every month (0 if missing)
        const budgetMonths = Array(12).fill(Number(b.monthly || 0));
        const budgetTotal = Number(b.annual || 0);

        rows.push({
          lgaId: lga.id,
          streamId: stream.id,
          lgaName: lga.name,
          streamName: stream.name,
          collected: Array(12).fill(0),
          budget: budgetMonths,
          collectedTotal: 0,
          budgetTotal
        });
      }
    }
    return rows;
  }

  function applyCollectionsToMatrix(rows, collections) {
    const idx = new Map();
    rows.forEach((r, i) => idx.set(`${r.lgaId}:${r.streamId}`, i));

    for (const rec of collections) {
      if (!rec?.lga_id || !rec?.economic_code_id || !rec?.month_year) continue;

      const streamId = codeToStream.get(rec.economic_code_id);
      if (!streamId) continue;

      const key = `${rec.lga_id}:${streamId}`;
      const i = idx.get(key);
      if (i === undefined) continue;

      const m = new Date(rec.month_year).getMonth();
      if (m < 0 || m > 11) continue;

      const amt = Number(rec.amount_collected || 0);
      rows[i].collected[m] += amt;
      rows[i].collectedTotal += amt;
    }
  }

  // ===== Filtering / rendering =====
  function getScopeLabel() {
    const lgaVal = lgaFilter?.value || 'all';
    const streamVal = streamFilter?.value || 'all';
    const lgaLabel = lgaVal === 'all' ? 'All LGAs' : (lgaNameById.get(lgaVal) || 'LGA');
    const streamLabel = streamVal === 'all' ? 'All streams' : (streamNameById.get(streamVal) || 'Stream');
    return `${lgaLabel} / ${streamLabel}`;
  }

  function getFilteredRows() {
    const lgaVal = lgaFilter?.value || 'all';
    const streamVal = streamFilter?.value || 'all';
    const q = (searchBox?.value || '').trim().toLowerCase();

    return matrixRows.filter(r => {
      if (lgaVal !== 'all' && r.lgaId !== lgaVal) return false;
      if (streamVal !== 'all' && r.streamId !== streamVal) return false;
      if (q) {
        const hay = `${r.lgaName} ${r.streamName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderHead() {
    annualTableHead.innerHTML = `
      <tr>
        <th class="px-3 py-2 font-medium border-b border-slate-200">LGA</th>
        <th class="px-3 py-2 font-medium border-b border-slate-200">Stream</th>
        ${MONTHS.map(m => `<th class="px-3 py-2 font-medium border-b border-slate-200">${m.key}</th>`).join('')}
        <th class="px-3 py-2 font-medium border-b border-slate-200">Total</th>
      </tr>
    `;
  }

  function renderBody(rows) {
    if (!rows.length) {
      annualTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td class="px-3 py-4 text-center" colspan="16">No rows match your filters.</td>
        </tr>`;
      return;
    }

    const mode = selectedView;

    const buildRow = (r, label, values, total, badgeClass) => {
      const badge = label
        ? `<span class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${badgeClass}">${safeText(label)}</span>`
        : '';

      return `
        <tr>
          <td class="px-3 py-2 whitespace-nowrap">
            ${safeText(r.lgaName)}${badge}
          </td>
          <td class="px-3 py-2 whitespace-nowrap">${safeText(r.streamName)}</td>
          ${values.map(v => `<td class="px-3 py-2 whitespace-nowrap">${formatNumber(v)}</td>`).join('')}
          <td class="px-3 py-2 whitespace-nowrap font-medium">${formatNumber(total)}</td>
        </tr>
      `;
    };

    let html = '';

    if (mode === 'collected') {
      html = rows.map(r => buildRow(r, null, r.collected, r.collectedTotal, '')).join('');
    } else if (mode === 'budget') {
      html = rows.map(r => buildRow(r, null, r.budget, r.budgetTotal, '')).join('');
    } else {
      // both
      html = rows.map(r => (
        buildRow(r, 'COLLECTED', r.collected, r.collectedTotal, 'bg-slate-100 text-slate-800 border border-slate-200') +
        buildRow(r, 'BUDGET', r.budget, r.budgetTotal, 'bg-emerald-50 text-emerald-800 border border-emerald-200')
      )).join('');
    }

    annualTableBody.innerHTML = html;
  }

  function updateCards(filteredRows) {
    if (cardYear) cardYear.textContent = yearTitle(selectedYear);
    if (cardScope) cardScope.textContent = getScopeLabel();

    // Count distinct LGAs/streams in filtered scope
    const lgas = new Set(filteredRows.map(r => r.lgaId));
    const streams = new Set(filteredRows.map(r => r.streamId));

    if (cardLgas) cardLgas.textContent = String(lgas.size);
    if (cardStreams) cardStreams.textContent = String(streams.size);

    // Total collected across filtered rows (always computed from collected, regardless of view)
    const totalCollected = filteredRows.reduce((sum, r) => sum + Number(r.collectedTotal || 0), 0);
    if (cardTotalCollected) cardTotalCollected.textContent = formatNumber(totalCollected);
  }

  function updateSubtitle(filteredRows) {
    const scope = getScopeLabel();
    const viewLabel = selectedView === 'collected' ? 'Collected'
      : selectedView === 'budget' ? 'Budget'
      : 'Collected + Budget';

    if (tableSubtitle) tableSubtitle.textContent = `${scope} • ${viewLabel} • ${selectedYear}`;
    if (rowCount) rowCount.textContent = `${filteredRows.length} rows`;
  }

  function renderAll() {
    renderHead();
    const filtered = getFilteredRows();
    renderBody(filtered);
    updateCards(filtered);
    updateSubtitle(filtered);

    if (window.lucide) lucide.createIcons();
  }

  // ===== Excel export (.xlsx) =====
  function buildAoaFor(mode, filtered) {
    const header = ['LGA', 'Stream', ...MONTHS.map(m => m.key), 'Total'];
    const meta = [
      ['KATSINA STATE INTERNAL REVENUE SERVICE'],
      ['SERVICE WIDE COLLECTION REPORT'],
      [yearTitle(selectedYear)],
      ['Scope', getScopeLabel()],
      ['View', mode.toUpperCase()],
      ['Generated', nowStamp()],
      [],
      header
    ];

    const rows = filtered.map(r => {
      const values = mode === 'budget' ? r.budget : r.collected;
      const total = mode === 'budget' ? r.budgetTotal : r.collectedTotal;
      return [r.lgaName, r.streamName, ...values.map(v => Number(v || 0)), Number(total || 0)];
    });

    return [...meta, ...rows];
  }

  function exportExcel() {
    if (!window.XLSX) {
      alert('Excel library (XLSX) not loaded.');
      return;
    }

    const filtered = getFilteredRows();

    const wb = XLSX.utils.book_new();

    if (selectedView === 'both') {
      const aoaCollected = buildAoaFor('collected', filtered);
      const wsCollected = XLSX.utils.aoa_to_sheet(aoaCollected);
      XLSX.utils.book_append_sheet(wb, wsCollected, 'Collected');

      const aoaBudget = buildAoaFor('budget', filtered);
      const wsBudget = XLSX.utils.aoa_to_sheet(aoaBudget);
      XLSX.utils.book_append_sheet(wb, wsBudget, 'Budget');
    } else {
      const aoa = buildAoaFor(selectedView, filtered);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, selectedView === 'budget' ? 'Budget' : 'Collected');
    }

    const filename = `KTIRS_ServiceWide_Report_${selectedYear}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  // ===== PDF export =====
  async function exportPdf() {
    const jspdfNS = window.jspdf;
    if (!jspdfNS?.jsPDF) {
      alert('PDF library not loaded.');
      return;
    }

    const filtered = getFilteredRows();

    const doc = new jspdfNS.jsPDF('p', 'pt', 'a4');
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 40;

    let logoDataUrl = null;
    try { logoDataUrl = await fetchAsDataURL(LOGO_URL); } catch (e) { console.warn(e); }

    // Header
    const top = 32;
    if (logoDataUrl) doc.addImage(logoDataUrl, 'JPEG', marginX, top, 62, 62);

    doc.setTextColor(...BRAND_BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('KATSINA STATE INTERNAL REVENUE SERVICE', pageW / 2, top + 18, { align: 'center' });

    doc.setFontSize(11);
    doc.text('SERVICE WIDE COLLECTION REPORT', pageW / 2, top + 36, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(yearTitle(selectedYear), pageW / 2, top + 54, { align: 'center' });

    doc.setDrawColor(...BRAND_RED);
    doc.setLineWidth(1);
    doc.line(marginX, top + 76, pageW - marginX, top + 76);

    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(`Scope: ${getScopeLabel()}`, marginX, top + 94);
    doc.text(`View: ${selectedView.toUpperCase()}`, marginX, top + 108);
    doc.text(`Generated: ${nowStamp()}`, marginX, top + 122);

    // Build table data
    const head = [['LGA', 'Stream', ...MONTHS.map(m => m.key), 'Total']];
    const mkBody = (mode) => filtered.map(r => {
      const vals = mode === 'budget' ? r.budget : r.collected;
      const tot = mode === 'budget' ? r.budgetTotal : r.collectedTotal;
      return [
        r.lgaName,
        r.streamName,
        ...vals.map(v => formatNumber(v)),
        formatNumber(tot)
      ];
    });

    let startY = top + 140;

    const renderTable = (mode, headerColor) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND_BLACK);
      doc.setFontSize(10);
      doc.text(mode === 'budget' ? 'BUDGET' : 'COLLECTED', marginX, startY - 10);

      doc.autoTable({
        startY,
        head,
        body: mkBody(mode),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 3 },
        headStyles: { fillColor: headerColor, textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: marginX, right: marginX }
      });

      startY = (doc.lastAutoTable?.finalY || startY) + 26;
    };

    if (selectedView === 'both') {
      renderTable('collected', BRAND_RED);
      renderTable('budget', BRAND_GREEN);
    } else if (selectedView === 'budget') {
      renderTable('budget', BRAND_GREEN);
    } else {
      renderTable('collected', BRAND_RED);
    }

    // Footer page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Page ${i} of ${pageCount}`, pageW / 2, pageH - 22, { align: 'center' });
    }

    doc.save(`KTIRS_ServiceWide_Report_${selectedYear}.pdf`);
  }

  // ===== Refresh =====
  async function refreshReport() {
    setLoading(`Loading annual report for ${selectedYear}…`);

    await loadBudgets(selectedYear);
    const collections = await loadCollections(selectedYear);

    matrixRows = buildEmptyMatrix();
    applyCollectionsToMatrix(matrixRows, collections);

    renderAll();
  }

  // ===== Events =====
  function wireEvents() {
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    if (yearPicker) {
      yearPicker.addEventListener('change', async () => {
        selectedYear = Number(yearPicker.value) || selectedYear;
        await refreshReport();
      });
    }

    if (viewMode) {
      viewMode.addEventListener('change', () => {
        selectedView = viewMode.value || 'collected';
        renderAll();
      });
    }

    const rerender = () => renderAll();

    if (lgaFilter) lgaFilter.addEventListener('change', rerender);
    if (streamFilter) streamFilter.addEventListener('change', rerender);

    if (searchBox) searchBox.addEventListener('input', debounce(rerender, 200));

    if (refreshBtn) refreshBtn.addEventListener('click', refreshReport);

    if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportExcel);

    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', async () => {
        exportPdfBtn.disabled = true;
        try { await exportPdf(); }
        finally { exportPdfBtn.disabled = false; }
      });
    }
  }

  // ===== Init =====
  (async () => {
    setupSidebar();
    populateYearSelect(yearPicker);

    // initial state from controls
    selectedYear = Number(yearPicker?.value) || selectedYear;
    selectedView = viewMode?.value || selectedView;

    const ok = await requireAdmin();
    if (!ok) return;

    try {
      await loadGlobals();
      await refreshReport();
    } catch (e) {
      console.error(e);
      setLoading('Failed to load report. Check console for details.');
    }

    wireEvents();
    if (window.lucide) lucide.createIcons();
  })();
})();
