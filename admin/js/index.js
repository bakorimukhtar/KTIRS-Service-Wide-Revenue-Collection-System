// admin/js/index.js

// Elements
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const logoutBtn = document.getElementById('logoutBtn');

const yearBadge = document.getElementById('currentYearBadge');

const statLgas = document.getElementById('statLgas');
const statOfficers = document.getElementById('statOfficers');
const statStreams = document.getElementById('statStreams');
const statCodes = document.getElementById('statCodes');
const statMonthlyTarget = document.getElementById('statMonthlyTarget');
const statMonthActual = document.getElementById('statMonthActual');

const recentActivityList = document.getElementById('recentActivityList');

// Helpers
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

function setText(el, value) {
  if (!el) return;
  el.textContent = value;
}

function getMonthStartDate(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getMonthEndDateExclusive(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

// Sidebar toggle (mobile)
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
    if (isHidden) openSidebar();
    else closeSidebar();
  });
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', () => closeSidebar());
}

// Logout
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    const supabase = window.supabaseClient;
    if (!supabase) {
      window.location.href = '../index.html';
      return;
    }

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
        alert('Unable to log out right now. Please try again.');
        return;
      }
      window.location.href = '../index.html';
    } catch (e) {
      console.error('Unexpected logout error:', e);
      window.location.href = '../index.html';
    }
  });
}

// Set current year badge
if (yearBadge) yearBadge.textContent = new Date().getFullYear().toString();

// Main load
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  // 1) Session check
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session || !sessionData.session.user) {
    window.location.href = '../index.html';
    return;
  }
  const user = sessionData.session.user;

  // 2) Load profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    console.warn('Profile not found for current user', profileError);
    window.location.href = '../index.html';
    return;
  }

  // 3) Only admins
  if (profile.global_role !== 'admin') {
    window.location.href = '../index.html';
    return;
  }

  // 4) Populate topbar
  const name =
    profile.full_name && profile.full_name.trim().length > 0
      ? profile.full_name.trim()
      : user.email || 'Admin User';

  const initial = name.charAt(0).toUpperCase();

  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');
  const loggedInAsBadge = document.getElementById('loggedInAsBadge');

  setText(topbarUserName, name);
  setText(topbarUserInitial, initial);
  setText(loggedInAsBadge, `${name} (KTIRS HQ)`);

  // 5) Load stats (safe: each query handles failure)
  // Notes:
  // - counts use { count: 'exact', head: true } which returns count in the `count` property. (Supabase docs) [web:23]
  let lgasCount = null;
  let officersCount = null;
  let streamsCount = null;
  let codesCount = null;

  try {
    const { count } = await supabase
      .from('lgas')
      .select('id', { count: 'exact', head: true });
    lgasCount = typeof count === 'number' ? count : null;
  } catch (e) {
    console.warn('LGAs count failed', e);
  }

  try {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('global_role', 'officer');
    officersCount = typeof count === 'number' ? count : null;
  } catch (e) {
    console.warn('Officers count failed', e);
  }

  try {
    const { count } = await supabase
      .from('revenue_streams')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    streamsCount = typeof count === 'number' ? count : null;
  } catch (e) {
    console.warn('Streams count failed', e);
  }

  try {
    const { count } = await supabase
      .from('economic_codes')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    codesCount = typeof count === 'number' ? count : null;
  } catch (e) {
    console.warn('Codes count failed', e);
  }

  setText(statLgas, lgasCount === null ? '—' : String(lgasCount));
  setText(statOfficers, officersCount === null ? '—' : String(officersCount));
  setText(statStreams, streamsCount === null ? '—' : String(streamsCount));
  setText(statCodes, codesCount === null ? '—' : String(codesCount));

  // Monthly target: sum economic_codes.monthly_budget
  let monthlyTargetTotal = 0;
  try {
    const { data: codeBudgets, error } = await supabase
      .from('economic_codes')
      .select('monthly_budget')
      .eq('is_active', true);

    if (!error && Array.isArray(codeBudgets)) {
      codeBudgets.forEach((row) => {
        const v = Number(row.monthly_budget);
        if (!Number.isNaN(v)) monthlyTargetTotal += v;
      });
    }
  } catch (e) {
    console.warn('Monthly target sum failed', e);
  }
  setText(statMonthlyTarget, formatNaira(monthlyTargetTotal));

  // Actual this month: sum collections.amount_collected for current month
  const monthStart = getMonthStartDate(new Date());
  const monthEndExclusive = getMonthEndDateExclusive(new Date());

  let monthActualTotal = 0;
  try {
    const { data: monthRows, error } = await supabase
      .from('collections')
      .select('amount_collected, submitted_at')
      .gte('submitted_at', monthStart.toISOString())
      .lt('submitted_at', monthEndExclusive.toISOString());

    if (!error && Array.isArray(monthRows)) {
      monthRows.forEach((row) => {
        const v = Number(row.amount_collected);
        if (!Number.isNaN(v)) monthActualTotal += v;
      });
    }
  } catch (e) {
    console.warn('Month actual sum failed', e);
  }
  setText(statMonthActual, formatNaira(monthActualTotal));

  // 6) Recent submissions (last 8)
  if (recentActivityList) {
    recentActivityList.innerHTML = '';

    try {
      // Pull last submissions with LGA + economic code (nesting relies on FK relations) [web:37]
      const { data: recents, error } = await supabase
        .from('collections')
        .select('id, officer_id, month_year, amount_collected, submitted_at, lgas(name), economic_codes(code, name)')
        .order('submitted_at', { ascending: false })
        .limit(8);

      if (error) throw error;

      if (!recents || recents.length === 0) {
        const li = document.createElement('li');
        li.textContent = '— No submissions recorded yet.';
        li.className = 'text-xs text-slate-600';
        recentActivityList.appendChild(li);
        return;
      }

      // Map officer ids => names (optional, best-effort)
      const officerIds = [...new Set(recents.map(r => r.officer_id).filter(Boolean))];
      let officerNameMap = {};

      if (officerIds.length > 0) {
        const { data: officers, error: officersError } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', officerIds);

        if (!officersError && Array.isArray(officers)) {
          officers.forEach(o => {
            officerNameMap[o.user_id] = (o.full_name || '').trim() || o.user_id;
          });
        }
      }

      recents.forEach((r) => {
        const li = document.createElement('li');
        li.className = 'text-xs text-slate-600';

        const time = new Date(r.submitted_at);
        const timeLabel = isNaN(time.getTime()) ? '' : time.toLocaleString();

        const officerName = r.officer_id ? (officerNameMap[r.officer_id] || 'Officer') : 'Officer';
        const lgaName = r.lgas && r.lgas.name ? r.lgas.name : 'LGA';
        const codeName =
          r.economic_codes
            ? `${r.economic_codes.code || ''}${r.economic_codes.name ? ' – ' + r.economic_codes.name : ''}`.trim()
            : 'Code';

        li.textContent = `${officerName} submitted ${formatNaira(r.amount_collected)} for ${lgaName} (${codeName}) – ${timeLabel}`;
        recentActivityList.appendChild(li);
      });

    } catch (e) {
      console.warn('Recent activity failed', e);
      const li = document.createElement('li');
      li.textContent = '— Unable to load recent submissions.';
      li.className = 'text-xs text-slate-600';
      recentActivityList.appendChild(li);
    }
  }
})();
