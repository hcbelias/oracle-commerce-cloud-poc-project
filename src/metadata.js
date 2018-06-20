"use strict"

const Promise = require("bluebird")
const upath = require("upath")

const classify = require("./classifier").classify
const constants = require("./constants").constants
const endPointTransceiver = require("./endPointTransceiver")
const eTagFor = require("./etags").eTagFor
const exists = require("./utils").exists
const getBasePath = require("./utils").getBasePath
const info = require("./logger").info
const PuttingFileType = require("./puttingFileType").PuttingFileType
const readJsonFile = require("./utils").readJsonFile
const splitFromBaseDir = require("./utils").splitFromBaseDir
const walkDirectory = require("./utils").walkDirectory
const warn = require("./logger").warn
const writeFile = require("./utils").writeFile

let transferMode

const cache = {}

/**
 * Called when we need to find matching metadata from the target system rather than
 * from the tracking directory.
 */
function inTransferMode(value) {
  if (value) {
    transferMode = value
  } else {
    return transferMode
  }
}

/**
 * Load up a bunch of data up front to make things quicker.
 * @return a Bluebird promise.
 */
const initializeMetadata = Promise.method(() => {

  // There is some information we always need.
  const promises = [
    cacheWidgetInstances(),
    cacheWidgetDescriptors()
  ]

  // Only need to load the cache if we are transferring between servers.
  if (transferMode) {

    promises.push(cacheThemes())
    promises.push(cacheGlobalElements())
    promises.push(cacheStackInstances())
    promises.push(cacheWidgetDetails())
  }

  // Populate the cache in parallel for speed.
  return Promise.all(promises)
})

/**
 * Load all themes from the target server into the cache to ensure matching is faster.
 * @returns A BlueBird promise.
 */
function cacheThemes() {

  // Create a theme name to theme map, keyed on name.
  cache.themes = new Map()

  return endPointTransceiver.getThemes("?type=custom").then(
    results => results.data.items.forEach((theme) => cache.themes.set(theme.name, theme)))
}

/**
 * Put the key creation logic for widget instance cache in one (reusable) place.
 * Must match on display name and version as instances can have the same name but different versions.
 * @param displayName
 * @param version
 * @returns {string}
 */
function makeWidgetInstanceKey(displayName, version) {
  return `Display Name: ${displayName} Version: ${version}`
}

/**
 * Load all Widget Instances from the target server into the cache to ensure matching is faster.
 * @returns A BlueBird promise.
 */
function cacheWidgetInstances() {

  // Reduce all the instances to one big array then stick em in a map keyed on display name.
  cache.widgetInstances = new Map()

  return endPointTransceiver.listWidgets().then(
    results => results.data.items.forEach((widgetInstance) =>
      cache.widgetInstances.set(
        makeWidgetInstanceKey(widgetInstance.displayName, widgetInstance.descriptor.version), widgetInstance)))
}

/**
 * Load all Widget Descriptors from the target server into the cache to ensure matching is faster.
 * @returns A BlueBird promise.
 */
function cacheWidgetDescriptors() {

  // We don't make this into a map like the others as the matching is more fiddly.
  return endPointTransceiver.getAllWidgetDescriptors().then(results => {
    cache.widgetDescriptors = results.data.items
  })
}

/**
 * Load all Global Elements from the target server into the cache to ensure matching is faster.
 * @returns A BlueBird promise.
 */
function cacheGlobalElements() {

  // Create a tag to element map.
  cache.globalElements = new Map()

  // getElements() is new so don't assume its there.
  if (endPointTransceiver.serverSupports("getElements")) {

    return endPointTransceiver.getElements("?globals=true").then(
      results => results.data.items.forEach(globalElement => cache.globalElements.set(globalElement.tag, globalElement)))
  }
}

/**
 * Load all Global Elements from the target server into the cache to ensure matching is faster.
 * @returns A BlueBird promise.
 */
function cacheStackInstances() {

  // Collect all the stack instances together and then store them in a map, keyed on display name.
  cache.stackInstances = new Map()

  return endPointTransceiver.getAllStackInstances().then(
    results => results.data.items.reduce((stackInstances, stack) => stackInstances.concat(stack.instances), [])
      .forEach(stackInstance => cache.stackInstances.set(stackInstance.displayName, stackInstance)))
}

