(() => {
  const TZ='America/New_York';
  const onReady=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();
  const TYPES={consultation:'Consultation call',project_call:'Project call',property_visit:'Property visit',installation:'Installation',walkthrough:'Walkthrough',other:'Other'};
  const LOCATIONS={phone:'Phone',video:'Video call',property:'At the property',office:'Office',other:'Other'};

  function zonedParts(value){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
    return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  }
  function offsetAt(ms){const p=zonedParts(ms);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-ms;}
  function toIso(date,time){
    const [y,m,d]=date.split('-').map(Number),[h,mi]=time.split(':').map(Number); const desired=Date.UTC(y,m-1,d,h,mi,0,0);
    let target=desired-offsetAt(desired); target=desired-offsetAt(target); return new Date(target).toISOString();
  }
  function etToday(){const p=zonedParts(Date.now());return `${p.year}-${p.month}-${p.day}`;}
  function when(value){return new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));}
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  onReady(async()=>{
    const db=window.saltStory, projectView=document.getElementById('project'), existing=document.getElementById('projectPagePanel');
    if(!db||!projectView||!existing)return;
    const wrap=document.createElement('div'); wrap.className='panel ss-appt-panel'; wrap.id='ssClientAppointments';
    wrap.innerHTML=`<div class="ss-appt-head"><div><h3>Appointments & visits</h3><p>Request time with Salt & Story and keep confirmed project dates in one place.</p></div><span class="ss-appt-timezone">Eastern Time</span></div>
      <div class="ss-appt-project-select"><select id="ssClientApptProject" aria-label="Project"></select></div>
      <form id="ssClientApptForm" class="ss-appt-form"><div class="ss-appt-grid">
        <div class="ss-appt-field"><label for="ssClientApptType">Appointment type</label><select id="ssClientApptType"><option value="project_call">Project call</option><option value="consultation">Consultation call</option><option value="property_visit">Property visit</option><option value="installation">Installation</option><option value="walkthrough">Walkthrough</option><option value="other">Other</option></select></div>
        <div class="ss-appt-field"><label for="ssClientApptDuration">Duration</label><select id="ssClientApptDuration"><option value="30">30 minutes</option><option value="60" selected>1 hour</option><option value="90">90 minutes</option><option value="120">2 hours</option></select></div>
        <div class="ss-appt-field"><label for="ssClientApptDate">Preferred date</label><input id="ssClientApptDate" type="date" required></div>
        <div class="ss-appt-field"><label for="ssClientApptTime">Preferred time</label><input id="ssClientApptTime" type="time" required></div>
        <div class="ss-appt-field"><label for="ssClientApptLocation">Where</label><select id="ssClientApptLocation"><option value="phone">Phone</option><option value="video">Video call</option><option value="property">At the property</option><option value="office">Office</option><option value="other">Other</option></select></div>
        <div class="ss-appt-field"><label for="ssClientApptLocationDetails">Location details</label><input id="ssClientApptLocationDetails" maxlength="300" placeholder="Optional"></div>
        <div class="ss-appt-field full"><label for="ssClientApptNotes">What do you need?</label><textarea id="ssClientApptNotes" maxlength="1200" placeholder="Optional note for Salt & Story"></textarea></div>
        <div class="ss-appt-field full"><div class="ss-appt-actions"><button class="ss-appt-primary" type="submit" id="ssClientApptSubmit">Request Appointment</button></div><div id="ssClientApptStatus" class="ss-appt-statusline" aria-live="polite"></div></div>
      </div></form><div class="ss-appt-divider"></div><h3 class="ss-appt-section-title">Your schedule</h3><div id="ssClientApptList" class="ss-appt-list"></div>`;
    existing.insertAdjacentElement('afterend',wrap);

    const projectSelect=document.getElementById('ssClientApptProject'), form=document.getElementById('ssClientApptForm'), type=document.getElementById('ssClientApptType'), duration=document.getElementById('ssClientApptDuration'), date=document.getElementById('ssClientApptDate'), time=document.getElementById('ssClientApptTime'), location=document.getElementById('ssClientApptLocation'), locationDetails=document.getElementById('ssClientApptLocationDetails'), notes=document.getElementById('ssClientApptNotes'), submit=document.getElementById('ssClientApptSubmit'), status=document.getElementById('ssClientApptStatus'), list=document.getElementById('ssClientApptList');
    let userId='',projects=[],selectedProjectId='';
    const setStatus=(t='',err=false)=>{status.textContent=t;status.classList.toggle('error',err)};
    date.min=etToday();
    type.addEventListener('change',()=>{if(['property_visit','installation','walkthrough'].includes(type.value))location.value='property';else if(type.value==='consultation'||type.value==='project_call')location.value='phone';});

    async function loadAppointments(){
      if(!selectedProjectId){list.innerHTML='<div class="ss-appt-empty">No project is available for scheduling yet.</div>';return;}
      const {data,error}=await db.from('salt_story_appointments').select('id,appointment_type,title,starts_at,duration_minutes,location_type,location_details,client_notes,status,confirmed_at,completed_at,cancelled_at,created_at').eq('project_id',selectedProjectId).order('starts_at',{ascending:true});
      if(error){list.innerHTML='<div class="ss-appt-empty">Could not load appointments.</div>';return;}
      const rows=data||[]; if(!rows.length){list.innerHTML='<div class="ss-appt-empty">No appointments yet. Request a time above when you need us.</div>';return;}
      const priority={requested:0,confirmed:1,completed:2,cancelled:3}; rows.sort((a,b)=>(priority[a.status]-priority[b.status])||(new Date(a.starts_at)-new Date(b.starts_at)));
      list.innerHTML=rows.map(a=>`<article class="ss-appt-card"><div class="ss-appt-card-top"><div><h4>${esc(a.title||TYPES[a.appointment_type]||'Appointment')}</h4><div class="ss-appt-meta">${esc(when(a.starts_at))} • ${a.duration_minutes} min • ${esc(LOCATIONS[a.location_type]||a.location_type)}${a.location_details?` • ${esc(a.location_details)}`:''}</div></div><span class="ss-appt-badge ${esc(a.status)}">${esc(a.status)}</span></div>${a.client_notes?`<p class="ss-appt-notes">${esc(a.client_notes)}</p>`:''}${a.status==='requested'?'<p class="ss-appt-notes">Salt & Story will confirm or adjust this request.</p>':''}</article>`).join('');
    }

    async function loadProjects(){
      const {data:{session}}=await db.auth.getSession(); if(!session?.user)return; userId=session.user.id;
      const {data:client}=await db.from('salt_story_clients').select('id').eq('primary_user_id',userId).maybeSingle();
      if(!client){projectSelect.innerHTML='<option>No client project</option>';projectSelect.disabled=true;submit.disabled=true;await loadAppointments();return;}
      const {data,error}=await db.from('salt_story_projects').select('id,name,status,updated_at').eq('client_id',client.id).order('updated_at',{ascending:false});
      if(error||!(data||[]).length){projectSelect.innerHTML='<option>No project yet</option>';projectSelect.disabled=true;submit.disabled=true;await loadAppointments();return;}
      projects=data; const active=projects.find(p=>!['complete','cancelled'].includes(p.status))||projects[0]; selectedProjectId=active.id;
      projectSelect.innerHTML=projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''); projectSelect.value=selectedProjectId; await loadAppointments();
    }

    form.addEventListener('submit',async e=>{
      e.preventDefault(); if(!selectedProjectId)return;
      if(!date.value||!time.value){setStatus('Choose a preferred date and time.',true);return;}
      const startsAt=toIso(date.value,time.value); if(new Date(startsAt).getTime()<Date.now()-300000){setStatus('Please choose a future time.',true);return;}
      submit.disabled=true; setStatus('Sending request…');
      const title=TYPES[type.value]||'Appointment';
      const {error}=await db.from('salt_story_appointments').insert({project_id:selectedProjectId,appointment_type:type.value,title,starts_at:startsAt,duration_minutes:+duration.value,location_type:location.value,location_details:locationDetails.value.trim()||null,client_notes:notes.value.trim()||null,status:'requested',created_by:userId,timezone:TZ});
      submit.disabled=false; if(error){setStatus(error.message||'Appointment request could not be sent.',true);return;}
      form.reset(); date.min=etToday(); duration.value='60'; type.value='project_call'; location.value='phone'; setStatus('Appointment request sent. Salt & Story will confirm it.'); await loadAppointments();
    });
    projectSelect.addEventListener('change',async()=>{selectedProjectId=projectSelect.value;setStatus('');await loadAppointments();});

    const bookBtn=document.getElementById('bookBtn'); if(bookBtn){const s=bookBtn.querySelector('span');if(s)s.textContent='Request or view appointments';bookBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();document.querySelector('[data-view="project"]')?.click();setTimeout(()=>wrap.scrollIntoView({behavior:'smooth',block:'start'}),120);},{capture:true});}
    await loadProjects();
  });
})();