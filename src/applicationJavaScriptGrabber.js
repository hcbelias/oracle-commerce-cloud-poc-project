const Promise = require("bluebird")

const constants = require("./constants").constants
const endPointTransceiver = require("./endPointTransceiver")
const getAllowedConcurrency = require("./concurrencySettings").getAllowedConcurrency
const info = require("./logger").info
const makeTrackedDirectory = require("./utils").makeTrackedDirectory
const writeFileAndETag = require("./grabberUtils").writeFileAndETag
const warn = require("./logger").warn

exports.grabAllApplicationJavaScript = function () {

  // The endpoints we need to manipulate Application Level JS were added fairly recently so let's not assume they are there.
  if (endPointTransceiver.serverSupports("listAllApplicationJavaScript", "getApplicationJavaScript")) {

    // Create a directory for global JS.
    makeTrackedDirectory(constants.globalDir)

    return endPointTransceiver.listAllApplicationJavaScript().then(results => {

      return Promise.map(Object.keys(results.data.items), jsFile => {

        info("grabbingApplicationJavaScript", {name : jsFile})
        return endPointTransceiver.getApplicationJavaScript([jsFile]).tap(results =>
          writeFileAndETag(`${constants.globalDir}/${jsFile}`, results.data.source, results.response.headers.etag))
      }, getAllowedConcurrency())
    })
  } else {
    warn("applicationJavaScriptCannotBeGrabbed")
  }
}
