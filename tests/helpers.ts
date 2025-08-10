import { parse } from 'acorn';
import type { TransformResult } from 'rollup';
import { type RegexTransformPluginOptions, regexTransformPlugin } from '../src/index.ts';

function makeTransformed(module: string) {
    return (input: string, options: RegexTransformPluginOptions = {}): string => {
        const plugin = regexTransformPlugin(options);
        const transform = plugin.transform as unknown as (
            this: { parse: typeof parse },
            code: string,
            id: string,
        ) => TransformResult;

        const context = {
            parse: (input: string) =>
                parse(input, {
                    ecmaVersion: 'latest',
                    sourceType: 'module',
                    locations: false,
                    ranges: false,
                    allowAwaitOutsideFunction: true,
                }),
        };

        return (transform.call(context, input, module) as { code: string }).code;
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
