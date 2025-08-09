import { walk } from 'npm:estree-walker';
import MagicString from 'npm:magic-string';
import { type InterpolatedValue, pattern, regex } from 'npm:regex';
import regexpTree from 'npm:regexp-tree';
import type { AstNode, Plugin, TransformResult } from 'npm:rollup';
import { createFilter, type FilterPattern } from '@rollup/pluginutils';
// @deno-types="@types/estree"
import type {
    CallExpression,
    Expression,
    Identifier,
    NewExpression,
    ObjectExpression,
    Property,
    TaggedTemplateExpression,
    TemplateLiteral,
} from 'estree';
import {
    isBooleanLiteral,
    isCallExpression,
    isExpressionStatement,
    isIdentifier,
    isNondynamicPattern,
    isNondynamicRegExpCall,
    isNondynamicString,
    isNumberLiteral,
    isRegExpLiteral,
    isSimpleOptionsObject,
    isStringLiteral,
    isTaggedTemplateExpression,
    isTemplateLiteral,
    type PatternCallExpression,
    type PatternTaggedTemplateExpression,
    type StringLiteral,
} from './guards.ts';
import type { RegexOptions, SimpleOptions } from './types.ts';

function getNondynamicString(node: StringLiteral | TemplateLiteral | TaggedTemplateExpression): string {
    if (isStringLiteral(node)) {
        return node.value;
    }

    if (isTemplateLiteral(node)) {
        return node.quasis[0].value.cooked ?? '';
    }

    return node.quasi.quasis[0].value.raw; // String.raw`...`
}

function getNondynamicRegExpCall(node: CallExpression | NewExpression): RegExp {
    const args = node.arguments ?? [];

    return new RegExp(
        getNondynamicString(args[0] as StringLiteral | TemplateLiteral | TaggedTemplateExpression),
        args[1]
            ? getNondynamicString(args[1] as StringLiteral | TemplateLiteral | TaggedTemplateExpression)
            : undefined,
    );
}

function getNondynamicPattern(
    node: PatternCallExpression | PatternTaggedTemplateExpression,
): ReturnType<typeof pattern> {
    if (isCallExpression(node)) {
        const arg = node.arguments[0];
        if (isNondynamicString(arg)) {
            return pattern(getNondynamicString(arg));
        }
        return pattern(arg.value);
    }

    return pattern(node.quasi.quasis[0].value.raw);
}

function getSimpleOptionsObject(node: ObjectExpression): SimpleOptions {
    const options: Record<string, string | boolean | SimpleOptions> = {};

    for (const property of node.properties as Property[]) {
        const key = (property.key as Identifier).name;

        if (isNondynamicString(property.value)) {
            options[key] = getNondynamicString(property.value);
        } else if (isBooleanLiteral(property.value)) {
            options[key] = property.value.value;
        } else if (isSimpleOptionsObject(property.value)) {
            options[key] = getSimpleOptionsObject(property.value);
        }
    }
    return options;
}

function isWhitelistedInterpolation(expressions: Expression[]): boolean {
    return expressions.every((e) => {
        return (
            isNondynamicString(e) ||
            isNumberLiteral(e) ||
            isRegExpLiteral(e) ||
            isNondynamicRegExpCall(e) ||
            isNondynamicPattern(e)
        );
    });
}

function getRegexCallArg(tagged: TaggedTemplateExpression): string | SimpleOptions | undefined {
    if (isCallExpression(tagged.tag)) {
        const args = tagged.tag.arguments ?? [];
        if (args.length) {
            const arg = args[0];
            if (isNondynamicString(arg)) {
                return getNondynamicString(arg);
            }
            if (isSimpleOptionsObject(arg)) {
                return getSimpleOptionsObject(arg);
            }
        }
    }
    return undefined;
}

function getRegexQuasisRaw(tagged: TaggedTemplateExpression): string[] {
    return tagged.quasi.quasis.map((q) => q.value.raw);
}

function getRegexExpressions(tagged: TaggedTemplateExpression): InterpolatedValue[] {
    const out: InterpolatedValue[] = [];
    for (const e of tagged.quasi.expressions) {
        if (isNondynamicString(e)) {
            out.push(getNondynamicString(e));
        } else if (isNumberLiteral(e)) {
            out.push(e.value);
        } else if (isRegExpLiteral(e)) {
            out.push(new RegExp(e.regex.pattern, e.regex.flags));
        } else if (isNondynamicRegExpCall(e)) {
            out.push(getNondynamicRegExpCall(e));
        } else if (isNondynamicPattern(e)) {
            out.push(getNondynamicPattern(e));
        }
    }
    return out;
}

function isRegexTemplate(node: TaggedTemplateExpression): boolean {
    if (
        !(
            isTemplateLiteral(node.quasi) &&
            (node.quasi.quasis.length === 1 || isWhitelistedInterpolation(node.quasi.expressions))
        )
    ) {
        return false;
    }
    if (isIdentifier(node.tag, 'regex')) {
        return true;
    }

    if (!(isCallExpression(node.tag) && isIdentifier(node.tag.callee, 'regex'))) {
        return false;
    }

    const args = node.tag.arguments ?? [];
    if (args.length === 0) {
        return true;
    }
    if (args.length !== 1) {
        return false;
    }

    return isNondynamicString(args[0]) || isSimpleOptionsObject(args[0]);
}

function getRegexOptions(
    callArg: string | SimpleOptions | undefined,
    opts: { disableUnicodeSets?: boolean; optimize?: boolean },
): RegexOptions {
    const { disableUnicodeSets, optimize } = opts;
    const disableV = !!(disableUnicodeSets || optimize);
    const options: RegexOptions = typeof callArg === 'string' ? { flags: callArg } : { ...(callArg ?? {}) };
    if (disableV) {
        options.disable ??= {};
        options.disable.v = true;
    }
    return options;
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

                    // Remove `import ... from "regex"` if requested
                    if (removeImport && node.type === 'ImportDeclaration') {
                        if (node.source && node.source.type === 'Literal' && node.source.value === 'regex') {
                            s ??= new MagicString(code);
                            s.remove(n.start, n.end);
                        }
                        return;
                    }

                    // Replace regex-tagged templates
                    if (isTaggedTemplateExpression(node) && isRegexTemplate(node)) {
                        const callArg = getRegexCallArg(node);
                        const options = getRegexOptions(callArg, {
                            disableUnicodeSets,
                            optimize,
                        });
                        const quasis = getRegexQuasisRaw(node);
                        const expressions = getRegexExpressions(node);

                        let re = regex(options)({ raw: quasis }, ...expressions);
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

                        const literal = `/${re.source}/${re.flags}`;
                        s ??= new MagicString(code);
                        s.overwrite(n.start, n.end, literal);

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
