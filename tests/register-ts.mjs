import { existsSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testsDir, '..');
const srcSharedDir = resolve(projectRoot, 'src/shared');
const srcRendererDir = resolve(projectRoot, 'src/renderer/src');

function resolveWithTsFallback(candidatePath) {
  const candidates = extname(candidatePath)
    ? [candidatePath]
    : [
        `${candidatePath}.ts`,
        `${candidatePath}.tsx`,
        resolve(candidatePath, 'index.ts'),
        candidatePath
      ];

  for (const filePath of candidates) {
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return pathToFileURL(filePath).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@shared/')) {
      const target = resolve(srcSharedDir, specifier.slice('@shared/'.length));
      const url = resolveWithTsFallback(target);
      if (url) return { url, shortCircuit: true };
    }

    if (specifier.startsWith('@renderer/')) {
      const target = resolve(
        srcRendererDir,
        specifier.slice('@renderer/'.length)
      );
      const url = resolveWithTsFallback(target);
      if (url) return { url, shortCircuit: true };
    }

    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file://')
    ) {
      const parentDir = dirname(fileURLToPath(context.parentURL));
      const target = resolve(parentDir, specifier);
      if (!extname(target)) {
        const url = resolveWithTsFallback(target);
        if (url) return { url, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  }
});
