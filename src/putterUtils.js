"use strict"

const error = require("./logger").error

const inTransferMode = require("./metadata").inTransferMode
const writeEtag = require("./etags").writeEtag

/**
 * Process the result of a put, telling the user how things went.
 * @param path
 * @param results
 * @returns true if it went OK, false otherwise.
 */
function processPutResult(path, results) {

  // See if we opt locked. Bomb out if we did.
  if (results.response.statusCode == 412) {

    error("alreadyBeenModified", {path}, "optimisticLock")
    return false

    // Any bad HTTP codes are taken as failure.
  } else if (results.response.statusCode < 200 || results.response.statusCode > 299) {
    return false
  }

  return true
}

/**
 * Does the requisite post processing after an attempted put.
 * If all goes well, write out the new etag for the file.
 * @param path
 * @param results
 * @return true if all went well, false otherwise.
 */
function processPutResultAndEtag(path, results, successCallback) {

  // If things went OK, write out the new etag unless we are in transfer mode.
  if (processPutResult(path, results) && !inTransferMode()) {

    writeEtag(path, results.response.headers.etag)

    // Looking good - call the succes callback if there is one.
    successCallback && successCallback(path)
  }
}

exports.processPutResult = processPutResult
exports.processPutResultAndEtag = processPutResultAndEtag
