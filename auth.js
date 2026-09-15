(() => {
  const SUPABASE_URL = 'https://mqiofvksgipmowyfjqjn.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_a2gI08GTG1ON5hDwnNvw-g_QUH4SbsB';
  const assetBase = new URL('.', document.currentScript?.src || window.location.href);

  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('Supabase client library failed to load.');
  }

  window.saltStory = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'salt-story-auth'
      }
    }
  );

  const page = window.location.pathname.split('/').pop() || 'index.html';
  const messagingScript = page === 'dashboard.html'
    ? 'dashboard-messaging.js'
    : page === 'admin.html'
      ? 'admin-messaging.js'
      : null;
  const approvalsScript = page === 'dashboard.html'
    ? 'dashboard-approvals.js'
    : page === 'admin.html'
      ? 'admin-approvals.js'
      : null;
  const filesScript = page === 'dashboard.html'
    ? 'dashboard-files.js'
    : page === 'admin.html'
      ? 'admin-files.js'
      : null;

  function loadModule(scriptName, cssName, key) {
    if (!scriptName) return;
    if (!document.querySelector(`link[data-salt-story-${key}]`)) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = new URL(cssName, assetBase).href;
      style.dataset[`saltStory${key.charAt(0).toUpperCase()}${key.slice(1)}`] = 'true';
      document.head.appendChild(style);
    }
    const script = document.createElement('script');
    script.src = new URL(scriptName, assetBase).href;
    script.dataset[`saltStory${key.charAt(0).toUpperCase()}${key.slice(1)}`] = 'true';
    document.head.appendChild(script);
  }

  loadModule(messagingScript, 'messaging.css', 'messaging');
  loadModule(approvalsScript, 'approvals.css', 'approvals');
  loadModule(filesScript, 'files.css', 'files');
})();