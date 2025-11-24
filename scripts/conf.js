// scripts/conf.js
const CONF = {
	baseDir: "'/",
	codeDelimit: `/`,
	counterFile: 'counter.json',
	baseSymbols:
		'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
	encoding: 'base62',
	dataExt: '.json',
	indexFile: 'index.json',
	useHashFiles: true,
	hashAlgo: 'sha512',
	github: {
		owner: 'SEU_USUARIO',
		repo: 'SEU_REPOSITORIO',
		mainBranch: 'main',
		liveBranch: 'live',
	},
	paths: {
		scripts: './scripts/',
		dbRoot: "./'/",
	},
	canonical: {
		acceptedProtocols: ['http', 'https', 'ftp'],
		defaultPorts: { http: 80, https: 443, ftp: 21 },
		rejectHosts: ['localhost', '127.0.0.1', '::1'],
	},
};

export default CONF;

if (typeof window !== 'undefined') {
	window.CONF = CONF;
} else if (typeof module !== 'undefined' && module.exports) {
	module.exports = CONF;
}
