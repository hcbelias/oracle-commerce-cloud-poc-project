"use strict"
const program = require("commander")

const addCommonOptions = require("./optionsUtils").addCommonOptions
const endPointTransceiver = require("./endPointTransceiver")
const getLastNode = require("./metadata").getLastNode
const proxy = require("./cloudProxy")
const t = require("./i18n").t
const useBasePath = require("./utils").useBasePath
const setVerboseLogging = require("./logger").setVerboseLogging

exports.main = function (argv) {

  // Force use of ccproxy rather than the actual file name of ccproxy.js.
  program._name = "ccproxy"

  program
    .version(require("../package.json").version)
    .option("-v, --verbose", t("verboseOptionText"))
    .option("-n, --node <node>", t("nodeOptionText"))
    .option("-b, --base <directory>", t("baseOptionText"))
    .option("-P, --port <port>", t("portOptionText"), 8088)
    .parse(argv)

  // Pass on the base path if it was set.
  if (program.base) {
    useBasePath(program.base)
  }

  // Make sure we know which server we are working with. If the user did not supply a node, try to use the last one.
  if (!program.node) {
    program.node = getLastNode()
  }

  // Something is not quite right - tell the user.
  if (!program.node) {
    program.help()
    return 1
  }

  setVerboseLogging(program.verbose)

  // Options passed by environment variable should trump the command line.
  const port = process.env['CC_DEVPROXY_PORT'] || program.port

  // Sort out our endpoints first.
  return proxy.startProxyDaemon(program.node, port)
}
