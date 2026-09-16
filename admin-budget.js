(() => {
  const onReady=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v||0));
  const pretty=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

  onReady(async()=>{
    const db=window.saltStory,workspace=document.getElementById('clientWorkspace'),clientList=document.getElementById('clientList'),tabs=workspace?.querySelector('.tabs');
    if(!db||!workspace||!clientList||!tabs)return;
    const tab=document.createElement('button');tab.className='tab';tab.type='button';tab.dataset.tab='budget';tab.textContent='Budget';tabs.appendChild(tab);
    const panel=document.createElement('div');panel.className='panel';panel.id='budget';panel.innerHTML=`
      <div class="ss-budget-head"><div><h3>Project budget & spending</h3><p>Track client-facing budget lines separately from Salt & Story cost basis and internal notes.</p></div></div>
      <div class="ss-budget-project-select"><select id="ssAdminBudgetProject"></select></div>
      <div class="ss-budget-kpis" id="ssAdminBudgetKpis"></div>
      <form id="ssAdminBudgetForm"><div class="ss-budget-grid">
        <div class="ss-budget-field"><label for="ssAdminBudgetCategory">Category</label><select id="ssAdminBudgetCategory"><option value="furnishings">Furnishings</option><option value="decor">Decor</option><option value="labor">Labor</option><option value="paint_materials">Paint & materials</option><option value="appliances">Appliances</option><option value="linens">Linens</option><option value="supplies">Supplies</option><option value="technology">Technology</option><option value="fees">Fees</option><option value="other">Other</option></select></div>
        <div class="ss-budget-field"><label for="ssAdminBudgetStatusSelect">Status</label><select id="ssAdminBudgetStatusSelect"><option value="planned">Planned</option><option value="approved">Approved</option><option value="ordered">Ordered</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></div>
        <div class="ss-budget-field full"><label for="ssAdminBudgetDescription">Description</label><input id="ssAdminBudgetDescription" maxlength="240" required placeholder="Living room sofa"></div>
        <div class="ss-budget-field"><label for="ssAdminBudgetPlanned">Planned amount</label><input id="ssAdminBudgetPlanned" type="number" min="0" step="0.01" value="0"></div>
        <div class="ss-budget-field"><label for="ssAdminBudgetApproved">Approved amount</label><input id="ssAdminBudgetApproved" type="number" min="0" step="0.01" value="0"></div>
        <div class="ss-budget-field"><label for="ssAdminBudgetActual">Actual/client amount</label><input id="ssAdminBudgetActual" type="number" min="0" step="0.01" value="0"></div>
        <div class="ss-budget-field"><label for="ssAdminBudgetCost">Salt & Story cost basis</label><input id="ssAdminBudgetCost" type="number" min="0" step="0.01" value="0"></div>
        <div class="ss-budget-field"><label for="ssAdminBudgetReceipt">Receipt / file</label><select id="ssAdminBudgetReceipt"><option value="">No file attached</option></select></div>
        <div class="ss-budget-field"><label>Client visibility</label><label class="ss-budget-check"><input id="ssAdminBudgetVisible" type="checkbox" checked> Show this line to client</label></div>
        <div class="ss-budget-field full"><label for="ssAdminBudgetInternal">Internal note</label><textarea id="ssAdminBudgetInternal" maxlength="1200" placeholder="Staff-only note"></textarea></div>
        <div class="ss-budget-field full"><div class="ss-budget-actions"><button class="ss-budget-primary" id="ssAdminBudgetSave" type="submit">Add Budget Line</button><button class="ss-budget-secondary" id="ssAdminBudgetReset" type="button">Clear</button></div><div class="ss-budget-statusline" id="ssAdminBudgetStatus" aria-live="polite"></div></div>
      </div></form>
      <div class="ss-budget-divider"></div><div class="ss-budget-head"><div><h3>Budget lines</h3><p>Client-safe amounts and internal margin are shown together here for staff only.</p></div></div><div class="ss-budget-list" id="ssAdminBudgetList"></div>`;
    workspace.appendChild(panel);

    const q=id=>document.getElementById(id),projectSelect=q('ssAdminBudgetProject'),kpis=q('ssAdminBudgetKpis'),form=q('ssAdminBudgetForm'),category=q('ssAdminBudgetCategory'),statusSelect=q('ssAdminBudgetStatusSelect'),description=q('ssAdminBudgetDescription'),planned=q('ssAdminBudgetPlanned'),approved=q('ssAdminBudgetApproved'),actual=q('ssAdminBudgetActual'),cost=q('ssAdminBudgetCost'),receipt=q('ssAdminBudgetReceipt'),visible=q('ssAdminBudgetVisible'),internalNote=q('ssAdminBudgetInternal'),save=q('ssAdminBudgetSave'),reset=q('ssAdminBudgetReset'),statusLine=q('ssAdminBudgetStatus'),list=q('ssAdminBudgetList');
    let userId='',selectedClientId='',selectedProjectId='',projects=[],items=[],internalRows=[],files=[],editingId='';
    const setStatus=(t='',err=false)=>{statusLine.textContent=t;statusLine.classList.toggle('error',err)};
    const activeClientId=()=>document.querySelector('.client-btn.active[data-client]')?.dataset.client||'';
    const activeProject=arr=>arr.find(p=>!['complete','cancelled'].includes(p.status))||arr[0]||null;
    function activate(){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===tab));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p===panel));loadBudget();}
    function resetForm(){editingId='';form.reset();planned.value='0';approved.value='0';actual.value='0';cost.value='0';visible.checked=true;statusSelect.value='planned';receipt.value='';save.textContent='Add Budget Line';setStatus('');}
    function fileMap(){return Object.fromEntries(files.map(f=>[f.id,f]));}
    function internalMap(){return Object.fromEntries(internalRows.map(r=>[r.budget_item_id,r]));}
    function renderKpis(){
      const p=projects.find(x=>x.id===selectedProjectId);const budget=Number(p?.budget||0);const plannedTotal=items.filter(x=>x.status!=='cancelled').reduce((s,x)=>s+Number(x.planned_amount||0),0);const actualTotal=items.filter(x=>x.status!=='cancelled').reduce((s,x)=>s+Number(x.actual_amount||0),0);const im=internalMap();const costTotal=items.filter(x=>x.status!=='cancelled').reduce((s,x)=>s+Number(im[x.id]?.cost_basis||0),0);const margin=actualTotal-costTotal;
      kpis.innerHTML=`<div class="ss-budget-kpi"><small>Project budget</small><strong>${money(budget)}</strong></div><div class="ss-budget-kpi"><small>Planned</small><strong>${money(plannedTotal)}</strong></div><div class="ss-budget-kpi"><small>Actual/client</small><strong>${money(actualTotal)}</strong></div><div class="ss-budget-kpi internal"><small>Internal margin</small><strong>${money(margin)}</strong></div>`;
    }
    async function signedUrl(path){if(!path)return'';const {data,error}=await db.storage.from('salt-story-project-files').createSignedUrl(path,300);return error?'':data?.signedUrl||'';}
    async function renderList(){
      renderKpis();if(!selectedProjectId){list.innerHTML='<div class="ss-budget-empty">Select a client with a project.</div>';return;}if(!items.length){list.innerHTML='<div class="ss-budget-empty">No budget lines yet.</div>';return;}
      const im=internalMap(),fm=fileMap();const cards=[];
      for(const item of items){const intr=im[item.id]||{};const f=fm[item.receipt_file_id];const url=f?await signedUrl(f.storage_path):'';const margin=Number(item.actual_amount||0)-Number(intr.cost_basis||0);cards.push(`<article class="ss-budget-card"><div class="ss-budget-card-top"><div><h4>${esc(item.description)}</h4><div class="ss-budget-meta">${esc(pretty(item.category))}</div></div><span class="ss-budget-badge ${esc(item.status)}">${esc(pretty(item.status))}</span></div><div class="ss-budget-amounts"><div class="ss-budget-amount"><small>Planned</small><strong>${money(item.planned_amount)}</strong></div><div class="ss-budget-amount"><small>Approved</small><strong>${money(item.approved_amount)}</strong></div><div class="ss-budget-amount"><small>Actual</small><strong>${money(item.actual_amount)}</strong></div></div><div class="ss-budget-internal"><b>Internal:</b> Cost basis ${money(intr.cost_basis||0)} • Margin ${money(margin)}${intr.internal_notes?`<br>${esc(intr.internal_notes)}`:''}</div><span class="ss-budget-visibility">${item.client_visible?'Client visible':'Internal line only'}${f?` • Receipt: ${esc(f.file_name)}`:''}</span><div class="ss-budget-card-actions">${url?`<a class="ss-budget-receipt" href="${esc(url)}" target="_blank" rel="noopener">Open Receipt</a>`:''}<button class="ss-budget-secondary" type="button" data-edit-budget="${item.id}">Edit</button><button class="ss-budget-danger" type="button" data-delete-budget="${item.id}">Delete</button></div></article>`)}
      list.innerHTML=cards.join('');list.querySelectorAll('[data-edit-budget]').forEach(b=>b.addEventListener('click',()=>editItem(b.dataset.editBudget)));list.querySelectorAll('[data-delete-budget]').forEach(b=>b.addEventListener('click',()=>deleteItem(b.dataset.deleteBudget)));
    }
    async function loadBudget(){
      if(!selectedProjectId){items=[];internalRows=[];files=[];receipt.innerHTML='<option value="">No file attached</option>';await renderList();return;}
      const [a,b,c]=await Promise.all([
        db.from('salt_story_budget_items').select('id,project_id,category,description,planned_amount,approved_amount,actual_amount,status,client_visible,receipt_file_id,created_at,updated_at').eq('project_id',selectedProjectId).order('created_at',{ascending:true}),
        db.from('salt_story_budget_internal').select('budget_item_id,cost_basis,internal_notes,updated_at'),
        db.from('salt_story_project_files').select('id,file_name,storage_path,category,client_visible').eq('project_id',selectedProjectId).order('created_at',{ascending:false})
      ]);
      if(a.error){list.innerHTML='<div class="ss-budget-empty">Could not load budget.</div>';return;}items=a.data||[];const ids=new Set(items.map(x=>x.id));internalRows=(b.data||[]).filter(x=>ids.has(x.budget_item_id));files=c.data||[];receipt.innerHTML='<option value="">No file attached</option>'+files.map(f=>`<option value="${f.id}">${esc(f.file_name)}</option>`).join('');await renderList();
    }
    async function syncClient(){
      selectedClientId=activeClientId();resetForm();if(!selectedClientId){projects=[];selectedProjectId='';projectSelect.innerHTML='<option>Select a client first</option>';projectSelect.disabled=true;save.disabled=true;await loadBudget();return;}
      const {data,error}=await db.from('salt_story_projects').select('id,name,status,budget,updated_at').eq('client_id',selectedClientId).order('updated_at',{ascending:false});if(error||!(data||[]).length){projects=[];selectedProjectId='';projectSelect.innerHTML='<option>No project yet</option>';projectSelect.disabled=true;save.disabled=true;await loadBudget();return;}projects=data;selectedProjectId=activeProject(projects).id;projectSelect.innerHTML=projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');projectSelect.value=selectedProjectId;projectSelect.disabled=false;save.disabled=false;await loadBudget();
    }
    function editItem(id){const item=items.find(x=>x.id===id);if(!item)return;const intr=internalMap()[id]||{};editingId=id;category.value=item.category;statusSelect.value=item.status;description.value=item.description;planned.value=item.planned_amount;approved.value=item.approved_amount;actual.value=item.actual_amount;cost.value=intr.cost_basis||0;receipt.value=item.receipt_file_id||'';visible.checked=!!item.client_visible;internalNote.value=intr.internal_notes||'';save.textContent='Save Budget Line';panel.scrollIntoView({behavior:'smooth',block:'start'});}
    async function deleteItem(id){const item=items.find(x=>x.id===id);if(!item||!confirm(`Delete ${item.description}?`))return;const {error}=await db.from('salt_story_budget_items').delete().eq('id',id);if(error){setStatus(error.message||'Budget line could not be deleted.',true);return;}setStatus('Budget line deleted.');await loadBudget();}
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(!selectedProjectId)return;save.disabled=true;setStatus(editingId?'Saving budget line…':'Adding budget line…');const now=new Date().toISOString();const payload={project_id:selectedProjectId,category:category.value,description:description.value.trim(),planned_amount:Number(planned.value||0),approved_amount:Number(approved.value||0),actual_amount:Number(actual.value||0),status:statusSelect.value,client_visible:visible.checked,receipt_file_id:receipt.value||null,updated_by:userId,updated_at:now};let id=editingId,error;
      if(editingId){({error}=await db.from('salt_story_budget_items').update(payload).eq('id',editingId));}else{payload.created_by=userId;const res=await db.from('salt_story_budget_items').insert(payload).select('id').single();error=res.error;id=res.data?.id;}
      if(error||!id){save.disabled=false;setStatus(error?.message||'Budget line could not be saved.',true);return;}
      const {error:intError}=await db.from('salt_story_budget_internal').upsert({budget_item_id:id,cost_basis:Number(cost.value||0),internal_notes:internalNote.value.trim()||null,updated_by:userId,updated_at:now},{onConflict:'budget_item_id'});save.disabled=false;if(intError){setStatus(intError.message||'Internal budget details could not be saved.',true);return;}const msg=editingId?'Budget line updated.':'Budget line added.';resetForm();setStatus(msg);await loadBudget();
    });
    reset.addEventListener('click',resetForm);projectSelect.addEventListener('change',async()=>{selectedProjectId=projectSelect.value;resetForm();await loadBudget();});tab.addEventListener('click',activate);clientList.addEventListener('click',e=>{if(e.target.closest('[data-client]'))setTimeout(syncClient,80);});
    const {data:{session}}=await db.auth.getSession();if(!session?.user)return;userId=session.user.id;const {data:membership}=await db.from('salt_story_memberships').select('role,active').eq('user_id',userId).maybeSingle();if(!membership?.active||!['staff','admin'].includes(membership.role))return;await syncClient();
  });
})();