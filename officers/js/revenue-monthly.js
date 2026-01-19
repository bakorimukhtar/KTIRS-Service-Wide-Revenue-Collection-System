// mda/js/revenue-monthly.js

(async () => {
    const supabase = window.supabaseClient;
    if (!supabase) return;
  
    const topbarUserName = document.getElementById('topbarUserName');
    const topbarUserInitial = document.getElementById('topbarUserInitial');
    const topbarMdaName = document.getElementById('topbarMdaName');
  
    const btnBackToSources = document.getElementById('btnBackToSources');
    const yearBadge = document.getElementById('yearBadge');
    const assignedMdaBadge = document.getElementById('assignedMdaBadge');
  
    const pageTitle = document.getElementById('pageTitle');
    const sourceCodeLabel = document.getElementById('sourceCodeLabel');
    const sourceNameLabel = document.getElementById('sourceNameLabel');
    const approvedBudgetLabel = document.getElementById('approvedBudgetLabel');
    const totalRecordedLabel = document.getElementById('totalRecordedLabel');
  
    const monthsTableBody = document.getElementById('monthsTableBody');
  
    const monthNames = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];
  
    // 1. Read query params
    const params = new URLSearchParams(window.location.search);
    const revenueSourceIdParam = params.get('revenue_source_id');
    const yearParam = params.get('year');
  
    if (!revenueSourceIdParam) {
      if (pageTitle) pageTitle.textContent = 'Revenue source not specified.';
      return;
    }
    const revenueSourceId = parseInt(revenueSourceIdParam, 10);
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  
    if (yearBadge) yearBadge.textContent = String(year);
  
    // 2. Session + profile
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session || !sessionData.session.user) {
      window.location.href = '../index.html';
      return;
    }
    const user = sessionData.session.user;
  
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, email, global_role')
      .eq('user_id', user.id)
      .single();
  
    if (profileError || !profile || profile.global_role !== 'mda_user') {
      window.location.href = '../index.html';
      return;
    }
  
    const displayName =
      profile.full_name && profile.full_name.trim().length > 0
        ? profile.full_name.trim()
        : profile.email || 'MDA Officer';
  
    if (topbarUserName) topbarUserName.textContent = displayName;
    if (topbarUserInitial) topbarUserInitial.textContent = displayName.charAt(0).toUpperCase();
  
    // 3. Resolve MDA from user_scopes
    const { data: scopes, error: scopesError } = await supabase
      .from('user_scopes')
      .select('mda_id')
      .eq('user_id', user.id)
      .order('id', { ascending: true });
  
    if (scopesError || !scopes || scopes.length === 0 || !scopes[0].mda_id) {
      if (pageTitle) pageTitle.textContent = 'No MDA assigned to your account.';
      if (assignedMdaBadge) assignedMdaBadge.textContent = 'No MDA';
      if (topbarMdaName) topbarMdaName.textContent = 'No MDA';
      return;
    }
  
    const mdaId = scopes[0].mda_id;
  
    // 4. Load MDA
    const { data: mda, error: mdaError } = await supabase
      .from('mdas')
      .select('id, name')
      .eq('id', mdaId)
      .single();
  
    if (mdaError || !mda) {
      if (pageTitle) pageTitle.textContent = 'Assigned MDA not found.';
      if (assignedMdaBadge) assignedMdaBadge.textContent = 'MDA not found';
      if (topbarMdaName) topbarMdaName.textContent = 'MDA not found';
      return;
    }
  
    if (assignedMdaBadge) assignedMdaBadge.textContent = mda.name;
    if (topbarMdaName) topbarMdaName.textContent = mda.name;
  
    // 5. Load revenue source and ensure it belongs to this MDA
    const { data: source, error: sourceError } = await supabase
      .from('revenue_sources')
      .select('id, code, name, approved_budget, budget_year, mda_id')
      .eq('id', revenueSourceId)
      .single();
  
    if (sourceError || !source || source.mda_id !== mda.id) {
      if (pageTitle) pageTitle.textContent = 'Revenue source not found for your MDA.';
      return;
    }
  
    if (pageTitle) pageTitle.textContent = `Monthly entry – ${source.name}`;
    if (sourceCodeLabel) sourceCodeLabel.textContent = `Code: ${source.code}`;
    if (sourceNameLabel) sourceNameLabel.textContent = source.name;
  
    const approved = Number(source.approved_budget) || 0;
    if (approvedBudgetLabel) {
      approvedBudgetLabel.textContent =
        '₦' +
        approved.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  
    // 6. Load existing revenues for this MDA, source, year
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
  
    const { data: revenues, error: revenuesError } = await supabase
      .from('revenues')
      .select('amount, revenue_date')
      .eq('mda_id', mda.id)
      .eq('revenue_source_id', source.id)
      .gte('revenue_date', yearStart)
      .lte('revenue_date', yearEnd);
  
    if (revenuesError) {
      console.error('Error loading revenues for monthly view:', revenuesError);
    }
  
    // Aggregate by month
    const totalsByMonth = new Map();
    let yearlyTotal = 0;
  
    if (Array.isArray(revenues)) {
      revenues.forEach((r) => {
        const d = new Date(r.revenue_date);
        if (Number.isNaN(d.getTime())) return;
        const monthIndex = d.getMonth(); // 0-11
        const amt = Number(r.amount) || 0;
        yearlyTotal += amt;
        const prev = totalsByMonth.get(monthIndex) || 0;
        totalsByMonth.set(monthIndex, prev + amt);
      });
    }
  
    if (totalRecordedLabel) {
      totalRecordedLabel.textContent =
        '₦' +
        yearlyTotal.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
    }
  
    // 7. Render months table with action button
    if (monthsTableBody) {
      monthsTableBody.innerHTML = '';
  
      for (let i = 0; i < 12; i++) {
        const tr = document.createElement('tr');
        tr.className = 'border-t border-slate-200';
  
        const tdMonth = document.createElement('td');
        tdMonth.className = 'px-2 py-1.5';
        tdMonth.textContent = `${monthNames[i]} ${year}`;
  
        const tdCurrent = document.createElement('td');
        tdCurrent.className = 'px-2 py-1.5 text-right whitespace-nowrap';
        const currentTotal = totalsByMonth.get(i) || 0;
        tdCurrent.textContent =
          '₦' +
          currentTotal.toLocaleString('en-NG', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
  
        const tdAction = document.createElement('td');
        tdAction.className = 'px-2 py-1.5 text-right whitespace-nowrap';
  
        const btnDetail = document.createElement('button');
        btnDetail.type = 'button';
        btnDetail.className =
          'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50';
        btnDetail.innerHTML = '<span>Record / update entries</span>';
        btnDetail.addEventListener('click', () => {
          const monthNumber = i + 1; // 1-12
          const url = `monthly-detail.html?revenue_source_id=${encodeURIComponent(
            source.id
          )}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(monthNumber)}`;
          window.location.href = url;
        });
  
        tdAction.appendChild(btnDetail);
  
        tr.appendChild(tdMonth);
        tr.appendChild(tdCurrent);
        tr.appendChild(tdAction);
  
        monthsTableBody.appendChild(tr);
      }
    }
  
    // 8. Back button
    if (btnBackToSources) {
      btnBackToSources.addEventListener('click', () => {
        window.location.href = 'revenue-sources.html';
      });
    }
  })();
  