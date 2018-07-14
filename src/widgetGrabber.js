"use strict"

const Promise = require("bluebird")

const constants = require("./constants").constants
const copyFieldContentsToFile = require("./grabberUtils").copyFieldContentsToFile
const dumpEtag = require("./etags").dumpEtag
const endPointTransceiver = require("./endPointTransceiver")
const exists = require("./utils").exists
const getAllowedConcurrency = require("./concurrencySettings").getAllowedConcurrency
const info = require("./logger").info
const makeTrackedDirectory = require("./utils").makeTrackedDirectory
const makeTrackedTree = require("./utils").makeTrackedTree
const readMetadataFromDisk = require("./metadata").readMetadataFromDisk
const request = require("./requestBuilder").request
const sanitizeName = require("./utils").sanitizeName
const warn = require("./logger").warn
const writeEtag = require("./etags").writeEtag
const writeFile = require("./utils").writeFile
const writeFileAndETag = require("./grabberUtils").writeFileAndETag
const writeMetadata = require("./metadata").writeMetadata

// Set up a map to enable us to find the directory that corresponds to a widget type.
const widgetTypeToDirectoryMap = new Map()

/**
 * Pull down all the widgets from the server.
 */
exports.grabAllWidgets = function () {

  // Create widget top level dir first if it does not already exist.
  makeTrackedDirectory(constants.widgetsDir)

  // Look for Oracle supplied widgets. In parallel, grab any user created widgets. These will be grouped by type and be the latest version.
  // After we get the current versions, look about for any old ones.
  return Promise.all([
    endPointTransceiver.getAllWidgetInstances("?source=100").then(grabWidgets),
    endPointTransceiver.getAllWidgetInstances("?source=101").then(grabWidgets)])
    .then(grabWidgetInstances)
}

/**
 * Get the directory for the supplied widget type and version.
 * @param widgetType
 * @param version
 * @param isLatestVersion
 * @returns a string containing the relative path to the widget directory.
 */
exports.getDirectoryForWidget = function (widgetType, version, isLatestVersion) {

  // Elements belonging to the latest version will go in the top level directory.
  if (isLatestVersion) {

    return widgetTypeToDirectoryMap.get(widgetType)
  } else {
    // Not the latest version - stick them in a directory of the form widget/<widget name>/version/<version number>/element.
    const versionDir = `${widgetTypeToDirectoryMap.get(widgetType)}/${constants.versionDir}`
    const versionNumberDir = `${versionDir}/${version}`

    makeTrackedDirectory(versionDir)
    makeTrackedDirectory(versionNumberDir)

    return versionNumberDir
  }
}

/**
 * Walk through the array contained in results creating files on disk.
 * @param results
 */
function grabWidgets(results) {

  return Promise.map(results.data.items, widget => {

    // No point in grabbing widgets you can't edit.
    if (widget.editableWidget) {
      return grabWidget(widget)
    }
  }, getAllowedConcurrency())
}

/**
 * Given the ID of widget, grab the associated JavaScript and write it to the supplied directory.
 * @param id
 * @param widgetDir
 */
function grabAllJavaScript(id, widgetDir) {

  // Create the js dir under the widget if it does not exist already.
  const widgetJsDir = `${widgetDir}/js`
  makeTrackedDirectory(widgetJsDir)
  const widgetModuleDir = `${widgetDir}/module`
  makeTrackedDirectory(widgetModuleDir)
  const widgetModuleJsDir = `${widgetDir}/module/js`
  makeTrackedDirectory(widgetModuleJsDir)

  // Keep track of all the promises, returning them as a single promise at the end.
  const promises = []

  // Get the javascript - if any.
  endPointTransceiver.getWidgetDescriptorJavascriptInfoById([id]).then(results => {
      results.data.jsFiles && results.data.jsFiles.forEach(jsFile => {
          promises.push(endPointTransceiver.get(jsFile.url).tap(results => {

            if (isJavascriptModule(jsFile)){
              writeFileAndETag(`${widgetModuleJsDir}/${jsFile.name}`, results.data, results.response.headers.etag)
            } else {
              writeFileAndETag(`${widgetJsDir}/${jsFile.name}`, results.data, results.response.headers.etag)
            }

          }))
        }
      )
    }
  )

  return Promise.all(promises)
}

/**
 * Holds the boilerplate for writing widget metadata.
 * @param widget
 * @param widgetDir
 * @return a Bluebird promise.
 */
