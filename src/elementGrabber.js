const Promise = require("bluebird")

const constants = require("./constants").constants
const endPointTransceiver = require("./endPointTransceiver")
const exists = require("./utils").exists
const getAllowedConcurrency = require("./concurrencySettings").getAllowedConcurrency
const getDirectoryForWidget = require("./widgetGrabber").getDirectoryForWidget
const info = require("./logger").info
const makeTrackedDirectory = require("./utils").makeTrackedDirectory
const sanitizeName = require("./utils").sanitizeName
const warn = require("./logger").warn
const writeFileAndETag = require("./grabberUtils").writeFileAndETag
const writeMetadata = require("./metadata").writeMetadata

const globalElementTags = new Set()

const processedWidgets = new Set()

/**
 * Note that there are two types of elements - those that live under widgets and those that are global and standalone.
 * Currently, even though you can edit the JS for elements uploaded via an Extension, the JS for an element will not be
 * editable here unless one of their parent widgets has editable JS.
 *
 * Note that we are assuming here that widgets have already been grabbed in previous step.
 * @returns A BlueBird promise
 */
exports.grabAllElements = function () {

  // Create a directory for global elements.
  makeTrackedDirectory(constants.elementsDir)

  // The endpoints we need to manipulate elements were added fairly recently so let's not assume they are there.
  if (endPointTransceiver.serverSupports("getFragmentTemplate", "getFragmentJavaScript")) {

    // This endpoint was added specifically to support this script so make sure it exists.
    if (endPointTransceiver.serverSupports("getElements")) {

      return grabGlobalElements().then((results) => grabWidgetElements())
    } else {
      warn("globalElementsCannotBeGrabbed")
      return grabWidgetElements()
    }

  } else {
    warn("elementsCannotBeGrabbed")
  }
}

/**
 * Find all the elements associated with widgets on the server and grab them.
 * Global elements are handled separately.
 * @returns A BlueBird promise
 */
function grabWidgetElements() {

  return endPointTransceiver.listWidgets().then((results) => grabElementsForWidgets(results.data.items))
}

/**
 * Return true if we have already seen an instance of this widget. We need this to stop us processing the same elements
 * more than once.
 * @param widgetDescriptor
 */
function grabbed(widgetRespositoryId) {

  if (processedWidgets.has(widgetRespositoryId)) {
    return true
  } else {
    // Record the fact that we have seen this so the next time we return true.
    processedWidgets.add(widgetRespositoryId)
    return false
  }
}

/**
 * Given a list of widgets, grab all their associated elements.
 * @param widgets
 * @returns A BlueBird promise.
 */
function grabElementsForWidgets(widgets) {

  return Promise.each(widgets, widget => {

    // Make sure widget is editable and has not been processed before.
    if (widget.descriptor.editableWidget && !grabbed(widget.descriptor.repositoryId)) {

      return endPointTransceiver.getWidget([widget.repositoryId]).then(results => {

        // Make sure widget actually has some interesting elements.
        if (hasGrabbableNonGlobalElements(results.data.fragments)) {

          // Create a directory for elements under the widget. Get the widgetGrabber to tell us where.
          const baseElementDir =
            `${getDirectoryForWidget(widget.descriptor.widgetType, widget.descriptor.version, widget.descriptor.isLatestVersion)}/${constants.elementsDir}`

          makeTrackedDirectory(baseElementDir)

          return Promise.map(results.data.fragments, element => {

            // Don't want all element types.
            if (isGrabbableElementType(element.type)) {

              return grabWidgetElement(widget, element, baseElementDir)
            }
          }, getAllowedConcurrency())
        }
      })
    }
  })
}

/**
 * Returns true if at least one of the elements in the array is grabbable.
 * @param elements
 * @returns {boolean}
 */
function hasGrabbableNonGlobalElements(elements) {
  return elements && elements.some((element) => isGrabbableElementType(element.type) && !isGlobal(element.tag))
}

/**
 * Return true if the element type passed in is suitable for grabbing.
 * @param elementType
 */
function isGrabbableElementType(elementType) {
  return ["panel", "instance", "subFragment"].every((unwantedType) => elementType != unwantedType)
}

/**
 * Pull down the assets associated with widgets element.
 * @param widget
 * @param element
 * @param baseElementDir
 * @returns A BlueBird promise.
 */
function grabWidgetElement(widget, element, baseElementDir) {

  // Leave global elements alone - they are handled elsewhere.
  if (!isGlobal(element.tag)) {

    // Let the user know something is happening...
    info("grabbingElement", {name : element.title})

    // Then create a directory for the specific element under its widget. Get rid of any invalid characters.
    const elementDir = `${baseElementDir}/${sanitizeName(element.title)}`
    makeTrackedDirectory(elementDir)

    // Save off the metadata.
    storeElementMetaData(element.tag, widget.descriptor.repositoryId, widget.descriptor.version, elementDir)

    // Lastly get template and possibly the JavaScript.
    return grabWidgetElementAssets(widget, element, elementDir)
  }
}

