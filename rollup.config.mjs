import { nodeResolve } from '@rollup/plugin-node-resolve';

export default [
	// ES Module build
	{
		input: 'lib/index.mjs',
		output: {
			file: 'dist/index.mjs',
			format: 'es'
		},
		plugins: [nodeResolve()],
		external: ['redis'] // Don't bundle external dependencies
	},
	// CommonJS build
	{
		input: 'lib/index.mjs',
		output: {
			file: 'dist/index.cjs',
			format: 'cjs',
			exports: 'named'
		},
		plugins: [nodeResolve()],
		external: ['redis']
	}
];