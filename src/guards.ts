// @deno-types="@types/estree"
import type {
    CallExpression,
    ExpressionStatement,
    Identifier,
    Literal,
    MemberExpression,
    NewExpression,
    Node,
    ObjectExpression,
    Property,
    RegExpLiteral,
    TaggedTemplateExpression,
    TemplateElement,
    TemplateLiteral,
} from 'estree';

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

type StringLiteral = Literal & { value: string };

const isStringLiteral = (node: Node | null | undefined): node is StringLiteral =>
    isLiteral(node) && typeof node.value === 'string';

type NumberLiteral = Literal & { value: number };

const isNumberLiteral = (node: Node | null | undefined): node is NumberLiteral =>
    isLiteral(node) && typeof node.value === 'number';

type BooleanLiteral = Literal & { value: boolean };

const isBooleanLiteral = (node: Node | null | undefined): node is BooleanLiteral =>
    isLiteral(node) && typeof node.value === 'boolean';

const isRegExpLiteral = (node: Node | null | undefined): node is RegExpLiteral =>
    isLiteral(node) && (node as RegExpLiteral).regex != null;

function isNondynamicString(node: Node): node is StringLiteral | TemplateLiteral | TaggedTemplateExpression {
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

function isNondynamicRegExpCall(node: Node): node is CallExpression | NewExpression {
    if (!isNewExpression(node) && !isCallExpression(node)) {
        return false;
    }

    const args = node.arguments ?? [];

    return (
        isIdentifier(node.callee, 'RegExp') &&
        (args.length === 1 || args.length === 2) &&
        args.every((a) => isNondynamicString(a))
    );
}

type NondynamicPatternArg = StringLiteral | TemplateLiteral | TaggedTemplateExpression | NumberLiteral;

type PatternCallExpression = CallExpression & {
    callee: Identifier & { name: 'pattern' };
    arguments: [NondynamicPatternArg];
};

type PatternTaggedTemplateExpression = TaggedTemplateExpression & {
    tag: Identifier & { name: 'pattern' };
    quasi: TemplateLiteral & { quasis: [TemplateElement]; expressions: [] };
};

function isNondynamicPatternCall(node: Node): node is PatternCallExpression {
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

    return isNondynamicString(args[0]) || isNumberLiteral(args[0]);
}

function isNondynamicPatternTaggedTemplateExpression(node: Node): node is PatternTaggedTemplateExpression {
    if (!isTaggedTemplateExpression(node)) {
        return false;
    }
    if (!isIdentifier(node.tag, 'pattern')) {
        return false;
    }

    return isTemplateLiteral(node.quasi) && node.quasi.quasis.length === 1 && node.quasi.expressions.length === 0;
}

function isNondynamicPattern(node: Node): node is PatternCallExpression | PatternTaggedTemplateExpression {
    return isNondynamicPatternCall(node) || isNondynamicPatternTaggedTemplateExpression(node);
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

            return isSimpleOptionsObject(p.value) || isNondynamicString(p.value) || isBooleanLiteral(p.value);
        })
    );
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
    isNondynamicString,
    isNondynamicRegExpCall,
    type PatternCallExpression,
    type PatternTaggedTemplateExpression,
    isNondynamicPattern,
    isSimpleOptionsObject,
};
