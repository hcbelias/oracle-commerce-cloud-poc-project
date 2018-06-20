/**
 * Entry point for the Content Creation Wizard.
 */
const program = require("commander")

const addCommonOptions = require("./optionsUtils").addCommonOptions
const endPointTransceiver = require("./endPointTransceiver")
const exitDueToInvalidCall = require("./exitHandler").exitDueToInvalidCall
const getApplicationKey = require("./optionsUtils").getApplicationKey
const getLastNode = require("./metadata").getLastNode
const getPassword = require("./optionsUtils").getPassword
const t = require("./i18n").t
const useBasePath = require("./utils").useBasePath
const widgetCreator = require("./widgetCreator")

exports.main = function (argv) {

  // Force use of ccw rather than the actual file name of index.js.
  program._name = "ccw"

  addCommonOptions(program)
    .option("-l, --locale <locale>", t("localeOptionText"))
    .option("-w, --createWidget", t("createWidgetOptionText"), false).parse(argv)

  // Pass on the base path if it was set.
  program.base && useBasePath(program.base)

  // Must have exactly one operation - no more and no less.
  const operationsCount = ["createWidget", "createWidgetInstance", "createElement", "createStack", "clone"].reduce(
    (total, currentValue) => total + (program[currentValue] ? 1 : 0), 0)

  // Make sure we know which server we are working with. If the user did not supply a node, try to use the last one.
  if (!program.node) {
    program.node = getLastNode()
  }

  // Something is not quite right - tell the user.
  if (operationsCount !== 1 || !program.node) {
    exitDueToInvalidCall(program)
  }

  // Sort out our endpoints first.
  return endPointTransceiver.init(
    program.node,
    program.username, getPassword(program.password),
    getApplicationKey(program.applicationKey),
    program.locale, true).then(() => {

    if (program.createWidget) {
      return widgetCreator.create(program.clean)
    }
  })
}
