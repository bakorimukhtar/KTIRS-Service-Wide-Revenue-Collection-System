// mda/js/monthly-detail.js

(async () => {
    const supabase = window.supabaseClient;
    if (!supabase) return;
  
    const topbarUserName = document.getElementById('topbarUserName');
    const topbarUserInitial = document.getElementById('topbarUserInitial');
    const topbarMdaName = document.getElementById('topbarMdaName');
  
    const detailHeading = document.getElementById('detailHeading');
    const detailSubheading = document.getElementById('detailSubheading');
    const reportingMonthLabel = document.getElementById('reportingMonthLabel');
    const assignedMdaBadge = document.getElementById('assignedMdaBadge');
    const zonesContainer = document.getElementById('zonesContainer');
    const btnBackToMonthly = document.getElementById('btnBackToMonthly');
    const saveStatus = document.getElementById('saveStatus');
  
    const sourceCodeLabel = document.getElementById('sourceCodeLabel');
    const sourceNameLabel = document.getElementById('sourceNameLabel');
    const approvedBudgetLabel = document.getElementById('approvedBudgetLabel');
    const monthTotalLabel = document.getElementById('monthTotalLabel');
  
    const monthNames = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];
  
    // 1. Read query params: revenue_source_id, year, month
    const params = new URLSearchParams(window.location.search);
    const revenueSourceIdParam = params.get('revenue_source_id');
    const yearParam = params.get('year');
    const monthParam = params.get('month'); // "1".."12"
  
    if (!revenueSourceIdParam || !monthParam) {
      if (detailHeading) detailHeading.textContent = 'Missing revenue source or month.';
      return;
    }
  
    const revenueSourceId = parseInt(revenueSourceIdParam, 10);
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    const monthIndex = parseInt(monthParam, 10) - 1;
    const monthName = monthNames[monthIndex] || 'Month';
    const monthLabel = `${monthName} ${year}`;
  
    if (reportingMonthLabel) reportingMonthLabel.textContent = monthLabel;
    if (detailHeading) detailHeading.textContent = `NTR details for ${monthLabel}`;
    if (detailSubheading) {
      detailSubheading.textContent =
        'Capture Non-Tax Revenue (NTR) by zone and LGA for this month and revenue source.';
    }
  
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
      if (detailHeading) detailHeading.textContent = 'No MDA assigned to your account.';
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
      if (detailHeading) detailHeading.textContent = 'Assigned MDA not found.';
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
      if (detailHeading) detailHeading.textContent = 'Revenue source not found for your MDA.';
      return;
    }
  
    if (sourceCodeLabel) sourceCodeLabel.textContent = `Code: ${source.code}`;
    if (sourceNameLabel) sourceNameLabel.textContent = source.name;
  
    const approved = Number(source.approved_budget) || 0;
    if (approvedBudgetLabel) {
      approvedBudgetLabel.textContent =
        '₦' +
        approved.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
    }
  
    // 6. Load zones and LGAs
    const [{ data: zones, error: zonesError }, { data: lgas, error: lgasError }] = await Promise.all([
      supabase.from('zones').select('id, name').order('name', { ascending: true }),
      supabase.from('lgas').select('id, name, zone_id').order('name', { ascending: true })
    ]);
  
    if (zonesError || lgasError) {
      console.error('Error loading zones/LGAs:', zonesError || lgasError);
      if (saveStatus) {
        saveStatus.textContent = 'Unable to load zones and LGAs. Please contact ICT.';
        saveStatus.className = 'mt-1 text-[11px] text-red-600';
      }
      return;
    }
  
    const lgasByZone = new Map();
    if (Array.isArray(lgas)) {
      lgas.forEach((l) => {
        if (!lgasByZone.has(l.zone_id)) {
          lgasByZone.set(l.zone_id, []);
        }
        lgasByZone.get(l.zone_id).push(l);
      });
    }
  
    // 7. Load existing revenues for this MDA, source, month, year
    const startDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const endDate = new Date(year, monthIndex + 1, 0); // last day of month
    const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(endDate.getDate()).padStart(2, '0')}`;
  
    const { data: revenues, error: revenuesError } = await supabase
      .from('revenues')
      .select('id, zone_id, lga_id, amount, revenue_date')
      .eq('mda_id', mda.id)
      .eq('revenue_source_id', source.id)
      .gte('revenue_date', startDate)
      .lte('revenue_date', endDateStr);
  
    const existingAmounts = new Map();
    let monthTotal = 0;
  
    if (!revenuesError && Array.isArray(revenues)) {
      revenues.forEach((row) => {
        if (!row.lga_id) return;
        const key = String(row.lga_id);
        const amt = Number(row.amount) || 0;
        monthTotal += amt;
        const prev = existingAmounts.get(key) || 0;
        existingAmounts.set(key, prev + amt);
      });
    }
  
    if (monthTotalLabel) {
      monthTotalLabel.textContent =
        '₦' +
        monthTotal.toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
    }
  
    // 8. Render zones + LGAs with per-LGA Save buttons
    if (zonesContainer) {
      zonesContainer.innerHTML = '';
  
      if (Array.isArray(zones) && zones.length > 0) {
        zones.forEach((zone) => {
          const zoneCard = document.createElement('div');
          zoneCard.className = 'border border-slate-200 rounded-md bg-white';
  
          const zoneHeader = document.createElement('div');
          zoneHeader.className =
            'px-3 py-2 flex items-center justify-between bg-slate-50 border-b border-slate-200';
          const zoneTitle = document.createElement('p');
          zoneTitle.className = 'text-[11px] font-semibold text-slate-700 uppercase tracking-wide';
          zoneTitle.textContent = `Zone: ${zone.name}`;
          const zoneHint = document.createElement('p');
          zoneHint.className = 'text-[11px] text-slate-500';
          zoneHint.textContent = 'Enter and save amounts per LGA.';
          zoneHeader.appendChild(zoneTitle);
          zoneHeader.appendChild(zoneHint);
  
          const zoneBody = document.createElement('div');
          zoneBody.className = 'px-3 py-2';
  
          const lgAsForZone = lgasByZone.get(zone.id) || [];
          if (lgAsForZone.length === 0) {
            const noLga = document.createElement('p');
            noLga.className = 'text-[11px] text-slate-500 italic';
            noLga.textContent = 'No LGAs configured under this zone.';
            zoneBody.appendChild(noLga);
          } else {
            const table = document.createElement('table');
            table.className = 'min-w-full text-[11px]';
  
            const thead = document.createElement('thead');
            thead.className = 'bg-slate-50';
            const headTr = document.createElement('tr');
            [
              'LGA',
              'Currently recorded (₦)',
              'New amount (₦)',
              'Action'
            ].forEach((h, idx) => {
              const th = document.createElement('th');
              th.className =
                'border-b border-slate-200 px-2 py-1.5 ' +
                (idx === 0 ? 'text-left' : 'text-right') +
                ' font-semibold text-slate-600';
              th.textContent = h;
              headTr.appendChild(th);
            });
            thead.appendChild(headTr);
            table.appendChild(thead);
  
            const tbody = document.createElement('tbody');
  
            lgAsForZone.forEach((lga) => {
              const tr = document.createElement('tr');
              tr.className = 'border-t border-slate-200';
  
              const tdName = document.createElement('td');
              tdName.className = 'px-2 py-1.5 align-middle';
              tdName.textContent = lga.name;
  
              const tdCurrent = document.createElement('td');
              tdCurrent.className = 'px-2 py-1.5 text-right align-middle whitespace-nowrap';
              const existing = existingAmounts.get(String(lga.id)) || 0;
              tdCurrent.textContent =
                '₦' +
                existing.toLocaleString('en-NG', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                });
  
              const tdInput = document.createElement('td');
              tdInput.className = 'px-2 py-1.5 text-right align-middle whitespace-nowrap';
  
              const input = document.createElement('input');
              input.type = 'number';
              input.min = '0';
              input.step = '0.01';
              input.className =
                'w-32 rounded-md border border-slate-300 px-2 py-1 text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500';
              input.name = `lga_${lga.id}`;
  
              const tdAction = document.createElement('td');
              tdAction.className = 'px-2 py-1.5 text-right align-middle whitespace-nowrap';
  
              const btnSave = document.createElement('button');
              btnSave.type = 'button';
              btnSave.className =
                'inline-flex items-center gap-1 rounded-md bg-slate-900 text-slate-50 px-2 py-0.5 text-[11px] hover:bg-slate-800';
              btnSave.innerHTML = '<span>Save</span>';
  
              btnSave.addEventListener('click', async () => {
                const raw = input.value.trim();
                const amount = Number(raw);
  
                if (!raw || !amount || amount <= 0) {
                  if (saveStatus) {
                    saveStatus.textContent =
                      'Please enter an amount greater than zero before saving.';
                    saveStatus.className = 'mt-1 text-[11px] text-amber-700';
                  }
                  return;
                }
  
                if (saveStatus) {
                  saveStatus.textContent = `Saving ${lga.name}...`;
                  saveStatus.className = 'mt-1 text-[11px] text-slate-600';
                }
  
                // Delete any existing rows for this MDA, source, month, LGA
                const { error: deleteError } = await supabase
                  .from('revenues')
                  .delete()
                  .eq('mda_id', mda.id)
                  .eq('revenue_source_id', source.id)
                  .eq('lga_id', lga.id)
                  .gte('revenue_date', startDate)
                  .lte('revenue_date', endDateStr);
  
                if (deleteError) {
                  console.error('Error deleting existing revenues for LGA:', deleteError);
                  if (saveStatus) {
                    saveStatus.textContent =
                      'Failed to prepare existing records for this LGA. Please try again.';
                    saveStatus.className = 'mt-1 text-[11px] text-red-600';
                  }
                  return;
                }
  
                // Insert new row
                const { error: insertError } = await supabase
                  .from('revenues')
                  .insert([
                    {
                      mda_id: mda.id,
                      revenue_source_id: source.id,
                      zone_id: lga.zone_id,
                      lga_id: lga.id,
                      amount,
                      revenue_date: endDateStr,
                      created_by: user.id
                    }
                  ]);
  
                if (insertError) {
                  console.error('Error inserting revenue for LGA:', insertError);
                  if (saveStatus) {
                    saveStatus.textContent =
                      'Failed to save entry for this LGA. Please try again or contact ICT.';
                    saveStatus.className = 'mt-1 text-[11px] text-red-600';
                  }
                } else {
                  // Update UI amounts
                  existingAmounts.set(String(lga.id), amount);
                  tdCurrent.textContent =
                    '₦' +
                    amount.toLocaleString('en-NG', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    });
  
                  // Recompute month total from map
                  let newMonthTotal = 0;
                  existingAmounts.forEach((v) => {
                    newMonthTotal += v || 0;
                  });
                  if (monthTotalLabel) {
                    monthTotalLabel.textContent =
                      '₦' +
                      newMonthTotal.toLocaleString('en-NG', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      });
                  }
  
                  if (saveStatus) {
                    saveStatus.textContent = `Saved entry for ${lga.name}.`;
                    saveStatus.className = 'mt-1 text-[11px] text-emerald-700';
                  }
                }
              });
  
              tdInput.appendChild(input);
              tdAction.appendChild(btnSave);
  
              tr.appendChild(tdName);
              tr.appendChild(tdCurrent);
              tr.appendChild(tdInput);
              tr.appendChild(tdAction);
  
              tbody.appendChild(tr);
            });
  
            table.appendChild(tbody);
            zoneBody.appendChild(table);
          }
  
          zoneCard.appendChild(zoneHeader);
          zoneCard.appendChild(zoneBody);
          zonesContainer.appendChild(zoneCard);
        });
      } else {
        const noZones = document.createElement('p');
        noZones.className = 'text-[11px] text-slate-500 italic';
        noZones.textContent = 'No zones configured.';
        zonesContainer.appendChild(noZones);
      }
    }
  
    // 9. Back button -> revenue-monthly.html
    if (btnBackToMonthly) {
      btnBackToMonthly.addEventListener('click', () => {
        const url = `revenue-monthly.html?revenue_source_id=${encodeURIComponent(
          source.id
        )}&year=${encodeURIComponent(year)}`;
        window.location.href = url;
      });
    }
  })();
  