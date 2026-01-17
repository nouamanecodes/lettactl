// Mock chalk for Jest (chalk v5 is ESM-only)
const passthrough = (str) => str;

const chalkMock = Object.assign(passthrough, {
  hex: () => passthrough,
  rgb: () => passthrough,
  bgHex: () => passthrough,
  bgRgb: () => passthrough,
  bold: passthrough,
  dim: passthrough,
  italic: passthrough,
  underline: passthrough,
  inverse: passthrough,
  strikethrough: passthrough,
  red: passthrough,
  green: passthrough,
  yellow: passthrough,
  blue: passthrough,
  magenta: passthrough,
  cyan: passthrough,
  white: passthrough,
  gray: passthrough,
  grey: passthrough,
  bgRed: passthrough,
  bgGreen: passthrough,
  bgYellow: passthrough,
  bgBlue: passthrough,
  bgMagenta: passthrough,
  bgCyan: passthrough,
  bgWhite: passthrough,
});

module.exports = chalkMock;
module.exports.default = chalkMock;
