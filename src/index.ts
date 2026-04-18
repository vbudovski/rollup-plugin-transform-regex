import { createFilter, type FilterPattern } from '@rollup/pluginutils';
import type { Expression, Identifier, ObjectExpression, Property, TaggedTemplateExpression } from 'estree';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import { type InterpolatedValue, regex } from 'regex';
import regexpTree from 'regexp-tree';
import type { AstNode, Plugin, TransformResult } from 'rollup';
import {
    getStaticPattern,
    getStaticRegExpCall,
    getStaticString,
    getTemplateRawStrings,
    isBooleanLiteral,
    isCallExpression,
    isExpressionStatement,
    isIdentifier,
    isNumberLiteral,
    isRegExpLiteral,
    isSimpleOptionsObject,
    isStaticPattern,
    isStaticRegExpCall,
    isStaticString,
    isTaggedTemplateExpression,
    isTemplateLiteral,
} from './ast.ts';
import { emitExpandedRegExpConstructor, emitRegExpConstructor } from './emit.ts';
import { computeOutputFlags, getRegexOptions } from './options.ts';
import { expandSubroutines } from './subroutines.ts';
import type { SimpleOptions } from './types.ts';

/**
 * Characters that are reserved inside character classes in v-mode but not in
 * u-mode.  `RegExp.prototype.source` may leave them unescaped because the
 * engine doesn't re-serialize for a specific flag context.
 */
const V_FLAG_CHARACTER_CLASS_RESERVED = new Set([
    '&',
    '!',
    '#',
    '$',
    '%',
    '*',
    '+',
    ',',
    '.',
    ':',
    ';',
    '<',
    '=',
    '>',
    '?',
    '@',
    '`',
    '~',
    '^',
]);

/**
 * Post-process a regex source so that reserved double-punctuator characters
 * inside character classes are escaped for the v flag.
 */
function escapeVFlagReservedInCharacterClasses(source: string): string {
    let result = '';
    let characterClassDepth = 0;
    let index = 0;

    while (index < source.length) {
        const character = source[index];

        // Skip escape sequences.
        if (character === '\\') {
            result += character + (source[index + 1] ?? '');
            index += 2;
            continue;
        }

        if (character === '[') {
            characterClassDepth++;
            result += character;
            index++;
            // Preserve negation caret at the start of a class.
            if (index < source.length && source[index] === '^') {
                result += '^';
                index++;
            }
            continue;
        }

        if (character === ']' && characterClassDepth > 0) {
            characterClassDepth--;
            result += character;
            index++;
            continue;
        }

        if (characterClassDepth > 0 && V_FLAG_CHARACTER_CLASS_RESERVED.has(character)) {
            if (source[index + 1] === character) {
                // Doubled punctuator (e.g. &&, !!) — escape both.
                result += '\\' + character + '\\' + character;
                index += 2;
            } else {
                result += character;
                index++;
            }
            continue;
        }

        result += character;
        index++;
    }

    return result;
}

function getSimpleOptionsObject(node: ObjectExpression): SimpleOptions {
    const options: Record<string, string | boolean | SimpleOptions> = {};

    for (const property of node.properties as Property[]) {
        const key = (property.key as Identifier).name;

        if (isStaticString(property.value)) {
            options[key] = getStaticString(property.value);
        } else if (isBooleanLiteral(property.value)) {
            options[key] = property.value.value;
        } else if (isSimpleOptionsObject(property.value)) {
            options[key] = getSimpleOptionsObject(property.value);
        }
    }
    return options;
}

/**
 * Try to resolve all template expressions to static interpolated values in a
 * single pass. Returns the values if every expression is precomputable, or
 * null if any expression is dynamic.
 */
function tryPrecomputeExpressions(expressions: Expression[]): InterpolatedValue[] | null {
    const out: InterpolatedValue[] = [];
    for (const e of expressions) {
        if (isStaticString(e)) {
            out.push(getStaticString(e));
        } else if (isNumberLiteral(e)) {
            out.push(e.value);
        } else if (isRegExpLiteral(e)) {
            out.push(new RegExp(e.regex.pattern, e.regex.flags));
        } else if (isStaticRegExpCall(e)) {
            out.push(getStaticRegExpCall(e));
        } else if (isStaticPattern(e)) {
            out.push(getStaticPattern(e));
        } else {
            return null;
        }
    }
    return out;
}

