import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';
export default defineConfig({
  resolve:{dedupe:['react','react-dom','react-pdf'],alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
  esbuild:{jsx:'automatic'},
  test:{environment:'jsdom',include:['tests/*.test.ts','tests/*.test.tsx'],setupFiles:['./tests/setup.ts']},
});
