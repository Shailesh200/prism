const { createRequire } = require("module");
const util = require("./util.js");
const req = createRequire(__filename);
const again = createRequire(__filename)("./util.js");

module.exports = { util, again, req };
