import { expect } from '@std/expect';
import { regex } from 'regex';
import { actual, flagVSupported, makeTransformed } from './helpers.ts';

const { test } = Deno;

const transformed = makeTransformed('plugin-options.test.ts');

// removeImport.
test('should strip regex import declarations', () => {
    expect(transformed('import { regex } from "regex";regex`.`;', { removeImport: false })).not.toBe(actual(regex`.`));
    expect(transformed('import { regex } from "regex";regex`.`;', { removeImport: true })).toBe(actual(regex`.`));
    expect(transformed('import {regex, pattern} from "regex";regex`.`;', { removeImport: true })).toBe(
        actual(regex`.`),
    );
    expect(transformed('import * as regex from "regex";', { removeImport: true })).toBe('');
});

test('should not strip other import declarations', () => {
    const declaration = 'import { regex } from "xregexp";';
    expect(transformed(declaration, { removeImport: true })).toBe(declaration);
});

test('should not strip regex dynamic import', () => {
    expect(transformed('import("regex");', { removeImport: true })).toBe('import("regex");');
});

// disableUnicodeSets.
test('should set option disable: {v: true} for all regexes', () => {
    expect(transformed('regex`.`', { disableUnicodeSets: true })).toBe(actual(regex({ disable: { v: true } })`.`));
    if (flagVSupported) {
        expect(transformed('regex`.`', { disableUnicodeSets: false })).not.toBe(
            actual(regex({ disable: { v: true } })`.`),
        );
    }
});

test('should not override option force: {v: true}', () => {
    if (flagVSupported) {
        expect(transformed('regex({force: {v: true}})`.`', { disableUnicodeSets: true })).not.toBe(
            actual(regex({ disable: { v: true } })`.`),
        );
    }
});

// headerComment.
test('should add a leading comment with the provided value', () => {
    expect(transformed('', { headerComment: 'Hi' })).toBe('/*\nHi\n*/');
});

// optimize.
test('should optimize generated regex source', () => {
    expect(transformed('regex`(?:.)`', { optimize: true })).toBe('/./u;');
    expect(transformed('regex`(?:.)`', { optimize: false })).not.toBe('/./u;');
});