/**
 * Build up a list of all the widget details up front for performance reasons.
 * @returns A Bluebird Promise.
 */
function cacheWidgetDetails() {

  return endPointTransceiver.listWidgets().then(allWidgets => {

    return Promise.reduce(allWidgets.data.items, (allWidgetDetails, widget) => {

      if (widget.descriptor.editableWidget) {

        return endPointTransceiver.getWidget([widget.repositoryId]).then(widgetDetails => {

            allWidgetDetails.push(widgetDetails.data)
            return allWidgetDetails
          }
        )
      }

      return allWidgetDetails
    }, [])
      .then(allWidgetDetails => cache.allWidgetDetails = allWidgetDetails)
  })

}

/**
 * Get the name of the last node that we grabbed from.
 * @param path - optional path to the file or directory we are using
 * @return value of the last node we grabbed from or null if we can't find it.
 */
function getLastNode(path) {

  // If we have a path to the file or directory we are working with, use that.
  // If we don't have such a path, use the base directory. If we don't have that,
  // use the current working directory.
  const targetFileOrDirectory = path ? path : (getBasePath() ? getBasePath() : ".")

  // Find the base metadata - if we can find it.
  const metadata = readMetadataFromDisk(targetFileOrDirectory, constants.configMetadataJson)

  // Just need the node value.
  return metadata ? metadata.node : null
}

/**
 * Given a path to an asset and a metadata file type, return the path to its associated metadata file.
 * @param path
 * @param type
 * @returns a path
 */
function getMetadataPath(path, type) {

  // Split up the path into two bits and tokenize the subDir for later.
  const splitDirs = splitFromBaseDir(path)
  const baseDir = splitDirs[0], subDir = splitDirs[1]
  const tokens = subDir.split("/")

  // Figure out the rest of the path based on the type of metadata.
  switch (type) {
    case constants.configMetadataJson :
      return `${baseDir}/${constants.trackingDir}/${type}`

    case constants.elementMetadataJson :
    case constants.stackInstanceMetadataJson :
    case constants.themeMetadataJson :
      return `${baseDir}/${constants.trackingDir}/${subDir}/${type}`

    case constants.widgetMetadataJson :
      const widgetBaseDir = tokens.slice(0, tokens.indexOf("widget") + 2).join("/")
      return `${baseDir}/${constants.trackingDir}/${widgetBaseDir}/${type}`

    case constants.widgetInstanceMetadataJson :
      const widgetInstanceBaseDir = tokens.slice(0, tokens.indexOf("instances") + 2).join("/")
      return `${baseDir}/${constants.trackingDir}/${widgetInstanceBaseDir}/${type}`
  }
}

/**
 * Read the contents of specified metadata JSON file.
 * @param path - path to the asset we are interested in e.g. widget template - can be relative or absolute.
 * @param type of metadata file we want
 * @returns A BlueBird promise returning the file contents as a JavaScript object graph or null.
 */
const readMetadata = Promise.method((path, type) => {

  if (transferMode) {

    // Need to call endpoints to try to get metadata.
    return readMetadataFromServer(path, type)
  } else {

    // More simple case - get it from the local disk.
    return readMetadataFromDisk(path, type)
  }
})

/**
 * Find the metadata for the matching entity given by path and type on the target server.
 * @param path
 * @param type
 * @returns A BlueBird promise
 */
function readMetadataFromServer(path, type) {

  switch (type) {
    case constants.themeMetadataJson :
      return getMatchingTheme(path)
    case constants.elementMetadataJson :
      return getMatchingElement(path)
    case constants.stackInstanceMetadataJson :
      return getMatchingStack(path)
    case constants.widgetMetadataJson :
      return getMatchingWidget(path)
    case constants.widgetInstanceMetadataJson :
      return getMatchingWidgetInstance(path)
    case constants.configMetadataJson:
      return readMetadataFromDisk(path, type)
  }
}

