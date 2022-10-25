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
					test: /\.(less|css)$/i,
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
					test: /\.json$/i,
					loader: 'file'
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
		},
	}
	if (process.env.APP_MODE == 'dev') {
		// Dev config
		webpackConfig['mode'] = 'development';
		webpackConfig['devtool'] = 'inline-source-map';
		webpackConfig['devServer'] = {
			static: path.join(__dirname, 'dist'),
			compress: true,
			host: "0.0.0.0",
			allowedHosts: "all",
			port: 1337,
			client: {
				webSocketURL: `ws://${process.env.APP_DOMAIN}:${process.env.APP_PORT}/websocket`
			}
		};
	}

	return webpackConfig;
}
