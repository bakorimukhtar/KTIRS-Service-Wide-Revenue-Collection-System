// IMPORTANT: do NOT use `const supabase = ...` because window.supabase already exists from CDN.
const sb = window.supabaseClient;

const el = (id) => document.getElementById(id);

const topbarUserName = el('topbarUserName');
const topbarBranchName = el('topbarBranchName');
const topbarUserInitial = el('topbarUserInitial');

const currentMonthBadge = el('currentMonthBadge');
const assignedLgaBadge = el('assignedLgaBadge');

const statOfficerName = el('statOfficerName');
const statOfficerId = el('statOfficerId');
const statAssignedLgas = el('statAssignedLgas');
const statAvailableStreams = el('statAvailableStreams');

const assignmentsTableBody = el('assignmentsTableBody');

const btnLogout = el('btnLogout');
const btnRecordCurrentMonth = el('btnRecordCurrentMonth');
const btnMonthLabel = el('btnMonthLabel');

function safeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}
function uniq(arr) { return [...new Set(arr)]; }

function getMonthLabel(d = new Date()) {
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}
function shortId(id) {
  const s = String(id || '');
  return s.length > 10 ? `${s.slice(0, 8)}…` : s;
}

async function signOutAndGoHome() {
  try { await sb?.auth.signOut(); } catch (_) {}
  window.location.href = '../index.html';
}

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
    await signOutAndGoHome();
    return null;
  }

  if (profile.global_role !== 'officer') {
    await signOutAndGoHome();
    return null;
  }

  return { user, profile };
}

async function loadActiveAssignments(officerId) {
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
    console.error('Assignments load error:', error);
    return [];
  }
  return data || [];
}

async function loadAvailableStreams() {
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

function renderAssignments(assignments) {
  if (!assignmentsTableBody) return;

  if (!assignments.length) {
    assignmentsTableBody.innerHTML = `
      <tr class="text-slate-500">
        <td colspan="2" class="px-3 py-4 text-center">
          No active assignments. Contact KTIRS admin for assignment.
        </td>
      </tr>
    `;
    return;
  }

  assignmentsTableBody.innerHTML = assignments.map(a => {
    const lgaName = a.lgas?.name || '—';

    return `
      <tr>
        <td class="px-3 py-2">${safeText(lgaName)}</td>
        <td class="px-3 py-2">
          <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-medium">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Active
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

function renderBadgesAndStats(profile, user, assignments, streams) {
  const officerName = (profile?.full_name || '').trim() || (user?.email || 'Officer');
  const officerInitial = officerName.charAt(0).toUpperCase();

  const lgaNames = uniq(assignments.map(a => a.lgas?.name).filter(Boolean));
  const lgaLabel = lgaNames.length ? lgaNames.join(', ') : 'Unassigned';

  const activeStreamsCount = streams.length;
  const streamsLabel = activeStreamsCount ? String(activeStreamsCount) : '0';

  if (topbarUserName) topbarUserName.textContent = officerName;
  if (topbarUserInitial) topbarUserInitial.textContent = officerInitial;
  if (topbarBranchName) topbarBranchName.textContent = lgaLabel;

  if (statOfficerName) statOfficerName.textContent = officerName;
  if (statOfficerId) statOfficerId.textContent = user?.id ? shortId(user.id) : '—';

  if (assignedLgaBadge) assignedLgaBadge.textContent = lgaLabel;

  if (statAssignedLgas) statAssignedLgas.textContent = lgaNames.length ? String(lgaNames.length) : '0';
  if (statAvailableStreams) statAvailableStreams.textContent = streamsLabel;

  if (btnRecordCurrentMonth) {
    const canRecord = assignments.length > 0;
    btnRecordCurrentMonth.disabled = !canRecord;
    btnRecordCurrentMonth.classList.toggle('opacity-50', !canRecord);
    btnRecordCurrentMonth.classList.toggle('cursor-not-allowed', !canRecord);
  }
}

btnLogout?.addEventListener('click', signOutAndGoHome);

btnRecordCurrentMonth?.addEventListener('click', () => {
  alert('Monthly collections entry page will be added here.');
});

// Init
(async () => {
  const monthLabel = getMonthLabel();
  if (currentMonthBadge) currentMonthBadge.textContent = monthLabel;
  if (btnMonthLabel) btnMonthLabel.textContent = monthLabel;

  const auth = await requireOfficer();
  if (!auth) return;

  const [assignments, streams] = await Promise.all([
    loadActiveAssignments(auth.user.id),
    loadAvailableStreams()
  ]);

  renderBadgesAndStats(auth.profile, auth.user, assignments, streams);
  renderAssignments(assignments);

  if (window.lucide) lucide.createIcons();
})();
