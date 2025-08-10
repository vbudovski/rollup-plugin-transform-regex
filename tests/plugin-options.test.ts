import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';
import { regex } from 'regex';
import { actual, flagVSupported, makeTransformed } from './helpers.ts';

const transformed = makeTransformed('plugin-options.test.ts');

describe('plugin options', () => {
    describe('removeImport', () => {
        it('strips regex import declarations', () => {
            expect(transformed('import { regex } from "regex";regex`.`;', { removeImport: false })).not.toBe(
                actual(regex`.`),
            );
            expect(transformed('import { regex } from "regex";regex`.`;', { removeImport: true })).toBe(
                actual(regex`.`),
            );
            expect(transformed('import {regex, pattern} from "regex";regex`.`;', { removeImport: true })).toBe(
                actual(regex`.`),
            );
            expect(transformed('import * as regex from "regex";', { removeImport: true })).toBe('');
        });

        it('keeps non-regex imports', () => {
            const declaration = 'import { regex } from "xregexp";';
            expect(transformed(declaration, { removeImport: true })).toBe(declaration);
        });

        it('keeps dynamic imports', () => {
            expect(transformed('import("regex");', { removeImport: true })).toBe('import("regex");');
        });
    });

    describe('disableUnicodeSets', () => {
        it('sets disable v flag', () => {
            expect(transformed('regex`.`', { disableUnicodeSets: true })).toBe(
                actual(regex({ disable: { v: true } })`.`),
            );
            if (flagVSupported) {
                expect(transformed('regex`.`', { disableUnicodeSets: false })).not.toBe(
                    actual(regex({ disable: { v: true } })`.`),
                );
            }
        });

        it('does not override force v', () => {
            if (flagVSupported) {
                expect(transformed('regex({force: {v: true}})`.`', { disableUnicodeSets: true })).not.toBe(
                    actual(regex({ disable: { v: true } })`.`),
                );
            }
        });
    });

    describe('headerComment', () => {
        it('adds leading comment', () => {
            expect(transformed('', { headerComment: 'Hi' })).toBe('/*\nHi\n*/');
        });
    });

    describe('optimize', () => {
        it('optimizes regex source', () => {
            expect(transformed('regex`(?:.)`', { optimize: true })).toBe('/./u;');
            expect(transformed('regex`(?:.)`', { optimize: false })).not.toBe('/./u;');
        });
    });
});
