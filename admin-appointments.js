(() => {
  const TZ='America/New_York';
  const TYPES={consultation:'Consultation call',project_call:'Project call',property_visit:'Property visit',installation:'Installation',walkthrough:'Walkthrough',other:'Other'};
  const LOCATIONS={phone:'Phone',video:'Video call',property:'At the property',office:'Office',other:'Other'};
  const onReady=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function zonedParts(value){const p=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}
  function offsetAt(ms){const p=zonedParts(ms);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-ms;}
  function toIso(date,time){const [y,m,d]=date.split('-').map(Number),[h,mi]=time.split(':').map(Number);const desired=Date.UTC(y,m-1,d,h,mi);let target=desired-offsetAt(desired);target=desired-offsetAt(target);return new Date(target).toISOString();}
  function fromIso(value){const p=zonedParts(value);return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};}
  function when(value){return new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));}

  onReady(async()=>{
    const db=window.saltStory,workspace=document.getElementById('clientWorkspace'),clientList=document.getElementById('clientList'),tabs=workspace?.querySelector('.tabs');
    if(!db||!workspace||!clientList||!tabs)return;
    const tab=document.createElement('button');tab.className='tab';tab.type='button';tab.dataset.tab='appointments';tab.textContent='Schedule';tabs.appendChild(tab);
    const panel=document.createElement('div');panel.className='panel';panel.id='appointments';panel.innerHTML=`
      <div class="ss-appt-admin-form"><div class="ss-appt-head"><div><h3>Appointments & visits</h3><p>Create project appointments or manage client requests.</p></div><span class="ss-appt-timezone">Eastern Time</span></div>
      <div class="ss-appt-project-select"><select id="ssAdminApptProject"></select></div>
      <div class="ss-appt-editing" id="ssAdminApptEditing"></div>
      <form id="ssAdminApptForm"><div class="ss-appt-grid">
        <div class="ss-appt-field"><label for="ssAdminApptType">Appointment type</label><select id="ssAdminApptType"><option value="project_call">Project call</option><option value="consultation">Consultation call</option><option value="property_visit">Property visit</option><option value="installation">Installation</option><option value="walkthrough">Walkthrough</option><option value="other">Other</option></select></div>
        <div class="ss-appt-field"><label for="ssAdminApptTitle">Title</label><input id="ssAdminApptTitle" maxlength="180" required value="Project call"></div>
        <div class="ss-appt-field"><label for="ssAdminApptDate">Date</label><input id="ssAdminApptDate" type="date" required></div>
        <div class="ss-appt-field"><label for="ssAdminApptTime">Time</label><input id="ssAdminApptTime" type="time" required></div>
        <div class="ss-appt-field"><label for="ssAdminApptDuration">Duration</label><select id="ssAdminApptDuration"><option value="30">30 minutes</option><option value="60" selected>1 hour</option><option value="90">90 minutes</option><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option></select></div>
        <div class="ss-appt-field"><label for="ssAdminApptStatusSelect">Status</label><select id="ssAdminApptStatusSelect"><option value="requested">Requested</option><option value="confirmed" selected>Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
        <div class="ss-appt-field"><label for="ssAdminApptLocation">Where</label><select id="ssAdminApptLocation"><option value="phone">Phone</option><option value="video">Video call</option><option value="property">At the property</option><option value="office">Office</option><option value="other">Other</option></select></div>
        <div class="ss-appt-field"><label for="ssAdminApptLocationDetails">Location details</label><input id="ssAdminApptLocationDetails" maxlength="300" placeholder="Optional"></div>
        <div class="ss-appt-field full"><label for="ssAdminApptNotes">Client-facing note</label><textarea id="ssAdminApptNotes" maxlength="1200" placeholder="Optional details the client should see"></textarea></div>
        <div class="ss-appt-field full"><div class="ss-appt-actions"><button class="ss-appt-primary" type="submit" id="ssAdminApptSave">Add Appointment</button><button class="ss-appt-secondary" type="button" id="ssAdminApptReset">Clear</button></div><div class="ss-appt-statusline" id="ssAdminApptStatus" aria-live="polite"></div></div>
      </div></form></div>
      <div class="ss-appt-divider"></div><h3 class="ss-appt-section-title">Project schedule</h3><div id="ssAdminApptList" class="ss-appt-list"></div>`;
    workspace.appendChild(panel);

    const projectSelect=document.getElementById('ssAdminApptProject'),form=document.getElementById('ssAdminApptForm'),type=document.getElementById('ssAdminApptType'),title=document.getElementById('ssAdminApptTitle'),date=document.getElementById('ssAdminApptDate'),time=document.getElementById('ssAdminApptTime'),duration=document.getElementById('ssAdminApptDuration'),statusSelect=document.getElementById('ssAdminApptStatusSelect'),location=document.getElementById('ssAdminApptLocation'),locationDetails=document.getElementById('ssAdminApptLocationDetails'),notes=document.getElementById('ssAdminApptNotes'),save=document.getElementById('ssAdminApptSave'),reset=document.getElementById('ssAdminApptReset'),statusLine=document.getElementById('ssAdminApptStatus'),list=document.getElementById('ssAdminApptList'),editing=document.getElementById('ssAdminApptEditing');
    let userId='',selectedClientId='',selectedProjectId='',projects=[],appointments=[],editingId='';
    const setStatus=(t='',err=false)=>{statusLine.textContent=t;statusLine.classList.toggle('error',err)};
    const activeClientId=()=>document.querySelector('.client-btn.active[data-client]')?.dataset.client||'';
    function activate(){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===tab));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p===panel));loadAppointments();}
    function resetForm(){editingId='';editing.classList.remove('show');editing.textContent='';form.reset();type.value='project_call';title.value='Project call';duration.value='60';statusSelect.value='confirmed';location.value='phone';save.textContent='Add Appointment';setStatus('');}
    type.addEventListener('change',()=>{title.value=TYPES[type.value]||'Appointment';if(['property_visit','installation','walkthrough'].includes(type.value))location.value='property';else if(['consultation','project_call'].includes(type.value))location.value='phone';});

    async function loadAppointments(){
      if(!selectedProjectId){appointments=[];list.innerHTML='<div class="ss-appt-empty">Select a client with a project to manage the schedule.</div>';return;}
      const {data,error}=await db.from('salt_story_appointments').select('id,project_id,appointment_type,title,starts_at,duration_minutes,location_type,location_details,client_notes,status,created_by,confirmed_at,completed_at,cancelled_at,created_at,updated_at').eq('project_id',selectedProjectId).order('starts_at',{ascending:true});
      if(error){list.innerHTML='<div class="ss-appt-empty">Could not load the project schedule.</div>';return;}
      appointments=data||[];if(!appointments.length){list.innerHTML='<div class="ss-appt-empty">No appointments yet.</div>';return;}
      const rank={requested:0,confirmed:1,completed:2,cancelled:3};appointments.sort((a,b)=>(rank[a.status]-rank[b.status])||(new Date(a.starts_at)-new Date(b.starts_at)));
      list.innerHTML=appointments.map(a=>`<article class="ss-appt-card"><div class="ss-appt-card-top"><div><h4>${esc(a.title||TYPES[a.appointment_type]||'Appointment')}</h4><div class="ss-appt-meta">${esc(when(a.starts_at))} • ${a.duration_minutes} min • ${esc(LOCATIONS[a.location_type]||a.location_type)}${a.location_details?` • ${esc(a.location_details)}`:''}</div></div><span class="ss-appt-badge ${esc(a.status)}">${esc(a.status)}</span></div>${a.client_notes?`<p class="ss-appt-notes">${esc(a.client_notes)}</p>`:''}<div class="ss-appt-card-actions"><button class="ss-appt-secondary" type="button" data-edit-appt="${a.id}">Manage</button>${a.status==='requested'?`<button class="ss-appt-primary" type="button" data-status-appt="${a.id}" data-next="confirmed">Confirm</button>`:''}${a.status==='confirmed'?`<button class="ss-appt-secondary" type="button" data-status-appt="${a.id}" data-next="completed">Complete</button>`:''}${!['cancelled','completed'].includes(a.status)?`<button class="ss-appt-danger" type="button" data-status-appt="${a.id}" data-next="cancelled">Cancel</button>`:''}</div></article>`).join('');
      list.querySelectorAll('[data-edit-appt]').forEach(b=>b.addEventListener('click',()=>editAppointment(b.dataset.editAppt)));
      list.querySelectorAll('[data-status-appt]').forEach(b=>b.addEventListener('click',()=>quickStatus(b.dataset.statusAppt,b.dataset.next)));
    }

    async function syncClient(){
      selectedClientId=activeClientId();resetForm();
      if(!selectedClientId){projects=[];selectedProjectId='';projectSelect.innerHTML='<option>Select a client first</option>';projectSelect.disabled=true;save.disabled=true;await loadAppointments();return;}
      const {data,error}=await db.from('salt_story_projects').select('id,name,status,updated_at').eq('client_id',selectedClientId).order('updated_at',{ascending:false});
      if(error||!(data||[]).length){projects=[];selectedProjectId='';projectSelect.innerHTML='<option>No project yet</option>';projectSelect.disabled=true;save.disabled=true;await loadAppointments();return;}
      projects=data;const active=projects.find(p=>!['complete','cancelled'].includes(p.status))||projects[0];selectedProjectId=active.id;projectSelect.innerHTML=projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');projectSelect.value=selectedProjectId;projectSelect.disabled=false;save.disabled=false;await loadAppointments();
    }
    function editAppointment(id){
      const a=appointments.find(x=>x.id===id);if(!a)return;editingId=id;const dt=fromIso(a.starts_at);type.value=a.appointment_type;title.value=a.title;date.value=dt.date;time.value=dt.time;duration.value=String(a.duration_minutes);statusSelect.value=a.status;location.value=a.location_type;locationDetails.value=a.location_details||'';notes.value=a.client_notes||'';save.textContent='Save Appointment';editing.textContent=`Editing ${a.title}`;editing.classList.add('show');panel.scrollIntoView({behavior:'smooth',block:'start'});
    }
    async function quickStatus(id,next){
      const a=appointments.find(x=>x.id===id);if(!a)return;const now=new Date().toISOString();const payload={status:next,updated_by:userId,updated_at:now};if(next==='confirmed'&&!a.confirmed_at)payload.confirmed_at=now;if(next==='completed'&&!a.completed_at)payload.completed_at=now;if(next==='cancelled'&&!a.cancelled_at)payload.cancelled_at=now;
      const {error}=await db.from('salt_story_appointments').update(payload).eq('id',id);if(error){setStatus(error.message||'Appointment could not be updated.',true);return;}setStatus(`Appointment marked ${next}.`);await loadAppointments();
    }

    form.addEventListener('submit',async e=>{
      e.preventDefault();if(!selectedProjectId)return;if(!date.value||!time.value){setStatus('Choose a date and time.',true);return;}save.disabled=true;setStatus(editingId?'Saving appointment…':'Adding appointment…');const now=new Date().toISOString();const payload={project_id:selectedProjectId,appointment_type:type.value,title:title.value.trim(),starts_at:toIso(date.value,time.value),duration_minutes:+duration.value,location_type:location.value,location_details:locationDetails.value.trim()||null,client_notes:notes.value.trim()||null,status:statusSelect.value,timezone:TZ,updated_by:userId,updated_at:now};
      let error;
      if(editingId){const existing=appointments.find(x=>x.id===editingId);if(statusSelect.value==='confirmed'&&!existing?.confirmed_at)payload.confirmed_at=now;if(statusSelect.value==='completed'&&!existing?.completed_at)payload.completed_at=now;if(statusSelect.value==='cancelled'&&!existing?.cancelled_at)payload.cancelled_at=now;({error}=await db.from('salt_story_appointments').update(payload).eq('id',editingId));}
      else{payload.created_by=userId;if(statusSelect.value==='confirmed')payload.confirmed_at=now;if(statusSelect.value==='completed')payload.completed_at=now;if(statusSelect.value==='cancelled')payload.cancelled_at=now;({error}=await db.from('salt_story_appointments').insert(payload));}
      save.disabled=false;if(error){setStatus(error.message||'Appointment could not be saved.',true);return;}const msg=editingId?'Appointment updated.':'Appointment added.';resetForm();setStatus(msg);await loadAppointments();
    });
    reset.addEventListener('click',resetForm);projectSelect.addEventListener('change',async()=>{selectedProjectId=projectSelect.value;resetForm();await loadAppointments();});tab.addEventListener('click',activate);clientList.addEventListener('click',e=>{if(e.target.closest('[data-client]'))setTimeout(syncClient,80);});

    const {data:{session}}=await db.auth.getSession();if(!session?.user)return;userId=session.user.id;const {data:membership}=await db.from('salt_story_memberships').select('role,active').eq('user_id',userId).maybeSingle();if(!membership?.active||!['staff','admin'].includes(membership.role))return;await syncClient();
  });
})();