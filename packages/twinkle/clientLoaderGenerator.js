const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CLIENT_DIR = path.resolve(__dirname, '../../client_packages');
const OUTPUT_FILE = path.join(CLIENT_DIR, 'loader.js');

const SCAN_DIRS = [
  'events',
];

const EXCLUDED_NAMES = new Set([
  'index.js',
  'loader.js',
  '__tests__',
  '__mocks__',
]);

const EXCLUDED_FILE_PATTERNS = [
  /\.test\.js$/i,
  /\.spec\.js$/i,
];

const EXTENSIONS = [
  '.js',
];

const LOAD_PRIORITY = [
  './events/hud/hudSnapshot.js',
  './events/interfaceLock.js',
  './events/ui/ui.loader.js',
  './events/ui/ui.state.js',
];

function waitForFileUnlock(delayMs) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  } catch {}
}

function writeLoaderIfChanged(content) {
  try {
    if (fs.readFileSync(OUTPUT_FILE, 'utf8') === content) return false;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`\x1b[33m[CLIENT LOADER]\x1b[0m Existing loader could not be read: ${error.message}`);
    }
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
      return true;
    } catch (error) {
      lastError = error;
      if (!['UNKNOWN', 'EPERM', 'EBUSY', 'EACCES'].includes(String(error?.code || '')) || attempt === 5) throw error;
      waitForFileUnlock(attempt * 75);
    }
  }
  throw lastError;
}

function sortByPriority(files) {
  const priority = new Map(LOAD_PRIORITY.map((file, index) => [file, index]));

  return [...files].sort((a, b) => {
    const aPriority = priority.has(a) ? priority.get(a) : Number.MAX_SAFE_INTEGER;
    const bPriority = priority.has(b) ? priority.get(b) : Number.MAX_SAFE_INTEGER;

    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.localeCompare(b);
  });
}

function checkSyntax(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf8');

    new vm.Script(code, {
      filename: filePath,
    });

    return true;
  } catch (err) {
    console.error(`\x1b[31m[CLIENT SYNTAX ERROR]\x1b[0m ${filePath}`);
    console.error(err.message);

    return false;
  }
}

function scanDir(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    console.log(`\x1b[33m[CLIENT LOADER]\x1b[0m Folder not found: ${dir}`);
    return files;
  }

  for (const item of fs.readdirSync(dir)) {
    if (EXCLUDED_NAMES.has(item.toLowerCase())) continue;

    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...scanDir(fullPath));
      continue;
    }

    if (!EXTENSIONS.includes(path.extname(item))) continue;
    if (EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(item))) continue;

    if (!checkSyntax(fullPath)) continue;

    const relativePath = './' + path
      .relative(CLIENT_DIR, fullPath)
      .replace(/\\/g, '/');

    files.push(relativePath);
  }

  return files;
}

function generateClientLoader() {
  const files = [];

  console.log('\x1b[36m[CLIENT LOADER]\x1b[0m Generating...');

  for (const folder of SCAN_DIRS) {
    const folderPath = path.join(CLIENT_DIR, folder);

    console.log(`\x1b[36m[SCAN]\x1b[0m ${folderPath}`);

    const scanned = scanDir(folderPath);

    files.push(...scanned);
  }

  const orderedFiles = sortByPriority(files);

  const content = `// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.

const files = ${JSON.stringify(orderedFiles, null, 2)};

const loaded = [];
const failed = [];

for (const file of files) {
  try {
    require(file);

    loaded.push(file);

    if (typeof mp !== 'undefined' && mp.console) {
      mp.console.logInfo(\`[CLIENT LOADED] \${file}\`);
    }
  } catch (e) {
    failed.push({
      file,
      error: e && e.message ? e.message : String(e),
    });

    if (typeof mp !== 'undefined' && mp.console) {
      mp.console.logError(\`[CLIENT ERROR] \${file}: \${e.message}\`);
    }
  }
}

if (typeof mp !== 'undefined' && mp.console) {
  mp.console.logInfo(
    \`[CLIENT LOADER] Loaded: \${loaded.length}, Failed: \${failed.length}\`
  );
}

global.clientLoaderStatus = {
  loaded,
  failed,
};
`;

  const changed = writeLoaderIfChanged(content);

  console.log(
    `\x1b[32m[CLIENT LOADER]\x1b[0m ${changed ? 'Generated' : 'Already current'}: ${orderedFiles.length} valid client files`
  );
}

module.exports = {
  generateClientLoader,
};
