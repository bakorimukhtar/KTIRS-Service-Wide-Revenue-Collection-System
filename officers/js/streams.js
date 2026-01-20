// /officers/js/streams.js
const sb = window.supabaseClient;

// Fail fast if Supabase client is missing
if (!sb) {
  console.error('window.supabaseClient is missing. Ensure Supabase init script runs BEFORE streams.js');
  alert('System configuration error: Supabase client not initialized.');
  throw new Error('supabaseClient missing');
}

const el = (id) => document.getElementById(id);
const safeText = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[m]));
const uniq = (arr) => [...new Set(arr)];
const shortId = (id) => {
  const s = String(id || '');
  return s.length > 10 ? `${s.slice(0, 8)}…` : s;
};

const topbarUserName = el('topbarUserName');
const topbarBranchName = el('topbarBranchName');
const topbarUserInitial = el('topbarUserInitial');

const currentYearBadge = el('currentYearBadge');
const assignmentCountBadge = el('assignmentCountBadge');

const statLgaCount = el('statLgaCount');
const statLgaNames = el('statLgaNames');
const statStreamCount = el('statStreamCount');
const statOfficerName = el('statOfficerName');
const statOfficerId = el('statOfficerId');

const searchAssign = el('searchAssign');
const streamsTableBody = el('streamsTableBody');

const btnLogout = el('btnLogout');

// Details modal elements
const detailsModal = el('detailsModal');
const detailsBackdrop = el('detailsBackdrop');
const closeDetailsBtn = el('closeDetailsBtn');

const detailsTitle = el('detailsTitle');
const detailsSubtitle = el('detailsSubtitle');
const detailsMessage = el('detailsMessage');

const detailsTotalRecorded = el('detailsTotalRecorded');
const detailsMonthsRecorded = el('detailsMonthsRecorded');
const detailsMonthsHint = el('detailsMonthsHint');
const detailsYearProgress = el('detailsYearProgress');
const detailsYearHint = el('detailsYearHint');

const btnExportExcel = el('btnExportExcel');
const btnExportPdf = el('btnExportPdf');
const btnGoMonthlyEntry = el('btnGoMonthlyEntry');

const detailsMonthTableBody = el('detailsMonthTableBody');

let currentUser = null;
let currentProfile = null;

// Data sets
let officerAssignments = [];   // LGA-only assignments
let activeStreams = [];        // all active revenue_streams
let lgaStreamRows = [];        // cartesian rows: each (LGA, stream)
let filteredRows = [];

let currentDetails = {
  lga_id: null,
  revenue_stream_id: null,
  lga_name: '',
  stream_name: '',
  perMonth: [],
  totalAll: 0,
};

