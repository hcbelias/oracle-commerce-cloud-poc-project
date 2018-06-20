"use strict"

const Promise = require("bluebird")

const constants = require("./constants").constants
const endPointTransceiver = require("./endPointTransceiver")
const getAllowedConcurrency = require("./concurrencySettings").getAllowedConcurrency
const info = require("./logger").info
const makeTrackedDirectory = require("./utils").makeTrackedDirectory
const request = require("./requestBuilder").request
const warn = require("./logger").warn
const writeFileAndETag = require("./grabberUtils").writeFileAndETag

/**
 * Suck down the common text snippets.
 */
exports.grabCommonTextSnippets = function () {

  // Make sure the server has the endpoint we need.
  if (!endPointTransceiver.serverSupports("getResourceStrings")) {
    warn("textSnippetsCannotBeGrabbed")
    return
  }

  // Create a directory to bung it all in and one for each locale.
  makeTrackedDirectory(constants.textSnippetsDir)

  // Get these for each language one by one to avoid running out of connections.
  return Promise.map(endPointTransceiver.locales, locale => {

    let textSnippetEndpoint = endPointTransceiver["getResourceStrings"]
    let endpointParams = ["ns.common"]

    if (endPointTransceiver["getResourceStringsForLocale"]) {
      textSnippetEndpoint = endPointTransceiver["getResourceStringsForLocale"]
      endpointParams = ["ns.common", locale.name]
    }

    textSnippetEndpoint(endpointParams, request().withLocale(locale.name)).tap(results => {

      // Only write out something if there something to write.
      results.data.resources && writeTextSnippetsForLocale(locale, results)
    })
  }, getAllowedConcurrency())
}

/**
 * Does the work of getting the text snippet information from the response to disk.
 * @param locale
 * @param results
 */
function writeTextSnippetsForLocale(locale, results) {

  // Let the user know something is happening...
  info("grabbingTextSnippets", {name : locale.name})

  // Create a directory for the locale and stick the contents in it.
  const textSnippetsLocaleDir = `${constants.textSnippetsDir}/${locale.name}`
  makeTrackedDirectory(textSnippetsLocaleDir)

  // Walk through any custom keys using them to override the base values.
  results.data.custom && Object.keys(results.data.resources).forEach(outerKey => {
    Object.keys(results.data.resources[outerKey]).forEach(innerKey => {
      if (results.data.custom[innerKey]) {
        results.data.resources[outerKey][innerKey] = results.data.custom[innerKey]
      }
    })
  })

  // Write the massaged data out to disk.
  writeFileAndETag(`${textSnippetsLocaleDir}/${constants.snippetsJson}`,
    JSON.stringify(results.data.resources, null, 2), results.response.headers.etag)
}
