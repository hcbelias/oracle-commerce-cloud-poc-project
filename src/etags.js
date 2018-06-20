"use strict"

const fs = require('fs')
const Path = require('path')

const constants = require("./constants").constants
const findBaseDirFromPath = require("./utils").findBaseDirFromPath
const readFile = require("./utils").readFile
const resolvePath = require("./utils").resolvePath
const writeFile = require("./utils").writeFile

/**
 * Write the supplied etag to the text file in the tracking directory.
 * @param path
 * @param etag
 */
function writeEtag(path, etag) {
  writeFile(getEtagPath(path), etag)
}

/**
 * Decode and dump the etag contents.
 * @param etag
 */
function dumpEtag(etag) {
  console.log(decodeEtag(etag))
}

/**
 * Turn the supplied etag into a readable string.
 * @param etag
 * @returns {string}
 */
function decodeEtag(etag) {
  return new Buffer(etag, 'base64').toString()
}

/**
 * Find the stored etag for the supplied path if it can find the file.
 * @param path
 * @returns a big long string.
 */
function eTagFor(path) {

  // May not be an etag if the server did not return one so be careful.
  const eTagPath = getEtagPath(path)

  if (fs.existsSync(resolvePath(eTagPath))) {
    return readFile(eTagPath)
  } else {
    return ""
  }
}

/**
 * Given a path to an asset, find the path to its etag file.
 * @param path - could be relative or absolute.
 */
function getEtagPath(path) {

  // See if path needs a massage.
  if (Path.isAbsolute(path)) {

    // Find the base directory containing the tracking information.
    const baseDir = findBaseDirFromPath(path)

    // Remove the base dir from the supplied path.
    return `${baseDir}/${constants.trackingDir}/${path.replace(baseDir, "")}${constants.etagSuffix}`
  } else {

    // Simple case - must be relative to current or supplied base directory.
    return `${constants.trackingDir}/${path}${constants.etagSuffix}`
  }
}

/**
 * Holds the boilerplate for generating a dummy etag
 * @param path
 */
function buildDummyEtagContents(path) {

  return new Buffer(JSON.stringify({
    "version" : 0, // This is the property we need to supply for opt lock to work.
    "uri" : path,
    "hash" : "dummy"
  })).toString('base64')
}

/**
 * Write a dummy etag to satisfy optimistic locking. This is to deal with the scenario
 * where we create something and someone else edits it.
 */
function writeDummyEtag(path) {
  writeEtag(path, buildDummyEtagContents(path))
}

/**
 * Given a path to an etag, reset the contents as if it was just being created.
 * @param etagPath
 */
function resetEtag(etagPath) {
  writeFile(etagPath, buildDummyEtagContents(etagPath))
}

exports.dumpEtag = dumpEtag
exports.eTagFor = eTagFor
exports.resetEtag = resetEtag
exports.writeDummyEtag = writeDummyEtag
exports.writeEtag = writeEtag
