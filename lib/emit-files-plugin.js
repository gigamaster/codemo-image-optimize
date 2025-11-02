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
import * as path from 'path';
import { promises as fs } from 'fs';
import glob from 'glob';
import { promisify } from 'util';

const globP = promisify(glob);

export default function emitFiles({
  root,
  include,
  basePath = '',
  processFile,
}) {
  return {
    name: 'emit-files-plugin',
    async buildStart() {
      const paths = await globP(include, { nodir: true, cwd: root });

      await Promise.all(
        paths.map(async (filePath) => {
          // Skip the existing sw.js file to avoid conflict with the generated one
          if (filePath === 'sw.js') {
            return;
          }

          let source = await fs.readFile(path.join(root, filePath));

          // Convert to string for processing
          let sourceStr = source.toString();

          // Process sw-bridge file to replace hardcoded serviceworker.js path
          if (filePath.includes('sw-bridge')) {
            // Replace with the correct path for the service worker
            const swPath = basePath
              ? `${basePath}/static/sw.js`
              : '/static/sw.js';
            // First try to replace the original pattern
            sourceStr = sourceStr.replace(
              /n\.p\s*\+\s*(['"])serviceworker\.js\1/g,
              `n.p + $1${swPath}$1`,
            );
            // Then try to replace any processed pattern
            sourceStr = sourceStr.replace(
              /n\.p\s*\+\s*(['"])[^'"]*?(?:static\/sw\.js)[^'"]*?\1/g,
              `n.p + $1${swPath}$1`,
            );
            // Add a new regex to match the service-worker:sw.js pattern
            sourceStr = sourceStr.replace(
              /['"]service-worker:sw\.js['"]/g,
              JSON.stringify(swPath),
            );
          }

          // Apply custom processFile function if provided
          if (processFile) {
            sourceStr = processFile(sourceStr, filePath);
          }

          return this.emitFile({
            type: 'asset',
            source: sourceStr,
            fileName: 'static/' + filePath,
          });
        }),
      );
    },
  };
}
