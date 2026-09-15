(() => {
  const BUCKET = 'salt-story-project-files';
  const onReady = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once:true }) : fn();

  onReady(async () => {
    const db = window.saltStory;
    const projectPanel = document.getElementById('projectPagePanel');
    if (!db || !projectPanel) return;

    const wrap = document.createElement('div');
    wrap.className = 'panel ss-files-wrap';
    wrap.id = 'ssClientFiles';
    wrap.innerHTML = `
      <div class="ss-files-head"><h3>Files & Photos</h3><span class="ss-files-count" id="ssClientFilesCount">0 files</span></div>
      <p style="margin:0 0 14px;color:var(--muted);font-size:.86rem">Photos, selections, receipts, proposals, and project documents shared with you by Salt & Story.</p>
      <div class="ss-files-grid" id="ssClientFilesGrid"><div class="ss-files-empty">Loading project files…</div></div>`;
    projectPanel.insertAdjacentElement('afterend', wrap);

    const grid = document.getElementById('ssClientFilesGrid');
    const count = document.getElementById('ssClientFilesCount');
    let project = null;
    let files = [];

    const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const pretty = (v) => String(v || '').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase());
    const stamp = (v) => !v ? '' : new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    const fileSize = (n) => {
      const bytes = Number(n || 0);
      if (!bytes) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
      return `${(bytes/1048576).toFixed(bytes >= 10485760 ? 0 : 1)} MB`;
    };
    const isImage = (f) => (f.mime_type || '').startsWith('image/');

    async function signedUrl(path) {
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 300);
      return error ? '' : (data?.signedUrl || '');
    }

    async function render() {
      count.textContent = `${files.length} ${files.length === 1 ? 'file' : 'files'}`;
      if (!project) {
        grid.innerHTML = '<div class="ss-files-empty">Project files will appear here once a project is open.</div>';
        return;
      }
      if (!files.length) {
        grid.innerHTML = '<div class="ss-files-empty">No files have been shared for this project yet.</div>';
        return;
      }

      const rendered = await Promise.all(files.map(async (f) => {
        const url = await signedUrl(f.storage_path);
        const meta = [pretty(f.category), fileSize(f.size_bytes), stamp(f.created_at)].filter(Boolean).join(' • ');
        const preview = isImage(f) && url
          ? `<div class="ss-file-thumb"><img src="${escapeHtml(url)}" alt="${escapeHtml(f.caption || f.file_name)}"></div>`
          : `<div class="ss-file-thumb"><span class="ss-file-icon">📄</span></div>`;
        return `<article class="ss-file-card">${preview}<div class="ss-file-body"><h4>${escapeHtml(f.file_name)}</h4><div class="ss-file-meta">${escapeHtml(meta)}</div>${f.caption ? `<p class="ss-file-caption">${escapeHtml(f.caption)}</p>` : ''}<div class="ss-file-actions">${url ? `<a class="ss-file-open" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open file</a>` : '<span class="ss-file-meta">File unavailable</span>'}</div></div></article>`;
      }));
      grid.innerHTML = rendered.join('');
    }

    async function loadFiles() {
      if (!project) { files=[]; await render(); return; }
      const { data, error } = await db.from('salt_story_project_files')
        .select('id,project_id,storage_path,file_name,category,mime_type,size_bytes,caption,client_visible,created_at')
        .eq('project_id', project.id)
        .order('created_at',{ascending:false});
      if (error) {
        grid.innerHTML = '<div class="ss-files-empty">We could not load project files right now.</div>';
        return;
      }
      files = data || [];
      await render();
    }

    async function init() {
      const { data:{ session } } = await db.auth.getSession();
      if (!session?.user) return;
      const { data: client } = await db.from('salt_story_clients').select('id').eq('primary_user_id',session.user.id).maybeSingle();
      if (!client) { await render(); return; }
      const { data: projects } = await db.from('salt_story_projects').select('id,name,status,updated_at').eq('client_id',client.id).order('updated_at',{ascending:false});
      const all = projects || [];
      project = all.find(p => !['complete','cancelled'].includes(p.status)) || all[0] || null;
      await loadFiles();
    }

    await init();
    setInterval(() => { if (!document.hidden) loadFiles(); }, 30000);
  });
})();