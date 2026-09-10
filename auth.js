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

  if (messagingScript) {
    if (!document.querySelector('link[data-salt-story-messaging]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = new URL('messaging.css', assetBase).href;
      style.dataset.saltStoryMessaging = 'true';
      document.head.appendChild(style);
    }
    const script = document.createElement('script');
    script.src = new URL(messagingScript, assetBase).href;
    script.dataset.saltStoryMessaging = 'true';
    document.head.appendChild(script);
  }

  if (approvalsScript) {
    if (!document.querySelector('link[data-salt-story-approvals]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = new URL('approvals.css', assetBase).href;
      style.dataset.saltStoryApprovals = 'true';
      document.head.appendChild(style);
    }
    const script = document.createElement('script');
    script.src = new URL(approvalsScript, assetBase).href;
    script.dataset.saltStoryApprovals = 'true';
    document.head.appendChild(script);
  }
})();