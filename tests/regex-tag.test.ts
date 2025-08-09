import { expect } from '@std/expect';
import { pattern, regex } from 'regex';
import { actual, makeTransformed } from './helpers.ts';

const { test } = Deno;

const transformed = makeTransformed('regex-tag.test.ts');

// Regex.
test('should transform tagged regex templates within code', () => {
    expect(transformed('const re = regex` .`;')).toBe('const re = /./v;');
});

// Call formats.
test('should transform direct use of tag', () => {
    expect(transformed('regex`.`')).toBe(actual(regex`.`));
});

test('should transform tag with empty arguments', () => {
    expect(transformed('regex()`.`')).toBe(actual(regex()`.`));
});

test('should transform tag with flags string', () => {
    expect(transformed("regex('i')`.`")).toBe(actual(regex('i')`.`));
    expect(transformed('regex("i")`.`')).toBe(actual(regex('i')`.`));
    expect(transformed('regex(`i`)`.`')).toBe(actual(regex(`i`)`.`));
    expect(transformed('regex(String.raw`i`)`.`')).toBe(actual(regex(String.raw`i`)`.`));
});

test('should transform tag with options object', () => {
    expect(transformed("regex({flags: 'i'})`.`")).toBe(actual(regex({ flags: 'i' })`.`));
    expect(transformed('regex({flags: "i"})`.`')).toBe(actual(regex({ flags: 'i' })`.`));
    expect(transformed('regex({flags: `i`})`.`')).toBe(actual(regex({ flags: `i` })`.`));
    expect(transformed('regex({flags: String.raw`i`})`.`')).toBe(actual(regex({ flags: String.raw`i` })`.`));
});

test('should transform tag with options object that disables features', () => {
    expect(transformed("regex({flags: 'i', disable: {x: true}})` . `")).toBe(
        actual(regex({ flags: 'i', disable: { x: true } })` . `),
    );
    expect(transformed('regex({disable: {x: true}})` . `')).toBe(actual(regex({ disable: { x: true } })` . `));
    expect(transformed('regex({disable: {x: false}})` . `')).toBe(actual(regex({ disable: { x: false } })` . `));
    expect(transformed('regex({disable: {v: true}})`.`')).toBe(actual(regex({ disable: { v: true } })`.`));
    expect(transformed('regex({disable: {v: false}})`.`')).toBe(actual(regex({ disable: { v: false } })`.`));
    expect(transformed('regex({disable: {v: true}, force: {v: true}})`.`')).toBe(
        actual(regex({ disable: { v: true }, force: { v: true } })`.`),
    );
});

test('should not transform tag with explicitly disallowed options', () => {
    expect(transformed('regex({subclass: true})`.`')).not.toBe(actual(regex({ subclass: true })`.`));
    expect(transformed('regex({plugins: []})`.`')).not.toBe(actual(regex({ plugins: [] })`.`));
    expect(transformed('regex({unicodeSetsPlugin: null})`.`')).not.toBe(actual(regex({ unicodeSetsPlugin: null })`.`));
});

// Interpolation of non-dynamic inline values.
test('should allow interpolating string literals', () => {
    expect(transformed("regex`${'.'}`")).toBe(actual(regex`${'.'}`));
    expect(transformed('regex`${"."}`')).toBe(actual(regex`${'.'}`));
});

test('should allow interpolating string templates without interpolation', () => {
    expect(transformed('regex`${`.`}`')).toBe(actual(regex`${`.`}`));
    expect(transformed('regex`${String.raw`.`}`')).toBe(actual(regex`${String.raw`.`}`));
    expect(transformed('regex`.${`.`}.${`.`}.`')).toBe(actual(regex`.${`.`}.${`.`}.`));
});

test('should allow interpolating number literals', () => {
    expect(transformed('regex`${1}`')).toBe(actual(regex`${1}`));
});

test('should allow interpolating regexp literals', () => {
    expect(transformed('regex`${/./}`')).toBe(actual(regex`${/./}`));
    expect(transformed('regex`${/./s}`')).toBe(actual(regex`${/./s}`));
});

test('should allow interpolating regexes constructed by RegExp', () => {
    expect(transformed("regex`${RegExp('.')}`")).toBe(actual(regex`${/./}`));
    expect(transformed('regex`${RegExp(".")}`')).toBe(actual(regex`${/./}`));
    expect(transformed('regex`${RegExp(`.`)}`')).toBe(actual(regex`${/./}`));
    expect(transformed('regex`${RegExp(String.raw`.`)}`')).toBe(actual(regex`${/./}`));
    expect(transformed("regex`${RegExp('.', 's')}`")).toBe(actual(regex`${/./s}`));
    expect(transformed('regex`${RegExp(`.`, "s")}`')).toBe(actual(regex`${/./s}`));
    expect(transformed('regex`${RegExp(`.`, `s`)}`')).toBe(actual(regex`${/./s}`));
    expect(transformed('regex`${RegExp(`.`, String.raw`s`)}`')).toBe(actual(regex`${/./s}`));
});

test('should allow interpolating regexes constructed by new RegExp', () => {
    expect(transformed("regex`${new RegExp('.')}`")).toBe(actual(regex`${/./}`));
    expect(transformed('regex`${new RegExp(".")}`')).toBe(actual(regex`${/./}`));
    expect(transformed('regex`${new RegExp(`.`)}`')).toBe(actual(regex`${/./}`));
    expect(transformed('regex`${new RegExp(String.raw`.`)}`')).toBe(actual(regex`${/./}`));
    expect(transformed("regex`${new RegExp('.', 's')}`")).toBe(actual(regex`${/./s}`));
    expect(transformed('regex`${new RegExp(`.`, "s")}`')).toBe(actual(regex`${/./s}`));
    expect(transformed('regex`${new RegExp(`.`, `s`)}`')).toBe(actual(regex`${/./s}`));
    expect(transformed('regex`${new RegExp(`.`, String.raw`s`)}`')).toBe(actual(regex`${/./s}`));
});

test('should allow interpolating pattern templates without interpolation', () => {
    expect(transformed('regex`${pattern`.`}`')).toBe(actual(regex`${pattern`.`}`));
});

test('should allow interpolating pattern function calls with string literals', () => {
    expect(transformed("regex`${pattern('.')}`")).toBe(actual(regex`${pattern('.')}`));
    expect(transformed('regex`${pattern(".")}`')).toBe(actual(regex`${pattern('.')}`));
});

test('should allow interpolating pattern function calls with string templates without interpolation', () => {
    expect(transformed('regex`${pattern(`.`)}`')).toBe(actual(regex`${pattern(`.`)}`));
    expect(transformed('regex`${pattern(String.raw`.`)}`')).toBe(actual(regex`${pattern(String.raw`.`)}`));
});

test('should allow interpolating pattern function calls with number literals', () => {
    expect(transformed('regex`${pattern(1)}`')).toBe(actual(regex`${pattern(1)}`));
});
