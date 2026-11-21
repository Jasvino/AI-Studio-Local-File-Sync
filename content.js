if (!window.__cleanAIStudioContextLoaded) {
  window.__cleanAIStudioContextLoaded = true;

  (() => {
    const { MAX_FILE_BYTES, isAlwaysIgnored, isGitIgnored, readGitignoreRules } =
      globalThis.__cleanAIStudioIgnore;

    const DB_NAME = 'clean-aistudio-context-db';
    const STORE_NAME = 'handles';
    const ROOT_KEY = 'sourceFolder';
    const SIZE_KEY = 'clean-aistudio-panel-size';

    const EXT_LANG_MAP = {
      js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
      ts: 'typescript', tsx: 'tsx', py: 'python', html: 'html', css: 'css',
      scss: 'scss', json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml',
      sh: 'bash', bash: 'bash', zsh: 'bash', rs: 'rust', go: 'go',
      java: 'java', kt: 'kotlin', swift: 'swift', rb: 'ruby', php: 'php',
      sql: 'sql', xml: 'xml', toml: 'toml', c: 'c', cpp: 'cpp', h: 'c'
    };

    function openDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE_NAME)) {
            req.result.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async function saveDirHandle(handle) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, ROOT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    async function loadDirHandle() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(ROOT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    function el(tag, props = {}, ...children) {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(props)) {
        if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'string') node.style.cssText = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k in node) {
          node[k] = v;
        } else if (v !== false && v != null) {
          node.setAttribute(k, v === true ? '' : String(v));
        }
      }
      for (const child of children) {
        if (child != null) node.append(child);
      }
      return node;
    }

    const host = document.createElement('div');
    host.id = 'clean-aistudio-context-host';
    host.style.cssText = 'position:fixed;top:12px;right:16px;z-index:2147483647;display:none;';
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      * { box-sizing: border-box; }
      .panel {
        position: relative;
        width: 460px;
        height: 540px;
        min-width: 320px;
        min-height: 280px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 24px);
        background: #111318;
        color: #e6edf3;
        border: 1px solid #30363d;
        border-radius: 12px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.55);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      header {
        padding: 10px 12px;
        border-bottom: 1px solid #262c36;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .row { display: flex; align-items: center; gap: 6px; }
      .between { justify-content: space-between; }
      .header-actions { flex-shrink: 0; }
      .folder-badge {
        flex: 1;
        min-width: 0;
        font-weight: 600;
        color: #8ab4f8;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tree-row button { flex: 1; }
      input[type="search"] {
        width: 100%;
        padding: 7px 10px;
        border-radius: 6px;
        border: 1px solid #30363d;
        background: #0d1117;
        color: #e6edf3;
        outline: none;
        font-size: 13px;
      }
      input[type="search"]:focus { border-color: #4c8bf5; }
      button {
        background: #21262d;
        color: #e6edf3;
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 5px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      button:hover:not(:disabled) { background: #30363d; }
      button:disabled { opacity: 0.45; cursor: not-allowed; }
      button.primary {
        background: #4c8bf5;
        border-color: #4c8bf5;
        color: #fff;
        font-weight: 600;
      }
      button.primary:hover:not(:disabled) { background: #3b7ae0; }
      .file-list { flex: 1; overflow-y: auto; padding: 6px; }
      .empty { color: #8b949e; text-align: center; padding: 40px 16px; }
      .empty.clickable { cursor: pointer; color: #8ab4f8; }
      .file-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 6px;
        cursor: pointer;
      }
      .file-item:hover { background: #1c2128; }
      .file-path {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
      }
      .file-size { color: #7d8590; font-size: 11px; flex-shrink: 0; }
      .quick-paste { opacity: 0; padding: 2px 7px; font-size: 11px; flex-shrink: 0; }
      .file-item:hover .quick-paste { opacity: 1; }
      footer {
        padding: 10px 12px;
        border-top: 1px solid #262c36;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #8b949e;
      }
      .status { color: #7ee787; }

      /* Resize handles (left edge, bottom edge, bottom-left corner) */
      .resize-left {
        position: absolute;
        left: 0;
        top: 8px;
        bottom: 14px;
        width: 6px;
        cursor: ew-resize;
        z-index: 10;
      }
      .resize-bottom {
        position: absolute;
        left: 14px;
        right: 8px;
        bottom: 0;
        height: 6px;
        cursor: ns-resize;
        z-index: 10;
      }
      .resize-corner {
        position: absolute;
        left: 3px;
        bottom: 3px;
        width: 14px;
        height: 14px;
        cursor: nesw-resize;
        z-index: 11;
        background: linear-gradient(
          45deg,
          transparent 3px, #586069 3px, #586069 4.5px,
          transparent 4.5px, transparent 6.5px, #586069 6.5px, #586069 8px,
          transparent 8px
        );
        opacity: 0.7;
      }
      .resize-corner:hover { opacity: 1; }
    `;

    let isOpen = false;
    let needsUnlock = false;
    let dragState = null;
    let rootHandle = null;
    let allFiles = [];
    let treeText = '';
    const selectedPaths = new Set();

    const folderNameEl = el('span', { className: 'folder-badge', text: 'No folder selected' });
    const refreshBtn = el('button', { text: '↻', title: 'Rescan folder', hidden: true });
    const selectFolderBtn = el('button', { text: 'Select Folder' });
    const closeBtn = el('button', { text: '✕', title: 'Close' });

    const pasteTreeBtn = el('button', { text: 'Paste Tree', disabled: true });
    const copyTreeBtn = el('button', { text: 'Copy Tree', disabled: true });
    const searchInput = el('input', {
      type: 'search',
      placeholder: 'Search files (e.g. auth, App.tsx)...',
      readOnly: true
    });

    const fileListEl = el(
      'div',
      { className: 'file-list' },
      el('div', { className: 'empty', text: 'Click "Select Folder" to load your project.' })
    );

    const selectionInfoEl = el('span', { text: '0 files selected' });
    const statusMsgEl = el('span', { className: 'status' });
    const clearBtn = el('button', { text: 'Clear', disabled: true });
    const copyFilesBtn = el('button', { text: 'Copy', disabled: true });
    const pasteFilesBtn = el('button', { className: 'primary', text: 'Paste Code', disabled: true });

    const leftHandle = el('div', { className: 'resize-left' });
    const bottomHandle = el('div', { className: 'resize-bottom' });
    const cornerHandle = el('div', {
      className: 'resize-corner',
      title: 'Drag to resize (double-click to reset)'
    });

    const panel = el(
      'div',
      { className: 'panel' },
      leftHandle,
      bottomHandle,
      cornerHandle,
      el(
        'header',
        {},
        el(
          'div',
          { className: 'row between' },
          folderNameEl,
          el('div', { className: 'row header-actions' }, refreshBtn, selectFolderBtn, closeBtn)
        ),
        el('div', { className: 'row tree-row' }, pasteTreeBtn, copyTreeBtn),
        searchInput
      ),
      fileListEl,
      el(
        'footer',
        {},
        el('div', { className: 'meta' }, selectionInfoEl, statusMsgEl),
        el('div', { className: 'row', style: 'justify-content:flex-end' }, clearBtn, copyFilesBtn, pasteFilesBtn)
      )
    );

    // Restore saved dimensions if present
    try {
      const saved = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
      if (saved?.width) panel.style.width = `${saved.width}px`;
      if (saved?.height) panel.style.height = `${saved.height}px`;
    } catch {}

    shadow.append(styleEl, panel);

    function startResize(mode, e) {
      e.preventDefault();
      e.stopPropagation();
      dragState = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        startW: panel.offsetWidth,
        startH: panel.offsetHeight
      };
      document.documentElement.style.userSelect = 'none';
    }

    leftHandle.addEventListener('pointerdown', (e) => startResize('left', e));
    bottomHandle.addEventListener('pointerdown', (e) => startResize('bottom', e));
    cornerHandle.addEventListener('pointerdown', (e) => startResize('corner', e));

    cornerHandle.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      panel.style.width = '460px';
      panel.style.height = '540px';
      try { localStorage.removeItem(SIZE_KEY); } catch {}
    });

    window.addEventListener('pointermove', (e) => {
      if (!dragState) return;
      if (dragState.mode === 'left' || dragState.mode === 'corner') {
        const w = Math.min(window.innerWidth - 32, Math.max(320, dragState.startW + (dragState.startX - e.clientX)));
        panel.style.width = `${w}px`;
      }
      if (dragState.mode === 'bottom' || dragState.mode === 'corner') {
        const h = Math.min(window.innerHeight - 24, Math.max(280, dragState.startH + (e.clientY - dragState.startY)));
        panel.style.height = `${h}px`;
      }
    });

    function stopResize() {
      if (!dragState) return;
      dragState = null;
      document.documentElement.style.userSelect = '';
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify({
          width: panel.offsetWidth,
          height: panel.offsetHeight
        }));
      } catch {}
    }

    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);

    function setStatus(msg, isError = false) {
      statusMsgEl.style.color = isError ? '#ff7b72' : '#7ee787';
      statusMsgEl.textContent = msg;
      if (msg) setTimeout(() => { statusMsgEl.textContent = ''; }, 3000);
    }

    function formatSize(bytes) {
      return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    }

    function getLang(filename) {
      const idx = filename.lastIndexOf('.');
      return idx === -1 ? '' : (EXT_LANG_MAP[filename.slice(idx + 1).toLowerCase()] || '');
    }

    function renderTree(node, prefix = '', isRoot = true) {
      const lines = isRoot ? [`${node.name}/`] : [];
      const children = node.children || [];
      children.forEach((child, idx) => {
        const isLast = idx === children.length - 1;
        const branch = isLast ? '└── ' : '├── ';
        const nextPrefix = prefix + (isLast ? '    ' : '│   ');
        if (child.kind === 'directory') {
          lines.push(`${prefix}${branch}${child.name}/`);
          lines.push(...renderTree(child, nextPrefix, false));
        } else {
          lines.push(`${prefix}${branch}${child.name}`);
        }
      });
      return lines;
    }

    async function scanDirectory(dirHandle, relDir = '', parentRules = []) {
      const localRules = await readGitignoreRules(dirHandle, relDir);
      const rules = [...parentRules, ...localRules];

      const entries = [];
      for await (const entry of dirHandle.values()) {
        entries.push(entry);
      }
      entries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const children = [];
      for (const entry of entries) {
        const isDir = entry.kind === 'directory';
        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

        if (isAlwaysIgnored(entry.name, isDir)) continue;
        if (isGitIgnored(relPath, isDir, rules)) continue;

        if (isDir) {
          children.push(await scanDirectory(entry, relPath, rules));
        } else {
          const file = await entry.getFile();
          allFiles.push({ path: relPath, name: entry.name, handle: entry, size: file.size });
          children.push({ kind: 'file', name: entry.name });
        }
      }
      return { kind: 'directory', name: dirHandle.name, children };
    }

    async function loadProject() {
      needsUnlock = false;
      fileListEl.replaceChildren(el('div', { className: 'empty', text: 'Scanning files...' }));
      allFiles = [];

      const treeNode = await scanDirectory(rootHandle);
      treeText = `\`\`\`text\n${renderTree(treeNode).join('\n')}\n\`\`\``;

      pasteTreeBtn.disabled = false;
      copyTreeBtn.disabled = false;
      searchInput.readOnly = false;
      refreshBtn.hidden = false;

      renderFileList();
      requestAnimationFrame(() => searchInput.focus());
    }

    function updateSelectionUI() {
      const count = selectedPaths.size;
      let totalBytes = 0;
      for (const f of allFiles) {
        if (selectedPaths.has(f.path)) totalBytes += f.size;
      }
      const estTokens = Math.round(totalBytes / 4);

      selectionInfoEl.textContent = count
        ? `${count} file${count > 1 ? 's' : ''} (~${estTokens.toLocaleString()} tokens)`
        : `${allFiles.length} files indexed`;

      clearBtn.disabled = count === 0;
      copyFilesBtn.disabled = count === 0;
      pasteFilesBtn.disabled = count === 0;
    }

    function renderFileList() {
      const query = searchInput.value.trim().toLowerCase();
      const matches = query
        ? allFiles.filter(f => f.path.toLowerCase().includes(query))
        : allFiles;

      if (matches.length === 0) {
        fileListEl.replaceChildren(el('div', { className: 'empty', text: 'No matching files found.' }));
        updateSelectionUI();
        return;
      }

      const frag = document.createDocumentFragment();
      for (const item of matches.slice(0, 250)) {
        const checkbox = el('input', {
          type: 'checkbox',
          checked: selectedPaths.has(item.path),
          onchange: () => {
            if (checkbox.checked) selectedPaths.add(item.path);
            else selectedPaths.delete(item.path);
            updateSelectionUI();
          }
        });

        const quickBtn = el('button', {
          type: 'button',
          className: 'quick-paste',
          text: 'Paste',
          onclick: async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const text = await buildFilesPayload([item]);
            if (text) insertIntoAIStudio(text, item.name);
          }
        });

        frag.append(
          el(
            'label',
            { className: 'file-item' },
            checkbox,
            el('span', { className: 'file-path', text: item.path, title: item.path }),
            el('span', { className: 'file-size', text: formatSize(item.size) }),
            quickBtn
          )
        );
      }

      fileListEl.replaceChildren(frag);
      updateSelectionUI();
    }

    async function buildFilesPayload(items) {
      const blocks = [];
      let skipped = 0;

      for (const item of items) {
        const file = await item.handle.getFile();
        if (file.size > MAX_FILE_BYTES) {
          skipped++;
          continue;
        }
        const content = await file.text();
        if (content.includes('\u0000')) {
          skipped++;
          continue;
        }

        let fence = '```';
        while (content.includes(fence)) fence += '`';

        const lang = getLang(item.name);
        const body = content.replace(/\r\n/g, '\n').replace(/\n$/, '');
        blocks.push(`${item.path}\n${fence}${lang}\n${body}\n${fence}`);
      }

      if (skipped > 0) setStatus(`Skipped ${skipped} binary/oversized file(s)`, true);
      return blocks.join('\n\n');
    }

    function insertIntoAIStudio(textToInsert, label) {
      const selectors = [
        'ms-prompt-input-wrapper textarea',
        'footer ms-autosize-textarea textarea',
        'textarea[aria-label*="prompt" i]',
        'ms-autosize-textarea textarea'
      ];

      let textarea = null;
      for (const sel of selectors) {
        const candidates = Array.from(document.querySelectorAll(sel));
        textarea = candidates.find(el => el.offsetParent !== null && !el.closest('.cdk-overlay-container'));
        if (textarea) break;
      }

      if (!textarea) {
        navigator.clipboard.writeText(textToInsert);
        setStatus(`Copied ${label} (prompt box not found)`);
        return;
      }

      const current = textarea.value || '';
      const nextValue = current.trim().length > 0
        ? `${current.replace(/\s+$/, '')}\n\n${textToInsert}`
        : textToInsert;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      ).set;

      nativeSetter.call(textarea, nextValue);
      textarea.focus();
      textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      textarea.scrollTop = textarea.scrollHeight;

      setStatus(`Pasted ${label}`);
    }

    panel.addEventListener('click', async (e) => {
      if (!needsUnlock || !rootHandle) return;
      const path = e.composedPath();
      if (path.includes(selectFolderBtn) || path.includes(closeBtn)) return;

      needsUnlock = false;
      try {
        const perm = await rootHandle.requestPermission({ mode: 'read' });
        if (perm === 'granted') {
          await loadProject();
        } else {
          needsUnlock = true;
        }
      } catch {
        needsUnlock = true;
      }
    });

    selectFolderBtn.addEventListener('click', async () => {
      try {
        const handle = await window.showDirectoryPicker({
          id: 'clean-aistudio-context',
          mode: 'read'
        });
        rootHandle = handle;
        selectedPaths.clear();
        folderNameEl.textContent = handle.name;
        await saveDirHandle(handle);
        await loadProject();
      } catch (err) {
        if (err.name !== 'AbortError') setStatus(err.message, true);
      }
    });

    refreshBtn.addEventListener('click', () => loadProject());
    closeBtn.addEventListener('click', () => setOpen(false));
    searchInput.addEventListener('input', () => renderFileList());

    pasteTreeBtn.addEventListener('click', () => insertIntoAIStudio(treeText, 'tree'));
    copyTreeBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(treeText);
      setStatus('Copied tree');
    });

    clearBtn.addEventListener('click', () => {
      selectedPaths.clear();
      renderFileList();
    });

    copyFilesBtn.addEventListener('click', async () => {
      const items = allFiles.filter(f => selectedPaths.has(f.path));
      const payload = await buildFilesPayload(items);
      if (payload) {
        await navigator.clipboard.writeText(payload);
        setStatus(`Copied ${items.length} file(s)`);
      }
    });

    pasteFilesBtn.addEventListener('click', async () => {
      const items = allFiles.filter(f => selectedPaths.has(f.path));
      const payload = await buildFilesPayload(items);
      if (payload) insertIntoAIStudio(payload, `${items.length} file(s)`);
    });

    function setOpen(next) {
      isOpen = next;
      host.style.display = isOpen ? 'block' : 'none';
      if (isOpen && !searchInput.readOnly) {
        requestAnimationFrame(() => searchInput.focus());
      }
    }

    document.addEventListener('pointerdown', (e) => {
      if (isOpen && !dragState && !e.composedPath().includes(host)) setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (isOpen && e.key === 'Escape') setOpen(false);
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'TOGGLE_PANEL') setOpen(!isOpen);
    });

    (async () => {
      setOpen(true);
      rootHandle = await loadDirHandle();
      if (!rootHandle) return;

      folderNameEl.textContent = rootHandle.name;
      let perm = await rootHandle.queryPermission({ mode: 'read' });

      if (perm !== 'granted' && navigator.userActivation?.isActive) {
        try {
          perm = await rootHandle.requestPermission({ mode: 'read' });
        } catch {}
      }

      if (perm === 'granted') {
        await loadProject();
      } else {
        needsUnlock = true;
        fileListEl.replaceChildren(
          el('div', {
            className: 'empty clickable',
            text: `Click anywhere here to load "${rootHandle.name}"`
          })
        );
      }
    })();
  })();
}