const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  {
    ignores: ['dist/**', '.expo/**', 'web-build/**', 'node_modules/**', 'scratch/**'],
  },
  ...expoConfig,
  {
    rules: {
      // Add custom team rules if needed
    },
  },
];

