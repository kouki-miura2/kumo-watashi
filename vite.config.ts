import { defineConfig } from 'vite-plus'

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    semi: false,
    singleQuote: true,
    sortImports: true,
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'func-style': ['error', 'expression'],
      'prefer-arrow-callback': 'error',
    },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
})
