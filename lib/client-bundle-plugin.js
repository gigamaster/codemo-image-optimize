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
import rollup from 'rollup';
import * as path from 'path';

const prefix = 'client-bundle:';
const entryPathPlaceholder = 'CLIENT_BUNDLE_PLUGIN_ENTRY_PATH';
const importsPlaceholder = 'CLIENT_BUNDLE_PLUGIN_IMPORTS';
const allSrcPlaceholder = 'CLIENT_BUNDLE_PLUGIN_ALL_SRC';

export function getDependencies(clientOutput, item) {
  const crawlDependencies = new Set([item.fileName]);
  const referencedFiles = new Set();

  for (const fileName of crawlDependencies) {
    const chunk = clientOutput.find((v) => v.fileName === fileName);

    for (const dep of chunk.imports) {
      crawlDependencies.add(dep);
    }

    for (const dep of chunk.referencedFiles) {
      referencedFiles.add(dep);
    }
  }

  // Don't add self as dependency
  crawlDependencies.delete(item.fileName);

  // Merge referencedFiles as regular deps. They need to be in the same Set as
  // some JS files might appear in both lists and need to be deduped too.
  //
  // Didn't do this as part of the main loop since their `chunk` can't have
  // nested deps and sometimes might be missing altogether, depending on type.
  for (const dep of referencedFiles) {
    crawlDependencies.add(dep);
  }

  return [...crawlDependencies];
}

