// admin/js/lga-report.js
(() => {
    const sb = window.supabaseClient;
    if (!sb) throw new Error('window.supabaseClient missing');
  
    // ===== CONFIG =====
    // Put your uploaded logo at this path (recommended):
    // admin/assets/images/logo-2.jpg  => then use "../assets/images/logo-2.jpg"
    const LOGO_URL = "../assets/images/katsina-irs-logo.png";
  
    // Branding (from uploaded logo palette)
    const BRAND_RED = [223, 38, 39];  // #df2627
    const BRAND_GREEN = [67, 140, 80]; // #438c50
    const BRAND_BLACK = [8, 6, 5];     // #080605
  
    // ===== Elements =====
    const reportSubtitle = document.getElementById('reportSubtitle');
  
    const monthPicker = document.getElementById('monthPicker');
    const budgetYearFilter = document.getElementById('budgetYearFilter');
  
    const exportStreamsCsvBtn = document.getElementById('exportStreamsCsvBtn');
    const exportCodesCsvBtn = document.getElementById('exportCodesCsvBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const printBtn = document.getElementById('printBtn');
  
    const cardLgaName = document.getElementById('cardLgaName');
    const cardPeriod = document.getElementById('cardPeriod');
    const cardOfficers = document.getElementById('cardOfficers');
    const cardStreams = document.getElementById('cardStreams');
    const cardCollected = document.getElementById('cardCollected');
  
    const streamsReportBody = document.getElementById('streamsReportBody');
    const codesReportBody = document.getElementById('codesReportBody');
  
    // ===== Helpers =====
    function safeText(s) {
      return String(s ?? '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m]));
    }
  
    // UI can still show ₦, but exports will use plain numbers.
    function formatNairaUI(amount) {
      const v = Number(amount || 0);
      return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  
    function formatNumber(amount) {
      const v = Number(amount || 0);
      return v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  
    function populateYearSelect(selectEl, baseYear) {
      if (!selectEl) return;
      const y = Number(baseYear) || new Date().getFullYear();
      const years = [y - 1, y, y + 1, y + 2];
      selectEl.innerHTML = years.map(v => `<option value="${v}">${v}</option>`).join('');
      selectEl.value = String(y);
    }
  
    function monthLabel(yyyyMm) {
      if (!yyyyMm) return '—';
      const [yy, mm] = yyyyMm.split('-').map(Number);
      const d = new Date(yy, (mm || 1) - 1, 1);
      return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    }
  
    function monthUpperLabel(yyyyMm) {
      return String(monthLabel(yyyyMm) || '').toUpperCase();
    }
  
    // CSV: add UTF-8 BOM (helps Excel detect UTF-8); also export numbers only.
    function downloadCsv(filename, csvContent) {
      const BOM = '\ufeff';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  
    function toCsv(rows) {
      const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return rows.map(r => r.map(escape).join(',')).join('\r\n');
    }
  
    function getParamAny(params, keys) {
      for (const k of keys) {
        const v = params.get(k);
        if (v) return v;
      }
      for (const k of keys) {
        const v = params.get(k.toLowerCase());
        if (v) return v;
      }
      return null;
    }
  
    function nowStamp() {
      const d = new Date();
      return d.toLocaleString();
    }
  
    async function fetchAsDataURL(url) {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Logo fetch failed: ${res.status}`);
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  
    // ===== State =====
    let lgaId = null;
    let monthYYYYMM = null; // YYYY-MM
    let selectedYear = new Date().getFullYear();
  
    let lgaRow = null;
  
    let allStreams = [];
    let activeStreams = [];
    let allCodes = [];
    let codesByStream = new Map();
  
    let budgetsByStreamYear = new Map(); // `${streamId}:${year}` => row
    let collectedByCode = new Map();     // codeId => sum
    let monthTotal = 0;
    let officersCount = 0;
  
    // For export (avoid reading DOM text that may contain currency symbols)
    let lastStreamsRows = []; // [{streamName,codesCount,annual,monthly,collected}]
    let lastCodesRows = [];   // [{streamName,code,name,collected}]
  
    function keyBudget(streamId, year) { return `${streamId}:${year}`; }
    function getBudget(streamId, year) { return budgetsByStreamYear.get(keyBudget(streamId, year)) || null; }
  
    function readParams() {
      const params = new URLSearchParams(window.location.search);
  
      lgaId = getParamAny(params, ['lga_id', 'lgaId', 'lgaid', 'lga']);
      monthYYYYMM = getParamAny(params, ['month']);
      const yearStr = getParamAny(params, ['year']);
  
      if (yearStr) selectedYear = Number(yearStr) || selectedYear;
  
      if (!monthYYYYMM) {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        monthYYYYMM = `${now.getFullYear()}-${mm}`;
      }
  
      if (monthPicker) monthPicker.value = monthYYYYMM;
      populateYearSelect(budgetYearFilter, selectedYear);
    }
  
    function setParamsInUrl() {
      const qs = new URLSearchParams();
      if (lgaId) qs.set('lga_id', lgaId);
      if (monthYYYYMM) qs.set('month', monthYYYYMM);
      if (selectedYear) qs.set('year', String(selectedYear));
      history.replaceState(null, '', `${location.pathname}?${qs.toString()}`);
    }
  
    // ===== Auth / Admin check =====
    async function loadAdminProfile() {
      const { data: sessionData, error: sessionErr } = await sb.auth.getSession();
      const user = sessionData?.session?.user;
  
      if (sessionErr || !user) {
        window.location.href = '../index.html';
        return null;
      }
  
      const { data: profile, error: profErr } = await sb
        .from('profiles')
        .select('full_name, global_role')
        .eq('user_id', user.id)
        .single();
  
      if (profErr || !profile || profile.global_role !== 'admin') {
        window.location.href = '../index.html';
        return null;
      }
  
      const name = (profile.full_name || '').trim() || user.email || 'Admin User';
      const initial = name.charAt(0).toUpperCase();
  
      const topbarUserName = document.getElementById('topbarUserName');
      const topbarUserInitial = document.getElementById('topbarUserInitial');
      if (topbarUserName) topbarUserName.textContent = name;
      if (topbarUserInitial) topbarUserInitial.textContent = initial;
  
      return { user, profile, displayName: name };
    }
  
    // ===== Data loaders =====
    async function loadLga() {
      if (!lgaId) return;
  
      const { data, error } = await sb
        .from('lgas')
        .select('id, name, is_active')
        .eq('id', lgaId)
        .single();
  
      if (error) throw error;
      lgaRow = data;
    }
  
    async function loadStreamsAndCodes() {
      const { data: streams, error: sErr } = await sb
        .from('revenue_streams')
        .select('id, name, is_active')
        .order('name', { ascending: true });
  
      if (sErr) throw sErr;
  
      allStreams = streams || [];
      activeStreams = allStreams.filter(s => s.is_active === true);
  
      const { data: codes, error: cErr } = await sb
        .from('economic_codes')
        .select('id, revenue_stream_id, code, name, is_active')
        .eq('is_active', true)
        .order('code', { ascending: true });
  
      if (cErr) throw cErr;
  
      allCodes = codes || [];
      codesByStream = new Map();
      allCodes.forEach(c => {
        if (!codesByStream.has(c.revenue_stream_id)) codesByStream.set(c.revenue_stream_id, []);
        codesByStream.get(c.revenue_stream_id).push(c);
      });
    }
  
    async function loadBudgetsForYear(year) {
      budgetsByStreamYear = new Map();
  
      const { data, error } = await sb
        .from('revenue_stream_budgets')
        .select('id, revenue_stream_id, year, annual_budget, monthly_target')
        .eq('year', year);
  
      if (error) {
        console.warn('Budget load error:', error);
        return;
      }
  
      (data || []).forEach(b => budgetsByStreamYear.set(keyBudget(b.revenue_stream_id, b.year), b));
    }
  
    async function loadOfficersCount() {
      officersCount = 0;
      if (!lgaId) return;
  
      const { data, error } = await sb
        .from('officer_assignments')
        .select('officer_id')
        .eq('lga_id', lgaId)
        .eq('is_active', true);
  
      if (error) {
        console.warn('Assignments load error:', error);
        return;
      }
  
      officersCount = new Set((data || []).map(r => r.officer_id).filter(Boolean)).size;
    }
  
    async function loadCollectionsForMonth() {
      collectedByCode = new Map();
      monthTotal = 0;
  
      if (!lgaId || !monthYYYYMM) return;
  
      const monthISO = `${monthYYYYMM}-01`; // date column
      const { data, error } = await sb
        .from('collections')
        .select('economic_code_id, amount_collected')
        .eq('lga_id', lgaId)
        .eq('month_year', monthISO);
  
      if (error) {
        console.warn('Collections load error:', error);
        return;
      }
  
      (data || []).forEach(r => {
        const codeId = r.economic_code_id;
        const amt = Number(r.amount_collected || 0);
        monthTotal += amt;
        collectedByCode.set(codeId, (collectedByCode.get(codeId) || 0) + amt);
      });
    }
  
    // ===== Row builders (single source of truth for UI + exports) =====
    function buildStreamsRows() {
      if (!activeStreams || activeStreams.length === 0) return [];
  
      const rows = activeStreams.map(s => {
        const codes = codesByStream.get(s.id) || [];
        let collected = 0;
        codes.forEach(c => { collected += Number(collectedByCode.get(c.id) || 0); });
  
        const b = getBudget(s.id, selectedYear);
        const annual = b ? Number(b.annual_budget || 0) : 0;
        const monthly = b ? Number(b.monthly_target || 0) : 0;
  
        return {
          streamName: s.name || 'Revenue Stream',
          codesCount: codes.length,
          annual,
          monthly,
          collected
        };
      }).sort((a, b) => b.collected - a.collected);
  
      return rows;
    }
  
    function buildCodesRows() {
      const streamNameById = new Map(allStreams.map(s => [s.id, s.name]));
  
      const rows = (allCodes || []).map(c => {
        const collected = Number(collectedByCode.get(c.id) || 0);
        return {
          streamName: streamNameById.get(c.revenue_stream_id) || 'Revenue Stream',
          code: c.code || '',
          name: c.name || '',
          collected
        };
      }).sort((a, b) => b.collected - a.collected);
  
      return rows;
    }
  
    // ===== Rendering =====
    function renderHeaderAndCards() {
      const lgaName = lgaRow?.name || 'LGA';
      const period = monthLabel(monthYYYYMM);
  
      if (reportSubtitle) {
        if (!lgaId) reportSubtitle.textContent = 'Missing lga_id in URL. Go back and open report again.';
        else reportSubtitle.textContent = `${lgaName} — ${period} (Budget year: ${selectedYear})`;
      }
  
      if (cardLgaName) cardLgaName.textContent = lgaName;
      if (cardPeriod) cardPeriod.textContent = `Period: ${period}`;
      if (cardOfficers) cardOfficers.textContent = String(officersCount || 0);
      if (cardStreams) cardStreams.textContent = String(activeStreams.length || 0);
      if (cardCollected) cardCollected.textContent = formatNairaUI(monthTotal || 0);
    }
  
    function renderStreamsTable() {
      if (!streamsReportBody) return;
  
      lastStreamsRows = buildStreamsRows();
  
      if (activeStreams.length === 0) {
        streamsReportBody.innerHTML = `
          <tr class="text-slate-500">
            <td colspan="5" class="px-3 py-4 text-center">No active revenue streams found.</td>
          </tr>`;
        return;
      }
  
      streamsReportBody.innerHTML = lastStreamsRows.map(r => `
        <tr>
          <td class="px-3 py-2">${safeText(r.streamName)}</td>
          <td class="px-3 py-2">${r.codesCount}</td>
          <td class="px-3 py-2">${formatNairaUI(r.annual)}</td>
          <td class="px-3 py-2">${formatNairaUI(r.monthly)}</td>
          <td class="px-3 py-2">${formatNairaUI(r.collected)}</td>
        </tr>
      `).join('');
    }
  
    function renderCodesTable() {
      if (!codesReportBody) return;
  
      lastCodesRows = buildCodesRows();
  
      if (lastCodesRows.length === 0) {
        codesReportBody.innerHTML = `
          <tr class="text-slate-500">
            <td colspan="4" class="px-3 py-4 text-center">No economic codes found.</td>
          </tr>`;
        return;
      }
  
      codesReportBody.innerHTML = lastCodesRows.map(r => `
        <tr>
          <td class="px-3 py-2">${safeText(r.streamName)}</td>
          <td class="px-3 py-2">${safeText(r.code)}</td>
          <td class="px-3 py-2">${safeText(r.name)}</td>
          <td class="px-3 py-2">${formatNairaUI(r.collected)}</td>
        </tr>
      `).join('');
    }
  
    // ===== Exports (CSV) =====
    function csvMetaRows() {
      const period = monthLabel(monthYYYYMM);
      const lgaName = lgaRow?.name || 'LGA';
      return [
        ['KATSINA STATE INTERNAL REVENUE SERVICE'],
        ['SERVICE WIDE COLLECTION REPORT'],
        [`FOR THE MONTH OF ${String(period).toUpperCase()}`],
        [''],
        [`LGA: ${lgaName}`],
        [`Budget year: ${selectedYear}`],
        [`Generated: ${nowStamp()}`],
        ['']
      ];
    }
  
    function exportStreamsCsv() {
      const meta = csvMetaRows();
      const rows = buildStreamsRows(); // ensure fresh
  
      const table = [
        ['Revenue stream', 'Codes', 'Approved year', 'Approved month', 'Collected month'],
        ...rows.map(r => [
          r.streamName,
          r.codesCount,
          formatNumber(r.annual),
          formatNumber(r.monthly),
          formatNumber(r.collected)
        ])
      ];
  
      const filename = `KTIRS_ServiceWideReport_${(lgaRow?.name || 'LGA').replace(/\s+/g, '_')}_${monthYYYYMM}_Streams.csv`;
      downloadCsv(filename, toCsv([...meta, ...table]));
    }
  
    function exportCodesCsv() {
      const meta = csvMetaRows();
      const rows = buildCodesRows(); // ensure fresh
  
      const table = [
        ['Stream', 'Code', 'Name', 'Collected month'],
        ...rows.map(r => [
          r.streamName,
          r.code,
          r.name,
          formatNumber(r.collected)
        ])
      ];
  
      const filename = `KTIRS_ServiceWideReport_${(lgaRow?.name || 'LGA').replace(/\s+/g, '_')}_${monthYYYYMM}_Codes.csv`;
      downloadCsv(filename, toCsv([...meta, ...table]));
    }
  
    // ===== Export (PDF) =====
    async function exportPdf() {
      const jspdfNS = window.jspdf;
      if (!jspdfNS?.jsPDF) {
        alert('PDF library not loaded.');
        return;
      }
  
      const doc = new jspdfNS.jsPDF('p', 'pt', 'a4');
  
      const lgaName = lgaRow?.name || 'LGA';
      const periodUpper = monthUpperLabel(monthYYYYMM);
  
      // Try to load logo, but don't fail the whole export if missing
      let logoDataUrl = null;
      try {
        logoDataUrl = await fetchAsDataURL(LOGO_URL);
      } catch (e) {
        console.warn(e);
      }
  
      // Layout constants
      const pageW = doc.internal.pageSize.getWidth();
      const marginX = 40;
  
      // Header block
      const headerTop = 32;
      const logoW = 62;
      const logoH = 62;
  
      if (logoDataUrl) {
        // addImage supports JPEG/PNG; since your file is .jpg, use 'JPEG'
        doc.addImage(logoDataUrl, 'JPEG', marginX, headerTop, logoW, logoH);
      }
  
      // Centered headings
      doc.setTextColor(...BRAND_BLACK);
  
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('KATSINA STATE INTERNAL REVENUE SERVICE', pageW / 2, headerTop + 20, { align: 'center' });
  
      doc.setFontSize(11);
      doc.text('SERVICE WIDE COLLECTION REPORT', pageW / 2, headerTop + 38, { align: 'center' });
  
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`FOR THE MONTH OF ${periodUpper}`, pageW / 2, headerTop + 55, { align: 'center' });
  
      // Divider line
      doc.setDrawColor(...BRAND_RED);
      doc.setLineWidth(1);
      doc.line(marginX, headerTop + 78, pageW - marginX, headerTop + 78);
  
      // Meta info under header
      let y = headerTop + 98;
      doc.setTextColor(...BRAND_BLACK);
      doc.setFontSize(9);
  
      doc.setFont('helvetica', 'bold');
      doc.text('LGA:', marginX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(lgaName), marginX + 30, y);
  
      doc.setFont('helvetica', 'bold');
      doc.text('Budget year:', pageW / 2, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(selectedYear), pageW / 2 + 70, y);
  
      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.text('Officers:', marginX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(officersCount || 0), marginX + 45, y);
  
      doc.setFont('helvetica', 'bold');
      doc.text('Collected (month):', pageW / 2, y);
      doc.setFont('helvetica', 'normal');
      doc.text(formatNumber(monthTotal || 0), pageW / 2 + 92, y);
  
      y += 18;
  
      // Streams table (data-driven; no ₦ symbol)
      const streamsRows = buildStreamsRows();
      doc.autoTable({
        startY: y,
        head: [[
          'Revenue stream',
          'Codes',
          'Approved year',
          'Approved month',
          'Collected month'
        ]],
        body: streamsRows.map(r => [
          r.streamName,
          String(r.codesCount),
          formatNumber(r.annual),
          formatNumber(r.monthly),
          formatNumber(r.collected)
        ]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: BRAND_RED, textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: marginX, right: marginX }
      });
  
      const afterStreamsY = (doc.lastAutoTable?.finalY || y) + 18;
  
      // Codes table
      const codesRows = buildCodesRows();
      doc.autoTable({
        startY: afterStreamsY,
        head: [[ 'Stream', 'Code', 'Name', 'Collected month' ]],
        body: codesRows.map(r => [
          r.streamName,
          r.code,
          r.name,
          formatNumber(r.collected)
        ]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: BRAND_GREEN, textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: marginX, right: marginX }
      });
  
      // Footer (page numbers)
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(90);
        doc.text(
          `Generated: ${nowStamp()}  |  Page ${i} of ${pageCount}`,
          pageW / 2,
          doc.internal.pageSize.getHeight() - 22,
          { align: 'center' }
        );
      }
  
      const filename = `KTIRS_ServiceWideReport_${String(lgaName).replace(/\s+/g, '_')}_${monthYYYYMM}.pdf`;
      doc.save(filename);
    }
  
    // ===== Refresh =====
    async function refresh() {
      if (streamsReportBody) {
        streamsReportBody.innerHTML =
          `<tr class="text-slate-500"><td colspan="5" class="px-3 py-4 text-center">Loading streams…</td></tr>`;
      }
      if (codesReportBody) {
        codesReportBody.innerHTML =
          `<tr class="text-slate-500"><td colspan="4" class="px-3 py-4 text-center">Loading codes…</td></tr>`;
      }
  
      await loadStreamsAndCodes();
      await loadBudgetsForYear(selectedYear);
  
      if (!lgaId) {
        lgaRow = null;
        collectedByCode = new Map();
        monthTotal = 0;
        officersCount = 0;
  
        renderHeaderAndCards();
        renderStreamsTable();
        renderCodesTable();
        if (window.lucide) lucide.createIcons();
        return;
      }
  
      await loadLga();
      await loadOfficersCount();
      await loadCollectionsForMonth();
  
      renderHeaderAndCards();
      renderStreamsTable();
      renderCodesTable();
  
      if (window.lucide) lucide.createIcons();
    }
  
    // ===== Events =====
    if (monthPicker) {
      monthPicker.addEventListener('change', async () => {
        monthYYYYMM = monthPicker.value || monthYYYYMM;
        setParamsInUrl();
        await refresh();
      });
    }
  
    if (budgetYearFilter) {
      budgetYearFilter.addEventListener('change', async () => {
        selectedYear = Number(budgetYearFilter.value) || selectedYear;
        setParamsInUrl();
        await refresh();
      });
    }
  
    if (exportStreamsCsvBtn) exportStreamsCsvBtn.addEventListener('click', exportStreamsCsv);
    if (exportCodesCsvBtn) exportCodesCsvBtn.addEventListener('click', exportCodesCsv);
  
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', async () => {
        exportPdfBtn.disabled = true;
        try {
          await exportPdf();
        } finally {
          exportPdfBtn.disabled = false;
        }
      });
    }
  
    if (printBtn) printBtn.addEventListener('click', () => window.print());
  
    // ===== Init =====
    (async () => {
      readParams();
      setParamsInUrl();
      await loadAdminProfile();
      await refresh();
    })();
  })();
  