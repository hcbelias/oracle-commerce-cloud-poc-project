"use strict"

const basename = require('path').basename
const upath = require("upath")

const cacheWidgetInstances = require("./metadata").cacheWidgetInstances
const createWidgetInExtension = require("./widgetCreator").createWidgetInExtension
const constants = require("./constants").constants
const dumpEtag = require("./etags").dumpEtag
const endPointTransceiver = require("./endPointTransceiver")
const eTagFor = require("./etags").eTagFor
const error = require("./logger").error
const exists = require("./utils").exists
const getCachedWidgetInstanceFromMetadata = require("./metadata").getCachedWidgetInstanceFromMetadata
const i18n = require("./i18n")
const inTransferMode = require("./metadata").inTransferMode
const logError = require("./logger").logError
const makeTrackingDirTree = require("./utils").makeTrackingDirTree
const processPutResultAndEtag = require("./putterUtils").processPutResultAndEtag
const readFile = require("./utils").readFile
const readJsonFile = require("./utils").readJsonFile
const readMetadata = require("./metadata").readMetadata
const readMetadataFromDisk = require("./metadata").readMetadataFromDisk
const request = require("./requestBuilder").request
const resetEtag = require("./etags").resetEtag
const splitFromBaseDir = require("./utils").splitFromBaseDir
const updateMetadata = require("./metadata").updateMetadata
const walkDirectory = require("./utils").walkDirectory
const warn = require("./logger").warn
const writeDummyEtag = require("./etags").writeDummyEtag
const writeFile = require("./utils").writeFile

let updateInstances = false
let sendInstanceConfig = true

/**
 * Tell the module to update instances.
 */
function enableUpdateInstances() {
  updateInstances = true
}

/**
 * Tell the module not to send widget instance metadata to the server.
 * This can be useful when config varies between environments.
 */
function suppressConfigUpdate() {
  sendInstanceConfig = false
}

/**
 * Do the needful to get the supplied template back to the server.
 * @param path
 * @return
 */
function putWidgetInstanceTemplate(path) {
  return getWidgetAndWidgetInstanceMetadata(path).then(metadata => {
    if (metadata) {
      return putWidgetInstanceFile(metadata, path, "updateWidgetSourceCode")
    }
  })
}

/**
 * Get the widget metadata (that is, the stuff we let people change) back to the server.
 * @param path
 */
function putWidgetModifiableMetadata(path) {

  return putMetadata(path, constants.widgetMetadataJson, "updateWidgetDescriptorMetadata", syncWidgetMetadata)
}

/**
 * Get the widget instance metadata (that is, the stuff we let people change) back to the server.
 * @param path
 */
function putWidgetInstanceModifiableMetadata(path) {

  // Firstly, make sure that we actually want to send widget instance metadata.
  if (sendInstanceConfig) {

    // See if endpoint exists - metadata endpoints are a recent innovation.
    if (!endPointTransceiver.serverSupports("updateWidgetMetadata")) {
      warn("widgetContentFileCannotBeSent", {path})
      return
    }

    return getWidgetAndWidgetInstanceMetadata(path).then(metadata => {

      if (metadata) {
        return endPointTransceiver.updateWidgetMetadata([metadata.instance.repositoryId],
          request().fromPathAsJSON(path, "metadata").withEtag(metadata.instance.etag)).tap(
          results => processPutResultAndEtag(path, results, syncWidgetInstanceMetadata))
      }
    })
  }
}

/**
 * This is fiddly. Users can change the display name of an instance which we store internally (because we need it).
 * So we need to make sure that the display name held by us is the same what the external metadata file says it is.
 * @param path
 */
function syncWidgetInstanceMetadata(path) {

  if (!inTransferMode()) {

    // Load up the display name value that the user can change.
    const displayName = readJsonFile(path).displayName

    // If there is a value (there should always be but play safe), use it to modify the internal metadata.
    displayName && updateMetadata(path, constants.widgetInstanceMetadataJson, {displayName})
  }
}

/**
 * This is fiddly. Users can change the display name of a widget which we store internally (because we need it).
 * So we need to make sure that the display name held by us is the same what the external metadata file says it is.
 * This is somewhat more complex in that widget names can be internationalized.
 * @param path
 */
