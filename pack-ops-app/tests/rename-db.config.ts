import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['tests/rename-job-part.db.ts'],testTimeout:20000}});
