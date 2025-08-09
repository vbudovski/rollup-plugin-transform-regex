import { parse } from 'acorn';
import { type RegexTransformPluginOptions, regexTransformPlugin } from '../src/index.ts';

function makeTransformed(module: string) {
    return (input: string, options: RegexTransformPluginOptions = {}): string => {
        const context = {
            parse: (input: string) =>
                parse(input, {
                    ecmaVersion: 'latest',
                    sourceType: 'module',
                    locations: false,
                    ranges: false,
                    allowAwaitOutsideFunction: true,
                }),
            ...regexTransformPlugin(options),
        };

        return (context as any).transform(input, module).code;
    };
}

function actual(regex: RegExp) {
    return `${String(regex)};`;
}

const flagVSupported = (() => {
    try {
        // biome-ignore lint/complexity/useRegexLiterals: Preserve original implementation.
        new RegExp('', 'v');
    } catch (_e) {
        return false;
    }
    return true;
})();

export { makeTransformed, actual, flagVSupported };
