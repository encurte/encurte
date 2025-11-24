// scripts/db.js
import fs from 'node:fs/promises';
import path from 'node:path';
import CONF from './conf.js';
import { ensureDir, posixJoin, hash } from './utils.js';

async function readJsonFs(file) {
	try {
		const s = await fs.readFile(file, 'utf8');
		return JSON.parse(s);
	} catch {
		return null;
	}
}
async function writeJsonFs(file, obj) {
	await ensureDir(path.dirname(file));
	await fs.writeFile(file, JSON.stringify(obj, null, 2), 'utf8');
}

// ---- domain meta management ----
async function ensureDomainLocal(domainKey) {
	// ensure counters root
	const domainsMetaDir = path.resolve(CONF.paths.domainsMeta);
	await ensureDir(domainsMetaDir);

	const h = await hashHex(domainKey);
	const metaFile = path.join(domainsMetaDir, `${h}.json`);
	let meta = await readJsonFs(metaFile);
	if (meta && meta.id) return meta;

	// create new global domain id (count files in domainsMetaDir)
	const files = await fs.readdir(domainsMetaDir).catch(() => []);
	const next = files.length;
	const id = d10ToBase(next);
	meta = { id, key: domainKey, created_at: new Date().toISOString() };
	await writeJsonFs(metaFile, meta);

	// create domain folder with counter.json and paths dir
	const domainDir = path.resolve(CONF.baseDir, id);
	await ensureDir(domainDir);
	await writeJsonFs(path.join(domainDir, 'counter.json'), {
		nextPath: 0,
		nextQuery: 0,
	});
	await ensureDir(path.join(domainDir, 'paths'));
	return meta;
}

async function ensurePathLocal(domainId, pathKey) {
	const domainDir = path.resolve(CONF.baseDir, domainId);
	const counterFile = path.join(domainDir, 'counter.json');
	const counter = (await readJsonFs(counterFile)) || {
		nextPath: 0,
		nextQuery: 0,
	};
	const pathsDir = path.join(domainDir, 'paths');
	await ensureDir(pathsDir);

	const h = await hashHex(pathKey);
	const file = path.join(pathsDir, `${h}.json`);
	let meta = await readJsonFs(file);
	if (meta && meta.id) return meta;

	const idNum = counter.nextPath++;
	const id = d10ToBase(idNum);
	meta = { id, key: pathKey, created_at: new Date().toISOString() };
	await writeJsonFs(file, meta);
	await writeJsonFs(counterFile, counter);
	// create path subdir for queries
	await ensureDir(path.join(domainDir, id, 'queries'));
	return meta;
}

async function ensureQueryLocal(domainId, pathId, queryKey) {
	const domainDir = path.resolve(CONF.baseDir, domainId);
	const counterFile = path.join(domainDir, 'counter.json');
	const counter = (await readJsonFs(counterFile)) || {
		nextPath: 0,
		nextQuery: 0,
	};

	const queriesDir = path.join(domainDir, pathId, 'queries');
	await ensureDir(queriesDir);

	const h = await hashHex(queryKey);
	const file = path.join(queriesDir, `${h}.json`);
	let meta = await readJsonFs(file);
	if (meta && meta.id) return meta;

	const idNum = counter.nextQuery++;
	const id = d10ToBase(idNum);
	meta = { id, key: queryKey, created_at: new Date().toISOString() };
	await writeJsonFs(file, meta);
	await writeJsonFs(counterFile, counter);
	// create final dir for index
	await ensureDir(path.join(domainDir, pathId, id));
	return meta;
}

