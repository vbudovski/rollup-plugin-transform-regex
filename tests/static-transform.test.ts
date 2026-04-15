import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';
import { pattern, regex } from 'regex';
import { actual, makeTransformed } from './helpers.ts';

const transformed = makeTransformed('static-transform.test.ts');

describe('static transform', () => {
    describe('call formats', () => {
        it('transforms tagged template in surrounding code', () => {
            expect(transformed('const re = regex` .`;')).toBe('const re = /./v;');
        });

        it('direct tag', () => {
            expect(transformed('regex`.`')).toBe(actual(regex`.`));
        });

        it('empty arguments', () => {
            expect(transformed('regex()`.`')).toBe(actual(regex()`.`));
        });

        it('flags string', () => {
            expect(transformed("regex('i')`.`")).toBe(actual(regex('i')`.`));
            expect(transformed('regex("i")`.`')).toBe(actual(regex('i')`.`));
            expect(transformed('regex(`i`)`.`')).toBe(actual(regex(`i`)`.`));
            expect(transformed('regex(String.raw`i`)`.`')).toBe(actual(regex(String.raw`i`)`.`));
        });

        it('options object with flags', () => {
            expect(transformed("regex({flags: 'i'})`.`")).toBe(actual(regex({ flags: 'i' })`.`));
            expect(transformed('regex({flags: "i"})`.`')).toBe(actual(regex({ flags: 'i' })`.`));
            expect(transformed('regex({flags: `i`})`.`')).toBe(actual(regex({ flags: `i` })`.`));
            expect(transformed('regex({flags: String.raw`i`})`.`')).toBe(actual(regex({ flags: String.raw`i` })`.`));
        });

        it('options with disable and force', () => {
            expect(transformed("regex({flags: 'i', disable: {x: true}})` . `")).toBe(
                actual(regex({ flags: 'i', disable: { x: true } })` . `),
            );
            expect(transformed('regex({disable: {x: true}})` . `')).toBe(actual(regex({ disable: { x: true } })` . `));
            expect(transformed('regex({disable: {x: false}})` . `')).toBe(
                actual(regex({ disable: { x: false } })` . `),
            );
            expect(transformed('regex({disable: {v: true}})`.`')).toBe(actual(regex({ disable: { v: true } })`.`));
            expect(transformed('regex({disable: {v: false}})`.`')).toBe(actual(regex({ disable: { v: false } })`.`));
            expect(transformed('regex({disable: {v: true}, force: {v: true}})`.`')).toBe(
                actual(regex({ disable: { v: true }, force: { v: true } })`.`),
            );
        });

        it('rejects disallowed options', () => {
            expect(transformed('regex({subclass: true})`.`')).not.toBe(actual(regex({ subclass: true })`.`));
            expect(transformed('regex({plugins: []})`.`')).not.toBe(actual(regex({ plugins: [] })`.`));
            expect(transformed('regex({unicodeSetsPlugin: null})`.`')).not.toBe(
                actual(regex({ unicodeSetsPlugin: null })`.`),
            );
        });
    });

    describe('literal interpolation', () => {
        it('string literals', () => {
            expect(transformed("regex`${'.'}`")).toBe(actual(regex`${'.'}`));
            expect(transformed('regex`${"."}`')).toBe(actual(regex`${'.'}`));
        });

        it('template literals', () => {
            expect(transformed('regex`${`.`}`')).toBe(actual(regex`${`.`}`));
            expect(transformed('regex`${String.raw`.`}`')).toBe(actual(regex`${String.raw`.`}`));
            expect(transformed('regex`.${`.`}.${`.`}.`')).toBe(actual(regex`.${`.`}.${`.`}.`));
        });

        it('number literals', () => {
            expect(transformed('regex`${1}`')).toBe(actual(regex`${1}`));
        });

        it('regexp literals', () => {
            expect(transformed('regex`${/./}`')).toBe(actual(regex`${/./}`));
            expect(transformed('regex`${/./s}`')).toBe(actual(regex`${/./s}`));
        });

        it('RegExp() constructor', () => {
            expect(transformed("regex`${RegExp('.')}`")).toBe(actual(regex`${/./}`));
            expect(transformed('regex`${RegExp(".")}`')).toBe(actual(regex`${/./}`));
            expect(transformed('regex`${RegExp(`.`)}`')).toBe(actual(regex`${/./}`));
            expect(transformed('regex`${RegExp(String.raw`.`)}`')).toBe(actual(regex`${/./}`));
            expect(transformed("regex`${RegExp('.', 's')}`")).toBe(actual(regex`${/./s}`));
            expect(transformed('regex`${RegExp(`.`, "s")}`')).toBe(actual(regex`${/./s}`));
            expect(transformed('regex`${RegExp(`.`, `s`)}`')).toBe(actual(regex`${/./s}`));
            expect(transformed('regex`${RegExp(`.`, String.raw`s`)}`')).toBe(actual(regex`${/./s}`));
        });

        it('new RegExp() constructor', () => {
            expect(transformed("regex`${new RegExp('.')}`")).toBe(actual(regex`${/./}`));
            expect(transformed('regex`${new RegExp(".")}`')).toBe(actual(regex`${/./}`));
            expect(transformed('regex`${new RegExp(`.`)}`')).toBe(actual(regex`${/./}`));
            expect(transformed('regex`${new RegExp(String.raw`.`)}`')).toBe(actual(regex`${/./}`));
            expect(transformed("regex`${new RegExp('.', 's')}`")).toBe(actual(regex`${/./s}`));
            expect(transformed('regex`${new RegExp(`.`, "s")}`')).toBe(actual(regex`${/./s}`));
            expect(transformed('regex`${new RegExp(`.`, `s`)}`')).toBe(actual(regex`${/./s}`));
            expect(transformed('regex`${new RegExp(`.`, String.raw`s`)}`')).toBe(actual(regex`${/./s}`));
        });

        it('pattern template', () => {
            expect(transformed('regex`${pattern`.`}`')).toBe(actual(regex`${pattern`.`}`));
        });

        it('pattern() with string literals', () => {
            expect(transformed("regex`${pattern('.')}`")).toBe(actual(regex`${pattern('.')}`));
            expect(transformed('regex`${pattern(".")}`')).toBe(actual(regex`${pattern('.')}`));
        });

        it('pattern() with template literals', () => {
            expect(transformed('regex`${pattern(`.`)}`')).toBe(actual(regex`${pattern(`.`)}`));
            expect(transformed('regex`${pattern(String.raw`.`)}`')).toBe(actual(regex`${pattern(String.raw`.`)}`));
        });

        it('pattern() with number literals', () => {
            expect(transformed('regex`${pattern(1)}`')).toBe(actual(regex`${pattern(1)}`));
        });
    });

    describe('subroutine groups', () => {
        it('expands references', () => {
            const input = 'const re = () => regex`^ \\g<foo> \\g<foo> $ (?(DEFINE) (?<foo> ([a-z])))`';
            const result = transformed(input);
            expect(result).toBe('const re = () => /^(?:(?:[a-z]))(?:(?:[a-z]))$/v');
        });
    });

    describe('advanced patterns', () => {
        it('unicode properties', () => {
            const result = transformed('const re = regex`^\\p{Emoji}+$`');
            expect(result).toBe('const re = /^\\p{Emoji}+$/v');
        });

        it('possessive quantifier', () => {
            const result = transformed('const re = regex`^(\\d)++$`');
            expect(result).toBe('const re = /^(?:(?=((?:\\d)+))\\1)$/v');
        });
    });
});
