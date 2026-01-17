// mda/js/revenue-sources.js

(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');
  const topbarMdaName = document.getElementById('topbarMdaName');
  const btnLogout = document.getElementById('btnLogout');

  const mdaNameHeading = document.getElementById('mdaNameHeading');
  const assignedMdaBadge = document.getElementById('assignedMdaBadge');
  const budgetYearLabel = document.getElementById('budgetYearLabel');
  const sourcesTableBody = document.getElementById('sourcesTableBody');

  // Modal elements
  const sourceModal = document.getElementById('sourceModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const modalSourceTitle = document.getElementById('modalSourceTitle');
  const modalSourceSubtitle = document.getElementById('modalSourceSubtitle');
  const modalApprovedBudget = document.getElementById('modalApprovedBudget');
  const modalTotalRecorded = document.getElementById('modalTotalRecorded');
  const modalCoverageText = document.getElementById('modalCoverageText');
  const modalZonesBody = document.getElementById('modalZonesBody');
  const btnExportAllLgasPdf = document.getElementById('btnExportAllLgasPdf');
  const btnExportAllLgasExcel = document.getElementById('btnExportAllLgasExcel');
  const btnOpenMonthlyEntry = document.getElementById('btnOpenMonthlyEntry');

  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  // 1. Session + profile
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session || !sessionData.session.user) {
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

  // 2. Resolve MDA from user_scopes
  const { data: scopes } = await supabase
    .from('user_scopes')
    .select('mda_id')
    .eq('user_id', user.id)
    .order('id', { ascending: true });

  if (!scopes || scopes.length === 0 || !scopes[0].mda_id) {
    if (mdaNameHeading) mdaNameHeading.textContent = 'No MDA assigned';
    if (assignedMdaBadge) assignedMdaBadge.textContent = 'No MDA';
    if (topbarMdaName) topbarMdaName.textContent = 'No MDA';
    return;
  }

  const mdaId = scopes[0].mda_id;

  // 3. Load MDA
  const { data: mda } = await supabase
    .from('mdas')
    .select('id, name')
    .eq('id', mdaId)
    .single();

  if (!mda) {
    if (mdaNameHeading) mdaNameHeading.textContent = 'Assigned MDA not found';
    if (assignedMdaBadge) assignedMdaBadge.textContent = 'MDA not found';
    if (topbarMdaName) topbarMdaName.textContent = 'MDA not found';
    return;
  }

  if (mdaNameHeading) mdaNameHeading.textContent = mda.name;
  if (assignedMdaBadge) assignedMdaBadge.textContent = mda.name;
  if (topbarMdaName) topbarMdaName.textContent = mda.name;

  // 4. Determine budget year (current year)
  const now = new Date();
  const year = now.getFullYear();
  if (budgetYearLabel) budgetYearLabel.textContent = String(year);

  // 5. Load zones + lgas for zone totals and exports
  const [{ data: zones }, { data: lgas }] = await Promise.all([
    supabase.from('zones').select('id, name').order('name', { ascending: true }),
    supabase.from('lgas').select('id, name, zone_id').order('name', { ascending: true })
  ]);

  // 6. Load revenue sources for this MDA and year
  const { data: sources, error: sourcesError } = await supabase
    .from('revenue_sources')
    .select('id, code, name, approved_budget, budget_year, is_active')
    .eq('mda_id', mda.id)
    .eq('is_active', true)
    .or(`budget_year.eq.${year},budget_year.is.null`);

  if (sourcesError) {
    console.error('Error loading revenue_sources', sourcesError);
  }

  // Load all revenues for this MDA and year once; reuse client-side
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const { data: revenues, error: revenuesError } = await supabase
    .from('revenues')
    .select('revenue_source_id, amount, revenue_date, zone_id, lga_id')
    .eq('mda_id', mda.id)
    .gte('revenue_date', yearStart)
    .lte('revenue_date', yearEnd);

  if (revenuesError) {
    console.error('Error loading revenues', revenuesError);
  }

  const revenuesBySource = new Map();
  if (Array.isArray(revenues)) {
    revenues.forEach((r) => {
      const key = String(r.revenue_source_id);
      if (!revenuesBySource.has(key)) {
        revenuesBySource.set(key, []);
      }
      revenuesBySource.get(key).push(r);
    });
  }

  // 7. Render revenue sources table
  if (sourcesTableBody) {
    sourcesTableBody.innerHTML = '';

    (sources || []).forEach((src) => {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-slate-200';

      const tdCode = document.createElement('td');
      tdCode.className = 'px-2 py-1.5 whitespace-nowrap';
      tdCode.textContent = src.code;

      const tdName = document.createElement('td');
      tdName.className = 'px-2 py-1.5';
      tdName.textContent = src.name;

      const tdApproved = document.createElement('td');
      tdApproved.className = 'px-2 py-1.5 text-right whitespace-nowrap';
      const approved = Number(src.approved_budget) || 0;
      tdApproved.textContent =
        '₦' +
        approved.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });

      const tdRecorded = document.createElement('td');
      tdRecorded.className = 'px-2 py-1.5 text-right whitespace-nowrap';
      const srcRevs = revenuesBySource.get(String(src.id)) || [];
      const totalRecorded = srcRevs.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      tdRecorded.textContent =
        '₦' +
        totalRecorded.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });

      const tdActions = document.createElement('td');
      tdActions.className = 'px-2 py-1.5 text-right whitespace-nowrap';

      const btnDetails = document.createElement('button');
      btnDetails.type = 'button';
      btnDetails.className =
        'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50';
      btnDetails.textContent = 'Details / Report';
      btnDetails.addEventListener('click', () => {
        openSourceModal(src, revenuesBySource.get(String(src.id)) || [], zones || [], lgas || []);
      });

      tdActions.appendChild(btnDetails);

      tr.appendChild(tdCode);
      tr.appendChild(tdName);
      tr.appendChild(tdApproved);
      tr.appendChild(tdRecorded);
      tr.appendChild(tdActions);

      sourcesTableBody.appendChild(tr);
    });
  }

  // 8. Modal open / close
  function openSourceModal(source, sourceRevenues, zonesList, lgasList) {
    if (!sourceModal) return;

    const approved = Number(source.approved_budget) || 0;
    const totalRecorded = sourceRevenues.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    if (modalSourceTitle) modalSourceTitle.textContent = source.name;
    if (modalSourceSubtitle) {
      modalSourceSubtitle.textContent = `Code: ${source.code} • Year: ${
        source.budget_year || 'Not set'
      }`;
    }
    if (modalApprovedBudget) {
      modalApprovedBudget.textContent =
        '₦' +
        approved.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (modalTotalRecorded) {
      modalTotalRecorded.textContent =
        '₦' +
        totalRecorded.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
    }

    const distinctZones = new Set(sourceRevenues.map((r) => r.zone_id).filter(Boolean));
    const distinctLgas = new Set(sourceRevenues.map((r) => r.lga_id).filter(Boolean));
    const coverageParts = [];
    if (distinctZones.size > 0) coverageParts.push(`${distinctZones.size} zone(s)`);
    if (distinctLgas.size > 0) coverageParts.push(`${distinctLgas.size} LGA(s)`);

    if (modalCoverageText) {
      modalCoverageText.textContent =
        coverageParts.length > 0 ? coverageParts.join(' • ') : 'No records captured yet.';
    }

    // Store current context for exports + monthly entry
    window.__currentSource = source;
    window.__currentSourceRevenues = sourceRevenues;
    window.__zonesList = zonesList;
    window.__lgasList = lgasList;

    // Build zone totals table
    if (modalZonesBody) {
      modalZonesBody.innerHTML = '';

      const totalsByZone = new Map();
      sourceRevenues.forEach((r) => {
        if (!r.zone_id) return;
        const key = String(r.zone_id);
        const prev = totalsByZone.get(key) || 0;
        totalsByZone.set(key, prev + (Number(r.amount) || 0));
      });

      if (totalsByZone.size === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.className = 'px-2 py-2 text-center text-[11px] text-slate-500 italic';
        td.textContent = 'No zone-level records available yet.';
        tr.appendChild(td);
        modalZonesBody.appendChild(tr);
      } else {
        Array.from(totalsByZone.entries()).forEach(([zoneIdStr, total]) => {
          const zone = zonesList.find((z) => String(z.id) === zoneIdStr);
          const zoneName = zone ? zone.name : 'Unknown zone';

          const tr = document.createElement('tr');
          tr.className = 'border-t border-slate-200';

          const tdZone = document.createElement('td');
          tdZone.className = 'px-2 py-1.5';
          tdZone.textContent = zoneName;

          const tdTotal = document.createElement('td');
          tdTotal.className = 'px-2 py-1.5 text-right whitespace-nowrap';
          tdTotal.textContent =
            '₦' +
            total.toLocaleString('en-NG', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });

          const tdExport = document.createElement('td');
          tdExport.className = 'px-2 py-1.5 text-right whitespace-nowrap space-x-1';

          const btnPdf = document.createElement('button');
          btnPdf.type = 'button';
          btnPdf.className =
            'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50';
          btnPdf.innerHTML = '<span>PDF</span>';
          btnPdf.addEventListener('click', () => {
            // TODO: implement zone PDF export
            console.log('Export PDF for zone', zoneIdStr, 'source', source.id);
          });

          const btnExcel = document.createElement('button');
          btnExcel.type = 'button';
          btnExcel.className =
            'inline-flex items-center gap-1 rounded-md bg-slate-900 text-slate-50 px-2 py-0.5 text-[11px] hover:bg-slate-800';
          btnExcel.innerHTML = '<span>Excel</span>';
          btnExcel.addEventListener('click', () => {
            // TODO: implement zone Excel export
            console.log('Export Excel for zone', zoneIdStr, 'source', source.id);
          });

          tdExport.appendChild(btnPdf);
          tdExport.appendChild(btnExcel);

          tr.appendChild(tdZone);
          tr.appendChild(tdTotal);
          tr.appendChild(tdExport);

          modalZonesBody.appendChild(tr);
        });
      }
    }

    sourceModal.classList.remove('hidden');
    sourceModal.classList.add('flex');
  }

  function closeSourceModal() {
    if (!sourceModal) return;
    sourceModal.classList.add('hidden');
    sourceModal.classList.remove('flex');
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', closeSourceModal);
  }
  if (sourceModal) {
    sourceModal.addEventListener('click', (e) => {
      if (e.target === sourceModal) closeSourceModal();
    });
  }

  // 9. All LGAs export buttons (stubbed; add real export later)
  if (btnExportAllLgasPdf) {
    btnExportAllLgasPdf.addEventListener('click', () => {
      const source = window.__currentSource;
      console.log('Export ALL LGAs PDF for source', source ? source.id : null);
      // TODO: implement PDF export for all LGAs of current source
    });
  }

  if (btnExportAllLgasExcel) {
    btnExportAllLgasExcel.addEventListener('click', () => {
      const source = window.__currentSource;
      console.log('Export ALL LGAs Excel for source', source ? source.id : null);
      // TODO: implement Excel export for all LGAs of current source
    });
  }

  // 10. Monthly entry button (navigate to per-source monthly page)
  if (btnOpenMonthlyEntry) {
    btnOpenMonthlyEntry.addEventListener('click', () => {
      const source = window.__currentSource;
      if (!source) return;

      const url = `revenue-monthly.html?revenue_source_id=${encodeURIComponent(
        source.id
      )}&year=${encodeURIComponent(year)}`;
      window.location.href = url;
    });
  }

  // 11. Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '../index.html';
    });
  }
})();
