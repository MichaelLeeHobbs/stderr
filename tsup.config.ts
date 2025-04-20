// tsup.config.ts
import {defineConfig} from 'tsup';

export default defineConfig({
    tsconfig: 'tsconfig.json',
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
});
