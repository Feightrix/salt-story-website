(() => {
  const onReady=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();
  onReady(async()=>{
    const db=window.saltStory,clientList=document.getElementById('clientList');if(!db||!clientList)return;
    const aside=clientList.closest('.card'),heading=aside?.querySelector('h2'),note=aside?.querySelector('.note');if(!aside||!heading)return;
    const toggle=document.createElement('button');toggle.type='button';toggle.className='ss-invite-toggle';toggle.textContent='Invite Client';heading.insertAdjacentElement('afterend',toggle);
    const box=document.createElement('div');box.className='ss-invite-box';box.innerHTML=`<form id="ssInviteForm"><div class="ss-invite-grid"><div class="ss-invite-field"><label for="ssInviteName">Client name</label><input id="ssInviteName" required placeholder="Jane Smith"></div><div class="ss-invite-field"><label for="ssInviteEmail">Email</label><input id="ssInviteEmail" type="email" required placeholder="jane@example.com"></div><div class="ss-invite-field"><label for="ssInvitePhone">Phone</label><input id="ssInvitePhone" type="tel" placeholder="Optional"></div><div class="ss-invite-actions"><button class="ss-invite-primary" id="ssInviteSend" type="submit">Send Invitation</button><button class="ss-invite-secondary" id="ssInviteCancel" type="button">Cancel</button></div><div class="ss-invite-status" id="ssInviteStatus" aria-live="polite"></div></div></form>`;toggle.insertAdjacentElement('afterend',box);
    if(note)note.textContent='Create and invite clients here. Their account is connected automatically when they accept the invitation.';
    const form=document.getElementById('ssInviteForm'),name=document.getElementById('ssInviteName'),email=document.getElementById('ssInviteEmail'),phone=document.getElementById('ssInvitePhone'),send=document.getElementById('ssInviteSend'),cancel=document.getElementById('ssInviteCancel'),status=document.getElementById('ssInviteStatus');
    const setStatus=(t='',err=false)=>{status.textContent=t;status.classList.toggle('error',err)};
    toggle.addEventListener('click',()=>{box.classList.toggle('show');if(box.classList.contains('show'))name.focus();});
    cancel.addEventListener('click',()=>{box.classList.remove('show');form.reset();setStatus('');});
    form.addEventListener('submit',async e=>{e.preventDefault();send.disabled=true;setStatus('Sending secure invitation…');const {data,error}=await db.functions.invoke('salt-story-client-invite',{body:{action:'invite',full_name:name.value.trim(),email:email.value.trim(),phone:phone.value.trim()}});send.disabled=false;if(error||data?.error){setStatus(data?.error||error?.message||'Invitation could not be sent.',true);return;}setStatus(`Invitation sent to ${data.email}.`);setTimeout(()=>location.reload(),900);});
    async function decorateInvites(){
      const {data,error}=await db.from('salt_story_client_invites').select('client_id,status');if(error)return;
      const map=Object.fromEntries((data||[]).map(x=>[x.client_id,x.status]));
      document.querySelectorAll('.client-btn[data-client]').forEach(btn=>{
        const inviteStatus=map[btn.dataset.client];if(!inviteStatus)return;
        let badge=btn.querySelector('.ss-invite-sent,.ss-invite-accepted');
        if(!badge){badge=document.createElement('span');btn.appendChild(badge);}
        badge.className=inviteStatus==='accepted'?'ss-invite-accepted':'ss-invite-sent';
        badge.textContent=inviteStatus==='accepted'?'Invitation accepted':'Invitation sent';
      });
    }
    await decorateInvites();setTimeout(decorateInvites,500);setTimeout(decorateInvites,1200);
  });
})();