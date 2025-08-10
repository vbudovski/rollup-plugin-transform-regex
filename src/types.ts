// @deno-types="@types/estree"
import type {
    CallExpression,
    Identifier,
    Literal,
    NewExpression,
    TaggedTemplateExpression,
    TemplateElement,
    TemplateLiteral,
} from 'estree';
import type { RegexTagOptions } from 'regex';

type Disallowed = 'subclass' | 'plugins' | 'unicodeSetsPlugin';
type AllowedPrimitive = string | boolean;

type SimpleOptions<T = RegexTagOptions> =
    // leaves
    T extends AllowedPrimitive
        ? T
        : // exclude arrays explicitly
          T extends readonly unknown[]
          ? never
          : // recurse into objects; omit disallowed keys and keys with disallowed value types
            T extends Record<string, unknown>
            ? {
                  [K in keyof T as K extends Disallowed
                      ? never
                      : T[K] extends AllowedPrimitive | Record<string, unknown>
                        ? K
                        : never]: SimpleOptions<T[K]>;
              }
            : never;

interface RegexOptions extends Omit<RegexTagOptions, 'subclass'> {
    subclass?: false;
}

type StringLiteral = Literal & { value: string };

type NumberLiteral = Literal & { value: number };

type BooleanLiteral = Literal & { value: boolean };

type StaticPatternArg = StringLiteral | TemplateLiteral | TaggedTemplateExpression | NumberLiteral;

type PatternCallExpression = CallExpression & {
    callee: Identifier & { name: 'pattern' };
    arguments: [StaticPatternArg];
};

type PatternTaggedTemplateExpression = TaggedTemplateExpression & {
    tag: Identifier & { name: 'pattern' };
    quasi: TemplateLiteral & { quasis: [TemplateElement]; expressions: [] };
};

type StringLike = StringLiteral | TemplateLiteral | TaggedTemplateExpression;

type RegExpConstructorCall = (CallExpression | NewExpression) & {
    callee: Identifier & { name: 'RegExp' };
    arguments: [StringLike] | [StringLike, StringLike];
};

export type {
    SimpleOptions,
    RegexOptions,
    StringLiteral,
    NumberLiteral,
    BooleanLiteral,
    StaticPatternArg,
    PatternCallExpression,
    PatternTaggedTemplateExpression,
    StringLike,
    RegExpConstructorCall,
};
