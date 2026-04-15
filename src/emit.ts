import type { Expression, TaggedTemplateExpression } from 'estree';
import type { AstNode } from 'rollup';
import {
    getStaticString,
    getTemplateRawStrings,
    isIdentifier,
    isNumberLiteral,
    isRegExpLiteral,
    isStaticPatternCall,
    isStaticPatternTemplate,
    isStaticRegExpCall,
    isStaticString,
    isTaggedTemplateExpression,
} from './ast.ts';
import { expandSubroutineReferences } from './subroutines.ts';

function escapeForRawTemplate(s: string): string {
    // Escape the template delimiter, and the placeholder opener only.
    // Do NOT escape backslashes here, since we're using String.raw.
    return s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\f', '\v']);

/**
 * Strip free-spacing whitespace and comments from a pattern string.
 * The `pattern` tagged template in the regex library always applies
 * free-spacing mode, but `new RegExp()` does not.
 */
function stripFreeSpacing(raw: string): string {
    let result = '';
    let inCharClass = false;
    let i = 0;
    while (i < raw.length) {
        const ch = raw[i];
        if (ch === '\\') {
            result += raw[i] + (raw[i + 1] ?? '');
            i += 2;
            continue;
        }
        if (inCharClass) {
            if (ch === ']') inCharClass = false;
            result += ch;
            i++;
            continue;
        }
        if (ch === '[') {
            inCharClass = true;
            result += ch;
            i++;
            continue;
        }
        if (ch === '#') {
            while (i < raw.length && raw[i] !== '\n') i++;
            continue;
        }
        if (WHITESPACE.has(ch)) {
            i++;
            continue;
        }
        result += ch;
        i++;
    }
    return result;
}

function emitExpression(expression: Expression, code: string, subroutineMap: Map<string, string> = new Map()): string {
    if (isStaticPatternTemplate(expression)) {
        const raw = stripFreeSpacing(expandSubroutineReferences(expression.quasi.quasis[0].value.raw, subroutineMap));
        return JSON.stringify(raw);
    }

    if (
        isTaggedTemplateExpression(expression) &&
        isIdentifier(expression.tag, 'pattern') &&
        expression.quasi.expressions.length > 0
    ) {
        const raws = expression.quasi.quasis.map((quasi) =>
            escapeForRawTemplate(stripFreeSpacing(expandSubroutineReferences(quasi.value.raw, subroutineMap))),
        );
        let out = 'String.raw`';
        for (let i = 0; i < raws.length; i++) {
            out += raws[i];
            if (i < expression.quasi.expressions.length) {
                const inner = expression.quasi.expressions[i];
                out += `\${${emitExpression(inner, code, subroutineMap)}}`;
            }
        }
        out += '`';
        return out;
    }

    if (isStaticPatternCall(expression)) {
        if (isStaticString(expression.arguments[0])) {
            return JSON.stringify(
                stripFreeSpacing(expandSubroutineReferences(getStaticString(expression.arguments[0]), subroutineMap)),
            );
        }

        if (isNumberLiteral(expression.arguments[0])) {
            return JSON.stringify(String(expression.arguments[0].value));
        }
    }

    if (isStaticString(expression)) {
        const str = getStaticString(expression);
        return JSON.stringify(str);
    }

    if (isRegExpLiteral(expression) || isStaticRegExpCall(expression)) {
        const src = code.slice((expression as unknown as AstNode).start, (expression as unknown as AstNode).end);
        return `(${src}).source`;
    }

    // Recurse on ternaries so each branch lowers (instead of falling back to the stringifier).
    if (expression.type === 'ConditionalExpression') {
        const test = code.slice((expression.test as AstNode).start, (expression.test as AstNode).end);
        const consequent = emitExpression(expression.consequent, code, subroutineMap);
        const alternate = emitExpression(expression.alternate, code, subroutineMap);
        return `((${test})?(${consequent}):(${alternate}))`;
    }

    const src = code.slice((expression as unknown as AstNode).start, (expression as unknown as AstNode).end);

    // Bare identifiers and String() calls can be emitted directly.
    if (expression.type === 'Identifier') {
        return src;
    }

    if (
        expression.type === 'CallExpression' &&
        expression.callee.type === 'Identifier' &&
        expression.callee.name === 'String'
    ) {
        return src;
    }

    // Fallback: runtime coercion that handles RegExp objects.
    return `(e => e && typeof e === "object" && "source" in e ? e.source : String(e))(${src})`;
}

function emitRegExpConstructor(
    tagged: TaggedTemplateExpression,
    code: string,
    flags?: string,
    subroutineMap: Map<string, string> = new Map(),
): string {
    const raws = getTemplateRawStrings(tagged).map(escapeForRawTemplate);

    let out = 'new RegExp(String.raw`';
    for (let i = 0; i < raws.length; i++) {
        out += raws[i];
        if (i < tagged.quasi.expressions.length) {
            out += `\${${emitExpression(tagged.quasi.expressions[i], code, subroutineMap)}}`;
        }
    }
    out += '`';
    if (flags?.length) {
        out += `, ${JSON.stringify(flags)}`;
    }
    out += ')';

    return out;
}

function emitExpandedRegExpConstructor(
    tagged: TaggedTemplateExpression,
    code: string,
    expandedQuasis: string[],
    flags?: string,
    subroutineMap: Map<string, string> = new Map(),
): string {
    let out = 'new RegExp(String.raw`';
    for (let i = 0; i < expandedQuasis.length; i++) {
        out += escapeForRawTemplate(expandedQuasis[i]);
        if (i < tagged.quasi.expressions.length) {
            out += `\${${emitExpression(tagged.quasi.expressions[i], code, subroutineMap)}}`;
        }
    }
    out += '`';
    if (flags?.length) {
        out += `, ${JSON.stringify(flags)}`;
    }
    out += ')';

    return out;
}

export { emitRegExpConstructor, emitExpandedRegExpConstructor };
