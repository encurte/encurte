/**
 * Converte um número entre bases arbitrárias definidas por conjuntos de símbolos.
 * Case-sensitive e compatível com Unicode.
 */
export function convertBase(value, fromBaseSymbols, toBaseSymbols) {
	const normalizeBase = (base, name) => {
		if (typeof base === 'string') return [...base];
		if (Array.isArray(base)) return base;
		throw new TypeError(
			`${name} deve ser uma string ou um array de caracteres únicos.`,
		);
	};

	const fromSymbols = normalizeBase(
		fromBaseSymbols,
		'fromBaseSymbols',
	);
	const toSymbols = normalizeBase(toBaseSymbols, 'toBaseSymbols');

	const hasDuplicates = (arr) => new Set(arr).size !== arr.length;
	if (hasDuplicates(fromSymbols))
		throw new Error('A base de origem contém símbolos duplicados.');
	if (hasDuplicates(toSymbols))
		throw new Error('A base de destino contém símbolos duplicados.');

	const fromBase = fromSymbols.length;
	const toBase = toSymbols.length;
	const fromMap = new Map(fromSymbols.map((sym, i) => [sym, i]));

	for (const ch of value) {
		if (!fromMap.has(ch))
			throw new Error(
				`Caractere '${ch}' não existe na base de origem.`,
			);
	}

	let num = 0n;
	for (const ch of value) {
		num = num * BigInt(fromBase) + BigInt(fromMap.get(ch));
	}

	if (num === 0n) return toSymbols[0];

	let result = '';
	while (num > 0n) {
		const remainder = Number(num % BigInt(toBase));
		result = toSymbols[remainder] + result;
		num = num / BigInt(toBase);
	}

	return result;
}

/**
 * Tenta detectar em quais bases possíveis um valor pode estar.
 * Retorna uma lista de bases (em formato padronizado — arrays de símbolos).
 *
 * @param {string} value - valor a analisar.
 * @param {(string|string[])[]} baseCandidates - lista de bases candidatas.
 * @returns {Array<{base:Array<string>, index:number}>} - lista de possíveis bases compatíveis.
 */
export function detectBaseTry(value, baseCandidates) {
	if (!Array.isArray(baseCandidates) || baseCandidates.length === 0) {
		throw new TypeError(
			'baseCandidates deve ser um array não vazio de strings ou arrays.',
		);
	}

	const normalizeBase = (base, idx) => {
		if (typeof base === 'string') return [...base];
		if (Array.isArray(base)) return base;
		throw new TypeError(
			`Base candidata #${idx} inválida: deve ser string ou array.`,
		);
	};

	const results = [];

	baseCandidates.forEach((candidate, idx) => {
		try {
			const baseArr = normalizeBase(candidate, idx);
			const set = new Set(baseArr);
			if (set.size !== baseArr.length)
				throw new Error('Base contém símbolos duplicados.');

			// Testa se todos os caracteres existem na base
			if ([...value].every((ch) => set.has(ch))) {
				results.push({ base: baseArr, index: idx });
			}
		} catch {
			// Ignora bases inválidas
		}
	});

	return results;
}