function syncWidgetMetadata(path) {

  if (!inTransferMode()) {

    // Defensively load the translations array holding the display name value that the user can change.
    const translations = readJsonFile(path).translations

    if (translations) {

      // Look for a translation with the same name as the current working locale.
      const translation = translations.find(t => t.language == endPointTransceiver.locale)

      // If there is one (there should be) use it to update the value in the internal metadata.
      if (translation) {
        updateMetadata(path, constants.widgetMetadataJson, {displayName : translation.name})
      }
    }
  }
}

/**
 * Holds the boilerplate for getting a metadata file back to the server.
 * @param path
 * @param metadataType
 * @param endpoint
 * @param successCallback
 * @returns {Promise.<TResult>|*}
 */
function putMetadata(path, metadataType, endpoint, successCallback) {

  // See if endpoint exists - metadata endpoints are a recent innovation.
  if (!endPointTransceiver.serverSupports(endpoint)) {
    warn("widgetContentFileCannotBeSent", {path})
    return
  }

  return readMetadata(path, metadataType).then(metadata => {

    if (metadata) {
      return endPointTransceiver[endpoint]([metadata.repositoryId],
        request().fromPathAsJSON(path, "metadata").withEtag(metadata.etag)).tap(
        results => processPutResultAndEtag(path, results, successCallback))
    }
  })
}

/**
 * Boilerplate for sending base widget content file to server.
 * @param path
 * @param endpoint
 * @returns {Promise.<TResult>|*}
 */
function putBaseWidgetFile(path, endpoint, field) {

  // See if endpoint exists - base endpoints are a recent innovation.
  if (!endPointTransceiver.serverSupports(endpoint)) {
    warn("widgetContentFileCannotBeSent", {path})
    return
  }

  // Get the metadata for the widget.
  return readMetadata(path, constants.widgetMetadataJson).then(metadata => {

    if (metadata) {
      return endPointTransceiver[endpoint]([metadata.repositoryId],
        `?updateInstances=${updateInstances}`,
        request().fromPathAs(path, field).withEtag(metadata.etag)).tap(
        results => processPutResultAndEtag(path, results))
    }
  })
}

/**
 * Get the contents of the base template back to the server.
 * @param path
 */
function putWidgetBaseTemplate(path) {

  checkSyncWithInstances(path, constants.widgetTemplate, readFile(path))
  return putBaseWidgetFile(path, "updateWidgetDescriptorBaseTemplate", "source")
}

/**
 * Need to ensure that if we want sync instances with base content that the file contents on disk match.
 * @param path
 * @param fileName
 */
function checkSyncWithInstances(path, fileName, contents) {

  // See if we are syncing the instances with the base resources.
  if (updateInstances) {

    // Walk through the instances directory, looking for suitable files.
    walkDirectory(`${getWidgetBaseDir(path)}/instances`, {
      listeners : {
        file : (root, fileStat, next) => {

          const fullPath = upath.resolve(root, fileStat.name)

          // Look for any corresponding instance content.
          if (fullPath.endsWith(fileName)) {

            // Make the instance file look like the base file.
            writeFile(fullPath, contents)
          }

          // Jump to the next file.
          next()
        }
      }
    })
  }
}

/**
 * Find the base directory for the widget from the path.
 * @param path
 * @returns {string}
 */
function getWidgetBaseDir(path) {

  const tokens = path.split("/")
  return tokens.slice(0, tokens.indexOf("widget") + 2).join("/")
}

/**
 * Get the contents of the base less file back to the server.
 * @param path
 */
function putWidgetBaseLess(path) {

  checkSyncWithInstances(path, constants.widgetLess, `${constants.widgetInstanceSubstitutionValue} {\n${readFile(path)}\n}\n`)
  return putBaseWidgetFile(path, "updateWidgetDescriptorBaseLess", "source")
}

/**
 * Get the contents of the config json back to the server.
 * @param path
 */
function putWidgetConfigJson(path) {

  return putMetadata(path, constants.widgetMetadataJson, "updateConfigMetadataForWidgetDescriptor")
}

/**
 * Get the contents of the config snippets json back to the server.
 * @param path
 */
