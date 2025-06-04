const fs = require('fs');
const path = require('path');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
let missing = [];
function checkFile(file) {
  if (!exists(file)) missing.push(file);
}
// action default_popup and icon
if (manifest.action) {
  if (manifest.action.default_popup) checkFile(manifest.action.default_popup);
  if (manifest.action.default_icon) checkFile(manifest.action.default_icon);
}
// content scripts
if (manifest.content_scripts) {
  for (const cs of manifest.content_scripts) {
    if (cs.js) cs.js.forEach(checkFile);
    if (cs.css) cs.css.forEach(checkFile);
  }
}
// web accessible resources
if (manifest.web_accessible_resources) {
  for (const war of manifest.web_accessible_resources) {
    for (const r of war.resources) {
      // if pattern ends with /*, check directory exists
      if (r.endsWith('/*')) {
        const dir = r.slice(0, -2);
        if (!exists(dir)) missing.push(r);
      } else {
        checkFile(r);
      }
    }
  }
}
if (manifest.options_page) checkFile(manifest.options_page);
if (manifest.background && manifest.background.service_worker) {
  checkFile(manifest.background.service_worker);
}
if (missing.length) {
  console.error('Missing files:', missing.join(', '));
  process.exit(1);
} else {
  console.log('All referenced files exist.');
}
