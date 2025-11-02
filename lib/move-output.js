/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// Move .tmp/build/static to build/
const fs = require('fs');
const del = require('del');
const path = require('path');

del.sync('build');
// Use copy instead of rename since we're copying the entire directory
const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      // Read the file content
      let content = fs.readFileSync(srcPath, 'utf8');

      // Process AMD module files that might contain service-worker:sw references
      if (entry.name.includes('sw-bridge') && entry.name.endsWith('.js')) {
        const basePath = process.env.BASE_PATH || '';
        const swPath = basePath ? basePath + '/static/sw.js' : '/static/sw.js';
        // Replace AMD module definition pattern
        content = content.replace(
          /"service-worker:sw"/g,
          JSON.stringify(swPath),
        );
        // Also replace any other instances
        content = content.replace(/service-worker:sw/g, swPath);
      }

      // Write the processed content
      fs.writeFileSync(destPath, content);
    }
  }
};

// Copy the contents of .tmp/build/static to build/
copyDir(path.join('.tmp', 'build', 'static'), 'build');
