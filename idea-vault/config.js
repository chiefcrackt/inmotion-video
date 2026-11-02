// Public identifiers only. Never put client secrets, access tokens or document content here.
// pickerApiKey: a browser API key restricted by HTTP referrer (see docs/idea-vault/IMPLEMENTATION.md).
// cloudProjectNumber: the numeric Google Cloud project number, used as the Picker appId.
// Both stay empty until configured; the document viewer then explains what is missing.
window.TIM_IDEA_VAULT_CONFIG = {
  googleClientId:
    '11245908730-cq0ku5f7o7u8d1228guo0n5n7nprhf3m.apps.googleusercontent.com', // Public OAuth client ID only.
  pickerApiKey: 'AIzaSyD_SGKerLekmI0HGyvKa0KMrL4O3sUBW4Y',
  cloudProjectNumber: '11245908730',
  autoSyncDelayMs: 4000, // quiet period before an automatic upload; tests shorten it
  autoCheckMs: 30000, // minimum gap between cloud checks when the tab regains focus
};