function putWidgetConfigSnippets(path) {

  // See if endpoint exists - base endpoints are a recent innovation.
  if (!endPointTransceiver.serverSupports("updateConfigLocaleContentForWidgetDescriptor")) {
    warn("widgetContentFileCannotBeSent", {path})
    return
  }

  // Get the metadata for the widget.
  return readMetadata(path, constants.widgetMetadataJson).then(metadata => {

    if (metadata) {

      // Get the locale from the path.
      const tokens = path.split("/")
      const locale = basename(tokens[tokens.length - 1], ".json")

      return endPointTransceiver.updateConfigLocaleContentForWidgetDescriptor([metadata.repositoryId, locale],
        request().withLocale(locale).fromPathAsJSON(path, "localeData").withEtag(metadata.etag)).tap(
        results => processPutResultAndEtag(path, results))
    }
  })
}

/**
 * Get the contents of the base snippets file back to the server.
 * @param path
 * @returns {Promise.<TResult>|*}
 */
function putWidgetBaseSnippets(path) {

  // See if endpoint exists - base endpoints are a recent innovation.
  if (!endPointTransceiver.serverSupports("updateWidgetDescriptorBaseLocaleContent")) {
    warn("widgetContentFileCannotBeSent", {path})
    return
  }

  // Get the metadata for the widget.
  return readMetadata(path, constants.widgetMetadataJson).then(metadata => {

    if (metadata) {

      // Get the locale from the path.
      const tokens = path.split("/")
      const locale = tokens[tokens.length - 2]

      // Make sure the instance content is sync'ed - if needbe.
      checkSyncWithInstances(path, `${locale}/${basename(path)}`, readFile(path))

      return endPointTransceiver.updateWidgetDescriptorBaseLocaleContent([metadata.repositoryId, locale],
        `?updateInstances=${updateInstances}`,
        request().withLocale(locale).fromPathAsJSON(path, "localeData").withEtag(metadata.etag)).tap(
        results => processPutResultAndEtag(path, results))
    }
  })
}

/**
 * Web content instance templates are a bit special so we handle them here.
 * @param metadata
 * @param path
 * @returns A Bluebird promise.
 */
function putWebContentWidgetInstanceTemplate(path) {

  // Need the metadata first.
  return getWidgetAndWidgetInstanceMetadata(path).then(metadata => {

    // Get the name and notes first so we don't overwrite these.
    if (metadata) {
      return endPointTransceiver.getWidget([metadata.instance.repositoryId]).then(results => {

        // Build up the payload, using some data from the server.
        const payload = {
          widgetConfig : {
            name : results.data.name,
            notes : results.data.notes
          },
          content : readFile(path)
        }

        return endPointTransceiver.updateWidgetWebContent(
          [metadata.instance.repositoryId], request().withBody(payload).withEtag(metadata.etag)).tap(
          results => processPutResultAndEtag(path, results))
      })
    }
  })
}

/**
 * Send a widget JavaScript file back up to the server.
 * @param path
 * @returns A BlueBird promise.
 */
function putWidgetJavaScript(path) {

  // Get the base metadata for the widget.
  return readMetadata(path, constants.widgetMetadataJson).then(metadata => {

    if (metadata) {
      // Call the endpoint, passing in the widget ID and the base file name of the .js file.
      return endPointTransceiver.updateWidgetDescriptorJavascript(
        [metadata.repositoryId, basename(path)], request().fromPathAs(path, "source").withEtag(metadata.etag)).tap(
        results => processPutResultAndEtag(path, results))
    }
  })
}

/**
 * Do the needful to get the supplied widget instance less back on the server.
 * @param path
 */
function putWidgetInstanceLess(path) {

  return getWidgetAndWidgetInstanceMetadata(path).then(metadata => {
    if (metadata) {
      return putWidgetInstanceFile(metadata, path, "updateWidgetLess", true)
    }
  })
}

/**
 * Send the text snippets for the widget instance back to the server.
 * @param path
 * @returns a BlueBird promise.
 */
function putWidgetInstanceSnippets(path) {

  // Get the metadata.
  return getWidgetAndWidgetInstanceMetadata(path).then(metadata => {

    if (metadata) {

      // Get the locale from the path.
      const tokens = path.split("/")
      const locale = tokens[tokens.length - 2]
      const widgetInstanceId = metadata.instance.repositoryId

      let putSnippetsEndpoint = endPointTransceiver["updateWidgetCustomTranslations"]
      let endpointParams = [widgetInstanceId]

      // Prefer an endpoint that will lock at locale level if available.
      if (endPointTransceiver["updateWidgetCustomTranslationsForLocale"]) {
        putSnippetsEndpoint = endPointTransceiver["updateWidgetCustomTranslationsForLocale"]
        endpointParams = [widgetInstanceId, locale]
      }

      // Build up the payload. Need to chop off the enclosing key.
      const payload = {
        custom : readJsonFile(path).resources
      }

      return putSnippetsEndpoint(endpointParams,
        request().withLocale(locale).withEtag(eTagFor(path)).withBody(payload)).tap(
        results => processPutResultAndEtag(path, results))
    }
  })
}

