(() => {
  const SUPABASE_URL = 'https://mqiofvksgipmowyfjqjn.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_a2gI08GTG1ON5hDwnNvw-g_QUH4SbsB';

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
})();
