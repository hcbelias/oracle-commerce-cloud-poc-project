const constants = require("./constants").constants
const endPointTransceiver = require("./endPointTransceiver")
const warn = require("./logger").warn
const processPutResultAndEtag = require("./putterUtils").processPutResultAndEtag
const readMetadata = require("./metadata").readMetadata
const request = require("./requestBuilder").request

/**
 * Sends a single stack instance file back up to the server.
 * @param path
 * @param endpoint
 */
function putStackInstanceFile(path, endpoint) {

  // See if endpoint exists - stack endpoints are a recent innovation.
  if (!endPointTransceiver.serverSupports(endpoint)) {
    warn("stacksCannotBeSent", {path})
    return
  }

  // Get the metadata for the stack instance.
  return readMetadata(path, constants.stackInstanceMetadataJson).then(metadata => {

    if (metadata) {

      return endPointTransceiver[endpoint]([metadata.repositoryId],
        request().fromPathAs(path, "source").withEtag(metadata.etag)).tap(results => processPutResultAndEtag(path, results))
    } else {
      warn("cannotUpdateStack", {path})
    }
  })
}

exports.putStackInstanceLess = (path) => putStackInstanceFile(path, "updateStackLess")
exports.putStackInstanceLessVariables = (path) => putStackInstanceFile(path, "updateStackLessVars")
exports.putStackInstanceTemplate = (path) => putStackInstanceFile(path, "updateStackSourceCode")