/**
 * Holds the boilerplate associated with getting a widget instance file back on the server.
 * @param metadata
 * @param path
 * @param endpoint
 * @param transform
 * @returns A Bluebird promise
 */
function putWidgetInstanceFile(metadata, path, endpoint, transform) {

  // Build the basic body.
  const body = request().fromPathAs(path, "source").withEtag(metadata.etag)

  // See if we need to transform the contents before sending.
  if (transform) {

    // Replace the substitution value in the file with the IDs on the target system.
    body.replacing(constants.widgetInstanceSubstitutionValue,
      `#${metadata.instance.descriptorRepositoryId}-${metadata.instance.repositoryId}`)
  }

  return endPointTransceiver[endpoint]([metadata.instance.repositoryId], body).tap(
    results => processPutResultAndEtag(path, results))
}

/**
 * Try to get the metadata for a widget instance - by hook or by crook.
 * @param path
 * @param widgetMetadata
 * @returns A BlueBird promise.
 */
function getWidgetInstanceMetadata(path, widgetMetadata) {

  // Load the metadata for the widget instance.
  return readMetadata(path, constants.widgetInstanceMetadataJson).then(widgetInstanceMetadata => {

    // Looks like we have metadata but check it actually exists on the server - someone could have deleted it.
    if (widgetInstanceMetadata && getCachedWidgetInstanceFromMetadata(widgetInstanceMetadata)) {

      widgetMetadata.instance = widgetInstanceMetadata
      return widgetMetadata

      // We have a widget but no instance. Create the instance, then load the metadata.
    } else {

      warn("creatingWidgetInstance", {path : path})

      return createMatchingWidgetInstance(widgetMetadata, path).then(() => {

        // Read out of date metadata from disk.
        const existingMetadata = readMetadataFromDisk(path, constants.widgetInstanceMetadataJson, true)

        // The right keys will be in the cache as it was just updated.
        const cacheEntry = getCachedWidgetInstanceFromMetadata(existingMetadata)

        // Make sure instance got created. There are certain edge cases when this could fail so deal with it.
        if (!cacheEntry) {
          error("failedToCreateInstance", {name : existingMetadata.displayName})
          return null
        }

        // If we are not in transfer mode, must update metadata on disk.
        if (!inTransferMode()) {

          // Update the disk metadata and write it back.
          existingMetadata.descriptorRepositoryId = cacheEntry.descriptor.repositoryId
          existingMetadata.repositoryId = cacheEntry.repositoryId

          updateMetadata(path, constants.widgetInstanceMetadataJson, existingMetadata)

          // Also need to reset the etag for the file.
          writeDummyEtag(path)
        }

        // Now the instance exists, can load the metadata,
        return readMetadata(path, constants.widgetInstanceMetadataJson).then(widgetInstanceMetadata => {

          widgetMetadata.instance = widgetInstanceMetadata
          return widgetMetadata
        })
      })
    }
  })
}

/**
 * Using the path to a widget instance file, find the metadata.
 * @param path
 */
function getWidgetAndWidgetInstanceMetadata(path) {

  // Load the metadata for the base widget.
  return readMetadata(path, constants.widgetMetadataJson).then(widgetMetadata => {

    if (widgetMetadata) {

      return getWidgetInstanceMetadata(path, widgetMetadata)
    } else {

      // This can happen in transfer mode.
      warn("cannotUpdateWidget", {path})
      return null
    }
  })
}

/**
 * Create a widget instance of the same name as that given in the path.
 * @param widgetMetadata
 * @param path
 */
function createMatchingWidgetInstance(widgetMetadata, path) {

  // Get the metadata for the local instance.
  const localWidgetInstanceMetadata = readMetadataFromDisk(path, constants.widgetInstanceMetadataJson)

  // Set up the JSON for the clone.
  const payload = {
    widgetDescriptorId : widgetMetadata.widgetType,
    displayName : localWidgetInstanceMetadata.displayName
  }

  // Firstly, clone an instance of the same name then update the cache so it now contains info on the new widget.
  return endPointTransceiver.createWidgetInstance([], request().withBody(payload)).then(() => cacheWidgetInstances())
}

