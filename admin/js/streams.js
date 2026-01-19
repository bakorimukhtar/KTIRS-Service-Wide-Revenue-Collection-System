// admin/js/streams.js (UPDATED - fixes: supabase redeclare + Monthly Records)

(() => {
  // ===== Supabase client =====
  const sb = window.supabaseClient;
  if (!sb) {
    alert('Supabase client not initialized.');
    throw new Error('window.supabaseClient missing');
  }

  // ===== Sidebar + auth UI =====
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const logoutBtn = document.getElementById('logoutBtn');

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

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      const isHidden = sidebar.classList.contains('-translate-x-full');
      isHidden ? openSidebar() : closeSidebar();
    });
  }
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

  // ===== Helpers =====
  function formatNaira(amount) {
    const v = Number(amount || 0);
    return (
      '₦' +
      v.toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    );
  }
  function badgeStatus(isActive) {
    if (isActive) {
      return `<span class="inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 text-[11px]">Active</span>`;
    }
    return `<span class="inline-flex items-center rounded-full bg-rose-50 text-rose-800 border border-rose-100 px-2 py-0.5 text-[11px]">Inactive</span>`;
  }
  function safeText(s) {
    return String(s ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }
  function uniq(arr) { return [...new Set(arr)]; }

  // ===== Filters =====
  const searchStream = document.getElementById('searchStream');
  const filterStatus = document.getElementById('filterStatus');
  const budgetYearFilter = document.getElementById('budgetYearFilter');
  const streamsTableBody = document.getElementById('streamsTableBody');

  // ===== Details modal elements =====
  const detailsModal = document.getElementById('detailsModal');
  const detailsBackdrop = document.getElementById('detailsBackdrop');
  const closeDetailsBtn = document.getElementById('closeDetailsBtn');
  const closeDetailsBtn2 = document.getElementById('closeDetailsBtn2');

  const detailsStreamName = document.getElementById('detailsStreamName');
  const detailsCodesCount = document.getElementById('detailsCodesCount');
  const detailsAnnualTotal = document.getElementById('detailsAnnualTotal');
  const detailsMonthlyTotal = document.getElementById('detailsMonthlyTotal');

  const tabCodes = document.getElementById('tabCodes');
  const tabMonthly = document.getElementById('tabMonthly');
  const panelCodes = document.getElementById('panelCodes');
  const panelMonthly = document.getElementById('panelMonthly');

  const codesTableBody = document.getElementById('codesTableBody');
  const monthlyTableBody = document.getElementById('monthlyTableBody');
  const monthPicker = document.getElementById('monthPicker');

  const detailsBudgetYear = document.getElementById('detailsBudgetYear');
  const openBudgetModalBtn = document.getElementById('openBudgetModalBtn');

  // ===== Budget modal elements =====
  const budgetModal = document.getElementById('budgetModal');
  const budgetBackdrop = document.getElementById('budgetBackdrop');
  const closeBudgetBtn = document.getElementById('closeBudgetBtn');
  const closeBudgetBtn2 = document.getElementById('closeBudgetBtn2');

  const budgetModalTitle = document.getElementById('budgetModalTitle');
  const budgetYearInput = document.getElementById('budgetYearInput');
  const annualBudgetInput = document.getElementById('annualBudgetInput');
  const monthlyTargetInput = document.getElementById('monthlyTargetInput');
  const saveBudgetBtn = document.getElementById('saveBudgetBtn');
  const budgetFormMessage = document.getElementById('budgetFormMessage');

  // ===== State =====
  let allStreams = [];
  let allCodes = [];
  let codesByStream = new Map();

  let budgetsByStreamYear = new Map(); // key = `${streamId}:${year}` => row
  let currentStreamId = null;

  let selectedYear = new Date().getFullYear();

  // ===== Default month picker to current month =====
  (function initMonth() {
    if (!monthPicker) return;
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    monthPicker.value = `${now.getFullYear()}-${mm}`;
  })();

  // ===== Modal show/hide =====
  function showModal() {
    if (!detailsModal) return;
    detailsModal.classList.remove('hidden');
  }
  function hideModal() {
    if (!detailsModal) return;
    detailsModal.classList.add('hidden');
    currentStreamId = null;
  }
  if (detailsBackdrop) detailsBackdrop.addEventListener('click', hideModal);
  if (closeDetailsBtn) closeDetailsBtn.addEventListener('click', hideModal);
  if (closeDetailsBtn2) closeDetailsBtn2.addEventListener('click', hideModal);

  function showBudgetModal() {
    if (!budgetModal) return;
    budgetModal.classList.remove('hidden');
  }
  function hideBudgetModal() {
    if (!budgetModal) return;
    budgetModal.classList.add('hidden');
    if (budgetFormMessage) budgetFormMessage.textContent = '';
  }
  if (budgetBackdrop) budgetBackdrop.addEventListener('click', hideBudgetModal);
  if (closeBudgetBtn) closeBudgetBtn.addEventListener('click', hideBudgetModal);
  if (closeBudgetBtn2) closeBudgetBtn2.addEventListener('click', hideBudgetModal);

  // ===== Tabs =====
  function setTab(which) {
    const activeBtn = "px-3 py-1.5 rounded-md text-xs border border-slate-200 bg-slate-900 text-white";
    const idleBtn = "px-3 py-1.5 rounded-md text-xs border border-slate-200 hover:bg-slate-50";

    if (which === 'codes') {
      tabCodes.className = activeBtn;
      tabMonthly.className = idleBtn;
      panelCodes.classList.remove('hidden');
      panelMonthly.classList.add('hidden');
    } else {
      tabCodes.className = idleBtn;
      tabMonthly.className = activeBtn;
      panelCodes.classList.add('hidden');
      panelMonthly.classList.remove('hidden');
    }
  }
  if (tabCodes) tabCodes.addEventListener('click', () => setTab('codes'));
  if (tabMonthly) tabMonthly.addEventListener('click', () => setTab('monthly'));

  // ===== Month picker reload =====
  if (monthPicker) {
    monthPicker.addEventListener('change', async () => {
      if (!currentStreamId) return;
      await loadMonthlyForStream(currentStreamId);
    });
  }

  // ===== Logout =====
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const { error } = await sb.auth.signOut();
      if (error) {
        alert('Unable to log out right now. Please try again.');
        return;
      }
      window.location.href = '../index.html';
    });
  }

  // ===== Budget helpers =====
  function keyBudget(streamId, year) {
    return `${streamId}:${year}`;
  }
  function getStreamBudget(streamId, year) {
    return budgetsByStreamYear.get(keyBudget(streamId, year)) || null;
  }
  function populateYearSelect(selectEl, baseYear) {
    if (!selectEl) return;
    const y = Number(baseYear) || new Date().getFullYear();
    const years = [y - 1, y, y + 1, y + 2];
    selectEl.innerHTML = years.map(v => `<option value="${v}">${v}</option>`).join('');
    selectEl.value = String(y);
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

    (data || []).forEach(b => {
      budgetsByStreamYear.set(keyBudget(b.revenue_stream_id, b.year), b);
    });
  }

  // ===== Rendering =====
  function renderStreamsTable() {
    if (!streamsTableBody) return;

    const q = (searchStream?.value || '').trim().toLowerCase();
    const status = (filterStatus?.value || '').trim();

    let rows = allStreams.slice();

    if (q) rows = rows.filter(s => (s.name || '').toLowerCase().includes(q));
    if (status === 'active') rows = rows.filter(s => s.is_active === true);
    if (status === 'inactive') rows = rows.filter(s => s.is_active === false);

    if (rows.length === 0) {
      streamsTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td colspan="6" class="px-3 py-4 text-center">No revenue streams found.</td>
        </tr>
      `;
      return;
    }

    const html = rows.map((s) => {
      const codes = codesByStream.get(s.id) || [];
      const b = getStreamBudget(s.id, selectedYear);

      const annual = b ? Number(b.annual_budget || 0) : 0;
      const monthly = b ? Number(b.monthly_target || 0) : 0;

      return `
        <tr>
          <td class="px-3 py-2">${safeText(s.name)}</td>
          <td class="px-3 py-2">${badgeStatus(s.is_active)}</td>
          <td class="px-3 py-2">${codes.length}</td>
          <td class="px-3 py-2">${formatNaira(annual)}</td>
          <td class="px-3 py-2">${formatNaira(monthly)}</td>
          <td class="px-3 py-2 text-right">
            <button
              class="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50"
              data-view-stream="${s.id}">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              <span>Details</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    streamsTableBody.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    document.querySelectorAll('[data-view-stream]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const streamId = btn.getAttribute('data-view-stream');
        await openStreamDetails(streamId);
      });
    });
  }

  async function openStreamDetails(streamId) {
    currentStreamId = streamId;
    setTab('codes');
    showModal();

    const stream = allStreams.find(s => s.id === streamId);
    detailsStreamName.textContent = stream ? stream.name : 'Revenue Stream';

    populateYearSelect(detailsBudgetYear, selectedYear);

    const codes = codesByStream.get(streamId) || [];
    detailsCodesCount.textContent = String(codes.length);

    const b = getStreamBudget(streamId, selectedYear);
    detailsAnnualTotal.textContent = formatNaira(b ? b.annual_budget : 0);
    detailsMonthlyTotal.textContent = formatNaira(b ? b.monthly_target : 0);

    renderCodesTable(codes);
    await loadMonthlyForStream(streamId);
  }

  function renderCodesTable(codes) {
    if (!codesTableBody) return;

    if (!codes || codes.length === 0) {
      codesTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td colspan="3" class="px-3 py-4 text-center">No economic codes under this stream yet.</td>
        </tr>
      `;
      return;
    }

    codesTableBody.innerHTML = codes.map(c => `
      <tr>
        <td class="px-3 py-2">${safeText(c.code)}</td>
        <td class="px-3 py-2">${safeText(c.name)}</td>
        <td class="px-3 py-2">${badgeStatus(c.is_active)}</td>
      </tr>
    `).join('');
  }

  // ===== Monthly records (FIXED) =====
  async function loadMonthlyForStream(streamId) {
    if (!monthlyTableBody) return;

    const monthValue = (monthPicker?.value || '').trim(); // YYYY-MM
    if (!monthValue) return;

    const monthStart = `${monthValue}-01`;
    const year = Number(monthValue.split('-')[0]);
    const month = Number(monthValue.split('-')[1]); // 1..12
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${monthValue}-${String(lastDay).padStart(2, '0')}`;

    monthlyTableBody.innerHTML = `
      <tr class="text-slate-500">
        <td colspan="6" class="px-3 py-4 text-center">Loading monthly records…</td>
      </tr>
    `;

    try {
      const { data: rows, error } = await sb
        .from('collections')
        .select(`
          id,
          officer_id,
          month_year,
          amount_collected,
          submitted_at,
          lgas(name),
          economic_codes!inner(code, name, revenue_stream_id)
        `)
        .eq('economic_codes.revenue_stream_id', streamId)
        .gte('month_year', monthStart)
        .lte('month_year', monthEnd)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      if (!rows || rows.length === 0) {
        monthlyTableBody.innerHTML = `
          <tr class="text-slate-500">
            <td colspan="6" class="px-3 py-4 text-center">
              No officer submissions for this stream in the selected month.
            </td>
          </tr>
        `;
        return;
      }

      const officerIds = uniq(rows.map(r => r.officer_id).filter(Boolean));
      const officerNameMap = {};

      if (officerIds.length > 0) {
        const { data: officers, error: offErr } = await sb
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', officerIds);

        if (!offErr && Array.isArray(officers)) {
          officers.forEach(o => {
            officerNameMap[o.user_id] = (o.full_name || '').trim() || o.user_id;
          });
        }
      }

      monthlyTableBody.innerHTML = rows.map(r => {
        const lgaName = r.lgas?.name || '—';
        const eco = r.economic_codes
          ? `${r.economic_codes.code || ''} ${r.economic_codes.name || ''}`.trim()
          : '—';
        const officer = officerNameMap[r.officer_id] || 'Officer';
        const monthLabel = r.month_year
          ? new Date(r.month_year).toLocaleString(undefined, { month: 'long', year: 'numeric' })
          : monthValue;
        const submitted = r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—';

        return `
          <tr>
            <td class="px-3 py-2">${safeText(lgaName)}</td>
            <td class="px-3 py-2">${safeText(eco)}</td>
            <td class="px-3 py-2">${safeText(officer)}</td>
            <td class="px-3 py-2">${safeText(monthLabel)}</td>
            <td class="px-3 py-2">${formatNaira(r.amount_collected)}</td>
            <td class="px-3 py-2">${safeText(submitted)}</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error('Load monthly error:', e);
      monthlyTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td colspan="6" class="px-3 py-4 text-center">
            Unable to load monthly records. (Most likely admin RLS policy missing on collections/profiles)
          </td>
        </tr>
      `;
    }
  }

  // ===== Year change (main filter) =====
  if (budgetYearFilter) {
    budgetYearFilter.addEventListener('change', async () => {
      selectedYear = Number(budgetYearFilter.value) || new Date().getFullYear();
      await loadBudgetsForYear(selectedYear);
      renderStreamsTable();

      if (currentStreamId) {
        const b = getStreamBudget(currentStreamId, selectedYear);
        detailsAnnualTotal.textContent = formatNaira(b ? b.annual_budget : 0);
        detailsMonthlyTotal.textContent = formatNaira(b ? b.monthly_target : 0);
        if (detailsBudgetYear) detailsBudgetYear.value = String(selectedYear);
      }
    });
  }

  // ===== Year change inside details modal =====
  if (detailsBudgetYear) {
    detailsBudgetYear.addEventListener('change', async () => {
      selectedYear = Number(detailsBudgetYear.value) || new Date().getFullYear();
      if (budgetYearFilter) budgetYearFilter.value = String(selectedYear);

      await loadBudgetsForYear(selectedYear);
      renderStreamsTable();

      if (currentStreamId) {
        const b = getStreamBudget(currentStreamId, selectedYear);
        detailsAnnualTotal.textContent = formatNaira(b ? b.annual_budget : 0);
        detailsMonthlyTotal.textContent = formatNaira(b ? b.monthly_target : 0);
      }
    });
  }

  // ===== Open budget modal =====
  if (openBudgetModalBtn) {
    openBudgetModalBtn.addEventListener('click', async () => {
      if (!currentStreamId) return;

      const stream = allStreams.find(s => s.id === currentStreamId);
      if (budgetModalTitle) budgetModalTitle.textContent = stream ? stream.name : 'Revenue Stream';

      if (budgetYearInput) budgetYearInput.value = String(selectedYear);

      const b = getStreamBudget(currentStreamId, selectedYear);
      if (annualBudgetInput) annualBudgetInput.value = b ? Number(b.annual_budget || 0) : '';
      if (monthlyTargetInput) monthlyTargetInput.value = b ? Number(b.monthly_target || 0) : '';

      showBudgetModal();
      if (window.lucide) lucide.createIcons();
    });
  }

  // ===== Save budget (upsert) =====
  if (saveBudgetBtn) {
    saveBudgetBtn.addEventListener('click', async () => {
      if (!currentStreamId) return;
      if (budgetFormMessage) budgetFormMessage.textContent = '';

      const year = Number(budgetYearInput?.value);
      const annual = Number(annualBudgetInput?.value || 0);
      const monthly = Number(monthlyTargetInput?.value || 0);

      if (!year || year < 2000) {
        if (budgetFormMessage) budgetFormMessage.textContent = 'Enter a valid year.';
        return;
      }
      if (annual < 0 || monthly < 0) {
        if (budgetFormMessage) budgetFormMessage.textContent = 'Budget values cannot be negative.';
        return;
      }

      try {
        const { data, error } = await sb
          .from('revenue_stream_budgets')
          .upsert(
            {
              revenue_stream_id: currentStreamId,
              year,
              annual_budget: annual,
              monthly_target: monthly,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'revenue_stream_id,year' }
          )
          .select('id, revenue_stream_id, year, annual_budget, monthly_target');

        if (error) throw error;

        const saved = Array.isArray(data) ? data[0] : data;
        if (saved) budgetsByStreamYear.set(keyBudget(saved.revenue_stream_id, saved.year), saved);

        selectedYear = year;
        if (budgetYearFilter) budgetYearFilter.value = String(year);
        if (detailsBudgetYear) detailsBudgetYear.value = String(year);

        renderStreamsTable();

        const b = getStreamBudget(currentStreamId, selectedYear);
        detailsAnnualTotal.textContent = formatNaira(b ? b.annual_budget : 0);
        detailsMonthlyTotal.textContent = formatNaira(b ? b.monthly_target : 0);

        hideBudgetModal();
      } catch (e) {
        console.error('Save budget error:', e);
        if (budgetFormMessage) budgetFormMessage.textContent = 'Unable to save budget. Check permissions and try again.';
      }
    });
  }

  // ===== Main init =====
  (async () => {
    const { data: userData, error: userErr } = await sb.auth.getUser();
    const user = userData?.user;

    if (userErr || !user) {
      window.location.href = '../index.html';
      return;
    }

    const { data: profile, error: profErr } = await sb
      .from('profiles')
      .select('full_name, global_role')
      .eq('user_id', user.id)
      .single();

    if (profErr || !profile || profile.global_role !== 'admin') {
      window.location.href = '../index.html';
      return;
    }

    const name = (profile.full_name || '').trim() || user.email || 'Admin User';
    const initial = name.charAt(0).toUpperCase();

    const topbarUserName = document.getElementById('topbarUserName');
    const topbarUserInitial = document.getElementById('topbarUserInitial');
    if (topbarUserName) topbarUserName.textContent = name;
    if (topbarUserInitial) topbarUserInitial.textContent = initial;

    populateYearSelect(budgetYearFilter, selectedYear);

    const { data: streams, error: streamsError } = await sb
      .from('revenue_streams')
      .select('id, name, is_active, created_at')
      .order('name', { ascending: true });

    if (streamsError) {
      console.error(streamsError);
      streamsTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td colspan="6" class="px-3 py-4 text-center">Unable to load revenue streams.</td>
        </tr>
      `;
      return;
    }
    allStreams = streams || [];

    const { data: codes, error: codesError } = await sb
      .from('economic_codes')
      .select('id, revenue_stream_id, code, name, is_active')
      .order('code', { ascending: true });

    if (codesError) console.warn('Codes load error:', codesError);

    allCodes = codes || [];
    codesByStream = new Map();
    allCodes.forEach(c => {
      const key = c.revenue_stream_id;
      if (!codesByStream.has(key)) codesByStream.set(key, []);
      codesByStream.get(key).push(c);
    });

    await loadBudgetsForYear(selectedYear);
    renderStreamsTable();

    if (searchStream) searchStream.addEventListener('input', renderStreamsTable);
    if (filterStatus) filterStatus.addEventListener('change', renderStreamsTable);

    if (window.lucide) lucide.createIcons();
  })();
})();