function writeWidgetMetadata(widget, widgetDir) {

  // Set up the base metadata. Start with what is already there if we can.
  // This is to stop us losing metadata created by ccw which cannot be created from the endpoint data.
  const existingMetadata = readMetadataFromDisk(widgetDir, constants.widgetMetadataJson, true)
  const metadata = existingMetadata ? existingMetadata : {}

  // Some metadata is only available in more recent versions.
  const baseKeys = ["repositoryId", "widgetType", "version", "displayName"]
  baseKeys.forEach(key => {
    metadata[key] = widget[key]
  })

  // The last four fields were added at the same time but later than the rest. Only needed for user defined widgets.
  if (widget.source === 101) {

    const possibleKeys = ["global", "i18nresources", "source"]
    possibleKeys.forEach(key => {
      widget[key] !== undefined && widget[key] !== null && (metadata[key] = widget[key])
    })

    metadata.javascript = widget.entrypoint
  }

  // Write out what we got to disk.
  writeMetadata(`${widgetDir}/${constants.widgetMetadataJson}`, metadata)

  // For user created widgets, we can allow them to change certain properties, post create.
  if (widget.source === 101) {

    // Also need to create the user modifiable metadata too.
    return createUserModifiableMetadata(widget, widgetDir)
  }
}

/**
 * Create a file on disk containing things associated with the widget that the user can change.
 * This will only ever get called for non-Oracle widgets.
 * @param widget
 * @param widgetDir
 */
function createUserModifiableMetadata(widget, widgetDir) {

  if (endPointTransceiver.serverSupports("getWidgetDescriptorMetadata")) {

    // Call the custom metadata endpoint created specially for this purpose.
    return endPointTransceiver.getWidgetDescriptorMetadata([widget.repositoryId]).then(results => {

      writeFileAndETag(`${widgetDir}/${constants.userWidgetMetadata}`,
        JSON.stringify(results.data.metadata, null, 2), results.response.headers.etag)
    })
  } else {
    warn("widgetDescriptorMetadataCannotBeGrabbed")
  }
}

/**
 * Create the top level and widget directory and do the house-keeping associated with it.
 * @param widget
 * @returns {string}
 */
function createWidgetDirectory(widget) {

  // Create the top level dirs for the widget first.
  const widgetDir = `${constants.widgetsDir}/${sanitizeName(widget.displayName)}`
  makeTrackedDirectory(widgetDir)

  // Record the directory for later use by things like element grabbing.
  widgetTypeToDirectoryMap.set(widget.widgetType, widgetDir)
  return widgetDir
}

/**
 * Get the base locale content for supplied widget and locale.
 * @param widget
 * @param widgetDir
 * @param locale
 */
function getWidgetBaseSnippets(widget, widgetDir, locale) {

  // Get the text snippets for the "current" locale.
  return endPointTransceiver.getWidgetDescriptorBaseLocaleContent([widget.id, locale.name],
    request().withLocale(locale.name)).tap(results => {

    // See if we got any locale data.
    if (results.data.localeData) {

      // Create directory for the current locale.
      const localeDir = `${widgetDir}/locales/${locale.name}`
      makeTrackedDirectory(localeDir)

      // Write out the text strings as a JSON file.
      const localeStringsFile = `${localeDir}/ns.${widget.widgetType.toLowerCase()}.json`
      writeFile(localeStringsFile, JSON.stringify(results.data.localeData, null, 2))

      // Write out the etag.
      writeEtag(localeStringsFile, results.response.headers.etag)
    }
  })
}

/**
 * Grab the base locale associated with the widget.
 * @param widget
 * @param widgetDir
 * @returns {*}
 */
function grabBaseLocaleContent(widget, widgetDir) {

  // Make the locales directories first.
  makeTrackedDirectory(`${widgetDir}/locales`)

  // Then do the locales request one by one to stop us running out of connections.
  return Promise.each(endPointTransceiver.locales, locale => getWidgetBaseSnippets(widget, widgetDir, locale))
}

/**
 * If the server supports the right endpoints, grab the base content files.
 * @param widget
 * @param widgetDir
 */
function grabBaseContent(widget, widgetDir) {

  // Build up a list of promises.
  const promises = []

  // Just to be safe, check the endpoints are there.
  if (endPointTransceiver.serverSupports(
      "getWidgetDescriptorBaseTemplate", "getWidgetDescriptorBaseLess", "getWidgetDescriptorBaseLocaleContent")) {

    // No point in getting less or template for global widgets.
    if (!widget.global) {
      promises.push(copyFieldContentsToFile("getWidgetDescriptorBaseTemplate", widget.id, "source", `${widgetDir}/${constants.widgetTemplate}`))
      promises.push(copyFieldContentsToFile("getWidgetDescriptorBaseLess", widget.id, "source", `${widgetDir}/${constants.widgetLess}`))
    }

    // Don't try to get i18 resources unless we have some.
    if (widget.i18nresources) {
      promises.push(grabBaseLocaleContent(widget, widgetDir))
    }
  } else {
    warn("baseWidgetContentCannotBeGrabbed")
  }

  // Gather all the promises together into a single one.
  return Promise.all(promises)
}