export default function (inputOptions, outputOptions, resolveFileUrl) {
  let cache;
  let entryPointPlaceholderMap;
  let exportCounter;
  let clientBundle;
  let clientOutput;

  // Define the service worker prefix
  const serviceWorkerPrefix = 'service-worker:';

  return {
    name: 'client-bundle',
    buildStart() {
      entryPointPlaceholderMap = new Map();
      exportCounter = 0;
    },
    async resolveId(id, importer) {
      // Handle service-worker: prefix
      if (id.startsWith(serviceWorkerPrefix)) {
        // For service worker imports, we don't resolve them as modules
        // but instead treat them as external dependencies that will be resolved at runtime
        return id;
      }

      if (!id.startsWith(prefix)) return null;

      const realId = id.slice(prefix.length);
      const resolveResult = await this.resolve(realId, importer);
      // Add an additional .js to the end so it ends up with .js at the end in the _virtual folder.
      if (resolveResult) return prefix + resolveResult.id + '.js';
      // This Rollup couldn't resolve it, but maybe the inner one can.
      return id + '.js';
    },
    load(id) {
      // Handle service-worker: prefix
      if (id.startsWith(serviceWorkerPrefix)) {
        // For service worker imports, we provide a placeholder that will be resolved at runtime
        const swName = id.slice(serviceWorkerPrefix.length);
        return `// Service worker placeholder for ${swName}
        export default 'service-worker:${swName}';`;
      }

      if (!id.startsWith(prefix)) return;

      const realId = id.slice(prefix.length, -'.js'.length);

      exportCounter++;

      entryPointPlaceholderMap.set(exportCounter, realId);

      return [
        `export default import.meta.${entryPathPlaceholder + exportCounter};`,
        `export const imports = import.meta.${
          importsPlaceholder + exportCounter
        };`,
        `export const allSrc = import.meta.${
          allSrcPlaceholder + exportCounter
        };`,
      ].join('\n');
    },
    async buildEnd(error) {
      const entryPoints = [...entryPointPlaceholderMap.values()];
      // The static-build is done, so now we can perform our client build.
      // Exit early if there's nothing to build.
      if (error || entryPoints.length === 0) return;

      clientBundle = await rollup.rollup({
        ...inputOptions,
        cache,
        input: entryPoints,
      });

      cache = clientBundle.cache;
    },
    async renderStart(staticBuildOutputOpts) {
      // The static-build has started generating output, so we can do the same for our client build.
      // Exit early if there's nothing to build.
      if (!clientBundle) return;
      const copiedOutputOptions = {
        assetFileNames: staticBuildOutputOpts.assetFileNames,
      };
      clientOutput = (
        await clientBundle.generate({
          ...copiedOutputOptions,
          ...outputOptions,
        })
      ).output;
    },
    resolveImportMeta(property, { moduleId, format }) {
      // Pick up the placeholder exports we created earlier, and fill in the correct details.
      let num = undefined;

      if (property.startsWith(entryPathPlaceholder)) {
        num = Number(property.slice(entryPathPlaceholder.length));
      } else if (property.startsWith(importsPlaceholder)) {
        num = Number(property.slice(importsPlaceholder.length));
      } else if (property.startsWith(allSrcPlaceholder)) {
        num = Number(property.slice(allSrcPlaceholder.length));
      } else {
        // This isn't one of our placeholders.
        return;
      }

      const id = path.normalize(entryPointPlaceholderMap.get(num));
      const clientEntry = clientOutput.find(
        (item) =>
          item.facadeModuleId && path.normalize(item.facadeModuleId) === id,
      );

      if (property.startsWith(entryPathPlaceholder)) {
        // Check if this is a service worker import
        if (id && id.startsWith(serviceWorkerPrefix)) {
          // For service worker imports, resolve to the correct URL
          const swName = id.slice(serviceWorkerPrefix.length);
          // Use the resolveFileUrl function to get the correct path
          // We need to create a mock fileName for the service worker
          const mockFileName = `static/sw.js`;
          return resolveFileUrl({
            fileName: mockFileName,
            moduleId,
            format,
          });
        }

        return resolveFileUrl({
          fileName: clientEntry.fileName,
          moduleId,
          format,
        });
      }

      const dependencies = getDependencies(clientOutput, clientEntry);

      if (property.startsWith(allSrcPlaceholder)) {
        const allModules = [
          clientEntry,
          ...dependencies
            .map((name) => clientOutput.find((item) => item.fileName === name))
            .filter((item) => item.code),
        ];

        const inlineDefines = [
          ...allModules.map((item) => {
            // Check if this is a service worker module
            if (
              item.facadeModuleId &&
              item.facadeModuleId.startsWith(serviceWorkerPrefix)
            ) {
              const swName = item.facadeModuleId.slice(
                serviceWorkerPrefix.length,
              );
              const mockFileName = `static/sw.js`;
              return `self.nextDefineUri=location.origin+${resolveFileUrl({
                fileName: mockFileName,
              })};${item.code}`;
            }
            return `self.nextDefineUri=location.origin+${resolveFileUrl(
              item,
            )};${item.code}`;
          }),
          'self.nextDefineUri=""',
        ];

        return JSON.stringify(inlineDefines.join(''));
      }

      return (
        '[' +
        dependencies
          .map((item) => {
            const entry = clientOutput.find((v) => v.fileName === item);

            // Check if this is a service worker module
            if (
              entry.facadeModuleId &&
              entry.facadeModuleId.startsWith(serviceWorkerPrefix)
            ) {
              const swName = entry.facadeModuleId.slice(
                serviceWorkerPrefix.length,
              );
              const mockFileName = `static/sw.js`;
              return resolveFileUrl({
                fileName: mockFileName,
                moduleId,
                format: outputOptions.format,
              });
            }

            return resolveFileUrl({
              fileName: entry.fileName,
              moduleId,
              format: outputOptions.format,
            });
          })
          .join(',') +
        ']'
      );
    },
    async generateBundle(options, bundle) {
      // Exit early if there's nothing to build.
      if (!clientOutput) return;
      // Copy everything from the client bundle into the main bundle.
      for (const clientEntry of clientOutput) {
        // Skip if the file already exists
        if (clientEntry.fileName in bundle) continue;

        this.emitFile({
          type: 'asset',
          source: clientEntry.code || clientEntry.source,
          fileName: clientEntry.fileName,
        });
      }
    },
  };
}
