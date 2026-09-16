(() => {
  const onReady=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const pretty=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  const fmt=v=>new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});

  onReady(async()=>{
    const db=window.saltStory,stats=document.querySelector('.stats');
    if(!db||!stats)return;
    const {data:{session}}=await db.auth.getSession();if(!session?.user)return;
    const {data:membership}=await db.from('salt_story_memberships').select('role,active').eq('user_id',session.user.id).maybeSingle();
    if(!membership?.active||!['staff','admin'].includes(membership.role))return;

    const card=document.createElement('section');card.className='ss-leads-card';card.innerHTML=`<div class="ss-leads-head"><div><span class="eyebrow">New business</span><h2>Consultation Leads</h2><p>Website requests appear here automatically. Qualify the lead, then invite them into the client portal.</p></div><div class="ss-leads-count" id="ssLeadCount">0 leads</div></div><div class="ss-leads-list" id="ssLeadList"><div class="ss-lead-empty">Loading consultation requests…</div></div>`;
    stats.insertAdjacentElement('afterend',card);
    const list=document.getElementById('ssLeadList'),count=document.getElementById('ssLeadCount');let leads=[];

    const render=()=>{
      const open=leads.filter(l=>!['closed_won','closed_lost'].includes(l.status));count.textContent=`${open.length} open`;
      if(!leads.length){list.innerHTML='<div class="ss-lead-empty">No consultation requests yet.</div>';return;}
      list.innerHTML=leads.map(l=>`<article class="ss-lead-card" data-lead-card="${l.id}"><div class="ss-lead-top"><div><h3>${esc(l.full_name)}</h3><div class="ss-lead-service">${esc(l.service||'Consultation')}</div></div><span class="ss-lead-badge ${esc(l.status)}">${esc(pretty(l.status))}</span></div><div class="ss-lead-contact"><div><small>Email</small><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></div><div><small>Phone</small>${l.phone?`<a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>`:'<span>Not provided</span>'}</div><div><small>Property</small><span>${esc(l.property_location||'Not provided')}</span></div><div><small>Source</small><span>${esc(pretty(l.source||'website'))}</span></div></div>${l.message?`<p class="ss-lead-message">${esc(l.message)}</p>`:''}<div class="ss-lead-date">Received ${esc(fmt(l.created_at))}</div><div class="ss-lead-actions"><select data-lead-status="${l.id}" aria-label="Lead status"><option value="new" ${l.status==='new'?'selected':''}>New</option><option value="contacted" ${l.status==='contacted'?'selected':''}>Contacted</option><option value="qualified" ${l.status==='qualified'?'selected':''}>Qualified</option><option value="invited" ${l.status==='invited'?'selected':''}>Invited</option><option value="closed_won" ${l.status==='closed_won'?'selected':''}>Closed Won</option><option value="closed_lost" ${l.status==='closed_lost'?'selected':''}>Closed Lost</option></select><button class="ss-lead-save" type="button" data-save-lead="${l.id}">Save Status</button>${l.converted_client_id||l.status==='invited'||l.status==='closed_won'?'':`<button class="ss-lead-invite" type="button" data-invite-lead="${l.id}">Invite as Client</button>`}</div><div class="ss-lead-status" data-lead-message="${l.id}" aria-live="polite"></div></article>`).join('');
      list.querySelectorAll('[data-save-lead]').forEach(b=>b.addEventListener('click',()=>saveStatus(b.dataset.saveLead)));
      list.querySelectorAll('[data-invite-lead]').forEach(b=>b.addEventListener('click',()=>inviteLead(b.dataset.inviteLead,b)));
    };
    const setMsg=(id,text='',error=false)=>{const el=list.querySelector(`[data-lead-message="${id}"]`);if(!el)return;el.textContent=text;el.classList.toggle('error',error)};
    async function load(){const {data,error}=await db.from('salt_story_leads').select('id,full_name,email,phone,property_location,service,message,source,status,converted_client_id,created_at,updated_at').order('created_at',{ascending:false});if(error){list.innerHTML='<div class="ss-lead-empty">Could not load consultation leads.</div>';return;}leads=data||[];render();}
    async function saveStatus(id){const select=list.querySelector(`[data-lead-status="${id}"]`);if(!select)return;setMsg(id,'Saving…');const {error}=await db.from('salt_story_leads').update({status:select.value,updated_at:new Date().toISOString()}).eq('id',id);if(error){setMsg(id,error.message||'Could not update lead.',true);return;}setMsg(id,'Status saved.');await load();}
    async function inviteLead(id,button){const lead=leads.find(l=>l.id===id);if(!lead)return;button.disabled=true;setMsg(id,'Creating client invitation…');const {data,error}=await db.functions.invoke('salt-story-client-invite',{body:{action:'invite',full_name:lead.full_name,email:lead.email,phone:lead.phone||''}});if(error||data?.error){button.disabled=false;setMsg(id,data?.error||error?.message||'Could not invite client.',true);return;}const clientId=data?.client?.id||null;const {error:updateError}=await db.from('salt_story_leads').update({status:'invited',converted_client_id:clientId,updated_at:new Date().toISOString()}).eq('id',id);if(updateError){button.disabled=false;setMsg(id,'Invitation sent, but the lead status could not be updated.',true);return;}setMsg(id,'Invitation sent.');if(typeof window.loadAll==='function'){try{await window.loadAll()}catch(_){}}await load();}
    await load();
  });
})();