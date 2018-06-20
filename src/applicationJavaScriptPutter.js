const basename = require('path').basename

const endPointTransceiver = require("./endPointTransceiver")
const warn = require("./logger").warn
const eTagFor = require("./etags").eTagFor
const processPutResultAndEtag = require("./putterUtils").processPutResultAndEtag
const request = require("./requestBuilder").request

/**
 * Send the contents of the specified Application Level JS file back up to the server.
 * @param path
 * @returns A BlueBird promise
 */
exports.putApplicationJavaScript = function (path) {

  // Make sure the server supports the operation as this is a recent innovation.
  if (endPointTransceiver.serverSupports("updateApplicationJavaScript")) {

    return endPointTransceiver.updateApplicationJavaScript([basename(path)],
      request().fromPathAs(path, "source").withEtag(eTagFor(path))).tap(results => processPutResultAndEtag(path, results))
  } else {
    warn("applicationJavaScriptCannotBeSent")
  }
}
