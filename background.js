chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith('https://aistudio.google.com/')) {
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#d9534f', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 1500);
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['ignore.js', 'content.js']
    });
  }
});