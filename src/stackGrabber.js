const Promise = require("bluebird")

const constants = require("./constants").constants
const copyFieldContentsToFile = require("./grabberUtils").copyFieldContentsToFile
const endPointTransceiver = require("./endPointTransceiver")
const exists = require("./utils").exists
const info = require("./logger").info
const makeTrackedDirectory = require("./utils").makeTrackedDirectory
const readMetadataFromDisk = require("./metadata").readMetadataFromDisk
const sanitizeName = require("./utils").sanitizeName
const warn = require("./logger").warn
const writeMetadata = require("./metadata").writeMetadata

/**
 * Pull down all the stacks from the server.
 */
exports.grabAllStacks = function () {

  const promises = []

  // The endpoints we need to manipulate stacks were added fairly recently so let's not assume they are there.
  if (!endPointTransceiver.serverSupports("getAllStackInstances", "getStackSourceCode", "getStackLessVars", "getStackLess")) {

    warn("stacksCannotBeGrabbed")
  } else {

    promises.push(endPointTransceiver.getAllStackInstances().tap(results => {
      // Create stack top level dir first if it does not already exist.
      makeTrackedDirectory(constants.stacksDir)

      promises.push(grabStacks(results))
    }))
  }

  return Promise.all(promises)
}

/**
 * Walk through the array contained in results creating files on disk.
 * @param results
 */
function grabStacks(results) {

  // Keep track of all the promises, returning them as a single promise at the end.
  const promises = []
  results.data.items.forEach(stack => promises.push(grabStack(stack)))

  return Promise.all(promises)
}

/**
 * Get the resources for the supplied stack. Unlike widgets, there is only source
 * code associated with the instances.
 * @param stack
 */
function grabStack(stack) {

  // Let the user know something is happening...
  info("grabbingStack", {name : stack.displayName})

  // Create the top level dirs for the stack first.
  const stackDir = `${constants.stacksDir}/${sanitizeName(stack.displayName)}`
  makeTrackedDirectory(stackDir)

  writeStackMetadata(stack.repositoryId, stack.stackType, stack.version, stack.displayName, stackDir)

  const instancesDir = `${stackDir}/instances`
  makeTrackedDirectory(instancesDir)

  // Keep track of all the promises, returning them as a single promise at the end.
  const promises = []

  // for each stack instance.
  stack.instances.forEach(stackInstance => promises.push(grabStackInstance(instancesDir, stackInstance)))

  return Promise.all(promises)
}

/**
 * Create files based on the supplied stack instance
 * @param instancesDir - where to stick the files
 * @param stackInstance - info on the stack instance from the server
 */
function grabStackInstance(instancesDir, stackInstance) {

  // Set up a dir for this instance.
  const stackInstanceDir = `${instancesDir}/${sanitizeName(stackInstance.displayName)}`

  // See if we have already grabbed a version of stack.
  if (exists(stackInstanceDir)) {

    // Get the version from the instance we currently have on disk.
    const metadataFromDisk = readMetadataFromDisk(stackInstanceDir, constants.stackInstanceMetadataJson)

    // If the one on disk is more up to date, don't go any further.
    if (metadataFromDisk && metadataFromDisk.version > stackInstance.descriptor.version) {
      return null
    }
  }

  // We can now safely make the directory.
  makeTrackedDirectory(stackInstanceDir)

  // Need to store the stack instance ID in the tracking dir for later.
  const stackInstanceJson = {}
  stackInstanceJson.repositoryId = stackInstance.id
  stackInstanceJson.displayName = stackInstance.displayName

  writeMetadata(`${stackInstanceDir}/${constants.stackInstanceMetadataJson}`, stackInstanceJson)

  // Keep track of all the promises, returning them as a single promise at the end.
  const promises = []

  // Add templates, style variables and style sheet.
  promises.push(copyFieldContentsToFile("getStackSourceCode", stackInstance.id, "source", `${stackInstanceDir}/${constants.stackTemplate}`))
  promises.push(copyFieldContentsToFile("getStackLessVars", stackInstance.id, "source", `${stackInstanceDir}/${constants.stackVariablesLess}`))
  promises.push(copyFieldContentsToFile("getStackLess", stackInstance.id, "source", `${stackInstanceDir}/${constants.stackLess}`))

  return Promise.all(promises)
}

/**
 * Holds the boilerplate for writing stack metadata.
 * @param repositoryId
 * @param stackType
 * @param version
 * @param displayName
 * @param stackDir
 */
function writeStackMetadata(repositoryId, stackType, version, displayName, stackDir) {
  writeMetadata(`${stackDir}/${constants.stackMetadataJson}`, {repositoryId, stackType, version, displayName})
}
