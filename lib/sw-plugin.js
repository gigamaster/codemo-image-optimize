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
import { createHash } from 'crypto';
import { posix } from 'path';

const importPrefix = 'service-worker:';

export default function serviceWorkerPlugin({
  output = 'sw.js',
  basePath = '',
  filterAssets = () => true,
} = {}) {
  return {
    name: 'service-worker',
    async resolveId(id, importer) {
      if (!id.startsWith(importPrefix)) return;

      const plainId = id.slice(importPrefix.length);
      const result = await this.resolve(plainId, importer);
      if (!result) return;

      return importPrefix + result.id;
    },
    load(id) {
      if (!id.startsWith(importPrefix)) return;
      console.log('Resolving service worker import:', id);
      // Don't emit the file here, let generateBundle handle it
      return `// Service worker placeholder for ${id}`;
    },
    generateBundle(options, bundle) {
      // Debug: Log the bundle contents
      console.log('Bundle contents:', Object.keys(bundle));

      // Create the service worker code directly
      let swCode = `// Service worker code\n`;

      // Filter out the service worker file itself from the assets to cache
      const toCacheInSW = Object.values(bundle).filter(
        (item) => item.fileName !== output && filterAssets(item),
      );

      // Debug: Log the items to cache
      console.log(
        'Items to cache:',
        toCacheInSW.map((item) => item.fileName),
      );

      const urls = toCacheInSW.map((item) => {
        const relativePath =
          posix
            .relative(posix.dirname(output), item.fileName)
            .replace(/((?<=^|\/)index)?\.html?$/, '') || '.';

        // Add the base path prefix
        if (basePath) {
          // Check if the relativePath already starts with basePath to avoid double prefixing
          if (relativePath.startsWith(basePath + '/')) {
            return relativePath;
          } else if (relativePath === basePath) {
            return relativePath;
          } else if (relativePath.startsWith('/')) {
            return basePath + relativePath;
          } else if (relativePath !== '.') {
            return basePath + '/' + relativePath;
          }
          return basePath;
        }
        return relativePath;
      });

      const versionHash = createHash('sha1');
      for (const item of toCacheInSW) {
        versionHash.update(item.code || item.source);
      }
      const version = versionHash.digest('hex');

      swCode =
        `const ASSETS = ${JSON.stringify(urls, null, '  ')};\n` +
        `const VERSION = ${JSON.stringify(version)};\n` +
        swCode;

      // Emit the service worker as an asset with the correct fileName
      console.log('Emitting service worker asset with fileName:', output);
      this.emitFile({
        type: 'asset',
        source: swCode,
        fileName: output,
      });
    },
  };
}
