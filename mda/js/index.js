// mda/js/index.js

(async () => {
    const supabase = window.supabaseClient;
    if (!supabase) return;
  
    const topbarUserName = document.getElementById('topbarUserName');
    const topbarUserInitial = document.getElementById('topbarUserInitial');
    const topbarMdaName = document.getElementById('topbarMdaName');
  
    const statMdaName = document.getElementById('statMdaName');
    const statMdaCode = document.getElementById('statMdaCode');
    const statApprovedBudget = document.getElementById('statApprovedBudget');
  
    const currentMonthBadge = document.getElementById('currentMonthBadge');
    const assignedMdaBadge = document.getElementById('assignedMdaBadge');
    const statCurrentMonthLabel = document.getElementById('statCurrentMonthLabel');
    const btnMonthLabel = document.getElementById('btnMonthLabel');
    const btnRecordCurrentMonth = document.getElementById('btnRecordCurrentMonth');
    const btnLogout = document.getElementById('btnLogout');
  
    // 1. Session check
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session || !sessionData.session.user) {
      window.location.href = '../index.html';
      return;
    }
  
    const user = sessionData.session.user;
  
    // 2. Profile check (must be mda_user)
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
  
    // 3. Find primary MDA from user_scopes
    const { data: scopes, error: scopesError } = await supabase
      .from('user_scopes')
      .select('mda_id')
      .eq('user_id', user.id)
      .order('id', { ascending: true });
  
    if (scopesError || !scopes || scopes.length === 0 || !scopes[0].mda_id) {
      if (statMdaName) statMdaName.textContent = 'No MDA assigned';
      if (statMdaCode) {
        statMdaCode.textContent =
          'Your account does not have an MDA assigned. Contact KTIRS administration.';
      }
      if (assignedMdaBadge) assignedMdaBadge.textContent = 'No MDA';
      if (topbarMdaName) topbarMdaName.textContent = 'No MDA';
      if (btnRecordCurrentMonth) btnRecordCurrentMonth.disabled = true;
      return;
    }
  
    const primaryMdaId = scopes[0].mda_id;
  
    // 4. Load MDA details
    const { data: mda, error: mdaError } = await supabase
      .from('mdas')
      .select('id, name, code')
      .eq('id', primaryMdaId)
      .single();
  
    if (mdaError || !mda) {
      if (statMdaName) statMdaName.textContent = 'Assigned MDA not found';
      if (statMdaCode) {
        statMdaCode.textContent =
          'Your scope references an MDA that could not be loaded. Please contact KTIRS administration.';
      }
      if (assignedMdaBadge) assignedMdaBadge.textContent = 'MDA not found';
      if (topbarMdaName) topbarMdaName.textContent = 'MDA not found';
      if (btnRecordCurrentMonth) btnRecordCurrentMonth.disabled = true;
      return;
    }
  
    if (topbarMdaName) topbarMdaName.textContent = mda.name;
    if (statMdaName) statMdaName.textContent = mda.name;
    if (assignedMdaBadge) assignedMdaBadge.textContent = mda.name;
  
    if (statMdaCode) {
      statMdaCode.textContent = mda.code ? `Code: ${mda.code}` : 'No code recorded.';
    }
  
    // 5. Current month labels
    const now = new Date();
    const monthNames = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];
    const monthName = monthNames[now.getMonth()];
    const year = now.getFullYear();
    const monthLabel = `${monthName} ${year}`;
    const monthParam = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
    if (currentMonthBadge) currentMonthBadge.textContent = monthLabel;
    if (statCurrentMonthLabel) statCurrentMonthLabel.textContent = monthLabel;
    if (btnMonthLabel) btnMonthLabel.textContent = monthLabel;
  
    // 6. Sum approved_budget across revenue sources for this MDA
    // Table: revenue_sources
    // Columns: mda_id (FK to mdas.id), approved_budget (numeric)
    const { data: revenueRows, error: revenueError } = await supabase
      .from('revenue_sources')
      .select('approved_budget')
      .eq('mda_id', mda.id);
  
    if (revenueError) {
      console.error('Error loading revenue sources:', revenueError);
      if (statApprovedBudget) statApprovedBudget.textContent = '₦0.00';
    } else {
      let total = 0;
      if (Array.isArray(revenueRows)) {
        total = revenueRows.reduce((sum, row) => {
          const val = Number(row.approved_budget) || 0;
          return sum + val;
        }, 0);
      }
      if (statApprovedBudget) {
        statApprovedBudget.textContent =
          '₦' + total.toLocaleString('en-NG', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
      }
    }
  
    // 7. Quick action: go to monthly entry page
    if (btnRecordCurrentMonth) {
      btnRecordCurrentMonth.addEventListener('click', () => {
        const url = `monthly-entry.html?mda_id=${encodeURIComponent(mda.id)}&month=${encodeURIComponent(monthParam)}`;
        window.location.href = url;
      });
    }
  
    // 8. Logout
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = '../index.html';
      });
    }
  })();
  