/**
 * Get the locale config file for supplied widget and locale and stick it in the supplied dir.
 * @param widget
 * @param configLocalesDir
 * @param locale
 * @returns {Promise.<TResult>|*}
 */
function getWidgetConfigSnippets(widget, configLocalesDir, locale) {

  return endPointTransceiver.getConfigLocaleContentForWidgetDescriptor([widget.repositoryId, locale.name],
    request().withLocale(locale.name)).then(results => {

    writeFileAndETag(`${configLocalesDir}/${locale.name}.json`,
      JSON.stringify(results.data.localeData, null, 2), results.response.headers.etag)
  })
}

/**
 * Get the config related content for the supplied widget.
 * @param widget
 * @param widgetDir
 */
function grabConfigContent(widget, widgetDir) {

  // Make sure the server can do what we want.
  if (endPointTransceiver.serverSupports("getConfigMetadataForWidgetDescriptor")) {

    // Build up a list of promises.
    const promises = []

    // Create a config dir first.
    const configDir = `${widgetDir}/config`
    makeTrackedDirectory(configDir)

    // Get the config file.
    promises.push(endPointTransceiver.getConfigMetadataForWidgetDescriptor([widget.id]).then(results => {

      writeFileAndETag(`${configDir}/${constants.userConfigMetadataJson}`,
        JSON.stringify(results.data.metadata, null, 2), results.response.headers.etag)
    }))

    // Make the locales directories first.
    const configLocalesDir = `${configDir}/locales`
    makeTrackedDirectory(configLocalesDir)

    // Then do the locales request one by one to stop us running out of connections.
    promises.push(Promise.each(endPointTransceiver.locales, locale => getWidgetConfigSnippets(widget, configLocalesDir, locale)))

    // Gather all the promises together into a single one.
    return Promise.all(promises)
  } else {
    warn("widgetConfigCannotBeGrabbed")
  }
}

/**
 * Using the supplied widget information, pull all available files from the server
 * and write them to disk.
 * @param widget
 */
function grabWidget(widget) {

  // Let the user know something is happening...
  info("grabbingWidget", {name : widget.displayName})

  // Create the top level directory.
  const widgetDir = createWidgetDirectory(widget)

  // Keep track of all the promises, returning them as a single promise at the end.
  const promises = []

  // Need to store internal metadata in the tracking dir for later (and maybe additional metadata for user defined widgets).
  promises.push(writeWidgetMetadata(widget, widgetDir))

  // Only try to pull the JS if we are allowed to.
  if (widget.jsEditable) {
    promises.push(grabAllJavaScript(widget.id, widgetDir))
  } else {
      // if there is javascript module / extension code grab it.
      if (("javascriptExtension" in widget) && (widget.javascriptExtension !== null)){
        promises.push(grabOnlyModuleJavascript(widget.id, widgetDir))
      }
  }

  // See if this is a user created widget.
  if (widget.source === 101) {
    promises.push(grabBaseContent(widget, widgetDir))

    // See if the widget is configurable.
    if (widget.configurable) {
      promises.push(grabConfigContent(widget, widgetDir))
    }
  }

  // Make an instances directory for future use.
  const instancesDir = `${widgetDir}/instances`
  makeTrackedDirectory(instancesDir)

  return Promise.all(promises)
}

/**
 * In certain scenarios, it is possible to get the multiple instances of the same name but different versions.
 * We only want instances of the latest version.
 * @param items
 */
function removeDuplicates(widgetInstances) {

  // Create a map to guarantee uniqueness.
  const instancesMap = new Map()

  // Walk through the list, looking for duplicates.
  widgetInstances.forEach(widgetInstance => {

    // We have seen an instance with this name before.
    if (instancesMap.has(widgetInstance.displayName)) {

      // See if the instance is more up to date than the one we have in the map.
      const storedInstance = instancesMap.get(widgetInstance.displayName)

      if (widgetInstance.version > storedInstance.version) {

        // This one is more up to date so replace what is in the map.
        instancesMap.set(widgetInstance.displayName, widgetInstance)
      }
    } else {

      // Never seen the instance before - just need to add it.
      instancesMap.set(widgetInstance.displayName, widgetInstance)
    }
  })

  // Send back the processed list.
  return instancesMap.values()
}