function fmtNaira(n) {
  const x = Number(n || 0);
  return `₦${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function showDetailsModal() { detailsModal?.classList.remove('hidden'); }
function hideDetailsModal() {
  detailsModal?.classList.add('hidden');
  if (detailsMessage) detailsMessage.textContent = '';
  currentDetails = { lga_id: null, revenue_stream_id: null, lga_name: '', stream_name: '', perMonth: [], totalAll: 0 };
}

detailsBackdrop?.addEventListener('click', hideDetailsModal);
closeDetailsBtn?.addEventListener('click', hideDetailsModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideDetailsModal(); });

btnLogout?.addEventListener('click', async () => {
  try { await sb.auth.signOut(); } catch (_) {}
  window.location.href = '../index.html';
});

function monthKeyFromDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function monthLabelFromKey(key) {
  const [y, m] = String(key).split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

// -------- Auth / profile --------

async function requireOfficer() {
  const { data: userData, error: userErr } = await sb.auth.getUser();
  const user = userData?.user;

  if (userErr || !user) {
    window.location.href = '../index.html';
    return null;
  }

  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('Profile error:', profileError);
    try { await sb.auth.signOut(); } catch (_) {}
    window.location.href = '../index.html';
    return null;
  }

  if (profile.global_role !== 'officer') {
    try { await sb.auth.signOut(); } catch (_) {}
    window.location.href = '../index.html';
    return null;
  }

  return { user, profile };
}

// -------- Loads --------

async function loadOfficerAssignments(officerId) {
  const { data, error } = await sb
    .from('officer_assignments')
    .select(`
      id,
      officer_id,
      lga_id,
      is_active,
      created_at,
      lgas(name)
    `)
    .eq('officer_id', officerId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Assignments error:', error);
    return [];
  }
  return data || [];
}

async function loadActiveStreams() {
  const { data, error } = await sb
    .from('revenue_streams')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Streams load error:', error);
    return [];
  }
  return data || [];
}

// Build rows: every assigned LGA × every active stream (for viewing/filtering)
function buildLgaStreamRows(assignments, streams) {
  const rows = [];
  for (const a of assignments) {
    for (const s of streams) {
      rows.push({
        lga_id: a.lga_id,
        lga_name: a.lgas?.name || '—',
        revenue_stream_id: s.id,
        stream_name: s.name || '—',
      });
    }
  }
  return rows;
}

// -------- Header + stats --------

function renderHeaderAndStats(assignments, streams) {
  const officerName = (currentProfile?.full_name || '').trim() || (currentUser?.email || 'Officer');

  if (topbarUserName) topbarUserName.textContent = officerName;
  if (topbarUserInitial) topbarUserInitial.textContent = officerName.charAt(0).toUpperCase();
  if (statOfficerName) statOfficerName.textContent = officerName;
  if (statOfficerId) statOfficerId.textContent = currentUser?.id ? shortId(currentUser.id) : '—';

  const lgaNames = uniq(assignments.map(a => a.lgas?.name).filter(Boolean));

  if (topbarBranchName) topbarBranchName.textContent = lgaNames.length ? lgaNames.join(', ') : 'Unassigned';

  if (statLgaCount) statLgaCount.textContent = String(lgaNames.length);
  if (statLgaNames) statLgaNames.textContent = lgaNames.length ? lgaNames.join(', ') : '—';

  const streamsCount = streams.length;
  if (statStreamCount) statStreamCount.textContent = String(streamsCount);

  if (assignmentCountBadge) assignmentCountBadge.textContent = String(assignments.length);
  if (currentYearBadge) currentYearBadge.textContent = String(new Date().getFullYear());
}

// -------- Table render / search --------

function renderAssignments(rows) {
  if (!streamsTableBody) return;

  if (!rows.length) {
    streamsTableBody.innerHTML = `
      <tr class="text-slate-500">
        <td colspan="4" class="px-3 py-4 text-center">No active assignments or streams.</td>
      </tr>
    `;
    return;
  }

  streamsTableBody.innerHTML = rows.map(r => `
    <tr>
      <td class="px-3 py-2">${safeText(r.lga_name)}</td>
      <td class="px-3 py-2">${safeText(r.stream_name)}</td>
      <td class="px-3 py-2">
        <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-medium">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Active
        </span>
      </td>
      <td class="px-3 py-2 text-right">
        <button
          class="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] hover:bg-slate-50"
          data-details="1"
          data-lga="${safeText(r.lga_id)}"
          data-stream="${safeText(r.revenue_stream_id)}">
          <i data-lucide="info" class="w-3.5 h-3.5"></i>
          <span>Details</span>
        </button>

        <button
          class="ml-2 inline-flex items-center gap-1 rounded-md bg-slate-900 text-white px-2.5 py-1.5 text-[11px] hover:bg-slate-800"
          data-entry="1"
          data-lga="${safeText(r.lga_id)}"
          data-stream="${safeText(r.revenue_stream_id)}">
          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          <span>Monthly entry</span>
        </button>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function applySearch() {
  const q = (searchAssign?.value || '').trim().toLowerCase();
  if (!q) {
    filteredRows = lgaStreamRows.slice();
  } else {
    filteredRows = lgaStreamRows.filter(r => {
      const lgaName = String(r.lga_name || '').toLowerCase();
      const streamName = String(r.stream_name || '').toLowerCase();
      return lgaName.includes(q) || streamName.includes(q);
    });
  }
  renderAssignments(filteredRows);
}

searchAssign?.addEventListener('input', applySearch);

// Delegated clicks
streamsTableBody?.addEventListener('click', async (e) => {
  const detailsBtn = e.target.closest?.('[data-details="1"]');
  const entryBtn = e.target.closest?.('[data-entry="1"]');

  if (entryBtn) {
    const lga = entryBtn.getAttribute('data-lga');
    const stream = entryBtn.getAttribute('data-stream');
    window.location.href = `monthly-entry.html?lga=${encodeURIComponent(lga)}&stream=${encodeURIComponent(stream)}`;
    return;
  }

  if (detailsBtn) {
    const lgaId = detailsBtn.getAttribute('data-lga');
    const streamId = detailsBtn.getAttribute('data-stream');
    await openDetails(lgaId, streamId);
  }
});

// -------- Details (collections per LGA + stream) --------

async function openDetails(lgaId, streamId) {
  const row = lgaStreamRows.find(r => r.lga_id === lgaId && r.revenue_stream_id === streamId);
  const lgaName = row?.lga_name || '—';
  const streamName = row?.stream_name || '—';

  currentDetails.lga_id = lgaId;
  currentDetails.revenue_stream_id = streamId;
  currentDetails.lga_name = lgaName;
  currentDetails.stream_name = streamName;

  if (detailsTitle) detailsTitle.textContent = `Stream details – ${streamName}`;
  if (detailsSubtitle) detailsSubtitle.textContent = `LGA/Branch: ${lgaName}`;
  if (detailsMessage) detailsMessage.textContent = 'Loading totals...';

  showDetailsModal();
  if (window.lucide) lucide.createIcons();

  // collections has economic_code_id; join economic_codes to filter by revenue_stream_id
  const { data, error } = await sb
    .from('collections')
    .select(`
      id,
      month_year,
      amount_collected,
      economic_codes!inner(revenue_stream_id)
    `)
    .eq('officer_id', currentUser.id)
    .eq('lga_id', lgaId)
    .eq('economic_codes.revenue_stream_id', streamId)
    .order('month_year', { ascending: false });

  if (error) {
    console.error('Details query error:', error);
    if (detailsMessage) detailsMessage.textContent = error.message || 'Unable to load totals.';
    return;
  }

  const rows = data || [];
  let totalAll = 0;
  const byMonth = new Map();

  for (const r of rows) {
    const key = monthKeyFromDate(r.month_year);
    const amt = Number(r.amount_collected || 0);
    totalAll += amt;

    if (!byMonth.has(key)) byMonth.set(key, { total: 0, rows: 0 });
    const obj = byMonth.get(key);
    obj.total += amt;
    obj.rows += 1;
  }

  const perMonth = [...byMonth.entries()]
    .map(([monthKey, v]) => ({
      monthKey,
      label: monthLabelFromKey(monthKey),
      total: v.total,
      rows: v.rows
    }))
    .sort((a, b) => String(b.monthKey).localeCompare(String(a.monthKey)));

  currentDetails.perMonth = perMonth;
  currentDetails.totalAll = totalAll;

  const monthsRecorded = perMonth.length;
  const thisYear = new Date().getFullYear();
  const monthsThisYear = perMonth.filter(x => String(x.monthKey).startsWith(`${thisYear}-`)).length;

  if (detailsTotalRecorded) detailsTotalRecorded.textContent = fmtNaira(totalAll);
  if (detailsMonthsRecorded) detailsMonthsRecorded.textContent = String(monthsRecorded);
  if (detailsMonthsHint) detailsMonthsHint.textContent =
    monthsRecorded >= 12 ? '12+ months recorded.' : 'Progress across all time.';
  if (detailsYearProgress) detailsYearProgress.textContent = `${monthsThisYear}/12`;
  if (detailsYearHint) detailsYearHint.textContent =
    monthsThisYear >= 12 ? 'All months recorded this year.' : 'Months recorded this year.';
  if (detailsMessage) detailsMessage.textContent = '';

  if (detailsMonthTableBody) {
    if (!perMonth.length) {
      detailsMonthTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td colspan="3" class="px-3 py-4 text-center">No records found yet.</td>
        </tr>
      `;
    } else {
      detailsMonthTableBody.innerHTML = perMonth.map(x => `
        <tr>
          <td class="px-3 py-2">${safeText(x.label)}</td>
          <td class="px-3 py-2 text-right font-medium text-slate-900">${safeText(fmtNaira(x.total))}</td>
          <td class="px-3 py-2 text-right text-slate-600">${safeText(x.rows)}</td>
        </tr>
      `).join('');
    }
  }
}

// Monthly entry from details
btnGoMonthlyEntry?.addEventListener('click', () => {
  if (!currentDetails.lga_id || !currentDetails.revenue_stream_id) return;
  window.location.href = `monthly-entry.html?lga=${encodeURIComponent(currentDetails.lga_id)}&stream=${encodeURIComponent(currentDetails.revenue_stream_id)}`;
});

// (Export buttons still to be implemented)
btnExportExcel?.addEventListener('click', () => {
  alert('Excel export will be implemented here.');
});
btnExportPdf?.addEventListener('click', () => {
  alert('PDF export will be implemented here.');
});

// -------- Init --------
(async () => {
  const auth = await requireOfficer();
  if (!auth) return;

  currentUser = auth.user;
  currentProfile = auth.profile;

  const [assignments, streams] = await Promise.all([
    loadOfficerAssignments(currentUser.id),
    loadActiveStreams()
  ]);

  officerAssignments = assignments;
  activeStreams = streams;

  lgaStreamRows = buildLgaStreamRows(officerAssignments, activeStreams);
  filteredRows = lgaStreamRows.slice();

  renderHeaderAndStats(officerAssignments, activeStreams);
  renderAssignments(filteredRows);

  if (window.lucide) lucide.createIcons();
})();
