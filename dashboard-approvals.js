(() => {
  const onReady = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once:true }) : fn();
  onReady(async () => {
    const db = window.saltStory;
    const projectView = document.getElementById('project');
    const projectPanel = document.getElementById('projectPagePanel');
    if (!db || !projectView || !projectPanel) return;

    const wrap = document.createElement('div');
    wrap.className = 'panel ss-approval-wrap';
    wrap.id = 'ssClientApprovals';
    wrap.innerHTML = '<div class="ss-approval-head"><h3>Approvals</h3><span class="ss-approval-count" id="ssClientApprovalCount">0 pending</span></div><div class="ss-approval-list" id="ssClientApprovalList"><div class="ss-approval-empty">Loading approvals…</div></div>';
    projectPanel.insertAdjacentElement('afterend', wrap);

    const list = document.getElementById('ssClientApprovalList');
    const count = document.getElementById('ssClientApprovalCount');
    let userId = '';
    let project = null;
    let requests = [];
    let decisions = [];

    const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const pretty = (v) => String(v || '').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase());
    const money = (v) => v == null ? '' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v));
    const dateOnly = (v) => !v ? '' : new Date(v + 'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    const stamp = (v) => !v ? '' : new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});

    function ensureBadges(){
      document.querySelectorAll('[data-view="project"]').forEach(button => {
        if (!button.querySelector('.ss-approval-badge')) {
          const badge = document.createElement('span');
          badge.className = 'ss-approval-badge';
          badge.setAttribute('aria-label','Pending approvals');
          button.appendChild(badge);
        }
      });
    }
    function paintPending(n){
      ensureBadges();
      count.textContent = `${n} pending`;
      document.querySelectorAll('[data-view="project"] .ss-approval-badge').forEach(badge => {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.classList.toggle('show', n > 0);
      });
    }

    function render(){
      const decisionMap = new Map(decisions.map(d => [d.approval_id,d]));
      const pending = requests.filter(r => r.status === 'open' && !decisionMap.has(r.id)).length;
      paintPending(pending);
      if (!project) {
        list.innerHTML = '<div class="ss-approval-empty">Approvals will appear here once a project is open.</div>';
        return;
      }
      if (!requests.length) {
        list.innerHTML = '<div class="ss-approval-empty">No approvals have been requested for this project yet.</div>';
        return;
      }
      list.innerHTML = requests.map(r => {
        const d = decisionMap.get(r.id);
        const finalStatus = d?.decision || (r.status === 'cancelled' ? 'cancelled' : 'pending');
        const meta = [r.amount != null ? money(r.amount) : '', r.due_date ? `Due ${dateOnly(r.due_date)}` : ''].filter(Boolean).join(' • ');
        let actionHtml = '';
        if (!d && r.status === 'open') {
          actionHtml = `<div class="ss-approval-actions" data-approval-actions="${r.id}"><textarea maxlength="2000" placeholder="Optional for approval; required if requesting changes" aria-label="Approval comment"></textarea><button class="ss-approve-btn" type="button" data-approve="${r.id}">Approve</button><button class="ss-change-btn" type="button" data-change="${r.id}">Request Changes</button></div><div class="ss-approval-note" data-approval-note="${r.id}"></div>`;
        } else if (d) {
          actionHtml = `<div class="ss-approval-decision"><span class="ss-approval-status ${escapeHtml(d.decision)}">${escapeHtml(pretty(d.decision))}</span>${d.comment ? `<p>${escapeHtml(d.comment)}</p>` : ''}<time>Recorded ${escapeHtml(stamp(d.created_at))}</time></div>`;
        } else {
          actionHtml = '<div class="ss-approval-decision"><span class="ss-approval-status cancelled">Cancelled</span></div>';
        }
        return `<article class="ss-approval-card ${finalStatus === 'pending' ? 'pending' : ''}"><h4>${escapeHtml(r.title)}</h4>${meta ? `<div class="ss-approval-meta">${escapeHtml(meta)}</div>` : ''}${r.details ? `<p class="ss-approval-detail">${escapeHtml(r.details)}</p>` : ''}${!d && r.status === 'open' ? '<span class="ss-approval-status">Pending decision</span>' : ''}${actionHtml}</article>`;
      }).join('');

      document.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', () => decide(btn.dataset.approve,'approved')));
      document.querySelectorAll('[data-change]').forEach(btn => btn.addEventListener('click', () => decide(btn.dataset.change,'changes_requested')));
    }

    async function decide(approvalId, decision){
      const action = document.querySelector(`[data-approval-actions="${approvalId}"]`);
      const note = document.querySelector(`[data-approval-note="${approvalId}"]`);
      const comment = action?.querySelector('textarea')?.value.trim() || '';
      if (decision === 'changes_requested' && !comment) {
        note.textContent = 'Please tell us what you would like changed.';
        note.classList.add('error');
        action?.querySelector('textarea')?.focus();
        return;
      }
      const label = decision === 'approved' ? 'approve this request' : 'request these changes';
      if (!window.confirm(`Are you sure you want to ${label}? Your decision will be recorded.`)) return;
      action?.querySelectorAll('button').forEach(b => b.disabled = true);
      if (note) { note.textContent = 'Saving decision…'; note.classList.remove('error'); }
      const { error } = await db.from('salt_story_approval_decisions').insert({approval_id:approvalId,decided_by:userId,decision,comment:comment || null});
      if (error) {
        if (note) { note.textContent = error.code === '23505' ? 'A decision has already been recorded for this approval.' : (error.message || 'Decision could not be saved.'); note.classList.add('error'); }
        action?.querySelectorAll('button').forEach(b => b.disabled = false);
        return;
      }
      await loadApprovals();
    }

    async function loadApprovals(){
      if (!project) { requests=[]; decisions=[]; render(); return; }
      const requestResult = await db.from('salt_story_approval_requests').select('id,project_id,title,details,amount,due_date,status,created_at').eq('project_id',project.id).order('created_at',{ascending:false});
      if (requestResult.error) { list.innerHTML = '<div class="ss-approval-empty">We could not load approvals right now.</div>'; return; }
      requests = requestResult.data || [];
      const ids = requests.map(r => r.id);
      if (!ids.length) { decisions=[]; render(); return; }
      const decisionResult = await db.from('salt_story_approval_decisions').select('id,approval_id,decision,comment,created_at').in('approval_id',ids);
      if (decisionResult.error) { list.innerHTML = '<div class="ss-approval-empty">We could not load approval decisions right now.</div>'; return; }
      decisions = decisionResult.data || [];
      render();
    }

    async function init(){
      const { data:{session} } = await db.auth.getSession();
      if (!session?.user) return;
      userId = session.user.id;
      const { data:client } = await db.from('salt_story_clients').select('id').eq('primary_user_id',userId).maybeSingle();
      if (!client) { render(); return; }
      const { data:projects } = await db.from('salt_story_projects').select('id,name,status,updated_at').eq('client_id',client.id).order('updated_at',{ascending:false});
      const all = projects || [];
      project = all.find(p => !['complete','cancelled'].includes(p.status)) || all[0] || null;
      await loadApprovals();
    }

    await init();
    setInterval(() => { if (!document.hidden) loadApprovals(); }, 15000);
  });
})();