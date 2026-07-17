#!/usr/bin/env node
// scripts/verify-dist.mjs
//
// External gate over the SHIPPED artifact. The jest suite collects coverage from src/**
// only and never loads dist/ — the internal-symbol leak (ADR-007) was reproduced against
// dist/ while src sat at 100% coverage. Coverage was not the gap; the gate was.
//
// Runs OUTSIDE jest on purpose: jest must not require a build.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '..', 'dist');

const LEAK_RE = /Symbol\(stderr_/;

let failures = 0;
const check = (name, fn) => {
    try {
        fn();
        console.log(`  ok   ${name}`);
    } catch (err) {
        failures++;
        console.error(`  FAIL ${name}`);
        console.error(`       ${err && err.message}`);
    }
};

const assert = (cond, msg) => {
    if (!cond) throw new Error(msg);
};

const assertClean = (label, err) => {
    const str = String(err);
    assert(!LEAK_RE.test(str), `${label}: toString() leaked internal state:\n${str}`);
    const json = JSON.stringify(err) ?? '';
    assert(!LEAK_RE.test(json), `${label}: JSON.stringify() leaked internal state:\n${json}`);
};

const require = createRequire(import.meta.url);
const cjs = require(resolve(distDir, 'index.js'));
const esm = await import(pathToFileURL(resolve(distDir, 'index.mjs')).href);

const copies = [
    ['dist/index.js (cjs)', cjs],
    ['dist/index.mjs (esm)', esm],
];

for (const [label, mod] of copies) {
    console.log(`\n${label}`);
    assert(typeof mod.stderr === 'function', `${label}: stderr is not a function`);

    check('re-normalization does not leak (root + cause)', () => {
        const e = new Error('fetch failed', { cause: new Error('boom') });
        const n = mod.stderr(mod.stderr(e));
        assertClean(label, n);

        const json = n.toJSON();
        assert(!Object.keys(json).includes('Symbol(stderr_maxDepth)'), `${label}: leaked key on root`);
        assert(!Object.keys(json.cause).includes('Symbol(stderr_maxDepth)'), `${label}: leaked key on cause`);
    });

    check('heals an error rehydrated from a poisoned JSON log', () => {
        const leaked = { name: 'TypeError', message: 'fetch failed', 'Symbol(stderr_maxDepth)': 8 };
        const n = mod.stderr(leaked);
        assertClean(label, n);
        assert(n['Symbol(stderr_maxDepth)'] === undefined, `${label}: leaked key survived the heal`);
    });

    check('N-fold re-normalization does not accumulate', () => {
        let e = new Error('x', { cause: new Error('y') });
        for (let i = 0; i < 5; i++) e = mod.stderr(e);
        assertClean(label, e);
    });
}

// The dual-package case src-only jest cannot reach: two loaded copies => two distinct
// Symbol() values. This is what proves Symbol.for() was unnecessary.
console.log('\ncross-feed (dual-package hazard)');

check('esm.stderr(cjs.stderr(x)) does not throw and does not leak', () => {
    const n = esm.stderr(cjs.stderr(new Error('x', { cause: new Error('y') })));
    assertClean('cjs -> esm', n);
});

check('cjs.stderr(esm.stderr(x)) does not throw and does not leak', () => {
    const n = cjs.stderr(esm.stderr(new Error('x', { cause: new Error('y') })));
    assertClean('esm -> cjs', n);
});

check('a cjs StdError nested as the cause of an esm StdError does not leak', () => {
    const inner = new cjs.StdError('inner', { maxDepth: 4 });
    const outer = new esm.StdError('outer', { cause: inner });
    assertClean('cjs StdError in esm StdError', outer);
});

check('a esm StdError nested as the cause of a cjs StdError does not leak', () => {
    const inner = new esm.StdError('inner', { maxDepth: 4 });
    const outer = new cjs.StdError('outer', { cause: inner });
    assertClean('esm StdError in cjs StdError', outer);
});

if (failures > 0) {
    console.error(`\nverify-dist: ${failures} check(s) FAILED`);
    process.exit(1);
}
console.log('\nverify-dist: all checks passed');
