const webpack = require('webpack')
const path = require('path')
const html = require('html-webpack-plugin')
const package = require('./package.json')

module.exports = module.exports = (env, options) => {
	webpackConfig = {
		entry: './src/index.ts',
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					use: 'ts-loader',
					exclude: /node_modules/
				},
				{
					// Eager stylesheets (injected on load). The `?lazy` ones are
					// handled by the rule below so the dark theme can be toggled.
					test: /\.(less|css)$/i,
					resourceQuery: { not: [/lazy/] },
					use: [
						{
							loader: "style-loader",
						},
						{
							loader: "css-loader",
						},
						{
							loader: "less-loader",
							options: {
								lessOptions: {
									paths: [path.resolve(__dirname, "node_modules")],
								}
							}
						}
					]
				},
				{
					// Lazy stylesheets: the imported module exposes .use()/.unuse()
					// so we can toggle the dark theme at runtime (see index.ts).
					test: /\.(less|css)$/i,
					resourceQuery: /lazy/,
					use: [
						{
							loader: "style-loader",
							options: {
								injectType: "lazyStyleTag",
							},
						},
						{
							loader: "css-loader",
						},
						{
							loader: "less-loader",
							options: {
								lessOptions: {
									paths: [path.resolve(__dirname, "node_modules")],
								}
							}
						}
					]
				}
			]
		},
		resolve: {
			extensions: ['.tsx', '.ts', '.js',],
		},
		mode: 'production',
		optimization: {
			minimize: false,
			usedExports: false,
			mangleExports: false,
		},
		plugins: [
			new html({
				title: package.name,
				template: 'src/index.html'
			})
		],
		output: {
			filename: 'stackmanager.js',
			path: path.resolve(__dirname, 'dist'),
			publicPath: '/',
		},
	}
	if (process.env.APP_MODE == 'dev') {
		// Dev config: HMR is served in-process by the Node server via
		// webpack-dev-middleware + webpack-hot-middleware (no webpack-dev-server).
		webpackConfig['mode'] = 'development';
		webpackConfig['devtool'] = 'inline-source-map';
		webpackConfig['entry'] = ['webpack-hot-middleware/client?reload=true', './src/index.ts'];
		webpackConfig['plugins'].push(new webpack.HotModuleReplacementPlugin());
	}

	return webpackConfig;
}
