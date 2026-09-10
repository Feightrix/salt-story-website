(() => {
  const onReady = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn();
  onReady(async () => {
    const db = window.saltStory;
    const workspace = document.getElementById('clientWorkspace');
    const clientList = document.getElementById('clientList');
    const tabs = workspace?.querySelector('.tabs');
    if (!db || !workspace || !clientList || !tabs) return;

    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.type = 'button';
    tab.dataset.tab = 'project-messages';
    tab.innerHTML = 'Messages <span class="ss-unread-badge" id="ssAdminTabUnread"></span>';
    tabs.appendChild(tab);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'project-messages';
    panel.innerHTML = `
      <div class="ss-admin-message-panel">
        <h3>Project messages</h3>
        <p>Reply to the client inside the project record. The client sees the same conversation in their dashboard.</p>
        <div class="ss-message-tools"><div class="field"><label for="ssAdminMessageProject">Project</label><select id="ssAdminMessageProject"></select></div></div>
        <div class="ss-message-panel">
          <div class="ss-thread" id="ssAdminThread"><div class="ss-thread-empty">Select a client and project to open the conversation.</div></div>
          <form class="ss-composer" id="ssAdminComposer">
            <textarea id="ssAdminMessageBody" maxlength="5000" required placeholder="Write a message to the client…" aria-label="Message"></textarea>
            <button class="ss-send" id="ssAdminSend" type="submit">Send</button>
          </form>
          <div class="ss-message-status" id="ssAdminMessageStatus" aria-live="polite"></div>
        </div>
      </div>`;
    workspace.appendChild(panel);

    const stats = document.querySelector('.stats');
    if (stats) {
      stats.classList.add('ss-has-message-stat');
      const stat = document.createElement('div');
      stat.className = 'stat';
      stat.innerHTML = '<small>Unread messages</small><strong id="ssAdminUnreadCount">0</strong>';
      stats.appendChild(stat);
    }

    const projectSelect = document.getElementById('ssAdminMessageProject');
    const thread = document.getElementById('ssAdminThread');
    const composer = document.getElementById('ssAdminComposer');
    const body = document.getElementById('ssAdminMessageBody');
    const send = document.getElementById('ssAdminSend');
    const status = document.getElementById('ssAdminMessageStatus');
    const tabUnread = document.getElementById('ssAdminTabUnread');
    const statUnread = document.getElementById('ssAdminUnreadCount');
    let userId = '';
    let selectedClientId = '';
    let projects = [];
    let selectedProjectId = '';

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    const formatTime = (value) => new Date(value).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    const activeProject = (items) => items.find((p) => !['complete','cancelled'].includes(p.status)) || items[0] || null;

    function setStatus(text = '', isError = false) {
      status.textContent = text;
      status.classList.toggle('error', isError);
    }

    function activateMessagesTab() {
      document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button === tab));
      document.querySelectorAll('.panel').forEach((item) => item.classList.toggle('active', item === panel));
      refreshThread(true);
    }

    function paintUnread(count) {
      if (statUnread) statUnread.textContent = String(count);
      if (tabUnread) {
        tabUnread.textContent = count > 99 ? '99+' : String(count);
        tabUnread.classList.toggle('show', count > 0);
      }
    }

    function renderThread(rows) {
      if (!rows.length) {
        thread.innerHTML = '<div class="ss-thread-empty">No messages yet. Start the project conversation here.</div>';
        return;
      }
      thread.innerHTML = rows.map((row) => {
        const context = row.sender_context === 'client' ? 'client' : 'team';
        const label = context === 'client' ? 'Client' : 'Salt & Story';
        return `<div class="ss-chat-row ${context}"><div class="ss-chat-bubble">${escapeHtml(row.body)}</div><div class="ss-chat-meta">${label} • ${escapeHtml(formatTime(row.created_at))}</div></div>`;
      }).join('');
      thread.scrollTop = thread.scrollHeight;
    }

    async function markRead(projectId) {
      if (!projectId || !userId) return;
      const { error } = await db.from('salt_story_message_thread_reads').upsert({
        project_id: projectId,
        user_id: userId,
        viewer_context: 'team',
        last_read_at: new Date().toISOString()
      }, { onConflict: 'project_id,user_id,viewer_context' });
      if (error) console.error('Could not update admin message read state', error);
    }

    async function refreshUnread() {
      if (!userId) return;
      const { data: allProjects, error: projectError } = await db.from('salt_story_projects').select('id');
      if (projectError) return;
      const ids = (allProjects || []).map((p) => p.id);
      if (!ids.length) { paintUnread(0); return; }
      const [messageResult, readResult] = await Promise.all([
        db.from('salt_story_messages').select('project_id,sender_context,created_at').in('project_id', ids),
        db.from('salt_story_message_thread_reads').select('project_id,last_read_at').eq('user_id', userId).eq('viewer_context', 'team').in('project_id', ids)
      ]);
      if (messageResult.error || readResult.error) return;
      const readMap = new Map((readResult.data || []).map((r) => [r.project_id, new Date(r.last_read_at).getTime()]));
      const unread = (messageResult.data || []).filter((m) => m.sender_context === 'client' && new Date(m.created_at).getTime() > (readMap.get(m.project_id) || 0)).length;
      paintUnread(unread);
    }

    async function refreshThread(markAsRead = false) {
      if (!selectedProjectId) {
        thread.innerHTML = '<div class="ss-thread-empty">Select a client with an open project to start messaging.</div>';
        body.disabled = true;
        send.disabled = true;
        await refreshUnread();
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

    function activeClientId() {
      return document.querySelector('.client-btn.active[data-client]')?.dataset.client || '';
    }

    async function syncClient(markAsRead = false) {
      selectedClientId = activeClientId();
      if (!selectedClientId) {
        projects = [];
        selectedProjectId = '';
        projectSelect.innerHTML = '<option value="">Select a client first</option>';
        projectSelect.disabled = true;
        await refreshThread(false);
        return;
      }
      const previous = selectedProjectId;
      const { data, error } = await db.from('salt_story_projects').select('id,name,status,updated_at').eq('client_id', selectedClientId).order('updated_at', { ascending: false });
      if (error) { setStatus('We could not load this client’s projects.', true); return; }
      projects = data || [];
      const preferred = projects.find((p) => p.id === previous) || activeProject(projects);
      selectedProjectId = preferred?.id || '';
      projectSelect.innerHTML = projects.length ? projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('') : '<option value="">No project yet</option>';
      projectSelect.disabled = !projects.length;
      if (selectedProjectId) projectSelect.value = selectedProjectId;
      await refreshThread(markAsRead && panel.classList.contains('active'));
    }

    tab.addEventListener('click', activateMessagesTab);
    clientList.addEventListener('click', (event) => {
      if (!event.target.closest('[data-client]')) return;
      setTimeout(() => syncClient(panel.classList.contains('active')), 80);
    });

    projectSelect.addEventListener('change', async () => {
      selectedProjectId = projectSelect.value;
      setStatus('');
      await refreshThread(panel.classList.contains('active'));
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
        sender_context: 'team',
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

    const { data: { session } } = await db.auth.getSession();
    if (!session?.user) return;
    userId = session.user.id;
    const { data: membership } = await db.from('salt_story_memberships').select('role,active').eq('user_id', userId).maybeSingle();
    if (!membership?.active || !['staff','admin'].includes(membership.role)) return;

    await refreshUnread();
    await syncClient(false);
    setInterval(async () => {
      if (document.hidden) return;
      if (panel.classList.contains('active')) await refreshThread(true);
      else await refreshUnread();
    }, 10000);
  });
})();
