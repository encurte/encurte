// scripts/index.js
import CONF from './conf.js';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { canonizeUrl } from './canon.js';
import { addUrl, resolve, listDomainsLocal } from './db.js';

const IS_ACTION = process.env.GITHUB_ACTIONS === 'true';

async function runCLI(argv) {
	const args = argv.slice(2);
	const cmd = args[0];
	switch (cmd) {
		case 'add': {
			const raw = args[1];
			if (!raw) {
				console.error('Uso: node scripts/index.js add <url>');
				return process.exit(1);
			}
			const canonical = canonizeUrl(raw);
			const res = await addUrl(canonical, {
				user: 'local',
				issue: null,
			});
			console.log('Adicionado:', res);
			break;
		}
		case 'resolve': {
			const code = args[1];
			if (!code) {
				console.error('Uso: node scripts/index.js resolve <code>');
				return process.exit(1);
			}
			const r = await resolve(code);
			console.log('Resolve result:', r);
			break;
		}
		case 'list': {
			const d = await listDomainsLocal();
			console.table(d);
			break;
		}
		default:
			console.log('Comandos: add | resolve | list');
	}
}

async function runAction() {
	try {
		const token = core.getInput('token') || process.env.GITHUB_TOKEN;
		if (!token) throw new Error('GITHUB_TOKEN ausente.');
		const octokit = github.getOctokit(token);
		const context = github.context;
		const event = context.payload;

		// Only issues opened (your workflow triggers on opened); adapt as needed
		const issue = event.issue || {};
		const issueNumber = issue.number;
		const body = issue.body || '';

		// tentativa simples de extrair url no corpo via regex (você pode adaptar)
		const urlMatch = body.match(/https?:\/\/[^\s)]+/i);
		if (!urlMatch) {
			core.info('Nenhuma URL encontrada na issue.');
			return;
		}
		const rawUrl = urlMatch[0];
		const canonical = canonizeUrl(rawUrl);

		// call addUrl with octokit
		const result = await addUrl(canonical, {
			octokit,
			user: context.actor,
			issue: issueNumber,
		});

		// comment back on issue with the generated code
		const commentBody = `🔗 Encurtado: code \`${result.code}\` — criado por @${context.actor}`;
		await octokit.rest.issues.createComment({
			owner: context.repo.owner,
			repo: context.repo.repo,
			issue_number: issueNumber,
			body: commentBody,
		});

		core.info(`Registro criado: ${result.code}`);
	} catch (err) {
		core.setFailed(err.message);
	}
}

async function main() {
	if (IS_ACTION) {
		await runAction();
	} else {
		await runCLI(process.argv);
	}
}

main().catch((e) => {
	console.error('Erro:', e);
	process.exit(1);
});
