(() => {
  const onReady = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once:true }) : fn();
  onReady(async () => {
    const db = window.saltStory;
    const workspace = document.getElementById('clientWorkspace');
    const clientList = document.getElementById('clientList');
    const tabs = workspace?.querySelector('.tabs');
    if (!db || !workspace || !clientList || !tabs) return;

    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.type = 'button';
    tab.dataset.tab = 'project-approvals';
    tab.innerHTML = 'Approvals <span class="ss-approval-badge" id="ssAdminApprovalBadge"></span>';
    tabs.appendChild(tab);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'project-approvals';
    panel.innerHTML = `
      <div class="ss-admin-approval-form">
        <h3>Client approvals</h3>
        <p class="note" style="margin-top:6px">Send a selection or decision to the client. Once the client responds, that decision is retained as part of the project record.</p>
        <div class="field" style="margin-top:14px"><label for="ssAdminApprovalProject">Project</label><select id="ssAdminApprovalProject"></select></div>
        <form id="ssAdminApprovalForm"><div class="form-grid">
          <div class="field full"><label for="ssApprovalTitle">Approval title</label><input id="ssApprovalTitle" required maxlength="180" placeholder="Living Room Sofa Selection"></div>
          <div class="field full"><label for="ssApprovalDetails">Details</label><textarea id="ssApprovalDetails" maxlength="5000" placeholder="Describe the item, scope, option, or decision the client is approving."></textarea></div>
          <div class="field"><label for="ssApprovalAmount">Amount</label><input id="ssApprovalAmount" type="number" min="0" step="0.01" placeholder="Optional"></div>
          <div class="field"><label for="ssApprovalDue">Decision needed by</label><input id="ssApprovalDue" type="date"></div>
          <div class="field full"><button class="btn" id="ssApprovalSubmit" type="submit">Send for Approval</button></div>
        </div><div class="message" id="ssApprovalMessage"></div></form>
      </div>
      <div class="subsection"><h3>Approval history</h3><p>Pending requests and permanent client decisions for the selected project.</p><div id="ssAdminApprovalList"></div></div>`;
    workspace.appendChild(panel);

    const projectSelect = document.getElementById('ssAdminApprovalProject');
    const form = document.getElementById('ssAdminApprovalForm');
    const title = document.getElementById('ssApprovalTitle');
    const details = document.getElementById('ssApprovalDetails');
    const amount = document.getElementById('ssApprovalAmount');
    const due = document.getElementById('ssApprovalDue');
    const submit = document.getElementById('ssApprovalSubmit');
    const message = document.getElementById('ssApprovalMessage');
    const list = document.getElementById('ssAdminApprovalList');
    const badge = document.getElementById('ssAdminApprovalBadge');
    let userId = '';
    let selectedClientId = '';
    let selectedProjectId = '';
    let projects = [];
    let requests = [];
    let decisions = [];

    const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const pretty = (v) => String(v || '').replaceAll('_',' ').replace(/\b\w/g,c => c.toUpperCase());
    const money = (v) => v == null ? '' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v));
    const dateOnly = (v) => !v ? '' : new Date(v + 'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    const stamp = (v) => !v ? '' : new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
    const activeProject = (items) => items.find(p => !['complete','cancelled'].includes(p.status)) || items[0] || null;

    function setMessage(text='', type='') { message.textContent=text; message.className = text ? `message show ${type || 'ok'}` : 'message'; }
    function activeClientId(){ return document.querySelector('.client-btn.active[data-client]')?.dataset.client || ''; }
    function activateTab(){
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active',b === tab));
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active',p === panel));
      loadApprovals();
    }
    function paintPending(n){
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.classList.toggle('show', n > 0);
    }

    function render(){
      const decisionMap = new Map(decisions.map(d => [d.approval_id,d]));
      const pending = requests.filter(r => r.status === 'open' && !decisionMap.has(r.id)).length;
      paintPending(pending);
      if (!selectedProjectId) {
        list.innerHTML = '<div class="empty">Select a client with a project to manage approvals.</div>';
        return;
      }
      if (!requests.length) {
        list.innerHTML = '<div class="empty">No approval requests have been sent for this project yet.</div>';
        return;
      }
      list.innerHTML = requests.map(r => {
        const d = decisionMap.get(r.id);
        const state = d?.decision || (r.status === 'cancelled' ? 'cancelled' : 'pending');
        const meta = [r.amount != null ? money(r.amount) : '', r.due_date ? `Due ${dateOnly(r.due_date)}` : '', `Sent ${stamp(r.created_at)}`].filter(Boolean).join(' • ');
        const decision = d ? `<div class="ss-admin-decision"><span class="ss-approval-status ${escapeHtml(d.decision)}">${escapeHtml(pretty(d.decision))}</span>${d.comment ? `<p>${escapeHtml(d.comment)}</p>` : ''}<div class="ss-admin-approval-meta">Recorded ${escapeHtml(stamp(d.created_at))}</div></div>` : '';
        const cancel = !d && r.status === 'open' ? `<button class="ss-cancel-approval" type="button" data-cancel-approval="${r.id}">Cancel Request</button>` : '';
        return `<div class="ss-admin-approval-item"><div class="record-head"><div><b>${escapeHtml(r.title)}</b><div class="ss-admin-approval-meta">${escapeHtml(meta)}</div></div>${cancel}</div>${r.details ? `<p>${escapeHtml(r.details)}</p>` : ''}<div class="ss-admin-approval-status">${!d ? `<span class="ss-approval-status ${state === 'cancelled' ? 'cancelled' : ''}">${escapeHtml(pretty(state))}</span>` : ''}</div>${decision}</div>`;
      }).join('');
      document.querySelectorAll('[data-cancel-approval]').forEach(btn => btn.addEventListener('click', () => cancelRequest(btn.dataset.cancelApproval)));
    }

    async function loadApprovals(){
      if (!selectedProjectId) { requests=[];decisions=[];render();return; }
      const rr = await db.from('salt_story_approval_requests').select('id,project_id,title,details,amount,due_date,status,created_at').eq('project_id',selectedProjectId).order('created_at',{ascending:false});
      if (rr.error) { list.innerHTML='<div class="empty">Could not load approvals.</div>'; return; }
      requests=rr.data||[];
      const ids=requests.map(r=>r.id);
      if(!ids.length){decisions=[];render();return;}
      const dr=await db.from('salt_story_approval_decisions').select('id,approval_id,decision,comment,created_at').in('approval_id',ids);
      if(dr.error){list.innerHTML='<div class="empty">Could not load approval decisions.</div>';return;}
      decisions=dr.data||[];render();
    }

    async function syncClient(){
      selectedClientId=activeClientId();
      setMessage('');
      if(!selectedClientId){projects=[];selectedProjectId='';projectSelect.innerHTML='<option value="">Select a client first</option>';projectSelect.disabled=true;submit.disabled=true;await loadApprovals();return;}
      const {data,error}=await db.from('salt_story_projects').select('id,name,status,updated_at').eq('client_id',selectedClientId).order('updated_at',{ascending:false});
      if(error){projectSelect.innerHTML='<option value="">Could not load projects</option>';submit.disabled=true;return;}
      projects=data||[];
      const preferred=projects.find(p=>p.id===selectedProjectId)||activeProject(projects);
      selectedProjectId=preferred?.id||'';
      projectSelect.innerHTML=projects.length?projects.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join(''):'<option value="">No project yet</option>';
      projectSelect.disabled=!projects.length;submit.disabled=!projects.length;
      if(selectedProjectId)projectSelect.value=selectedProjectId;
      await loadApprovals();
    }

    async function cancelRequest(id){
      if(!window.confirm('Cancel this pending approval request?'))return;
      const {error}=await db.from('salt_story_approval_requests').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',id);
      if(error){setMessage(error.message||'Request could not be cancelled.','bad');return;}
      setMessage('Approval request cancelled.','ok');await loadApprovals();
    }

    form.addEventListener('submit',async e=>{
      e.preventDefault();if(!selectedProjectId)return;
      setMessage('');submit.disabled=true;
      const value=amount.value.trim();
      const payload={project_id:selectedProjectId,title:title.value.trim(),details:details.value.trim()||null,amount:value?Number(value):null,due_date:due.value||null,status:'open',created_by:userId};
      const {error}=await db.from('salt_story_approval_requests').insert(payload);
      if(error){setMessage(error.message||'Approval request could not be sent.','bad');submit.disabled=false;return;}
      form.reset();setMessage('Approval request sent to the client.','ok');submit.disabled=false;await loadApprovals();
    });
    projectSelect.addEventListener('change',async()=>{selectedProjectId=projectSelect.value;setMessage('');await loadApprovals();});
    tab.addEventListener('click',activateTab);
    clientList.addEventListener('click',e=>{if(!e.target.closest('[data-client]'))return;setTimeout(syncClient,80);});

    const {data:{session}}=await db.auth.getSession();if(!session?.user)return;userId=session.user.id;
    const {data:membership}=await db.from('salt_story_memberships').select('role,active').eq('user_id',userId).maybeSingle();
    if(!membership?.active||!['staff','admin'].includes(membership.role))return;
    await syncClient();
    setInterval(()=>{if(!document.hidden&&panel.classList.contains('active'))loadApprovals();},15000);
  });
})();