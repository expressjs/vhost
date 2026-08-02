import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', 'node_modules/']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true
      }
    }
  },
  {
    files: ['bench/**/*.{mjs,cjs}', 'test/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
)
