"use strict"

const constants = require("./constants").constants
const endPointTransceiver = require("./endPointTransceiver")
const exists = require("./utils").exists
const grabAllApplicationJavaScript = require("./applicationJavaScriptGrabber").grabAllApplicationJavaScript
const grabAllThemes = require("./themeGrabber").grabAllThemes
const grabCommonTextSnippets = require("./textSnippetGrabber").grabCommonTextSnippets
const grabAllStacks = require("./stackGrabber").grabAllStacks
const grabAllElements = require("./elementGrabber").grabAllElements
const grabAllWidgets = require("./widgetGrabber").grabAllWidgets
const info = require("./logger").info
const mkdirIfNotExists = require("./utils").mkdirIfNotExists
const packageVersion = require('../package.json').version
const removeTree = require("./utils").removeTree
const writeMetadata = require("./metadata").writeMetadata

/**
 * Entry point. Grabs all it can from the server.
 * @returns {Promise.<T>}
 */
exports.grab = function (node, clean) {

  // See if we want to start afresh.
  clean && clearExistingDirs()

  // Create tracking directory first if it does not already exist.
  mkdirIfNotExists(constants.trackingDir)

  // Store basic info in the tracking directory.
  storeNodeInfo(node, endPointTransceiver.commerceCloudVersion)

  // Need to wait for everything to finish.
  return grabAllStacks()
    .then(grabAllWidgets)
    .then(grabCommonTextSnippets)
    .then(grabAllElements)
    .then(grabAllThemes)
    .then(grabAllApplicationJavaScript)
    .then(() => info("allDone"))
}

/**
 * Store high level info about the grab in the tracking directory - including the node package version.
 * @param node
 */
function storeNodeInfo(node, commerceCloudVersion) {
  writeMetadata(constants.configMetadataJson, {node, commerceCloudVersion, packageVersion})
}

/**
 * Before we grab anything, get rid of what is already there.
 */
function clearExistingDirs() {
  [
    constants.trackingDir,
    constants.globalDir,
    constants.widgetsDir,
    constants.elementsDir,
    constants.stacksDir,
    constants.themesDir,
    constants.textSnippetsDir

  ].forEach(directory => exists(directory) && removeTree(directory)) // Make sure directory is actually there first.
}