/**
 * This is for when the widget does not exist on the target server and so needs to be created.
 * @param path
 */
function putWidget(path) {

  // Get the metadata for the widget.
  const localWidgetMetadata = readMetadataFromDisk(path, constants.widgetMetadataJson)

  // If we grabbed a non-Oracle widget from a pre-17.6 system there will not be enough information to create it again.
  // This is an edge case but we need to do the right thing.
  if (localWidgetMetadata.source !== 101) {
    warn("insufficientInfoToCreateWidget", {widgetName: localWidgetMetadata.displayName})
    return
  }

  // Call the widget creator to do the business.
  return createWidgetInExtension(localWidgetMetadata.displayName, localWidgetMetadata.widgetType, localWidgetMetadata.global, path)
}

/**
 * Send a widget JavaScript file back up to the server.
 * @param path
 * @returns A BlueBird promise.
 */
function putWidgetModuleJavaScript(path) {

  // Get the base metadata for the widget.
  const moduleEtag = eTagFor(path)

  return readMetadata(path, constants.widgetMetadataJson).then(
    (metadata) => {

      if (metadata) {
        if (moduleEtag != ""){
          // Call the endpoint, passing in the widget ID and the base file name of the .js file.
          return endPointTransceiver.updateWidgetDescriptorJavascriptExtension(
            [metadata.repositoryId, basename(path)], request().fromPathAs(path, "source").withEtag(metadata.etag)).tap(
            (results) => processPutResultAndEtag(path, results))
        } else {

          // OK this is a new module, create the tracking directory and
          // call the create endpoint, passing in the widget ID and the base file name of the .js file.
          makeTrackingDirTree(path)

          return endPointTransceiver.createWidgetDescriptorJavascriptExtension(
            [metadata.repositoryId, basename(path)], request().fromPathAs(path, "source")).tap(
            (results) => processPutResultAndEtag(path, results))
        }

      }
    }
  )
}

/**
 * Special case. Here we do not actually put the instance or even create it when it does not exist.
 * What we actually do is look and see if the widget instance exists. If not, reset the etag files.
 * @param path
 */
function putWidgetInstance(path) {

  // Get the metadata for the widget.
  const localWidgetInstanceMetadata = readMetadataFromDisk(path, constants.widgetInstanceMetadataJson)

  // See if it exists on the server.
  if (!getCachedWidgetInstanceFromMetadata(localWidgetInstanceMetadata)) {

    // Chop the directory up so we can insert the tracking dir.
    const splitDirs = splitFromBaseDir(path)
    const baseDir = splitDirs[0], subDir = splitDirs[1]

    // Walk through the tracking dir looking for etags.
    walkDirectory(`${baseDir}/${constants.trackingDir}/${subDir}`, {
      listeners : {
        file : (root, fileStat, next) => {

          const fullPath = upath.resolve(root, fileStat.name)

          // Replace any etag files with dummies.
          if (fullPath.endsWith(constants.etagSuffix)) {
            resetEtag(fullPath)
          }

          // Jump to the next file.
          next()
        }
      }
    })
  }
}

exports.enableUpdateInstances = enableUpdateInstances
exports.putWebContentWidgetInstanceTemplate = putWebContentWidgetInstanceTemplate
exports.putWidget = putWidget
exports.putWidgetBaseTemplate = putWidgetBaseTemplate
exports.putWidgetBaseLess = putWidgetBaseLess
exports.putWidgetBaseSnippets = putWidgetBaseSnippets
exports.putWidgetConfigJson = putWidgetConfigJson
exports.putWidgetConfigSnippets = putWidgetConfigSnippets
exports.putWidgetInstance = putWidgetInstance
exports.putWidgetInstanceLess = putWidgetInstanceLess
exports.putWidgetInstanceSnippets = putWidgetInstanceSnippets
exports.putWidgetInstanceTemplate = putWidgetInstanceTemplate
exports.putWidgetJavaScript = putWidgetJavaScript
exports.putWidgetModuleJavaScript = putWidgetModuleJavaScript
exports.putWidgetModifiableMetadata = putWidgetModifiableMetadata
exports.putWidgetInstanceModifiableMetadata = putWidgetInstanceModifiableMetadata
exports.enableUpdateInstances = enableUpdateInstances
exports.suppressConfigUpdate = suppressConfigUpdate
