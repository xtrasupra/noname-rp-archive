const fs = require('fs');
const path = require('path');

const RUNTIME_EXCLUDED_DIRECTORIES = new Set(['__tests__', '__mocks__']);
const RUNTIME_TEST_FILE_PATTERN = /\.(?:test|spec)\.js$/i;

function loadDir(dir, options = {}) {
  const {
    exclude = [],
    extensions = ['.js'],
    recursive = true,
    baseDir = dir
  } = options;

  if (!fs.existsSync(dir)) return;

  for (const file of fs.readdirSync(dir)) {
    if (exclude.includes(file) || RUNTIME_EXCLUDED_DIRECTORIES.has(file)) continue;

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (recursive) {
        loadDir(fullPath, { ...options, baseDir });
      }
      continue;
    }

    if (!extensions.includes(path.extname(file)) || RUNTIME_TEST_FILE_PATTERN.test(file)) continue;

    const relativePath = path
      .relative(baseDir, fullPath)
      .replace(/\\/g, '/');

    try {
      require(fullPath);
      console.log(`\x1b[32m[LOADED]\x1b[0m ${relativePath}`);
    } catch (err) {
      console.error(`\x1b[31m[ERROR]\x1b[0m ${relativePath}`);
      console.error(err);
    }
  }
}

module.exports = { loadDir };
