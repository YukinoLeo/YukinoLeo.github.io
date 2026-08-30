// =====================================================
// KaTeX markdown rendering
// Renders $...$ (inline) and $$...$$ (block) LaTeX to KaTeX
// HTML during the markdown -> HTML step (hexo-renderer-marked).
// Pages enable it with `katex: true` in front matter
// (math.per_page is true), see themes/butterfly math config.
// =====================================================

const markedKatex = require('marked-katex-extension')

hexo.extend.filter.register('marked:use', function (markedUse) {
  // nonStandard: allow $...$ directly followed/preceded by CJK characters
  // (the default rule requires a space/delimiter around $, which fails in
  // Chinese sentences like "$x_t$ 可以直接写成").
  markedUse(markedKatex({ throwOnError: false, nonStandard: true }))
})
