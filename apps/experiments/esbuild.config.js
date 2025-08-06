import esbuild from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';

const build = async () => {
  try {
    await esbuild.build({
      entryPoints: ['./src/main.ts'],
      bundle: true,
      platform: 'node',
      target: 'node22',
      outfile: 'dist/main.js',
      format: 'esm',
      // Keep node_modules external to avoid bundling them
      plugins: [
        nodeExternalsPlugin({
          allowList: [
            // Bundle local workspace packages
            '@the-project-b/rita-graphs',
            '@the-project-b/graphql'
          ]
        })
      ],
      // Source maps for debugging
      sourcemap: process.env.NODE_ENV === 'production' ? false : 'inline',
      // Minify for production
      minify: process.env.NODE_ENV === 'production',
      // Handle TypeScript and resolve .js extensions properly
      loader: {
        '.ts': 'ts',
        '.gql': 'text'
      },
      resolveExtensions: ['.ts', '.js', '.json'],
      // Keep names for better stack traces
      keepNames: true,
      // Banner for ESM compatibility
      banner: {
        js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`
      }
    });
    
    console.log('✅ Build completed successfully');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
};

build();