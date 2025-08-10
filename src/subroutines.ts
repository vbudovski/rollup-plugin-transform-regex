// @deno-types="@types/estree"
import type { TaggedTemplateExpression } from 'estree';
import { regex } from 'regex';
import { getTemplateRawStrings } from './ast.ts';
import { getRegexOptions } from './options.ts';
import type { RegexOptions, SimpleOptions } from './types.ts';

const EXPR_MARKER = '\x00';
const DEFINE_PREFIX = '(?(DEFINE)';

/**
 * Scan forward from `start` (which should point just past an opening paren)
 * tracking paren depth, skipping escaped characters and character classes.
 * Returns the index just after the matching closing paren, or -1 if unmatched.
 */
function findMatchingParenthesis(str: string, start: number): number {
    let depth = 1;
    let pos = start;
    while (pos < str.length && depth > 0) {
        const ch = str[pos];
        if (ch === '\\') {
            pos += 2;
            continue;
        }
        if (ch === '[') {
            pos++;
            if (pos < str.length && str[pos] === '^') pos++;
            if (pos < str.length && str[pos] === ']') pos++;
            while (pos < str.length && str[pos] !== ']') {
                if (str[pos] === '\\') pos++;
                pos++;
            }
            pos++;
            continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        pos++;
    }
    return depth === 0 ? pos : -1;
}

/**
 * Parse the (?(DEFINE) ...) block from raw quasis and extract named groups
 * whose definitions are fully contained within a single template segment
 * (i.e. they don't contain dynamic expressions).
 */
function extractStaticDefineGroups(quasis: string[]): Map<string, string> {
    const full = quasis.join(EXPR_MARKER);

    const defineIdx = full.indexOf(DEFINE_PREFIX);
    if (defineIdx === -1) return new Map();

    const contentStart = defineIdx + DEFINE_PREFIX.length;
    const end = findMatchingParenthesis(full, contentStart);
    if (end === -1) return new Map();

    const defineContent = full.slice(contentStart, end - 1);

    const groups = new Map<string, string>();
    let searchPosition = 0;
    while (searchPosition < defineContent.length) {
        const idx = defineContent.indexOf('(?<', searchPosition);
        if (idx === -1) break;

        const nameEnd = defineContent.indexOf('>', idx + 3);
        if (nameEnd === -1) break;
        const name = defineContent.slice(idx + 3, nameEnd);

        if (name.includes(EXPR_MARKER)) {
            searchPosition = nameEnd + 1;
            continue;
        }

        const groupEnd = findMatchingParenthesis(defineContent, nameEnd + 1);

        if (groupEnd !== -1) {
            const content = defineContent.slice(nameEnd + 1, groupEnd - 1);
            if (!content.includes(EXPR_MARKER)) {
                groups.set(name, content.trim());
            }
        }

        searchPosition = Math.max(searchPosition + 1, groupEnd === -1 ? nameEnd + 1 : groupEnd);
    }

    return groups;
}

/**
 * Build a map of subroutine name → expanded regex source by running the
 * regex builder on each static DEFINE group individually.
 */
function buildSubroutineMap(quasis: string[], options: RegexOptions): Map<string, string> {
    const staticGroups = extractStaticDefineGroups(quasis);
    if (staticGroups.size === 0) return new Map();

    // Filter to only groups whose \g<name> references are all resolvable
    // within the static group set. Groups referencing dynamic groups would
    // cause the regex builder to fail.
    const resolvable = new Map<string, string>();
    for (const [name, content] of staticGroups) {
        const refs = [...content.matchAll(/\\g<([^>]+)>/g)].map((match) => match[1]);
        if (refs.every((ref) => staticGroups.has(ref))) {
            resolvable.set(name, content);
        }
    }
    if (resolvable.size === 0) return new Map();

    // Reconstruct a DEFINE block containing only the resolvable groups.
    let defineBlock = DEFINE_PREFIX;
    for (const [name, content] of resolvable) {
        defineBlock += ` (?<${name}> ${content})`;
    }
    defineBlock += ')';

    const map = new Map<string, string>();
    for (const name of resolvable.keys()) {
        try {
            const re = regex(options)({ raw: [`\\g<${name}> ${defineBlock}`] });
            map.set(name, re.source);
        } catch {
            // Skip groups that fail to expand.
        }
    }

    return map;
}

/** Replace `\g<name>` references in a raw string with expanded sources. */
function expandSubroutineReferences(raw: string, subroutineMap: Map<string, string>): string {
    if (subroutineMap.size === 0) return raw;
    return raw.replace(/\\g<([^>]+)>/g, (_match, name) => {
        return subroutineMap.get(name) ?? _match;
    });
}

function createPlaceholder(i: number) {
    return `__REGEX_PLACEHOLDER_${i}__`;
}

interface SubroutineExpansionResult {
    expandedQuasis: string[];
    subroutineMap: Map<string, string>;
}

function expandSubroutines(
    tagged: TaggedTemplateExpression,
    callArg: string | SimpleOptions | undefined,
    transformOptions: { disableUnicodeSets?: boolean; optimize?: boolean },
): SubroutineExpansionResult | null {
    const quasis = getTemplateRawStrings(tagged);
    const exprCount = tagged.quasi.expressions.length;
    const placeholders = Array.from({ length: exprCount }, (_, i) => createPlaceholder(i));

    // Use the builder to expand subroutine groups and strip their definitions.
    let re: RegExp;
    const options = getRegexOptions(callArg, transformOptions);
    try {
        re = regex(options)({ raw: quasis }, ...placeholders);
    } catch {
        return null;
    }

    const src = re.source;
    const expanded: string[] = [];
    let cursor = 0;

    for (let i = 0; i < placeholders.length; i++) {
        const placeholder = placeholders[i];
        const index = src.indexOf(placeholder, cursor);
        if (index === -1) {
            return null;
        }

        let before = src.slice(cursor, index);
        let nextPos = index + placeholder.length;

        // Strip the builder's synthetic non-capturing wrapper.
        if (
            before.endsWith('(?:') &&
            src.charCodeAt(nextPos) === ')'.charCodeAt(0) &&
            (() => {
                const nextCharCode = src.charCodeAt(nextPos + 1);
                // If next is a quantifier, don't strip: ?, *, + or {.
                return !(
                    nextCharCode === '?'.charCodeAt(0) ||
                    nextCharCode === '*'.charCodeAt(0) ||
                    nextCharCode === '+'.charCodeAt(0) ||
                    nextCharCode === '{'.charCodeAt(0)
                );
            })()
        ) {
            before = before.slice(0, -3);
            nextPos += 1; // Skip the ')'.
        }

        expanded.push(before);
        cursor = nextPos;
    }
    expanded.push(src.slice(cursor));

    // Build subroutine map for expanding \g<name> refs in pattern expressions.
    const subroutineMap = buildSubroutineMap(quasis, options);

    return { expandedQuasis: expanded, subroutineMap };
}

export { expandSubroutines, expandSubroutineReferences };
