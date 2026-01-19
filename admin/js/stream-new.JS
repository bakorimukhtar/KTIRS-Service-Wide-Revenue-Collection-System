const topbarUserName = document.getElementById('topbarUserName');
const topbarUserInitial = document.getElementById('topbarUserInitial');

const pageTitle = document.getElementById('pageTitle');
const pageModeBadge = document.getElementById('pageModeBadge');

const streamForm = document.getElementById('streamForm');
const streamIdInput = document.getElementById('streamId');

const streamNameInput = document.getElementById('streamName');
const streamStatusSelect = document.getElementById('streamStatus');

const economicCodeInput = document.getElementById('economicCode');

const streamSubmitBtn = document.getElementById('streamSubmitBtn');
const streamSubmitLabel = document.getElementById('streamSubmitLabel');
const streamResetBtn = document.getElementById('streamResetBtn');
const streamFormMessage = document.getElementById('streamFormMessage');

let isEditMode = false;

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

async function requireAdminSession() {
  const supabase = window.supabaseClient;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) {
    window.location.href = '../index.html';
    return null;
  }

  const user = sessionData.session.user;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.global_role !== 'admin') {
    window.location.href = '../index.html';
    return null;
  }

  const name = (profile.full_name || '').trim() || user.email || 'Admin User';
  const initial = name.charAt(0).toUpperCase();
  if (topbarUserName) topbarUserName.textContent = name;
  if (topbarUserInitial) topbarUserInitial.textContent = initial;

  return { user, profile };
}

(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) {
    if (streamFormMessage) {
      streamFormMessage.textContent =
        'System configuration error. Please contact ICT.';
    }
    return;
  }

  const session = await requireAdminSession();
  if (!session) return;

  const streamIdParam = getQueryParam('id');
  if (streamIdParam) {
    isEditMode = true;

    if (pageTitle) pageTitle.textContent = 'Edit revenue stream';
    if (pageModeBadge) {
      pageModeBadge.textContent = 'Edit Stream';
      pageModeBadge.classList.remove('bg-slate-900');
      pageModeBadge.classList.add('bg-amber-600');
    }
    if (streamSubmitLabel) streamSubmitLabel.textContent = 'Update Stream';

    // Load stream
    const { data: stream, error: streamError } = await supabase
      .from('revenue_streams')
      .select('id, name, is_active')
      .eq('id', streamIdParam)
      .single();

    if (streamError || !stream) {
      streamFormMessage.textContent =
        'Unable to load selected stream. Return to streams and try again.';
      return;
    }

    streamIdInput.value = stream.id;
    streamNameInput.value = stream.name || '';
    streamStatusSelect.value = stream.is_active ? 'active' : 'inactive';

    // Load latest code under the stream (best effort)
    const { data: codeRow } = await supabase
      .from('economic_codes')
      .select('id, code, name')
      .eq('revenue_stream_id', stream.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeRow) {
      economicCodeInput.value = codeRow.code || '';
      // name comes from DB but we don't show it in the UI
    }
  } else {
    streamStatusSelect.value = 'active';
  }
})();

if (streamForm) {
  streamForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const supabase = window.supabaseClient;
    if (!supabase) return;

    const session = await requireAdminSession();
    if (!session) return;

    streamFormMessage.textContent = '';
    streamSubmitBtn.disabled = true;
    streamSubmitLabel.textContent = isEditMode ? 'Updating...' : 'Saving...';

    const streamName = (streamNameInput.value || '').trim();
    const isActive = (streamStatusSelect.value || 'active') === 'active';

    const ecoCode = (economicCodeInput.value || '').trim();
    // use stream name as economic code name
    const ecoName = streamName;

    if (!streamName) {
      streamFormMessage.textContent = 'Please enter a stream name.';
      streamSubmitBtn.disabled = false;
      streamSubmitLabel.textContent = isEditMode ? 'Update Stream' : 'Save Stream';
      return;
    }
    if (!ecoCode) {
      streamFormMessage.textContent = 'Please enter an economic code.';
      streamSubmitBtn.disabled = false;
      streamSubmitLabel.textContent = isEditMode ? 'Update Stream' : 'Save Stream';
      return;
    }

    try {
      let streamId = streamIdInput.value;

      // 1) Save stream
      if (isEditMode && streamId) {
        const { error: updErr } = await supabase
          .from('revenue_streams')
          .update({ name: streamName, is_active: isActive })
          .eq('id', streamId);

        if (updErr) {
          console.error(updErr);
          streamFormMessage.textContent =
            'Unable to update stream. Ensure stream name is unique.';
          streamSubmitBtn.disabled = false;
          streamSubmitLabel.textContent = 'Update Stream';
          return;
        }
      } else {
        const { data: insertedStream, error: insErr } = await supabase
          .from('revenue_streams')
          .insert({ name: streamName, is_active: isActive })
          .select('id')
          .single();

        if (insErr || !insertedStream) {
          console.error(insErr);
          streamFormMessage.textContent =
            'Unable to create stream. Ensure the name is unique and try again.';
          streamSubmitBtn.disabled = false;
          streamSubmitLabel.textContent = 'Save Stream';
          return;
        }

        streamId = insertedStream.id;
      }

      // 2) Save economic code (update if exists else insert)
      const { data: existing } = await supabase
        .from('economic_codes')
        .select('id')
        .eq('revenue_stream_id', streamId)
        .eq('code', ecoCode)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error: codeUpdErr } = await supabase
          .from('economic_codes')
          .update({ name: ecoName, is_active: true })
          .eq('id', existing.id);

        if (codeUpdErr) {
          console.error(codeUpdErr);
          streamFormMessage.textContent =
            'Stream saved, but economic code update failed (check duplicates/permissions).';
          streamSubmitBtn.disabled = false;
          streamSubmitLabel.textContent = isEditMode ? 'Update Stream' : 'Save Stream';
          return;
        }
      } else {
        const { error: codeInsErr } = await supabase
          .from('economic_codes')
          .insert({
            revenue_stream_id: streamId,
            code: ecoCode,
            name: ecoName,
            is_active: true,
          });

        if (codeInsErr) {
          console.error(codeInsErr);
          streamFormMessage.textContent =
            'Stream saved, but economic code insert failed (maybe duplicate code).';
          streamSubmitBtn.disabled = false;
          streamSubmitLabel.textContent = isEditMode ? 'Update Stream' : 'Save Stream';
          return;
        }
      }

      window.location.href = 'streams.html';
    } catch (err) {
      console.error(err);
      streamFormMessage.textContent =
        'Unexpected error while saving. Please try again.';
      streamSubmitBtn.disabled = false;
      streamSubmitLabel.textContent = isEditMode ? 'Update Stream' : 'Save Stream';
    }
  });
}

if (streamResetBtn) {
  streamResetBtn.addEventListener('click', () => {
    streamFormMessage.textContent = '';
    if (isEditMode) {
      window.location.reload();
    } else {
      streamIdInput.value = '';
      streamNameInput.value = '';
      streamStatusSelect.value = 'active';
      economicCodeInput.value = '';
    }
  });
}
