import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(apiRoot, 'resources', 'generation', 'templates');
const outputRoot = join(apiRoot, 'dist', 'resources', 'generation', 'templates');

await mkdir(outputRoot, { recursive: true });
await cp(sourceRoot, outputRoot, { recursive: true, force: true });

const registryModule = await import(
  pathToFileURL(
    join(
      apiRoot,
      'dist',
      'generation',
      'templates',
      'generation-template-registry.js',
    ),
  ).href
);
const loaderModule = await import(
  pathToFileURL(
    join(
      apiRoot,
      'dist',
      'generation',
      'templates',
      'generation-template-loader.js',
    ),
  ).href
);

const outputRootUrl = pathToFileURL(`${outputRoot}${sep}`);
const loader = new loaderModule.GenerationTemplateLoader([outputRootUrl]);

await Promise.all(
  registryModule.generationTemplateRegistry.map((descriptor) =>
    loader.load(descriptor.documentType, descriptor.language),
  ),
);

console.log(
  `Packaged and verified ${registryModule.generationTemplateRegistry.length} Generation templates.`,
);