// ---- local addUrl ----
export async function addUrlLocal(
	canonicalUrl,
	{ user = 'unknown', issue = null } = {},
) {
	const u = new URL(canonicalUrl);
	const domainKey = `${u.protocol}//${u.hostname}${
		u.port ? ':' + u.port : ''
	}`;
	const pathKey = u.pathname || '/';
	const queryKey = u.search || '';

	// domain
	const domainMeta = await ensureDomainLocal(domainKey);
	const domainId = domainMeta.id;

	// path (scoped to domain)
	const pathMeta = await ensurePathLocal(domainId, pathKey);
	const pathId = pathMeta.id;

	// query (scoped to domain/path)
	const queryMeta = await ensureQueryLocal(
		domainId,
		pathId,
		queryKey,
	);
	const queryId = queryMeta.id;

	// write index.json
	const index = {
		original: canonicalUrl,
		canonical: canonicalUrl,
		by: user,
		issue,
		created_at: new Date().toISOString(),
	};

	const indexFile = path.join(
		path.resolve(CONF.baseDir),
		domainId,
		pathId,
		queryId,
		CONF.indexFile,
	);
	await writeJsonFs(indexFile, index);

	return {
		code: `${domainId}/${pathId}/${queryId}`,
		domainId,
		pathId,
		queryId,
		indexFile,
	};
}

// ---- local resolve ----
export async function resolveLocal(code) {
	const parts = code.split('/').filter(Boolean);
	if (parts.length === 0) throw new Error('Código inválido');
	const [d, p, q] = parts;
	// try partial resolutions:
	const baseDir = path.resolve(CONF.baseDir);
	if (parts.length === 1) {
		// return domain meta if exists
		const domainDir = path.join(baseDir, d);
		const counter = await readJsonFs(
			path.join(domainDir, 'counter.json'),
		);
		return { domainId: d, counter };
	}
	if (parts.length === 2) {
		// list queries under path
		const pathDir = path.join(baseDir, d, p);
		const qfiles = await fs
			.readdir(path.join(baseDir, d, p))
			.catch(() => []);
		return { domainId: d, pathId: p, entries: qfiles };
	}
	if (parts.length === 3) {
		const indexFile = path.join(baseDir, d, p, q, CONF.indexFile);
		const data = await readJsonFs(indexFile);
		return data;
	}
	throw new Error('Formato de código desconhecido');
}

// ---- GitHub (Octokit) helpers (minimal, best-effort) ----
async function ghGetContent(octokit, owner, repo, path_) {
	try {
		const res = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: path_,
		});
		return res.data;
	} catch (err) {
		if (err.status === 404) return null;
		throw err;
	}
}
async function ghPutContent(
	octokit,
	owner,
	repo,
	branch,
	path_,
	contentStr,
	message,
	sha,
) {
	const params = {
		owner,
		repo,
		path: path_,
		message,
		content: Buffer.from(contentStr, 'utf8').toString('base64'),
		branch,
	};
	if (sha) params.sha = sha;
	const res = await octokit.rest.repos.createOrUpdateFileContents(
		params,
	);
	return res.data;
}

async function ensureLiveBranch(octokit) {
	const { owner, repo, mainBranch, liveBranch } = CONF.github;
	try {
		const live = await octokit.rest.repos.getBranch({
			owner,
			repo,
			branch: liveBranch,
		});
		return live.data.commit.sha;
	} catch (err) {
		// create from main
		const main = await octokit.rest.repos.getBranch({
			owner,
			repo,
			branch: mainBranch,
		});
		const baseSha = main.data.commit.sha;
		await octokit.rest.git.createRef({
			owner,
			repo,
			ref: `refs/heads/${liveBranch}`,
			sha: baseSha,
		});
		return baseSha;
	}
}

/**
 * addUrl using Octokit: we will create/update small JSON files under the repo.
 * For simplicity we write domain meta under CONF.paths.domainsMeta,
 * and each domain gets its own folder under CONF.baseDir (like local).
 *
 * This implementation is best-effort and uses getContent + createOrUpdateFileContents.
 */