/**
 * Grab all the widget instances on the system, assuming we have already got the base widgets.
 */
function grabWidgetInstances() {

  return endPointTransceiver.listWidgets().then(results => {

    // Now look at each instance in turn.
    return Promise.map(removeDuplicates(results.data.items), widgetInstance => grabWidgetInstance(widgetInstance), getAllowedConcurrency())
  })
}

/**
 * Get the CSS for the supplied instance.
 * @param widgetInstance
 * @param widgetInstanceDir
 * @returns A BlueBird promise
 */
function getInstanceCss(widgetInstance, widgetInstanceDir) {

  // Match value will be a combination of widget ID and widget instance ID. We want to replace this with something
  // neutral that we can transform again when put the code back up.
  return copyFieldContentsToFile("getWidgetLess", widgetInstance.id, "source",
    `${widgetInstanceDir}/${constants.widgetLess}`, constants.lessFileSubstitutionReqExp, constants.widgetInstanceSubstitutionValue)
}

/**
 * Get user modifiable metadata for the instance.
 * @param widgetInstance
 * @param widgetInstanceDir
 * @returns {Promise.<TResult>|*}
 */
function getInstanceMetadata(widgetInstance, widgetInstanceDir) {

  // Make sure the endpoint exists on the instance.
  if (endPointTransceiver.serverSupports("getWidgetMetadata")) {

    // Call the custom metadata endpoint created specially for this purpose.
    return endPointTransceiver.getWidgetMetadata([widgetInstance.repositoryId]).then(results => {

      // Write out the massaged data.
      writeFileAndETag(`${widgetInstanceDir}/${constants.userWidgetInstanceMetadata}`,
        JSON.stringify(results.data.metadata, null, 2), results.response.headers.etag)
    })

  } else {
    warn("widgetInstanceMetadataCannotBeGrabbed")
  }
}

/**
 * Save information for widget instance off in the tracking directory.
 * @param widgetInstance
 * @param widgetInstanceDir
 */
function saveInstanceMetadata(widgetInstance, widgetInstanceDir) {

  const widgetInstanceJson = {}
  widgetInstanceJson.repositoryId = widgetInstance.repositoryId
  widgetInstanceJson.descriptorRepositoryId = widgetInstance.descriptor.repositoryId
  widgetInstanceJson.version = widgetInstance.descriptor.version
  widgetInstanceJson.displayName = widgetInstance.displayName

  writeMetadata(`${widgetInstanceDir}/${constants.widgetInstanceMetadataJson}`, widgetInstanceJson)
}

/**
 * Process the supplied widget instance.
 * @param widgetInstance
 */
function grabWidgetInstance(widgetInstance) {

  // Let the user know something is happening.
  info("grabbingWidgetInstance", {name : widgetInstance.displayName})

  // See if we can find a widget dir.
  const widgetDir = widgetTypeToDirectoryMap.get(widgetInstance.descriptor.widgetType)

  // If there's no widget dir, it implies the widget is not editable and can be ignored.
  if (widgetDir) {

    // Create directory for each widget instance.
    const widgetInstanceDir = `${widgetDir}/instances/${sanitizeName(widgetInstance.displayName)}`

    // See if we already have grabbed a version of the instance.
    if (exists(widgetInstanceDir)) {

      // Get the version from the instance we currently have on disk.
      const versionOnDisk = readMetadataFromDisk(widgetInstanceDir, constants.widgetInstanceMetadataJson).version

      // If the one on disk is more up to date, don't go any further.
      if (versionOnDisk > widgetInstance.descriptor.version) {
        return null
      }
    }

    // Safe to go ahead and start building.
    makeTrackedTree(widgetInstanceDir)

    // Save off the metadata for the instance.
    saveInstanceMetadata(widgetInstance, widgetInstanceDir)

    // Build up the default promise list. Always want the template, style sheet, snippets and modifiable metadata.
    return Promise.all([
      getInstanceTemplate(widgetInstance.descriptor.widgetType, widgetInstance.id, widgetInstanceDir),
      getInstanceCss(widgetInstance, widgetInstanceDir),
      getInstanceSnippets(widgetInstance, widgetInstanceDir),
      getInstanceMetadata(widgetInstance, widgetInstanceDir)
    ])
  }
}

/**
 * Get all the snippet stuff for widget instance.
 * @param widgetInstance
 * @param widgetInstanceDir
 * @returns {*}
 */
function getInstanceSnippets(widgetInstance, widgetInstanceDir) {

  // Make the locales directories first.
  makeTrackedDirectory(`${widgetInstanceDir}/locales`)

  // Then do the locales request one by one to stop us running out of connections.
  return Promise.each(endPointTransceiver.locales, locale => getWidgetSnippets(widgetInstance, widgetInstanceDir, locale))
}

