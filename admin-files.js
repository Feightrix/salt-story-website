(() => {
  const BUCKET = 'salt-story-project-files';
  const MAX_SIZE = 25 * 1024 * 1024;
  const MAX_IMAGE_DIMENSION = 2048;
  const IMAGE_QUALITY = 0.75;
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
    tab.dataset.tab = 'project-files';
    tab.textContent = 'Files';
    tabs.appendChild(tab);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'project-files';
    panel.innerHTML = `
      <div class="ss-admin-files-form">
        <h3>Project files & photos</h3>
        <p class="note" style="margin-top:6px">Upload project photos and documents. Client-visible files appear immediately in the client portal; internal files stay staff-only.</p>
        <div class="field" style="margin-top:14px"><label for="ssAdminFileProject">Project</label><select id="ssAdminFileProject"></select></div>
        <form id="ssAdminFileForm"><div class="form-grid">
          <div class="field full"><label for="ssAdminFileInput">Files</label><div class="ss-file-picker"><input id="ssAdminFileInput" type="file" multiple required></div><div class="note">Images are automatically compressed before upload. Other files: up to 25 MB each.</div></div>
          <div class="field"><label for="ssAdminFileCategory">Category</label><select id="ssAdminFileCategory"><option value="photo">Photo</option><option value="selection">Selection</option><option value="receipt">Receipt</option><option value="proposal">Proposal</option><option value="document" selected>Document</option><option value="other">Other</option></select></div>
          <div class="field"><label>Visibility</label><label class="ss-file-check"><input id="ssAdminFileVisible" type="checkbox" checked> Share with client</label></div>
          <div class="field full"><label for="ssAdminFileCaption">Caption / note</label><textarea id="ssAdminFileCaption" maxlength="1000" placeholder="Optional note that appears with the file"></textarea></div>
          <div class="field full"><button class="btn" id="ssAdminFileUpload" type="submit">Upload Files</button><div class="ss-file-status" id="ssAdminFileStatus" aria-live="polite"></div></div>
        </div></form>
      </div>
      <div class="subsection"><div class="ss-files-head"><div><h3>Project library</h3><p>Manage access and open or remove project files.</p></div><span class="ss-files-count" id="ssAdminFilesCount">0 files</span></div><div class="ss-files-grid" id="ssAdminFilesGrid"></div></div>`;
    workspace.appendChild(panel);

    const projectSelect = document.getElementById('ssAdminFileProject');
    const form = document.getElementById('ssAdminFileForm');
    const input = document.getElementById('ssAdminFileInput');
    const category = document.getElementById('ssAdminFileCategory');
    const visible = document.getElementById('ssAdminFileVisible');
    const caption = document.getElementById('ssAdminFileCaption');
    const upload = document.getElementById('ssAdminFileUpload');
    const status = document.getElementById('ssAdminFileStatus');
    const grid = document.getElementById('ssAdminFilesGrid');
    const count = document.getElementById('ssAdminFilesCount');

    let userId = '';
    let selectedClientId = '';
    let selectedProjectId = '';
    let projects = [];
    let files = [];

    const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const pretty = (v) => String(v || '').replaceAll('_',' ').replace(/\b\w/g,c => c.toUpperCase());
    const stamp = (v) => !v ? '' : new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    const fileSize = (n) => { const b=Number(n||0); if(!b)return''; if(b<1024)return`${b} B`; if(b<1048576)return`${(b/1024).toFixed(1)} KB`; return`${(b/1048576).toFixed(b>=10485760?0:1)} MB`; };
    const activeProject = (items) => items.find(p => !['complete','cancelled'].includes(p.status)) || items[0] || null;
    const isImage = (f) => (f.mime_type || '').startsWith('image/');
    const safeName = (name) => {
      const cleaned = String(name || 'file').normalize('NFKD').replace(/[^A-Za-z0-9._,'!&$@=;:+?() -]/g,'_').replace(/\s+/g,'-').replace(/-+/g,'-');
      return cleaned.slice(-180) || 'file';
    };
    const canCompressImage = (file) => /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.type || '');
    const webpName = (name) => {
      const raw = String(name || 'image').replace(/\.[^.]+$/, '') || 'image';
      return `${raw}.webp`;
    };

    function setStatus(text='', isError=false){ status.textContent=text; status.classList.toggle('error',isError); }
    function activeClientId(){ return document.querySelector('.client-btn.active[data-client]')?.dataset.client || ''; }
    function activateTab(){ document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===tab)); document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p===panel)); loadFiles(); }

    async function compressImage(file){
      if(!canCompressImage(file)) return { blob:file, fileName:file.name, mimeType:file.type || null, originalSize:file.size, compressed:false };
      let objectUrl = '';
      try {
        objectUrl = URL.createObjectURL(file);
        const image = await new Promise((resolve,reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Image could not be decoded'));
          img.src = objectUrl;
        });
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if(!sourceWidth || !sourceHeight) throw new Error('Image dimensions unavailable');
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha:true });
        if(!ctx) throw new Error('Canvas unavailable');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, width, height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY));
        if(!blob || blob.type !== 'image/webp' || blob.size >= file.size * 0.95) {
          return { blob:file, fileName:file.name, mimeType:file.type || null, originalSize:file.size, compressed:false };
        }
        return { blob, fileName:webpName(file.name), mimeType:'image/webp', originalSize:file.size, compressed:true };
      } catch (error) {
        console.warn('Salt & Story image compression skipped:', error);
        return { blob:file, fileName:file.name, mimeType:file.type || null, originalSize:file.size, compressed:false };
      } finally {
        if(objectUrl) URL.revokeObjectURL(objectUrl);
      }
    }

    async function signedUrl(path){ const {data,error}=await db.storage.from(BUCKET).createSignedUrl(path,300); return error?'':(data?.signedUrl||''); }

    async function render(){
      count.textContent = `${files.length} ${files.length===1?'file':'files'}`;
      if(!selectedProjectId){grid.innerHTML='<div class="ss-files-empty">Select a client with a project to manage files.</div>';return;}
      if(!files.length){grid.innerHTML='<div class="ss-files-empty">No files have been uploaded for this project yet.</div>';return;}
      const cards=await Promise.all(files.map(async f=>{
        const url=await signedUrl(f.storage_path);
        const meta=[pretty(f.category),fileSize(f.size_bytes),stamp(f.created_at)].filter(Boolean).join(' • ');
        const preview=isImage(f)&&url?`<div class="ss-file-thumb"><img src="${escapeHtml(url)}" alt="${escapeHtml(f.caption||f.file_name)}"></div>`:`<div class="ss-file-thumb"><span class="ss-file-icon">📄</span></div>`;
        return `<article class="ss-file-card">${preview}<div class="ss-file-body"><h4>${escapeHtml(f.file_name)}</h4><div class="ss-file-meta">${escapeHtml(meta)}</div><span class="ss-file-visibility ${f.client_visible?'':'internal'}">${f.client_visible?'Client visible':'Internal only'}</span>${f.caption?`<p class="ss-file-caption">${escapeHtml(f.caption)}</p>`:''}<div class="ss-file-actions">${url?`<a class="ss-file-open" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open</a>`:''}<button class="ss-file-secondary" type="button" data-toggle-file="${f.id}">${f.client_visible?'Make internal':'Share with client'}</button><button class="ss-file-danger" type="button" data-delete-file="${f.id}">Delete</button></div></div></article>`;
      }));
      grid.innerHTML=cards.join('');
      grid.querySelectorAll('[data-toggle-file]').forEach(btn=>btn.addEventListener('click',()=>toggleVisibility(btn.dataset.toggleFile)));
      grid.querySelectorAll('[data-delete-file]').forEach(btn=>btn.addEventListener('click',()=>deleteFile(btn.dataset.deleteFile)));
    }

    async function loadFiles(){
      if(!selectedProjectId){files=[];await render();return;}
      const {data,error}=await db.from('salt_story_project_files').select('id,project_id,storage_path,file_name,category,mime_type,size_bytes,caption,client_visible,uploaded_by,created_at,updated_at').eq('project_id',selectedProjectId).order('created_at',{ascending:false});
      if(error){grid.innerHTML='<div class="ss-files-empty">Could not load project files.</div>';return;}
      files=data||[]; await render();
    }

    async function syncClient(){
      selectedClientId=activeClientId(); setStatus('');
      if(!selectedClientId){projects=[];selectedProjectId='';projectSelect.innerHTML='<option value="">Select a client first</option>';projectSelect.disabled=true;upload.disabled=true;await loadFiles();return;}
      const {data,error}=await db.from('salt_story_projects').select('id,name,status,updated_at').eq('client_id',selectedClientId).order('updated_at',{ascending:false});
      if(error){projectSelect.innerHTML='<option value="">Could not load projects</option>';upload.disabled=true;return;}
      projects=data||[]; const preferred=projects.find(p=>p.id===selectedProjectId)||activeProject(projects); selectedProjectId=preferred?.id||'';
      projectSelect.innerHTML=projects.length?projects.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join(''):'<option value="">No project yet</option>';
      projectSelect.disabled=!projects.length; upload.disabled=!projects.length; if(selectedProjectId)projectSelect.value=selectedProjectId; await loadFiles();
    }

    async function toggleVisibility(id){
      const f=files.find(x=>x.id===id); if(!f)return;
      setStatus('Updating visibility…');
      const {error}=await db.from('salt_story_project_files').update({client_visible:!f.client_visible,updated_at:new Date().toISOString()}).eq('id',id);
      if(error){setStatus(error.message||'Visibility could not be updated.',true);return;}
      setStatus(!f.client_visible?'File is now visible to the client.':'File is now internal only.'); await loadFiles();
    }

    async function deleteFile(id){
      const f=files.find(x=>x.id===id); if(!f)return;
      if(!window.confirm(`Delete ${f.file_name}? This cannot be undone.`))return;
      setStatus('Deleting file…');
      const {error:dbError}=await db.from('salt_story_project_files').delete().eq('id',id);
      if(dbError){setStatus(dbError.message||'File record could not be deleted.',true);return;}
      const {error:storageError}=await db.storage.from(BUCKET).remove([f.storage_path]);
      if(storageError){
        await db.from('salt_story_project_files').insert({id:f.id,project_id:f.project_id,storage_path:f.storage_path,file_name:f.file_name,category:f.category,mime_type:f.mime_type,size_bytes:f.size_bytes,caption:f.caption,client_visible:f.client_visible,uploaded_by:userId,created_at:f.created_at,updated_at:new Date().toISOString()});
        setStatus('Storage delete failed, so the file record was restored. Please try again.',true); await loadFiles(); return;
      }
      setStatus('File deleted.'); await loadFiles();
    }

    form.addEventListener('submit',async e=>{
      e.preventDefault();
      if(!selectedProjectId)return;
      const chosen=Array.from(input.files||[]); if(!chosen.length){setStatus('Choose at least one file.',true);return;}
      upload.disabled=true; setStatus(`Preparing 0 of ${chosen.length}…`);
      let completed=0; let failed=0; let originalBytes=0; let uploadedBytes=0;
      for(const file of chosen){
        setStatus(`Optimizing ${completed+failed+1} of ${chosen.length}…`);
        const prepared=await compressImage(file);
        if(prepared.blob.size>MAX_SIZE){failed++;setStatus(`${file.name} is still larger than 25 MB after optimization.`,true);continue;}
        const path=`${selectedProjectId}/${crypto.randomUUID()}-${safeName(prepared.fileName)}`;
        const {error:uploadError}=await db.storage.from(BUCKET).upload(path,prepared.blob,{contentType:prepared.mimeType||undefined,cacheControl:'3600',upsert:false});
        if(uploadError){failed++;setStatus(`Could not upload ${file.name}: ${uploadError.message}`,true);continue;}
        const {error:metaError}=await db.from('salt_story_project_files').insert({project_id:selectedProjectId,storage_path:path,file_name:prepared.fileName,category:category.value,mime_type:prepared.mimeType,size_bytes:prepared.blob.size,caption:caption.value.trim()||null,client_visible:visible.checked,uploaded_by:userId});
        if(metaError){failed++;await db.storage.from(BUCKET).remove([path]);setStatus(`Could not register ${file.name}: ${metaError.message}`,true);continue;}
        completed++; originalBytes+=prepared.originalSize; uploadedBytes+=prepared.blob.size; setStatus(`Uploading ${completed+failed} of ${chosen.length}…`);
      }
      upload.disabled=false;
      if(completed){
        input.value='';caption.value='';
        const saved=Math.max(0,originalBytes-uploadedBytes);
        const savings=originalBytes>0?Math.round((saved/originalBytes)*100):0;
        const savingsText=saved>1024?` Saved ${fileSize(saved)}${savings?` (${savings}%)`:''}.`:'';
        setStatus(failed?`${completed} uploaded; ${failed} failed.${savingsText}`:`${completed} ${completed===1?'file':'files'} uploaded successfully.${savingsText}`,failed>0);
      }
      await loadFiles();
    });

    projectSelect.addEventListener('change',async()=>{selectedProjectId=projectSelect.value;setStatus('');await loadFiles();});
    tab.addEventListener('click',activateTab);
    clientList.addEventListener('click',e=>{if(!e.target.closest('[data-client]'))return;setTimeout(syncClient,80);});

    const {data:{session}}=await db.auth.getSession(); if(!session?.user)return; userId=session.user.id;
    const {data:membership}=await db.from('salt_story_memberships').select('role,active').eq('user_id',userId).maybeSingle();
    if(!membership?.active||!['staff','admin'].includes(membership.role))return;
    await syncClient();
  });
})();