/**
 * Handy function to find the widget information in the cache, given a copy of the metadata on disk.
 * @param metadata
 * @returns {V}
 */
function getCachedWidgetInstanceFromMetadata(metadata) {
  return cache.widgetInstances.get(makeWidgetInstanceKey(metadata.displayName, metadata.version))
}

/**
 * Find the matching widget instance given by path on the target server.
 * @param path
 */
function getMatchingWidgetInstance(path) {

  // Get the metadata for the local file first.
  const metadata = readMetadataFromDisk(path, constants.widgetInstanceMetadataJson)

  // See if we can find a widget with instance of the right name and version.
  const matchingWidgetInstance = getCachedWidgetInstanceFromMetadata(metadata)

  if (matchingWidgetInstance) {

    info("matchingWidgetInstanceFound", {path})
    return {
      repositoryId : matchingWidgetInstance.repositoryId,
      descriptorRepositoryId : matchingWidgetInstance.descriptor.repositoryId,
      version : matchingWidgetInstance.version,
      displayName : matchingWidgetInstance.displayName
    }
  } else {

    warn("noMatchingWidgetInstanceFound", {path})
    return null
  }
}

/**
 * Find the match for the widget on the remote system given by path.
 * @param path
 */
function getMatchingWidget(path) {

  // Get the metadata for the local file first.
  const metadata = readMetadataFromDisk(path, constants.widgetMetadataJson)

  // See if we can find a widget with the same name same name and version.
  const matchingWidget = cache.widgetDescriptors.find(
    widget => widget.version == metadata.version && widget.displayName == metadata.displayName)

  if (matchingWidget) {

    info("matchingWidgetFound", {path})
    return {
      repositoryId : matchingWidget.repositoryId,
      widgetType : matchingWidget.widgetType
    }
  } else {

    warn("noMatchingWidgetFound", {path})
    return null
  }
}

/**
 * Find the match for the stack instance on the remote system given by path.
 * @param path
 */
function getMatchingStack(path) {

  // Get metadata from the tracking dir.
  const metadata = readMetadataFromDisk(path, constants.stackInstanceMetadataJson)

  // Walk through all stack instances of all stacks looking for a matching name.
  const matchingStackInstance = cache.stackInstances.get(metadata.displayName)

  // See what we got.
  if (matchingStackInstance) {

    info("matchingStackInstanceFound", {path})
    return {repositoryId : matchingStackInstance.repositoryId}
  } else {

    warn("noMatchingStackInstanceFound", {path})
    return null
  }
}

/**
 * Ensure that the given element file has a counterpart on the remote machine.
 * @param path
 */
function getMatchingElement(path) {

  // Get the metadata from the tracking dir first.
  const elementMetadata = readMetadataFromDisk(path, constants.elementMetadataJson)
  const widgetMetadata = readMetadataFromDisk(path, constants.widgetMetadataJson)

  // See if its a global or under a widget...
  if (classify(path) == PuttingFileType.GLOBAL_ELEMENT_TEMPLATE ||
    classify(path) == PuttingFileType.GLOBAL_ELEMENT_JAVASCRIPT) {

    // See if we can find it in the cache.
    const matchingElement = cache.globalElements.get(elementMetadata.tag)

    if (matchingElement) {

      info("matchingElementFound", {path})
      return elementMetadata
    } else {

      warn("noMatchingElementFound", {path})
      return null
    }
  } else {

    // Element is under a widget - look for a widget of the same name and version, containing the element.
    const matchingWidgetWithElement = cache.allWidgetDetails.find(
      widgetDetails => widgetDetails.instance.descriptor.version == elementMetadata.version &&
        widgetDetails.instance.descriptor.displayName == widgetMetadata.displayName &&
        widgetDetails.fragments.find(element => element.tag == elementMetadata.tag))

    if (matchingWidgetWithElement) {

      info("matchingElementFound", {path})
      return {tag : elementMetadata.tag, widgetId : matchingWidgetWithElement.instance.descriptor.repositoryId}
    } else {

      warn("noMatchingElementFound", {path})
      return null
    }
  }
}

/**
 * Look on the target server for a matching theme.
 * @param path
 * @returns A BlueBird promise
 */
