module.exports = {
	apps: [
		{
			name:			'ses_web',
			namespace:		'ses',
			script:			'./app.js',
			watch:			'./',
			node_args:		'--env-file=.env',
			args:			'',
			ignore_watch:	['node_modules', '\.git', '\.idea', '\.vscode', '*.log', '*.md'],
		}
	]
}