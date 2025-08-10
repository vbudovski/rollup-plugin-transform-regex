[![Release](https://github.com/vbudovski/rollup-plugin-transform-regex/actions/workflows/release.yml/badge.svg)](https://github.com/vbudovski/rollup-plugin-transform-regex/actions/workflows/release.yml)
[![Coverage](https://gist.githubusercontent.com/vbudovski/80548a1b87f9f00fe1ae426ca6a2a517/raw/vbudovski_rollup-plugin-transform-regex_main-coverage.svg)](https://github.com/vbudovski/rollup-plugin-transform-regex/actions/workflows/release.yml)
[![JSR](https://jsr.io/badges/@vbudovski/rollup-plugin-transform-regex)](https://jsr.io/@vbudovski/rollup-plugin-transform-regex)
[![JSR Score](https://jsr.io/badges/@vbudovski/rollup-plugin-transform-regex/score)](https://jsr.io/@vbudovski/rollup-plugin-transform-regex)

---

# Transform Regex+ Rollup Plugin

This is a [Rollup](https://rollupjs.org) plugin that transpiles tagged [Regex+](https://github.com/slevithan/regex)
regex templates into native RegExp literals, enabling syntax for modern, readable regex features (atomic groups,
subroutines, insignificant whitespace, comments, etc.) without the need for calling regex at runtime. Although Regex+ is
already a lightweight and high-performance library, this takes things further by giving you its developer experience
benefits without adding any runtime dependencies and without users paying any runtime cost.

Note: This is a port of the
existing [babel-plugin-transform-regex](https://github.com/slevithan/babel-plugin-transform-regex).
