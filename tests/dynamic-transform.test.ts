import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';
import { makeTransformed } from './helpers.ts';

const transformed = makeTransformed('dynamic-transform.test.ts');

describe('dynamic transform', () => {
    describe('basic interpolation', () => {
        it('without flags', () => {
            expect(transformed('const re = (n) => regex`^\\d${n}$`;')).toBe(
                'const re = (n) => new RegExp(String.raw`^\\d${n}$`, "v");',
            );
        });

        it('with flags', () => {
            expect(transformed("const re = (n) => regex('i')`^\\d${n}$`;")).toBe(
                'const re = (n) => new RegExp(String.raw`^\\d${n}$`, "iv");',
            );
        });

        it('with nested RegExp', () => {
            expect(transformed('const re = (n) => regex`${/abc/}${n}`;')).toBe(
                'const re = (n) => new RegExp(String.raw`${(/abc/).source}${n}`, "v");',
            );
        });

        describe('without unicode sets', () => {
            it('without flags', () => {
                expect(transformed('const re = (n) => regex`^\\d${n}$`;', { disableUnicodeSets: true })).toBe(
                    'const re = (n) => new RegExp(String.raw`^\\d${n}$`);',
                );
            });

            it('with flags', () => {
                expect(transformed("const re = (n) => regex('i')`^\\d${n}$`;", { disableUnicodeSets: true })).toBe(
                    'const re = (n) => new RegExp(String.raw`^\\d${n}$`, "i");',
                );
            });

            it('with nested RegExp', () => {
                expect(transformed('const re = (n) => regex`${/abc/}${n}`;', { disableUnicodeSets: true })).toBe(
                    'const re = (n) => new RegExp(String.raw`${(/abc/).source}${n}`);',
                );
            });
        });
    });

    describe('expression lowering', () => {
        it('bare identifier', () => {
            const result = transformed('const re = (n) => regex`^\\d${n}$`');
            expect(result).toBe('const re = (n) => new RegExp(String.raw`^\\d${n}$`, "v")');
        });

        it('String() call', () => {
            const input =
                'const re = (p) => regex`^\\d+${p === undefined ? pattern`(\\.\\d+)?` : pattern`\\.\\d{${String(p)}}`}$`';
            const result = transformed(input);
            expect(result).toBe(
                'const re = (p) => new RegExp(String.raw`^\\d+${((p === undefined)?("(\\\\.\\\\d+)?"):(String.raw`\\.\\d{${String(p)}}`))}$`, "v")',
            );
        });
    });

    describe('pattern ternaries', () => {
        it('two alternatives', () => {
            const input = 'const re = (p) => regex`^\\d+${p === undefined ? pattern`(\\.\\d+)?` : pattern`\\.\\d+`}$`';
            const result = transformed(input);
            expect(result).toBe(
                'const re = (p) => new RegExp(String.raw`^\\d+${((p === undefined)?("(\\\\.\\\\d+)?"):("\\\\.\\\\d+"))}$`, "v")',
            );
        });

        it('with String() interpolation', () => {
            const input =
                'const re = (p) => regex`^\\d+${p === undefined ? pattern`(\\.\\d+)?` : pattern`\\.\\d{${String(p)}}`}$`';
            const result = transformed(input);
            expect(result).toBe(
                'const re = (p) => new RegExp(String.raw`^\\d+${((p === undefined)?("(\\\\.\\\\d+)?"):(String.raw`\\.\\d{${String(p)}}`))}$`, "v")',
            );
        });

        it('with flags', () => {
            const input = "const re = (v) => regex('i')`^${v === 4 ? pattern`\\d+\\.\\d+` : pattern`[a-f\\d]+`}$`";
            const result = transformed(input);
            expect(result).toBe(
                'const re = (v) => new RegExp(String.raw`^${((v === 4)?("\\\\d+\\\\.\\\\d+"):("[a-f\\\\d]+"))}$`, "iv")',
            );
        });

        it('comparing to undefined', () => {
            const input =
                'const re = (v) => regex`^${v === undefined ? pattern`(a|b)` : v === 4 ? pattern`a` : pattern`b`}$`';
            const result = transformed(input);
            expect(result).toBe(
                'const re = (v) => new RegExp(String.raw`^${((v === undefined)?("(a|b)"):(((v === 4)?("a"):("b"))))}$`, "v")',
            );
        });

        it('multiple interpolations', () => {
            const input =
                'const re = (a, b) => regex`^${a ? pattern`\\d+` : pattern`\\w+`}-${b ? pattern`[a-z]` : pattern`[A-Z]`}$`';
            const result = transformed(input);
            expect(result).toBe(
                'const re = (a, b) => new RegExp(String.raw`^${((a)?("\\\\d+"):("\\\\w+"))}-${((b)?("[a-z]"):("[A-Z]"))}$`, "v")',
            );
        });

        it('nested three branches', () => {
            const input =
                'const re = (a, b) => regex`^\\d+${a && b ? pattern`(X|Y)` : a ? pattern`(X|Z)` : pattern`Z`}$`';
            const result = transformed(input);
            expect(result).toBe(
                'const re = (a, b) => new RegExp(String.raw`^\\d+${((a && b)?("(X|Y)"):(((a)?("(X|Z)"):("Z"))))}$`, "v")',
            );
        });
    });

    describe('subroutine expansion', () => {
        it('expands references', () => {
            const input = 'const re = (n) => regex`^ \\g<foo> ${n} \\g<foo> $ (?(DEFINE) (?<foo> ([a-z])))`';
            const result = transformed(input);
            expect(result).toBe('const re = (n) => new RegExp(String.raw`^(?:(?:[a-z]))${n}(?:(?:[a-z]))$`, "v")');
        });

        it('with flags', () => {
            const input = "const re = (n) => regex('i')`^ \\g<foo> ${n} $ (?(DEFINE) (?<foo> [a-z]+))`";
            const result = transformed(input);
            expect(result).toBe('const re = (n) => new RegExp(String.raw`^(?:[a-z]+)${n}$`, "iv")');
        });

        it('multiple references', () => {
            const input = 'const re = (n) => regex`^ \\g<a> ${n} \\g<b> $ (?(DEFINE) (?<a> \\d+) (?<b> [a-z]+))`';
            const result = transformed(input);
            expect(result).toBe('const re = (n) => new RegExp(String.raw`^(?:\\d+)${n}(?:[a-z]+)$`, "v")');
        });

        it('ternary inside DEFINE group', () => {
            const input =
                'const re = (p) => regex`^ \\g<t> $ (?(DEFINE) (?<t> \\d{2}:\\d{2} ${p === undefined ? pattern`(\\.\\d+)?` : pattern`\\.\\d+`}))`';
            const result = transformed(input);
            expect(result).toBe(
                'const re = (p) => new RegExp(String.raw`^(?:\\d{2}:\\d{2}${((p === undefined)?("(\\\\.\\\\d+)?"):("\\\\.\\\\d+"))})$`, "v")',
            );
        });

        it('with disableUnicodeSets', () => {
            const input = "const re = (n) => regex('i')`^ \\g<foo> ${n} $ (?(DEFINE) (?<foo> [a-z]+))`";
            const result = transformed(input, { disableUnicodeSets: true });
            expect(result).toBe('const re = (n) => new RegExp(String.raw`^(?:[a-z]+)${n}$`, "i")');
        });

        it('expands refs across N ternary branches', () => {
            const input = [
                'const re = (n) => regex`',
                '  ^ \\g<out> $',
                '  (?(DEFINE)',
                '    (?<out> ${n === 1 ? pattern`\\g<a>` : n === 2 ? pattern`\\g<b>` : n === 3 ? pattern`\\g<c>` : pattern`(\\g<a> | \\g<b> | \\g<c>)`})',
                '    (?<a> x+)',
                '    (?<b> y+)',
                '    (?<c> z+)',
                '  )',
                '`',
            ].join('\n');
            const result = transformed(input);
            expect(result).toBe(
                'const re = (n) => new RegExp(String.raw`^(?:${((n === 1)?("(?:x+)"):(((n === 2)?("(?:y+)"):(((n === 3)?("(?:z+)"):("((?:x+)|(?:y+)|(?:z+))"))))))})$`, "v")',
            );
        });
    });
});
