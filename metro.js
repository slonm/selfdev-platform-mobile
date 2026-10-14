// Metro configuration helper for apps built on the platform:
//   const { withSelfDevPlatform } = require('@slonm/selfdev-platform-mobile/metro');
//   module.exports = withSelfDevPlatform(getDefaultConfig(__dirname));
const path = require('path');

/**
 * js-interpreter (the script sandbox) contains a lazy `require("vm")` for sandboxed regular
 * expressions. React Native has no `vm`; the platform disables regular expressions in scripts, so
 * the module is never loaded, but Metro still resolves it at bundle time. Map it to an empty module.
 */
function withSelfDevPlatform(config) {
  config.resolver = config.resolver || {};
  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules || {}),
    vm: path.join(__dirname, 'src', 'shims', 'empty.js'),
  };
  return config;
}

module.exports = { withSelfDevPlatform };