/**
 * Write out the metadata for the element.
 * @param tag
 * @param widgetId - optional.
 * @param version - optional.
 * @param elementDir
 */
function storeElementMetaData(tag, widgetId, version, elementDir) {

  // Need to store the widget ID (if supplied) and element tag in the tracking dir for later.
  const metadata = {tag}

  if (widgetId) {
    metadata.widgetId = widgetId
  }

  if (version) {
    metadata.version = version
  }

  writeMetadata(`${elementDir}/${constants.elementMetadataJson}`, metadata)
}

/**
 * Get the files for an element associated with a widget.
 * @param widget
 * @param element
 * @param elementDir
 * @returns A Bluebird promise.
 */
function grabWidgetElementAssets(widget, element, elementDir) {

  // Build up a list of promises. Always try to get the template.
  const promises = [
    grabWidgetElementFile("getFragmentTemplate", widget.descriptor.repositoryId, element.tag, elementDir, constants.elementTemplate, "template")
  ]

  // Try to get the javascript for the element only if the parent widget has editable JS (and there may not be any anyway).
  if (widget.descriptor.jsEditable) {
    promises.push(grabWidgetElementFile("getFragmentJavaScript", widget.descriptor.repositoryId, element.tag, elementDir, constants.elementJavaScript, "javascript"))
  }

  return Promise.all(promises)
}

/**
 * Holds the boilerplate for getting the file associated with an non-global element.
 * @param endpoint
 * @param widgetRepositoryId
 * @param tag
 * @param elementDir
 * @param fileName
 * @param field
 * @returns A BlueBird promise
 */
function grabWidgetElementFile(endpoint, widgetRepositoryId, tag, elementDir, fileName, field) {

  return endPointTransceiver[endpoint]([widgetRepositoryId, tag]).tap(results => {
    // Only write anything out if we got anything.
    if (results.data.code && results.data.code[field]) {
      writeFileAndETag(`${elementDir}/${fileName}`, results.data.code[field], results.response.headers.etag)
    }
  })
}

/**
 * Find all the global elements and display them.
 */
function grabGlobalElements() {

  // Create a top level element directory.
  const elementsDir = `${constants.elementsDir}`
  makeTrackedDirectory(elementsDir)

  // Get a list of global elements.
  return endPointTransceiver.getElements("?globals=true").tap(results => {

    return Promise.map(results.data.items, globalElement => {

      // Make sure the element is not from the wrong side of the tracks.
      if (!isGrabbableElementType(globalElement.type)) {
        return
      }

      // See if we have processed this element already.
      if (globalElementTags.has(globalElement.tag)) {
        return
      }

      // Keep a note of the tags for later.
      globalElementTags.add(globalElement.tag)

      // Get the files associated with the global element while we are about it.
      return grabGlobalElementAssets(globalElement, elementsDir)
    }, getAllowedConcurrency())
  })
}

/**
 * Return true if the supplied element title refers to a global element.
 * @param tag
 */
function isGlobal(tag) {
  return globalElementTags.has(tag)
}

/**
 * Get the template and JavaScript for the supplied global element.
 * @param element
 * @param elementsDir
 * @returns A BlueBird Promise
 */
function grabGlobalElementAssets(element, elementsDir) {

  // Start with an empty list of promises.
  const promises = []

  // Let the user know something is happening...
  info("grabbingElement", {name : element.title})

  // Then create a directory for the specific element in the global directory. Get rid of any invalid characters.
  const elementDir = `${elementsDir}/${sanitizeName(element.title)}`
  makeTrackedDirectory(elementDir)

  // Write out the metadata.
  storeElementMetaData(element.tag, null, null, elementDir)

  // Only try to get the JavaScript for non-Oracle supplied elements.
  if (element.source != 100) {
    promises.push(grabGlobalElementFile("getGlobalElementJavaScript", element.tag, elementDir, constants.elementJavaScript, "javascript"))
  }

  // Get the template.
  promises.push(grabGlobalElementFile("getGlobalElementTemplate", element.tag, elementDir, constants.elementTemplate, "template"))

  return Promise.all(promises)
}

/**
 * Holds the boilerplate for grabbing templates and JS for global elements.
 * @param endpoint
 * @param tag
 * @param elementDir
 * @param fileName
 * @param field
 * @returns A BlueBird Promise
 */
function grabGlobalElementFile(endpoint, tag, elementDir, fileName, field) {

  return endPointTransceiver[endpoint]([tag]).tap(results => {

    if (results.data.code && results.data.code[field]) {
      writeFileAndETag(`${elementDir}/${fileName}`, results.data.code[field], results.response.headers.etag)
    }
  })
}