function getRegexCallArgument(tagged: TaggedTemplateExpression): string | SimpleOptions | undefined {
    if (isCallExpression(tagged.tag)) {
        const args = tagged.tag.arguments ?? [];
        if (args.length) {
            const arg = args[0];
            if (isStaticString(arg)) {
                return getStaticString(arg);
            }
            if (isSimpleOptionsObject(arg)) {
                return getSimpleOptionsObject(arg);
            }
        }
    }
    return undefined;
}

function isRegexTemplate(node: TaggedTemplateExpression): boolean {
    if (!isTemplateLiteral(node.quasi)) {
        return false;
    }

    // regex`...`.
    if (isIdentifier(node.tag, 'regex')) {
        return true;
    }

    // regex(...)`...` where the single arg (if any) is static.
    if (isCallExpression(node.tag) && isIdentifier(node.tag.callee, 'regex')) {
        const args = node.tag.arguments ?? [];
        return args.length === 0 || (args.length === 1 && (isStaticString(args[0]) || isSimpleOptionsObject(args[0])));
    }

    return false;
}

interface RegexTransformPluginOptions {
    optimize?: boolean;
    disableUnicodeSets?: boolean;
    removeImport?: boolean;
    headerComment?: string;
    include?: FilterPattern;
    exclude?: FilterPattern;
}

function regexTransformPlugin({
    optimize = false,
    disableUnicodeSets = false,
    removeImport = false,
    headerComment = '',
    include = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    exclude,
}: RegexTransformPluginOptions = {}): Plugin {
    const filter = createFilter(include, exclude);

    return {
        name: 'regex-transform',
        transform(code: string, id: string): TransformResult {
            if (!filter(id)) {
                return null;
            }

            let s: MagicString | undefined;

            const ast = this.parse(code);

            walk(ast, {
                enter(node, parent) {
                    const n = node as AstNode;

                    if (removeImport && node.type === 'ImportDeclaration') {
                        if (node.source && node.source.type === 'Literal' && node.source.value === 'regex') {
                            s ??= new MagicString(code);
                            s.remove(n.start, n.end);
                        }
                        return;
                    }

                    if (isTaggedTemplateExpression(node) && isRegexTemplate(node)) {
                        const callArg = getRegexCallArgument(node);
                        const precomputed =
                            node.quasi.quasis.length === 1 ? [] : tryPrecomputeExpressions(node.quasi.expressions);

                        if (precomputed) {
                            // Static expressions that can be turned into a literal.
                            const options = getRegexOptions(callArg, {
                                disableUnicodeSets,
                                optimize,
                            });
                            const quasis = getTemplateRawStrings(node);

                            let re = regex(options)({ raw: quasis }, ...precomputed);
                            if (optimize && !options.force?.v) {
                                re = regexpTree
                                    .optimize(re, [
                                        'charEscapeUnescape',
                                        'groupSingleCharsToCharClass',
                                        'removeEmptyGroup',
                                        'ungroup',
                                    ])
                                    .toRegExp();
                            }

                            const source = re.flags.includes('v')
                                ? escapeVFlagReservedInCharacterClasses(re.source)
                                : re.source;
                            const literal = `/${source}/${re.flags}`;
                            s ??= new MagicString(code);
                            s.overwrite(n.start, n.end, literal);
                        } else {
                            // Dynamic expressions that need to be called with the RegExp constructor.
                            const outFlags = computeOutputFlags(callArg, { disableUnicodeSets, optimize });

                            const result = expandSubroutines(node, callArg, {
                                disableUnicodeSets,
                                optimize,
                            });

                            const replacement = result
                                ? emitExpandedRegExpConstructor(
                                      node,
                                      code,
                                      result.expandedQuasis,
                                      outFlags,
                                      result.subroutineMap,
                                  )
                                : emitRegExpConstructor(node, code, outFlags);
                            s ??= new MagicString(code);
                            s.overwrite(n.start, n.end, replacement);
                        }

                        if (isExpressionStatement(parent) && parent.expression === node) {
                            const parentNode = parent as unknown as AstNode;
                            const hasSemicolon = code[parentNode.end - 1] === ';';
                            if (!hasSemicolon) {
                                s.appendLeft(parentNode.end, ';');
                            }
                        }
                    }
                },
            });

            if (headerComment) {
                s ??= new MagicString(code);
                s.prepend(`/*\n${headerComment}\n*/`);
            }

            return {
                code: s?.toString() ?? code,
                map: s?.generateMap({ hires: true, source: id }) ?? null,
            };
        },
    };
}

export { regexTransformPlugin };
export type { RegexTransformPluginOptions };
