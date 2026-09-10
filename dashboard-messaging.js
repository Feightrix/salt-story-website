(() => {
  const onReady = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn();
  onReady(async () => {
    const db = window.saltStory;
    const host = document.getElementById('messages');
    if (!db || !host) return;

    host.innerHTML = `
      <span class="eyebrow">Messages</span>
      <h2>Talk directly with our team.</h2>
      <p>Your conversation stays attached to the property project so decisions and updates remain in one place.</p>
      <div class="ss-message-tools"><div class="field"><label for="ssClientMessageProject">Project</label><select id="ssClientMessageProject"></select></div></div>
      <div class="ss-message-panel">
        <div class="ss-thread" id="ssClientThread"><div class="ss-thread-empty">Loading conversation…</div></div>
        <form class="ss-composer" id="ssClientComposer">
          <textarea id="ssClientMessageBody" maxlength="5000" required placeholder="Write a message to Salt & Story…" aria-label="Message"></textarea>
          <button class="ss-send" id="ssClientSend" type="submit">Send</button>
        </form>
        <div class="ss-message-status" id="ssClientMessageStatus" aria-live="polite"></div>
      </div>`;

    const projectSelect = document.getElementById('ssClientMessageProject');
    const thread = document.getElementById('ssClientThread');
    const composer = document.getElementById('ssClientComposer');
    const body = document.getElementById('ssClientMessageBody');
    const send = document.getElementById('ssClientSend');
    const status = document.getElementById('ssClientMessageStatus');
    let userId = '';
    let projects = [];
    let selectedProjectId = '';

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    const formatTime = (value) => new Date(value).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    const activeProject = (items) => items.find((p) => !['complete','cancelled'].includes(p.status)) || items[0] || null;

    function setStatus(text = '', isError = false) {
      status.textContent = text;
      status.classList.toggle('error', isError);
    }

    function ensureUnreadBadges() {
      document.querySelectorAll('[data-view="messages"]').forEach((button) => {
        if (!button.querySelector('.ss-unread-badge')) {
          const badge = document.createElement('span');
          badge.className = 'ss-unread-badge';
          badge.setAttribute('aria-label', 'Unread messages');
          button.appendChild(badge);
        }
      });
    }

    function paintUnread(count) {
      ensureUnreadBadges();
      document.querySelectorAll('[data-view="messages"] .ss-unread-badge').forEach((badge) => {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.toggle('show', count > 0);
      });
    }

    function renderThread(rows) {
      if (!rows.length) {
        thread.innerHTML = '<div class="ss-thread-empty">No messages yet. Send the first message whenever you need something from the Salt & Story team.</div>';
        return;
      }
      thread.innerHTML = rows.map((row) => {
        const context = row.sender_context === 'team' ? 'team' : 'client';
        const label = context === 'team' ? 'Salt & Story' : 'You';
        return `<div class="ss-chat-row ${context}"><div class="ss-chat-bubble">${escapeHtml(row.body)}</div><div class="ss-chat-meta">${label} • ${escapeHtml(formatTime(row.created_at))}</div></div>`;
      }).join('');
      thread.scrollTop = thread.scrollHeight;
    }

    async function markRead(projectId) {
      if (!projectId || !userId) return;
      const { error } = await db.from('salt_story_message_thread_reads').upsert({
        project_id: projectId,
        user_id: userId,
        viewer_context: 'client',
        last_read_at: new Date().toISOString()
      }, { onConflict: 'project_id,user_id,viewer_context' });
      if (error) console.error('Could not update message read state', error);
    }

    async function refreshUnread() {
      const ids = projects.map((p) => p.id);
      if (!ids.length) { paintUnread(0); return; }
      const [messageResult, readResult] = await Promise.all([
        db.from('salt_story_messages').select('project_id,sender_context,created_at').in('project_id', ids),
        db.from('salt_story_message_thread_reads').select('project_id,last_read_at').eq('user_id', userId).eq('viewer_context', 'client').in('project_id', ids)
      ]);
      if (messageResult.error || readResult.error) return;
      const readMap = new Map((readResult.data || []).map((r) => [r.project_id, new Date(r.last_read_at).getTime()]));
      const unread = (messageResult.data || []).filter((m) => m.sender_context === 'team' && new Date(m.created_at).getTime() > (readMap.get(m.project_id) || 0)).length;
      paintUnread(unread);
    }

    async function refreshThread(markAsRead = false) {
      if (!selectedProjectId) {
        thread.innerHTML = '<div class="ss-thread-empty">A project needs to be opened before messaging begins.</div>';
        body.disabled = true;
        send.disabled = true;
        return;
      }
      const { data, error } = await db.from('salt_story_messages').select('id,project_id,sender_context,body,created_at').eq('project_id', selectedProjectId).order('created_at', { ascending: true });
      if (error) {
        setStatus('We could not load this conversation.', true);
        return;
      }
      renderThread(data || []);
      body.disabled = false;
      send.disabled = false;
      if (markAsRead) await markRead(selectedProjectId);
      await refreshUnread();
    }

    async function loadProjects() {
      const { data: { session } } = await db.auth.getSession();
      if (!session?.user) return;
      userId = session.user.id;
      const { data: client, error: clientError } = await db.from('salt_story_clients').select('id').eq('primary_user_id', userId).maybeSingle();
      if (clientError || !client) return;
      const { data, error } = await db.from('salt_story_projects').select('id,name,status,updated_at').eq('client_id', client.id).order('updated_at', { ascending: false });
      if (error) { setStatus('We could not load your project conversations.', true); return; }
      projects = data || [];
      const first = activeProject(projects);
      selectedProjectId = first?.id || '';
      projectSelect.innerHTML = projects.length ? projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('') : '<option value="">No project yet</option>';
      projectSelect.disabled = !projects.length;
      if (selectedProjectId) projectSelect.value = selectedProjectId;
      await refreshThread(false);
      await refreshUnread();
    }

    projectSelect.addEventListener('change', async () => {
      selectedProjectId = projectSelect.value;
      setStatus('');
      await refreshThread(host.classList.contains('active'));
    });

    composer.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = body.value.trim();
      if (!text || !selectedProjectId) return;
      send.disabled = true;
      setStatus('Sending…');
      const { error } = await db.from('salt_story_messages').insert({
        project_id: selectedProjectId,
        sender_user_id: userId,
        sender_context: 'client',
        body: text
      });
      if (error) {
        setStatus(error.message || 'Message could not be sent.', true);
        send.disabled = false;
        return;
      }
      body.value = '';
      setStatus('Sent.');
      await refreshThread(true);
      send.disabled = false;
      body.focus();
    });

    document.querySelectorAll('[data-view="messages"]').forEach((button) => button.addEventListener('click', () => {
      setTimeout(() => refreshThread(true), 50);
    }));

    await loadProjects();
    setInterval(async () => {
      if (document.hidden) return;
      if (host.classList.contains('active')) await refreshThread(true);
      else await refreshUnread();
    }, 10000);
  });
})();