export async function addUrlGitHub(
	canonicalUrl,
	{ octokit, user = 'unknown', issue = null } = {},
) {
	const { owner, repo, liveBranch } = CONF.github;

	// ensure live branch exists
	await ensureLiveBranch(octokit);

	const u = new URL(canonicalUrl);
	const domainKey = `${u.protocol}//${u.hostname}${
		u.port ? ':' + u.port : ''
	}`;
	const pathKey = u.pathname || '/';
	const queryKey = u.search || '';

	// 1) domain meta (counters/domains/<hash>.json)
	const domainHash = await hashHex(domainKey);
	const domainMetaPath = posixJoin(
		CONF.paths.domainsMeta,
		`${domainHash}.json`,
	);
	let domainMeta = await ghGetContent(
		octokit,
		owner,
		repo,
		domainMetaPath,
	);
	let domainId;
	if (!domainMeta) {
		// create new domain meta: determine next id by listing directory
		// NOTE: listing repo directory via getContent to count files
		const dirList = await ghGetContent(
			octokit,
			owner,
			repo,
			CONF.paths.domainsMeta.replace(/^\.\//, ''),
		);
		const count = Array.isArray(dirList) ? dirList.length : 0;
		domainId = d10ToBase(count);
		domainMeta = {
			id: domainId,
			key: domainKey,
			created_at: new Date().toISOString(),
		};
		await ghPutContent(
			octokit,
			owner,
			repo,
			liveBranch,
			domainMetaPath,
			JSON.stringify(domainMeta, null, 2),
			`create domain meta ${domainId} [#${issue || 'cli'}]`,
		);
		// create domain counter.json and directories
		const domainCounterPath = posixJoin(
			CONF.baseDir,
			domainId,
			'counter.json',
		);
		await ghPutContent(
			octokit,
			owner,
			repo,
			liveBranch,
			domainCounterPath,
			JSON.stringify({ nextPath: 0, nextQuery: 0 }, null, 2),
			`init domain ${domainId} [#${issue || 'cli'}]`,
		);
	} else {
		// parse returned content
		const content = Buffer.from(
			domainMeta.content,
			'base64',
		).toString('utf8');
		domainMeta = JSON.parse(content);
		domainId = domainMeta.id;
	}

	// 2) path meta under domain (paths/<hash>.json)
	const pathHash = await hashHex(pathKey);
	const pathMetaPath = posixJoin(
		CONF.baseDir,
		domainId,
		'paths',
		`${pathHash}.json`,
	);
	let pathMeta = await ghGetContent(
		octokit,
		owner,
		repo,
		pathMetaPath,
	);
	let pathId;
	if (!pathMeta) {
		// read domain counter
		const domainCounterPath = posixJoin(
			CONF.baseDir,
			domainId,
			'counter.json',
		);
		const dc = await ghGetContent(
			octokit,
			owner,
			repo,
			domainCounterPath,
		);
		let counter = { nextPath: 0, nextQuery: 0 };
		if (dc) {
			counter = JSON.parse(
				Buffer.from(dc.content, 'base64').toString('utf8'),
			);
		}
		pathId = d10ToBase(counter.nextPath || 0);
		counter.nextPath = (counter.nextPath || 0) + 1;
		// write path meta and updated counter
		const newPathMeta = {
			id: pathId,
			key: pathKey,
			created_at: new Date().toISOString(),
		};
		await ghPutContent(
			octokit,
			owner,
			repo,
			liveBranch,
			pathMetaPath,
			JSON.stringify(newPathMeta, null, 2),
			`create path meta ${domainId}/${pathId} [#${issue || 'cli'}]`,
		);
		await ghPutContent(
			octokit,
			owner,
			repo,
			liveBranch,
			domainCounterPath,
			JSON.stringify(counter, null, 2),
			`update counter for domain ${domainId} [#${issue || 'cli'}]`,
		);
	} else {
		const content = Buffer.from(pathMeta.content, 'base64').toString(
			'utf8',
		);
		pathMeta = JSON.parse(content);
		pathId = pathMeta.id;
	}

	// 3) query meta under domain/path (domainId/pathId/queries/<hash>.json)
	const queryHash = await hashHex(queryKey);
	const queryMetaPath = posixJoin(
		CONF.baseDir,
		domainId,
		pathId,
		'queries',
		`${queryHash}.json`,
	);
	let queryMeta = await ghGetContent(
		octokit,
		owner,
		repo,
		queryMetaPath,
	);
	let queryId;
	if (!queryMeta) {
		// read & update domain counter
		const domainCounterPath = posixJoin(
			CONF.baseDir,
			domainId,
			'counter.json',
		);
		const dc = await ghGetContent(
			octokit,
			owner,
			repo,
			domainCounterPath,
		);
		let counter = { nextPath: 0, nextQuery: 0 };
		if (dc)
			counter = JSON.parse(
				Buffer.from(dc.content, 'base64').toString('utf8'),
			);
		queryId = d10ToBase(counter.nextQuery || 0);
		counter.nextQuery = (counter.nextQuery || 0) + 1;
		const newQueryMeta = {
			id: queryId,
			key: queryKey,
			created_at: new Date().toISOString(),
		};
		await ghPutContent(
			octokit,
			owner,
			repo,
			liveBranch,
			queryMetaPath,
			JSON.stringify(newQueryMeta, null, 2),
			`create query meta ${domainId}/${pathId}/${queryId} [#${
				issue || 'cli'
			}]`,
		);
		await ghPutContent(
			octokit,
			owner,
			repo,
			liveBranch,
			domainCounterPath,
			JSON.stringify(counter, null, 2),
			`update counter for domain ${domainId} [#${issue || 'cli'}]`,
		);
	} else {
		const content = Buffer.from(queryMeta.content, 'base64').toString(
			'utf8',
		);
		queryMeta = JSON.parse(content);
		queryId = queryMeta.id;
	}

	// 4) write index.json in final folder
	const indexPathRepo = posixJoin(
		CONF.baseDir,
		domainId,
		pathId,
		queryId,
		CONF.indexFile,
	);
	const indexObj = {
		original: canonicalUrl,
		canonical: canonicalUrl,
		by: user,
		issue,
		created_at: new Date().toISOString(),
	};
	await ghPutContent(
		octokit,
		owner,
		repo,
		liveBranch,
		indexPathRepo,
		JSON.stringify(indexObj, null, 2),
		`add index ${domainId}/${pathId}/${queryId} [#${issue || 'cli'}]`,
	);

	return {
		code: `${domainId}/${pathId}/${queryId}`,
		domainId,
		pathId,
		queryId,
	};
}

// ---- API exports selected ----
export async function addUrl(canonicalUrl, opts = {}) {
	if (opts.octokit) return addUrlGitHub(canonicalUrl, opts);
	return addUrlLocal(canonicalUrl, opts);
}

export async function resolve(code, opts = {}) {
	if (opts.octokit) {
		// minimal GitHub read: attempt to get index file
		const { owner, repo, liveBranch } = CONF.github;
		const octokit = opts.octokit;
		const indexPath = posixJoin(
			CONF.baseDir,
			...code.split('/'),
			CONF.indexFile,
		).replace(/^\.\//, '');
		const file = await ghGetContent(octokit, owner, repo, indexPath);
		if (!file) return null;
		const content = Buffer.from(file.content, 'base64').toString(
			'utf8',
		);
		return JSON.parse(content);
	} else {
		return resolveLocal(code);
	}
}

export async function listDomainsLocal() {
	const domainsMetaDir = path.resolve(CONF.paths.domainsMeta);
	const list = await fs.readdir(domainsMetaDir).catch(() => []);
	const result = [];
	for (const f of list) {
		if (!f.endsWith('.json')) continue;
		const meta = await readJsonFs(path.join(domainsMetaDir, f));
		if (meta) result.push(meta);
	}
	return result;
}
