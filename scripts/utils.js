// scripts/utils.js
import CONF from './conf.js';
import { createHash } from 'node:crypto';

export function isNode() {
	return typeof process !== 'undefined' && !!process.versions?.node;
}

export function ensureTrailingSlash(path) {
	return path.endsWith('/') ? path : path + '/';
}

export function normalizePath(...parts) {
	return parts.join('/').replace(/\/+/g, '/').replace(/\/$/, '');
}

export async function ensureDir(dir) {
	await fs.mkdir(dir, { recursive: true });
}

export function posixJoin(...parts) {
	// Build repository-relative POSIX path (for GitHub Content API)
	return parts
		.join('/')
		.replace(/\/{2,}/g, '/')
		.replace(/\/$/, '');
}

export function fsJoin(...parts) {
	return path.join(...parts);
}

export const d10ToBase = (x) =>
	convertBase(x, '0123456789', CONF.baseSymbols);
