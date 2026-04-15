import type { RegexOptions, SimpleOptions } from './types.ts';

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

function hasFlags(x: unknown): x is { flags: string } {
    return x != null && typeof x === 'object' && 'flags' in x && typeof x.flags === 'string';
}

function hasForceUnicodeSets(x: unknown): x is { force?: { v?: boolean } } {
    return x != null && typeof x === 'object' && 'force' in x && !!x.force;
}

function flagsFromCallArgument(callArg: string | SimpleOptions | undefined): string | undefined {
    if (typeof callArg === 'string') {
        return callArg;
    }
    if (hasFlags(callArg)) {
        return callArg.flags;
    }

    return undefined;
}

function deduplicateFlags(flags: string): string {
    return [...new Set(flags)].join('');
}

function computeOutputFlags(
    callArg: string | SimpleOptions | undefined,
    options: { disableUnicodeSets?: boolean; optimize?: boolean },
): string | undefined {
    let flags = flagsFromCallArgument(callArg) ?? '';

    const wantDisableV =
        (options.disableUnicodeSets || options.optimize) && !(hasForceUnicodeSets(callArg) && callArg.force?.v);
    if (wantDisableV) {
        flags = flags.replace(/v/g, '');
    } else {
        flags += 'v';
    }
    flags = deduplicateFlags(flags);

    return flags.length ? flags : undefined;
}

export { getRegexOptions, computeOutputFlags };
