// Moves all root-level .md files (except README.md) into ./documentation
// Usage: node scripts/move-root-markdown.js
const fs = require('fs');
const path = require('path');

(function main() {
  const root = path.resolve(__dirname, '..');
  const docsDir = path.join(root, 'documentation');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md') && e.name.toLowerCase() !== 'readme.md')
    .map((e) => e.name);

  if (mdFiles.length === 0) {
    console.log('No root-level .md files to move.');
    return;
  }

  for (const name of mdFiles) {
    const from = path.join(root, name);
    const to = path.join(docsDir, name);
    try {
      // If destination exists, overwrite by unlinking then rename
      if (fs.existsSync(to)) fs.unlinkSync(to);
      fs.renameSync(from, to);
      console.log(`Moved: ${name} -> documentation/${name}`);
    } catch (err) {
      console.error(`Failed to move ${name}:`, err.message);
    }
  }

  console.log(`Moved ${mdFiles.length} markdown files to documentation/`);
})();
