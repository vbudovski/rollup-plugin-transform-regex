import type { RegexTagOptions } from 'regex';

type Disallowed = 'subclass' | 'plugins' | 'unicodeSetsPlugin';
type AllowedLeaf = string | boolean;

type SimpleOptions<T = RegexTagOptions> =
    // leaves
    T extends AllowedLeaf
        ? T
        : // exclude arrays explicitly
          T extends readonly unknown[]
          ? never
          : // recurse into objects; omit disallowed keys and keys with disallowed value types
            T extends Record<string, unknown>
            ? {
                  [K in keyof T as K extends Disallowed
                      ? never
                      : T[K] extends AllowedLeaf | Record<string, unknown>
                        ? K
                        : never]: SimpleOptions<T[K]>;
              }
            : never;

interface RegexOptions extends Omit<RegexTagOptions, 'subclass'> {
    //
}

export type { SimpleOptions, RegexOptions };
