// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['node_modules/*'] },
  // Build-time helper loaded by the app's Metro config in Node.
  { files: ['metro.js'], languageOptions: { globals: { __dirname: 'readonly', require: 'readonly', module: 'writable' } } },
]);
