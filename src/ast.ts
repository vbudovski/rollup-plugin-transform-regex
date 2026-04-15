import type {
    CallExpression,
    Expression,
    ExpressionStatement,
    Identifier,
    Literal,
    MemberExpression,
    NewExpression,
    Node,
    ObjectExpression,
    Property,
    RegExpLiteral,
    SpreadElement,
    TaggedTemplateExpression,
    TemplateLiteral,
} from 'estree';
import { pattern } from 'regex';
import type {
    BooleanLiteral,
    NumberLiteral,
    PatternCallExpression,
    PatternTaggedTemplateExpression,
    RegExpConstructorCall,
    StringLike,
    StringLiteral,
} from './types.ts';

const isIdentifier = (node: Node | null | undefined, name?: string): node is Identifier =>
    node?.type === 'Identifier' && (name ? node.name === name : true);

const isCallExpression = (node: Node | null | undefined): node is CallExpression => node?.type === 'CallExpression';

const isNewExpression = (node: Node | null | undefined): node is NewExpression => node?.type === 'NewExpression';

const isTemplateLiteral = (node: Node | null | undefined): node is TemplateLiteral => node?.type === 'TemplateLiteral';

const isTaggedTemplateExpression = (node: Node | null | undefined): node is TaggedTemplateExpression =>
    node?.type === 'TaggedTemplateExpression';

const isMemberExpression = (node: Node | null | undefined): node is MemberExpression =>
    node?.type === 'MemberExpression';

const isObjectExpression = (node: Node | null | undefined): node is ObjectExpression =>
    node?.type === 'ObjectExpression';

const isExpressionStatement = (node: Node | null | undefined): node is ExpressionStatement =>
    node?.type === 'ExpressionStatement';

const isProperty = (node: Node | null | undefined): node is Property =>
    node?.type === 'Property' && node.kind === 'init';

const isLiteral = (node: Node | null | undefined): node is Literal => node?.type === 'Literal';

const isStringLiteral = (node: Node | null | undefined): node is StringLiteral =>
    isLiteral(node) && typeof node.value === 'string';

const isNumberLiteral = (node: Node | null | undefined): node is NumberLiteral =>
    isLiteral(node) && typeof node.value === 'number';

const isBooleanLiteral = (node: Node | null | undefined): node is BooleanLiteral =>
    isLiteral(node) && typeof node.value === 'boolean';

const isRegExpLiteral = (node: Node | null | undefined): node is RegExpLiteral =>
    isLiteral(node) && (node as RegExpLiteral).regex != null;

function isStaticString(node: Node): node is StringLiteral | TemplateLiteral | TaggedTemplateExpression {
    return (
        isStringLiteral(node) ||
        (isTemplateLiteral(node) && node.quasis.length === 1 && node.expressions.length === 0) ||
        (isTaggedTemplateExpression(node) &&
            isTemplateLiteral(node.quasi) &&
            node.quasi.quasis.length === 1 &&
            node.quasi.expressions.length === 0 &&
            isMemberExpression(node.tag) &&
            !node.tag.computed &&
            isIdentifier(node.tag.object, 'String') &&
            isIdentifier(node.tag.property, 'raw'))
    );
}

function isStringArgument(arg: Expression | SpreadElement): arg is StringLike {
    return arg.type !== 'SpreadElement' && isStaticString(arg);
}

function isStaticRegExpCall(node: Node): node is RegExpConstructorCall {
    if (node.type !== 'CallExpression' && node.type !== 'NewExpression') {
        return false;
    }

    if (node.callee.type !== 'Identifier' || node.callee.name !== 'RegExp') {
        return false;
    }

    const args = node.arguments ?? [];
    if (!(args.length === 1 || args.length === 2)) {
        return false;
    }

    if (!isStringArgument(args[0])) {
        return false;
    }

    return !(args.length === 2 && !isStringArgument(args[1]));
}

function isStaticPatternCall(node: Node): node is PatternCallExpression {
    if (!isCallExpression(node)) {
        return false;
    }
    if (!isIdentifier(node.callee, 'pattern')) {
        return false;
    }

    const args = node.arguments ?? [];
    if (args.length !== 1) {
        return false;
    }

    if (args[0].type === 'SpreadElement') {
        return false;
    }

    return isStaticString(args[0]) || isNumberLiteral(args[0]);
}

function isStaticPatternTemplate(node: Node): node is PatternTaggedTemplateExpression {
    if (!isTaggedTemplateExpression(node)) {
        return false;
    }
    if (!isIdentifier(node.tag, 'pattern')) {
        return false;
    }

    return isTemplateLiteral(node.quasi) && node.quasi.quasis.length === 1 && node.quasi.expressions.length === 0;
}

function isStaticPattern(node: Node): node is PatternCallExpression | PatternTaggedTemplateExpression {
    return isStaticPatternCall(node) || isStaticPatternTemplate(node);
}

function isSimpleOptionsObject(node: Node): node is ObjectExpression {
    const disallowed = new Set(['subclass', 'plugins', 'unicodeSetsPlugin']);
    return (
        isObjectExpression(node) &&
        node.properties.every((p) => {
            if (!isProperty(p) || p.method || p.computed || p.shorthand) {
                return false;
            }
            if (!isIdentifier(p.key) || disallowed.has(p.key.name)) {
                return false;
            }

            return isSimpleOptionsObject(p.value) || isStaticString(p.value) || isBooleanLiteral(p.value);
        })
    );
}

function getStaticString(node: StringLiteral | TemplateLiteral | TaggedTemplateExpression): string {
    if (isStringLiteral(node)) {
        return node.value;
    }

    if (isTemplateLiteral(node)) {
        return node.quasis[0].value.cooked ?? '';
    }

    return node.quasi.quasis[0].value.raw; // String.raw`...`
}

function getStaticRegExpCall(node: RegExpConstructorCall): RegExp {
    const args = node.arguments ?? [];

    return new RegExp(getStaticString(args[0]), args[1] ? getStaticString(args[1]) : undefined);
}

function getStaticPattern(node: PatternCallExpression | PatternTaggedTemplateExpression): ReturnType<typeof pattern> {
    if (isCallExpression(node)) {
        const arg = node.arguments[0];
        if (isStaticString(arg)) {
            return pattern(getStaticString(arg));
        }
        return pattern(arg.value);
    }

    return pattern(node.quasi.quasis[0].value.raw);
}

function getTemplateRawStrings(tagged: TaggedTemplateExpression): string[] {
    return tagged.quasi.quasis.map((quasi) => quasi.value.raw);
}

export {
    isIdentifier,
    isCallExpression,
    isNewExpression,
    isTemplateLiteral,
    isTaggedTemplateExpression,
    isMemberExpression,
    isObjectExpression,
    isExpressionStatement,
    isProperty,
    type StringLiteral,
    isStringLiteral,
    isNumberLiteral,
    isBooleanLiteral,
    isRegExpLiteral,
    isStaticString,
    isStaticRegExpCall,
    type PatternCallExpression,
    type PatternTaggedTemplateExpression,
    isStaticPattern,
    isSimpleOptionsObject,
    isStaticPatternTemplate,
    isStaticPatternCall,
    getStaticString,
    getStaticPattern,
    getStaticRegExpCall,
    getTemplateRawStrings,
};
