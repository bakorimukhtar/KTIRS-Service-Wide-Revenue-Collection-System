const sb = window.supabaseClient;
if (!sb) {
  alert('System configuration error: Supabase not initialized.');
  throw new Error('supabaseClient missing');
}

const el = (id) => document.getElementById(id);
const safeText = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[m]));

const fmtNaira = (n) => {
  const x = Number(n || 0);
  return `₦${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const topbarUserName = el('topbarUserName');
const topbarBranchName = el('topbarBranchName');
const topbarUserInitial = el('topbarUserInitial');

const btnBack = el('btnBack');

const pageTitle = el('pageTitle');
const pageSubtitle = el('pageSubtitle');

const badgeYear = el('badgeYear');
const badgeMonth = el('badgeMonth');

const cardLga = el('cardLga');
const cardStream = el('cardStream');
const cardYearTotal = el('cardYearTotal');
const cardMonthTotal = el('cardMonthTotal');
const cardYearBudgetHint = el('cardYearBudgetHint');
const cardMonthTargetHint = el('cardMonthTargetHint');
const streamInfoNote = el('streamInfoNote');

const yearSelect = el('yearSelect');
const monthsTableBody = el('monthsTableBody');

// Modal
const entryModal = el('entryModal');
const entryBackdrop = el('entryBackdrop');
const btnCloseModal = el('btnCloseModal');
const btnCancel = el('btnCancel');
const entryForm = el('entryForm');

const modalTitle = el('modalTitle');
const modalSubtitle = el('modalSubtitle');
const modalError = el('modalError');

const inputMonth = el('inputMonth');
const inputAmount = el('inputAmount');
const amountInWords = el('amountInWords');

const codeBlock = el('codeBlock');
const selectEconomicCode = el('selectEconomicCode');
const codeHint = el('codeHint');

const btnSave = el('btnSave');

let currentUser = null;
let currentProfile = null;

let lgaId = null;
let streamId = null;

let lgaName = '—';
let streamName = '—';

let economicCodes = []; // {id, code, name}
let selectedYear = new Date().getFullYear();

let yearBudget = null;  // revenue_stream_budgets row (optional)
let yearCollections = []; // collections rows for selected year

let monthAgg = {}; // key YYYY-MM => { total, rows }
let modalState = { monthKey: null, monthDate: null, existingRowId: null };

function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function monthKeyFromDate(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function firstOfMonthDate(year, month1to12) {
  const m = String(month1to12).padStart(2, '0');
  return `${year}-${m}-01`;
}

function monthLabel(year, month1to12) {
  const d = new Date(year, month1to12 - 1, 1);
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function currentMonthKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function uniq(arr) { return [...new Set(arr)]; }

function showModal() {
  entryModal?.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}
function hideModal() {
  entryModal?.classList.add('hidden');
  if (modalError) modalError.classList.add('hidden');
  if (modalError) modalError.textContent = '';
  modalState = { monthKey: null, monthDate: null, existingRowId: null };
  if (inputAmount) inputAmount.value = '';
  if (amountInWords) amountInWords.textContent = '—';
}

entryBackdrop?.addEventListener('click', hideModal);
btnCloseModal?.addEventListener('click', hideModal);
btnCancel?.addEventListener('click', hideModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideModal(); });

btnBack?.addEventListener('click', () => {
  window.location.href = 'streams.html';
});

function cleanAmountToNumber(str) {
  const s = String(str || '').replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!s) return 0;
  // keep only first dot
  const parts = s.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').slice(0, 2);
  const num = Number(frac ? `${whole}.${frac}` : whole);
  return Number.isFinite(num) ? num : 0;
}

function formatWithCommas(str) {
  const raw = String(str || '').replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!raw) return '';
  const parts = raw.split('.');
  const whole = parts[0] || '';
  const frac = (parts[1] || '').slice(0, 2);
  const wholeNum = Number(whole || 0);
  const wholeFmt = whole ? wholeNum.toLocaleString(undefined) : '';
  return frac.length ? `${wholeFmt}.${frac}` : wholeFmt;
}

/* Simple number-to-words (international) for Naira/Kobo */
function numberToWordsCurrency(amount) {
  const n = Math.round(Number(amount || 0) * 100); // convert to kobo
  if (!Number.isFinite(n)) return '—';

  const naira = Math.floor(n / 100);
  const kobo = n % 100;

  const words = (x) => {
    const ones = ['', 'one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
    const tens = ['', '', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

    const chunk = (num) => {
      let out = '';
      if (num >= 100) {
        out += `${ones[Math.floor(num / 100)]} hundred`;
        num %= 100;
        if (num) out += ' ';
      }
      if (num >= 20) {
        out += tens[Math.floor(num / 10)];
        num %= 10;
        if (num) out += ` ${ones[num]}`;
      } else if (num > 0) {
        out += ones[num];
      }
      return out;
    };

    if (x === 0) return 'zero';

    const units = [
      { v: 1_000_000_000, n: 'billion' },
      { v: 1_000_000, n: 'million' },
      { v: 1_000, n: 'thousand' },
      { v: 1, n: '' }
    ];

    let res = '';
    for (const u of units) {
      if (x >= u.v) {
        const q = Math.floor(x / u.v);
        x = x % u.v;
        if (q) {
          res += (res ? ' ' : '') + chunk(q) + (u.n ? ` ${u.n}` : '');
        }
      }
    }
    return res;
  };

  const nairaWords = `${words(naira)} naira`;
  const koboWords = kobo ? `${words(kobo)} kobo` : '';

  return (koboWords ? `${nairaWords} and ${koboWords} only` : `${nairaWords} only`).replace(/\s+/g, ' ').trim();
}

inputAmount?.addEventListener('input', () => {
  const formatted = formatWithCommas(inputAmount.value);
  inputAmount.value = formatted;

  const val = cleanAmountToNumber(formatted);
  amountInWords.textContent = val > 0 ? numberToWordsCurrency(val) : '—';
});

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

  if (profileError || !profile || profile.global_role !== 'officer') {
    try { await sb.auth.signOut(); } catch (_) {}
    window.location.href = '../index.html';
    return null;
  }

  return { user, profile };
}

async function loadContextNames() {
  // verify officer is assigned (optional but recommended)
  const { data: assign, error: assignErr } = await sb
    .from('officer_assignments')
    .select('id, lga_id, revenue_stream_id, is_active, lgas(name), revenue_streams(name)')
    .eq('officer_id', currentUser.id)
    .eq('lga_id', lgaId)
    .eq('revenue_stream_id', streamId)
    .eq('is_active', true)
    .maybeSingle();

  if (assignErr || !assign) {
    pageSubtitle.textContent = 'No active assignment for this LGA/stream. Contact admin.';
    throw new Error('No assignment found or RLS blocked.');
  }

  lgaName = assign.lgas?.name || '—';
  streamName = assign.revenue_streams?.name || '—';
}

async function loadEconomicCodes() {
  const { data, error } = await sb
    .from('economic_codes')
    .select('id, code, name')
    .eq('revenue_stream_id', streamId)
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (error) {
    console.error('economic_codes error:', error);
    economicCodes = [];
    return;
  }
  economicCodes = data || [];
}

async function loadStreamBudgetForYear(year) {
  const { data, error } = await sb
    .from('revenue_stream_budgets')
    .select('id, year, annual_budget, monthly_target')
    .eq('revenue_stream_id', streamId)
    .eq('year', year)
    .maybeSingle();

  if (error) {
    console.warn('budget load error:', error);
    yearBudget = null;
    return;
  }
  yearBudget = data || null;
}

async function loadCollectionsForYear(year) {
  // Join economic_codes and filter by streamId (because collections stores economic_code_id)
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const { data, error } = await sb
    .from('collections')
    .select(`
      id,
      month_year,
      amount_collected,
      economic_code_id,
      economic_codes!inner(revenue_stream_id)
    `)
    .eq('officer_id', currentUser.id)
    .eq('lga_id', lgaId)
    .eq('economic_codes.revenue_stream_id', streamId)
    .gte('month_year', from)
    .lte('month_year', to);

  if (error) {
    console.error('collections load error:', error);
    yearCollections = [];
    return;
  }
  yearCollections = data || [];
}

function aggregateYearCollections() {
  monthAgg = {};
  let totalYear = 0;

  for (const r of yearCollections) {
    const key = monthKeyFromDate(r.month_year);
    const amt = Number(r.amount_collected || 0);
    totalYear += amt;

    if (!monthAgg[key]) monthAgg[key] = { total: 0, rows: 0 };
    monthAgg[key].total += amt;
    monthAgg[key].rows += 1;
  }

  // header cards
  cardYearTotal.textContent = fmtNaira(totalYear);

  const cmKey = currentMonthKey();
  const cm = monthAgg[cmKey];
  cardMonthTotal.textContent = fmtNaira(cm?.total || 0);

  if (yearBudget?.annual_budget != null) {
    cardYearBudgetHint.textContent = `Budget: ${fmtNaira(yearBudget.annual_budget)}`;
  } else {
    cardYearBudgetHint.textContent = 'Budget: —';
  }

  if (yearBudget?.monthly_target != null) {
    cardMonthTargetHint.textContent = `Monthly target: ${fmtNaira(yearBudget.monthly_target)}`;
  } else {
    cardMonthTargetHint.textContent = 'Monthly target: —';
  }
}

function renderHeader() {
  const officerName = (currentProfile?.full_name || '').trim() || (currentUser?.email || 'Officer');
  topbarUserName.textContent = officerName;
  topbarUserInitial.textContent = officerName.charAt(0).toUpperCase();
  topbarBranchName.textContent = lgaName;

  pageTitle.textContent = 'Monthly entry';
  pageSubtitle.textContent = `${lgaName} • ${streamName}`;

  cardLga.textContent = lgaName;
  cardStream.textContent = streamName;

  const year = selectedYear;
  badgeYear.textContent = String(year);
  badgeMonth.textContent = new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' });

  // Inform about economic codes (saving strategy)
  if (economicCodes.length === 0) {
    streamInfoNote.textContent = 'No active economic codes found under this stream. Admin should add economic codes.';
  } else if (economicCodes.length === 1) {
    streamInfoNote.textContent = `Saving will be recorded under economic code: ${economicCodes[0].code} – ${economicCodes[0].name}.`;
  } else {
    streamInfoNote.textContent = `This stream has ${economicCodes.length} economic codes. Choose one in the modal when saving. Totals shown are summed across all codes.`;
  }
}

function renderYearSelect() {
  const y = new Date().getFullYear();
  const years = [y - 1, y, y + 1]; // keep simple
  yearSelect.innerHTML = years.map(v => `<option value="${v}">${v}</option>`).join('');
  yearSelect.value = String(selectedYear);

  yearSelect.addEventListener('change', async () => {
    selectedYear = Number(yearSelect.value);
    await refreshYear();
  });
}

function renderMonthsTable() {
  const year = selectedYear;

  const rows = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const agg = monthAgg[key];
    const total = agg?.total || 0;
    const rcount = agg?.rows || 0;

    const hasData = rcount > 0;
    const btnLabel = hasData ? 'Edit' : 'Record';

    rows.push(`
      <tr>
        <td class="px-3 py-2">${safeText(monthLabel(year, m))}</td>
        <td class="px-3 py-2 text-right font-medium text-slate-900">${safeText(fmtNaira(total))}</td>
        <td class="px-3 py-2 text-right text-slate-600">${safeText(rcount)}</td>
        <td class="px-3 py-2 text-right">
          <button
            class="inline-flex items-center gap-1 rounded-md ${hasData ? 'border border-slate-200 bg-white hover:bg-slate-50' : 'bg-slate-900 text-white hover:bg-slate-800'} px-2.5 py-1.5 text-[11px]"
            data-open-month="1"
            data-month="${key}">
            <i data-lucide="${hasData ? 'pencil' : 'plus'}" class="w-3.5 h-3.5"></i>
            <span>${btnLabel}</span>
          </button>
        </td>
      </tr>
    `);
  }

  monthsTableBody.innerHTML = rows.join('');
  if (window.lucide) lucide.createIcons();
}

monthsTableBody?.addEventListener('click', (e) => {
  const btn = e.target.closest?.('[data-open-month="1"]');
  if (!btn) return;
  const key = btn.getAttribute('data-month');
  openMonthModal(key);
});

function openMonthModal(monthKey) {
  modalState.monthKey = monthKey;
  modalState.monthDate = `${monthKey}-01`;

  // default modal state
  if (modalError) { modalError.classList.add('hidden'); modalError.textContent = ''; }
  inputMonth.value = monthLabel(Number(monthKey.split('-')[0]), Number(monthKey.split('-')[1]));
  inputAmount.value = '';
  amountInWords.textContent = '—';

  modalTitle.textContent = (monthAgg[monthKey]?.rows > 0) ? 'Edit amount' : 'Record amount';
  modalSubtitle.textContent = `${lgaName} • ${streamName}`;

  // code selector
  if (economicCodes.length <= 1) {
    codeBlock.classList.add('hidden');
  } else {
    codeBlock.classList.remove('hidden');
    selectEconomicCode.innerHTML = economicCodes
      .map(c => `<option value="${c.id}">${safeText(c.code)} - ${safeText(c.name)}</option>`)
      .join('');
    codeHint.textContent = 'Select the economic code you are recording for.';
  }

  showModal();
}

async function saveAmount() {
  const amount = cleanAmountToNumber(inputAmount.value);

  if (!amount || amount <= 0) {
    modalError.textContent = 'Enter a valid amount greater than ₦0.00';
    modalError.classList.remove('hidden');
    return;
  }

  if (!economicCodes.length) {
    modalError.textContent = 'No economic code found for this stream. Contact admin.';
    modalError.classList.remove('hidden');
    return;
  }

  // Choose economic code to save against:
  const economicCodeId =
    (economicCodes.length === 1)
      ? economicCodes[0].id
      : (selectEconomicCode.value || economicCodes[0].id);

  btnSave.disabled = true;
  btnSave.classList.add('opacity-60', 'cursor-not-allowed');

  try {
    // Find if a row exists for that exact month + code (so we can edit cleanly)
    const { data: existing, error: findErr } = await sb
      .from('collections')
      .select('id')
      .eq('officer_id', currentUser.id)
      .eq('lga_id', lgaId)
      .eq('economic_code_id', economicCodeId)
      .eq('month_year', modalState.monthDate)
      .maybeSingle();

    if (findErr) throw findErr;

    if (existing?.id) {
      const { error: updErr } = await sb
        .from('collections')
        .update({ amount_collected: amount, submitted_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await sb
        .from('collections')
        .insert([{
          officer_id: currentUser.id,
          lga_id: lgaId,
          economic_code_id: economicCodeId,
          month_year: modalState.monthDate,
          amount_collected: amount
        }]);

      if (insErr) throw insErr;
    }

    hideModal();
    await refreshYear(); // reload and re-aggregate
  } catch (e) {
    console.error(e);
    modalError.textContent = e?.message || 'Unable to save. Check RLS policies.';
    modalError.classList.remove('hidden');
  } finally {
    btnSave.disabled = false;
    btnSave.classList.remove('opacity-60', 'cursor-not-allowed');
  }
}

entryForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveAmount();
});

async function refreshYear() {
  badgeYear.textContent = String(selectedYear);
  monthsTableBody.innerHTML = `
    <tr class="text-slate-500">
      <td colspan="4" class="px-3 py-4 text-center">Loading months...</td>
    </tr>
  `;

  await loadStreamBudgetForYear(selectedYear);
  await loadCollectionsForYear(selectedYear);
  aggregateYearCollections();
  renderHeader();
  renderMonthsTable();
}

(async () => {
  // Get required params
  lgaId = getParam('lga');
  streamId = getParam('stream');
  if (!lgaId || !streamId) {
    alert('Missing URL parameters. Go back to Streams and open Monthly entry again.');
    window.location.href = 'streams.html';
    return;
  }

  // Auth
  const auth = await requireOfficer();
  if (!auth) return;
  currentUser = auth.user;
  currentProfile = auth.profile;

  // Year dropdown
  selectedYear = new Date().getFullYear();
  renderYearSelect();

  // Load page context
  await loadContextNames();
  await loadEconomicCodes();
  await refreshYear();

  if (window.lucide) lucide.createIcons();
})();
