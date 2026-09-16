(() => {
  const onReady=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v||0));
  const pretty=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

  onReady(async()=>{
    const db=window.saltStory,projectView=document.getElementById('project'),existing=document.getElementById('projectPagePanel');
    if(!db||!projectView||!existing)return;
    const wrap=document.createElement('div');wrap.className='panel ss-budget-panel';wrap.id='ssClientBudget';wrap.innerHTML=`<div class="ss-budget-head"><div><h3>Budget & spending</h3><p>See the current financial picture for your project.</p></div></div><div class="ss-budget-project-select"><select id="ssClientBudgetProject" aria-label="Project"></select></div><div class="ss-budget-kpis" id="ssClientBudgetKpis"></div><div class="ss-budget-progress"><span id="ssClientBudgetProgress"></span></div><div class="ss-budget-list" id="ssClientBudgetList"></div>`;
    existing.insertAdjacentElement('afterend',wrap);
    const projectSelect=document.getElementById('ssClientBudgetProject'),kpis=document.getElementById('ssClientBudgetKpis'),progress=document.getElementById('ssClientBudgetProgress'),list=document.getElementById('ssClientBudgetList');
    let projects=[],selectedProjectId='',items=[],files=[];
    async function signedUrl(path){if(!path)return'';const {data,error}=await db.storage.from('salt-story-project-files').createSignedUrl(path,300);return error?'':data?.signedUrl||'';}
    function fileMap(){return Object.fromEntries(files.map(f=>[f.id,f]));}
    async function render(){
      const p=projects.find(x=>x.id===selectedProjectId);const budget=Number(p?.budget||0);const planned=items.filter(x=>x.status!=='cancelled').reduce((s,x)=>s+Number(x.planned_amount||0),0);const approved=items.filter(x=>x.status!=='cancelled').reduce((s,x)=>s+Number(x.approved_amount||0),0);const actual=items.filter(x=>x.status!=='cancelled').reduce((s,x)=>s+Number(x.actual_amount||0),0);const remaining=Math.max(0,budget-actual);const pct=budget>0?Math.min(100,Math.round(actual/budget*100)):0;
      kpis.innerHTML=`<div class="ss-budget-kpi"><small>Project budget</small><strong>${money(budget)}</strong></div><div class="ss-budget-kpi"><small>Approved</small><strong>${money(approved)}</strong></div><div class="ss-budget-kpi"><small>Spent</small><strong>${money(actual)}</strong></div><div class="ss-budget-kpi"><small>Remaining</small><strong>${money(remaining)}</strong></div>`;progress.style.width=`${pct}%`;
      if(!items.length){list.innerHTML='<div class="ss-budget-empty">No client-visible budget lines have been added yet.</div>';return;}
      const fm=fileMap(),cards=[];
      for(const item of items){const f=fm[item.receipt_file_id];const url=f?await signedUrl(f.storage_path):'';cards.push(`<article class="ss-budget-card"><div class="ss-budget-card-top"><div><h4>${esc(item.description)}</h4><div class="ss-budget-meta">${esc(pretty(item.category))}</div></div><span class="ss-budget-badge ${esc(item.status)}">${esc(pretty(item.status))}</span></div><div class="ss-budget-amounts"><div class="ss-budget-amount"><small>Planned</small><strong>${money(item.planned_amount)}</strong></div><div class="ss-budget-amount"><small>Approved</small><strong>${money(item.approved_amount)}</strong></div><div class="ss-budget-amount"><small>Actual</small><strong>${money(item.actual_amount)}</strong></div></div>${url?`<div class="ss-budget-card-actions"><a class="ss-budget-receipt" href="${esc(url)}" target="_blank" rel="noopener">Open Receipt</a></div>`:''}</article>`)}
      list.innerHTML=cards.join('');
    }
    async function loadBudget(){
      if(!selectedProjectId){items=[];files=[];await render();return;}
      const {data,error}=await db.from('salt_story_budget_items').select('id,project_id,category,description,planned_amount,approved_amount,actual_amount,status,receipt_file_id,created_at,updated_at').eq('project_id',selectedProjectId).order('created_at',{ascending:true});if(error){list.innerHTML='<div class="ss-budget-empty">Could not load budget details.</div>';return;}items=data||[];
      const ids=[...new Set(items.map(x=>x.receipt_file_id).filter(Boolean))];files=[];if(ids.length){const res=await db.from('salt_story_project_files').select('id,file_name,storage_path,client_visible').in('id',ids);files=res.data||[];}await render();
    }
    async function loadProjects(){
      const {data:{session}}=await db.auth.getSession();if(!session?.user)return;const {data:client}=await db.from('salt_story_clients').select('id').eq('primary_user_id',session.user.id).maybeSingle();if(!client){projectSelect.innerHTML='<option>No client project</option>';projectSelect.disabled=true;return;}
      const {data,error}=await db.from('salt_story_projects').select('id,name,status,budget,updated_at').eq('client_id',client.id).order('updated_at',{ascending:false});if(error||!(data||[]).length){projectSelect.innerHTML='<option>No project yet</option>';projectSelect.disabled=true;return;}projects=data;const active=projects.find(p=>!['complete','cancelled'].includes(p.status))||projects[0];selectedProjectId=active.id;projectSelect.innerHTML=projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');projectSelect.value=selectedProjectId;await loadBudget();
    }
    projectSelect.addEventListener('change',async()=>{selectedProjectId=projectSelect.value;await loadBudget();});
    await loadProjects();
  });
})();