function getMatchingTheme(path) {

  // Get the metadata for the local file first.
  const metadata = readMetadataFromDisk(path, constants.themeMetadataJson)

  // See if we can find a theme on the target server with the same name.
  const matchingTheme = cache.themes.get(metadata.displayName)

  if (matchingTheme) {
    info("matchingThemeFound", {name : metadata.displayName})
    return {
      repositoryId : matchingTheme.repositoryId
    }
  } else {
    warn("noMatchingThemeFound", {name : metadata.displayName})
    return null
  }
}

/**
 * Return true if the theme for the given file exists on the target server.
 * This method will only work in transfer mode as this is the only time that themes will not necessarily exist.
 * @param path
 */
function themeExistsOnTarget(path) {

  // Get the metadata for the local file first.
  const metadata = readMetadataFromDisk(path, constants.themeMetadataJson)

  return cache.themes.get(metadata.displayName)
}

/**
 * Return true if the widget exists on the target instance - this will work in transfer and non transfer mode.
 * @param path
 */
function widgetExistsOnTarget(path) {

  // Get the metadata for the local file first.
  const metadata = readMetadataFromDisk(path, constants.widgetMetadataJson)

  // If it exists on the target, widget should already exist in the cache.
  return cache.widgetDescriptors.find(
    widget => widget.version == metadata.version && widget.displayName == metadata.displayName)
}

/**
 * Try to get the metadata for the resource given by path and the metadata type.
 * @param path
 * @param type
 * @param excludeEtag
 * @returns the metadata or null
 */
function readMetadataFromDisk(path, type, excludeEtag) {

  // Figure out where the metadata ought to be.
  const metadataPath = getMetadataPath(path, type)

  // See if it exists.
  if (exists(metadataPath)) {

    const json = readJsonFile(metadataPath)

    // Add in the etag too.
    !excludeEtag && (json.etag = eTagFor(path))

    return json
  } else {

    // Can't find the metadata.
    return null
  }
}

/**
 * Write the supplied content to the metadata file.
 * @param path - relative path within the tracking directory
 * @param content
 */
function writeMetadata(path, content) {
  writeFile(`${constants.trackingDir}/${path}`, JSON.stringify(content, null, 2))
}

/**
 * Return true if the widget type is already used in the metadata.
 * @param widgetType
 */
function widgetTypeExists(widgetType) {

  // Set up a default return value.
  let exists = false

  // Need to check the metadata on disk.
  walkDirectory(upath.join(constants.trackingDir, constants.widgetsDir), {
    listeners : {
      file : (root, fileStat, next) => {

        // Only interested in widget.jsons.
        if (fileStat.name == constants.widgetMetadataJson &&
          readJsonFile(upath.join(root, fileStat.name)).widgetType == widgetType) {
          exists = true
        }

        // Jump to the next file if we haven't found a match.
        !exists && next()
      }
    }
  })

  return exists
}

/**
 * Update the supplied metadata.
 * @param path
 * @param type
 * @param additionalMetadata
 */
function updateMetadata(path, type, additionalMetadata) {

  // Load existing metadata sans etag.
  const existingMetadata = readMetadataFromDisk(path, type, true)

  // Stick the new values on top of it.
  Object.keys(additionalMetadata).forEach(key => {
    existingMetadata[key] = additionalMetadata[key]
  })

  // Write out updated metadata.
  writeFile(getMetadataPath(path, type), JSON.stringify(existingMetadata, null, 2))
}

exports.cacheWidgetInstances = cacheWidgetInstances
exports.getCachedWidgetInstanceFromMetadata = getCachedWidgetInstanceFromMetadata
exports.getLastNode = getLastNode
exports.initializeMetadata = initializeMetadata
exports.inTransferMode = inTransferMode
exports.readMetadata = readMetadata
exports.readMetadataFromDisk = readMetadataFromDisk
exports.themeExistsOnTarget = themeExistsOnTarget
exports.updateMetadata = updateMetadata
exports.widgetExistsOnTarget = widgetExistsOnTarget
exports.widgetTypeExists = widgetTypeExists
exports.writeMetadata = writeMetadata
