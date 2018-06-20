const constants = require("./constants").constants
const endPointTransceiver = require("./endPointTransceiver")
const warn = require("./logger").warn
const processPutResultAndEtag = require("./putterUtils").processPutResultAndEtag
const readFile = require("./utils").readFile
const readMetadata = require("./metadata").readMetadata
const request = require("./requestBuilder").request

/**
 * Contains the boilerplate for put an element file on the server.
 * @param path
 * @param endpoint
 * @param field
 * @returns A BlueBird promise.
 */
function putElementFile(path, endpoint, field) {

  // See if endpoint exists - element endpoints are a recent innovation.
  if (!endPointTransceiver.serverSupports(endpoint)) {
    warn("elementsCannotBeSent", {path})
    return
  }

  // Find the metadata for the element.
  return readMetadata(path, constants.elementMetadataJson).then(metadata => {

    if (metadata) {

      return endPointTransceiver[endpoint](buildUrlParameters(metadata),
        request().withBody(buildPayload(field, path)).withEtag(metadata.etag)).tap(
        results => processPutResultAndEtag(path, results))
    } else {
      warn("cannotUpdateElement", {path})
    }
  })
}

/**
 * Builds up the URL parameters array to pass to the endpoint.
 * @param metadata
 * @returns {Array}
 */
function buildUrlParameters(metadata) {

  // See if this element is associated with a widget, include the widget ID.
  const urlParameters = []

  if (metadata.widgetId) {
    urlParameters.push(metadata.widgetId)
  }

  // Always need the element tag.
  urlParameters.push(metadata.tag)

  return urlParameters
}

/**
 * Boilerplate for building up the payload.
 * @param field
 * @param path
 * @returns {{code: {}}}
 */
function buildPayload(field, path) {

  // Set up the payload based on the parameters we got.
  const payload = {
    code : {}
  }

  payload.code[field] = readFile(path)

  return payload
}

exports.putElementJavaScript = path => putElementFile(path, "updateFragmentJavaScript", "javascript")
exports.putElementTemplate = path => putElementFile(path, "updateFragmentTemplate", "template")
exports.putGlobalElementJavaScript = path => putElementFile(path, "updateGlobalElementJavaScript", "javascript")
exports.putGlobalElementTemplate = path => putElementFile(path, "updateGlobalElementTemplate", "template")
