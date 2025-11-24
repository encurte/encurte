// scripts/canon.js
import CONF from './conf.js';

/**
 * Canoniza URLs removendo ambiguidades, padronizando protocolo,
 * ordenando query params e rejeitando hosts locais ou inválidos.
 */
export function canonizeUrl(rawUrl) {
	if (typeof rawUrl !== 'string' || !rawUrl.trim())
		throw new Error('URL vazia ou inválida.');

	let url;
	try {
		url = new URL(rawUrl.trim());
	} catch {
		throw new Error(`URL inválida: ${rawUrl}`);
	}

	const proto = url.protocol.replace(':', '').toLowerCase();
	if (!CONF.canonical.acceptedProtocols.includes(proto))
		throw new Error(`Protocolo não permitido: ${proto}`);

	// rejeita localhost, IPs locais, etc.
	const hostLower = url.hostname.toLowerCase();
	if (
		CONF.canonical.rejectHosts.includes(hostLower) ||
		hostLower.endsWith('.local') ||
		hostLower.startsWith('localhost') ||
		/^[0-9.]+$/.test(hostLower) ||
		hostLower === '::1'
	)
		throw new Error('Host local não permitido.');

	// Normaliza portas padrão
	const portNum = url.port ? parseInt(url.port, 10) : null;
	const defaultPort = CONF.canonical.defaultPorts[proto];
	if (portNum === defaultPort || !portNum) url.port = '';

	// Corrige casos http:443 e https:80
	if (proto === 'http' && portNum === 443) {
		url.protocol = 'https:';
		url.port = '';
	} else if (proto === 'https' && portNum === 80) {
		url.port = '';
	}

	// Ordena parâmetros de query
	const params = Array.from(url.searchParams.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(
			([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
		)
		.join('&');
	url.search = params ? '?' + params : '';

	// Remove fragmentos (#hash)
	url.hash = '';

	// Remove duplicidades de barra
	url.pathname = url.pathname.replace(/\/{2,}/g, '/');

	// Remove barra final redundante (exceto raiz)
	if (url.pathname.length > 1 && url.pathname.endsWith('/'))
		url.pathname = url.pathname.slice(0, -1);

	return url.toString();
}
