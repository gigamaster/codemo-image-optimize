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

// Use copy instead of rename since we're copying the entire directory
const copyDir = (src, dest) => {
  // Check if source directory exists
  if (!fs.existsSync(src)) {
    console.log(`Source directory ${src} does not exist, skipping copy`);
    return;
  }

  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

// Copy the contents of .tmp/build/static to build/
const staticSrc = path.join('.tmp', 'build', 'static');
const buildDest = 'build';

// Delete the build directory if it exists
if (fs.existsSync(buildDest)) {
  del.sync(buildDest);
}

// Copy static directory contents
copyDir(staticSrc, buildDest);
