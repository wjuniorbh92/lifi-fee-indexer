import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		swc.vite({
			jsc: {
				parser: {
					syntax: 'typescript',
					decorators: true,
				},
				transform: {
					legacyDecorator: true,
					decoratorMetadata: true,
				},
			},
		}),
	],
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.spec.ts'],
		exclude: ['src/**/*.e2e.spec.ts'],
		setupFiles: ['src/test-setup.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.spec.ts', 'src/**/*.d.ts'],
		},
	},
});