/**
 * Get the template for the instance.
 * @param widgetType
 * @param widgetInstanceId
 * @param widgetInstanceDir
 * @returns A Bluebird promise.
 */
function getInstanceTemplate(widgetType, widgetInstanceId, widgetInstanceDir) {

  const promises = []

  // Grab the base template.
  promises.push(copyFieldContentsToFile("getWidgetSourceCode", widgetInstanceId, "source", `${widgetInstanceDir}/${constants.widgetTemplate}`))

  // Web Content widgets are special in that the template with the actual content is on a different endpoint. Pull it down as well in a different file.
  if (widgetType === "webContent") {
    promises.push(copyFieldContentsToFile("getWidgetWebContent", widgetInstanceId, "content", `${widgetInstanceDir}/${constants.webContentTemplate}`))
  }

  return Promise.all(promises)
}

/**
 * Get all the snippets associated with a specific locale and widget instance.
 * @param widgetInstance
 * @param widgetInstanceDir
 * @param locale
 * @returns a Bluebird promise.
 */
function getWidgetSnippets(widgetInstance, widgetInstanceDir, locale) {

  let getSnippetsEndpoint = endPointTransceiver["getWidgetLocaleContent"]
  let endpointParams = [widgetInstance.id]

  // Prefer an endpoint that will lock at locale level if available.
  if (endPointTransceiver["getWidgetLocaleContentForLocale"]) {
    getSnippetsEndpoint = endPointTransceiver["getWidgetLocaleContentForLocale"]
    endpointParams = [widgetInstance.id, locale.name]
  }

  // Get the text snippets for the "current" locale.
  return getSnippetsEndpoint(endpointParams, request().withLocale(locale.name)).tap(results => {

    // See if we got any locale data.
    if (results.data.localeData && Object.keys(results.data.localeData.resources).length) {

      // Create directory for the current locale.
      const widgetInstanceLocaleDir = `${widgetInstanceDir}/locales/${locale.name}`
      makeTrackedDirectory(widgetInstanceLocaleDir)

      // If there are custom field values, use these to override the base values.
      results.data.localeData.custom && Object.keys(results.data.localeData.resources).forEach(key => {
        if (results.data.localeData.custom[key]) {
          results.data.localeData.resources[key] = results.data.localeData.custom[key]
        }
      })

      // Then extract just what we want for the file.
      const fileContents = {
        resources : results.data.localeData.resources
      }

      // Write out the text strings as a JSON file.
      const localeStringsFile = `${widgetInstanceLocaleDir}/ns.${widgetInstance.descriptor.widgetType.toLowerCase()}.json`
      writeFile(localeStringsFile, JSON.stringify(fileContents, null, 2))

      // Write out the etag.
      writeEtag(localeStringsFile, results.response.headers.etag)
    }
  })
}


/*
 * Checks to see if the jsFile is an extension / moudule javascript file.
 * @param jsFile - jsFile object

 */
function isJavascriptModule(jsFile){
  let retValue = false

  if ( "extension" in jsFile){

    if (typeof(jsFile.extension) === "string") {
      retValue =  jsFile.extension.toLowerCase() == 'true'
    }
  }

  return retValue
}

/*
 * Given the ID of widget, grab the associated Module JavaScript and write it to the supplied directory.
 * To be used on widget that are not jsEditable
 * @param id the widget id
 * @param widgetDir the widget directory.

 */
function grabOnlyModuleJavascript(id, widgetDir) {

  // Create the js dir under the widget if it does not exist already.
  const widgetJsDir = `${widgetDir}/js/`
  makeTrackedDirectory(widgetJsDir)
  const widgetModuleDir = `${widgetDir}/module`
  makeTrackedDirectory(widgetModuleDir)
  const widgetModuleJsDir = `${widgetDir}/module/js`
  makeTrackedDirectory(widgetModuleJsDir)

  // Keep track of all the promises, returning them as a single promise at the end.
  const promises = []

  // Get the javascript - if any.
  endPointTransceiver.getWidgetDescriptorJavascriptExtensionInfoById([id]).then(results => {
      results.data.jsFiles && results.data.jsFiles.forEach(jsFile => {
          promises.push(endPointTransceiver.get(jsFile.url).tap(results => {

            if (isJavascriptModule(jsFile)){
              writeFileAndETag(`${widgetModuleJsDir}/${jsFile.name}`, results.data, results.response.headers.etag)
            }

          }))
        }
      )
    }
  )

  return Promise.all(promises)
}
