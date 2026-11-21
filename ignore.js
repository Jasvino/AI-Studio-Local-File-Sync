if (!globalThis.__cleanAIStudioIgnore) {
  globalThis.__cleanAIStudioIgnore = (() => {
    const MAX_FILE_BYTES = 512 * 1024;

    const ALWAYS_IGNORE_DIRS = new Set([
      '.git', 'node_modules', '.next', '.nuxt', '.svelte-kit', '.astro',
      'dist', 'build', 'out', 'target', 'coverage', '__pycache__',
      '.pytest_cache', '.mypy_cache', '.venv', 'venv', 'env', '.idea', '.vscode',
      '.turbo', '.cache', 'vendor', 'Pods'
    ]);

    const ALWAYS_IGNORE_FILES = new Set([
      '.DS_Store', 'Thumbs.db', 'package-lock.json', 'yarn.lock',
      'pnpm-lock.yaml', 'bun.lockb', 'Cargo.lock', 'poetry.lock',
      'composer.lock', 'Gemfile.lock', '.npmrc', '.pypirc', '.netrc',
      'credentials.json'
    ]);

    const BINARY_EXTENSIONS = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tiff', 'avif',
      'mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'ogg', 'flac',
      'woff', 'woff2', 'ttf', 'otf', 'eot', 'zip', 'tar', 'gz', '7z',
      'rar', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'exe',
      'dll', 'so', 'dylib', 'bin', 'wasm', 'pyc', 'pyo', 'class', 'o',
      'a', 'lib', 'db', 'sqlite', 'sqlite3'
    ]);

    function isAlwaysIgnored(name, isDir) {
      if (isDir) return ALWAYS_IGNORE_DIRS.has(name);
      if (ALWAYS_IGNORE_FILES.has(name)) return true;

      if (/^\.env(\..+)?$/i.test(name) && !/^\.env\.(example|sample|template)$/i.test(name)) {
        return true;
      }
      if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(name)) return true;
      if (/^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i.test(name)) return true;
      if (/^service[-_]?account.*\.json$/i.test(name)) return true;

      const dotIdx = name.lastIndexOf('.');
      if (dotIdx !== -1 && BINARY_EXTENSIONS.has(name.slice(dotIdx + 1).toLowerCase())) {
        return true;
      }
      return false;
    }

    function globToRegex(pattern, anchored) {
      const tokenized = pattern
        .replace(/\*\*\//g, '__GLOBSTAR_SLASH__')
        .replace(/\*\*/g, '__GLOBSTAR__')
        .replace(/\*/g, '__STAR__')
        .replace(/\?/g, '__QMARK__')
        .replace(/[.+^${}()|[\]\\]/g, '\\$&');

      const body = tokenized
        .replace(/__GLOBSTAR_SLASH__/g, '(?:.*/)?')
        .replace(/__GLOBSTAR__/g, '.*')
        .replace(/__STAR__/g, '[^/]*')
        .replace(/__QMARK__/g, '[^/]');

      return anchored
        ? new RegExp(`^${body}(?:/.*)?$`)
        : new RegExp(`(?:^|/)${body}(?:/.*)?$`);
    }

    async function readGitignoreRules(dirHandle, baseRelPath) {
      try {
        const fh = await dirHandle.getFileHandle('.gitignore');
        const text = await (await fh.getFile()).text();
        const rules = [];

        for (const rawLine of text.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) continue;

          let negate = false;
          let pat = line;

          if (pat.startsWith('!')) {
            negate = true;
            pat = pat.slice(1);
          } else if (pat.startsWith('\\#') || pat.startsWith('\\!')) {
            pat = pat.slice(1);
          }
          if (!pat) continue;

          const dirOnly = pat.endsWith('/');
          if (dirOnly) pat = pat.slice(0, -1);

          const hadLeadingSlash = pat.startsWith('/');
          if (hadLeadingSlash) pat = pat.slice(1);
          if (!pat) continue;

          const anchored = hadLeadingSlash || pat.includes('/');
          rules.push({
            baseRelPath,
            negate,
            dirOnly,
            regex: globToRegex(pat, anchored)
          });
        }
        return rules;
      } catch {
        return [];
      }
    }

    function isGitIgnored(fullRelPath, isDir, rules) {
      let ignored = false;
      for (const rule of rules) {
        let localPath = fullRelPath;
        if (rule.baseRelPath) {
          const prefix = `${rule.baseRelPath}/`;
          if (!fullRelPath.startsWith(prefix)) continue;
          localPath = fullRelPath.slice(prefix.length);
        }
        if (rule.dirOnly && !isDir && !localPath.includes('/')) continue;
        if (rule.regex.test(localPath)) ignored = !rule.negate;
      }
      return ignored;
    }

    return { MAX_FILE_BYTES, isAlwaysIgnored, isGitIgnored, readGitignoreRules };
  })();
}