/**
 * Holds common utility functions for doing things.
 */
"use strict"

const dirname = require('path').dirname
const fs = require('fs')
const mkdirp = require('mkdirp')
const shadowedOsLocale = require('os-locale')
const Path = require('path')
const sanitize = require("sanitize-filename")
const upath = require("upath")
const remove = require('remove')
const glob = require('glob')
const walk = require('walk')

const constants = require("./constants").constants

// Default config for sanitizing file names.
const sanitizeConfiguration = {
  replacement : " "
}

let basePath = null

/**
 * Tell the module to use this path for all relative paths.
 * @param path
 */
function useBasePath(path) {

  basePath = path

  basePath && (basePath = normalize(basePath))
}

/**
 * In case someone else needs to know.
 * @returns The current base path as a string.
 */
function getBasePath() {
  return basePath
}

/**
 * Return a fully normalized path taking account of the current base directory.
 * @param path
 */
function resolvePath(path) {

  // If the path is absolute, our work is done.
  if (Path.isAbsolute(path)) {

    return normalize(path)
  } else {

    // Path is relative. See if we have a base path.
    if (basePath) {

      // See if base path is absolute.
      if (Path.isAbsolute(basePath)) {

        return upath.join(basePath, path)
      } else {

        // Both paths are relative. See if the base path looks like it has already been added.
        if (path.startsWith(basePath)) {

          return path
        } else {
          // Base path has not been added. Add it now.
          return upath.join(basePath, path)
        }
      }
    } else {

      // No base path and path is relative. Job done.
      return normalize(path)
    }
  }
}

/**
 * Turn the supplied path into standard format.
 * @param path
 * @returns a normalized path
 */
function normalize(path) {
  return upath.normalize(path)
}

/**
 * Return true if the supplied path is a directory.
 * @param path
 * @returns boolean
 */
function isDirectory(path) {
  try {
    return fs.statSync(path).isDirectory();
  } catch (e) {
    return false
  }
}

/**
 * Create a directory both in the target directory and in the tracking directory.
 * @param dir
 */
function makeTrackedDirectory(dir) {
  mkdirIfNotExists(dir)
  mkdirIfNotExists(`${constants.trackingDir}/${dir}`)
}

/**
 * Find the directory from the metadata directory which should be somewhere above the current path.
 * @param path
 * @returns string base directory path or null
 */
function findBaseDirFromPath(path) {

  // Relative paths must be relative to the base directory.
  if (!Path.isAbsolute(path)) {
    return basePath ? basePath : "."
  }

  // Starting at the bottom directory in the path, look for the .ccc dir. When we get the root dir, join will return ".".
  let currentDir = isDirectory(path) ? path : dirname(path)

  while (currentDir != ".") {

    // See if the tracking directory is in the current directory.
    const trackingDir = upath.join(currentDir, constants.trackingDir)
    if (fs.existsSync(trackingDir)) {

      // Found the tracking directory! Return the directory we found it in.
      return currentDir
    }

    // No luck. Keep looking.
    currentDir = upath.join(currentDir, "..")
  }

  // If we got to here, we couldn't find the tracking directory.
  throw new Error(`Failed for find tracking directory for ${path}`)
}

/**
 * Simple utility function to put the file boilerplate in one place.
 * @param path
 * @param content
 */
function writeFile(path, content) {

  makeTree(dirname(path))
  fs.writeFileSync(resolvePath(path), content, 'utf8')
}

/**
 * Simple utility function to make a directory only if it isn't there.
 * @param dir
 */
function mkdirIfNotExists(dir) {

  try {
    fs.accessSync(resolvePath(dir))
  } catch (e) {
    fs.mkdirSync(resolvePath(dir))
  }
}

/**
 * Turn the supplied name into something we can use to create a directory for file from.
 * @param name
 * @returns the name minus any funny characters
 */
function sanitizeName(name) {
  return sanitize(name ? name : "null", sanitizeConfiguration)
}

/**
 * Read the file given by the supplied path.
 * @param path
 * @returns The file contents.
 */
function readFile(path) {
  return fs.readFileSync(resolvePath(path), 'utf8')
}

/**
 * Return true if the file or directory given by path exists.
 * @param path
 * @returns true if the path can be located. false o/w.
 */
function exists(path) {
  return fs.existsSync(resolvePath(path))
}

/**
 * Recursively create the directories in the supplied path in the base and tracking directories.
 * @param directory
 */
function makeTrackedTree(directory) {
  mkdirp.sync(resolvePath(directory))
  mkdirp.sync(resolvePath(`${constants.trackingDir}/${directory}`))
}

/**
 * Recursively delect the directories in the supplied path in the base and tracking directories.
 * @param directory
 */
function removeTrackedTree(directory) {
  removeTree(directory)
  removeTree(`${constants.trackingDir}/${directory}`)
}

/**
 * Recursively create the directories in the supplied path.
 * @param directory
 */
function makeTree(directory) {
  mkdirp.sync(resolvePath(directory))
}

/**
 * Recursively remove the specified directory tree if it exists.
 * @param directory
 */
function removeTree(directory) {
  try {
    remove.removeSync(resolvePath(directory))
  } catch (e) {
    // This call can bomb if the dir isn't there.
  }
}

/**
 * Read the file given by the supplied path and parse it as JSON.
 * @param path
 * @return the file contents as a JavaScript object graph.
 */
function readJsonFile(path) {
  return JSON.parse(readFile(path))
}

/**
 * Given a path to an asset, derive the base directory and the path under the base directory.
 * @param path
 */
function splitFromBaseDir(path) {

  // Find the base directory one way or another.
  const baseDir = findBaseDirFromPath(path)

  // Cut out the base directory part and asset file from the path was passed in, including the trailing separator.
  const directory = isDirectory(path) ? path : dirname(path)
  const subDir = directory.replace(`${baseDir}/`, "")

  // Return both pieces.
  return [baseDir, subDir]
}

/**
 * Synchronously enumerate files matching the path string without our resolved
 * content directory.
 *
 * @param path A path string which may contain glob wildcards (*, **).
 */
function globSync(path) {
  return glob.sync(resolvePath(path))
}

/**
 * Return the os-locale in a standard format.
 */
function osLocale() {
  return shadowedOsLocale.sync()
}

/**
 * Get the first part of the locale i.e. the language.
 * @param locale
 * @returns {string}
 */
function shortLocale(locale) {
  return locale.substr(0, 2)
}

/**
 * Simple path sensitive wrapper around walker - sync version.
 * @param path
 */
function walkDirectory(path, options) {

  // Always avoid links.
  options.followLinks = false

  // Normalize the path in case its in windows format, taking into account the base directory.
  return walk.walkSync(resolvePath(path), options)
}

/**
 * Recursively creates the tracking directories for the supplied path, used for
 * @param directory
 */
function makeTrackingDirTree(path) {

  const splitDirs = splitFromBaseDir(path)
  const baseDir = splitDirs[0], subDir = splitDirs[1]

  mkdirp.sync(resolvePath(`${constants.trackingDir}/${subDir}`))
}

exports.exists = exists
exports.findBaseDirFromPath = findBaseDirFromPath
exports.getBasePath = getBasePath
exports.glob = globSync
exports.isDirectory = isDirectory
exports.makeTree = makeTree
exports.makeTrackedDirectory = makeTrackedDirectory
exports.makeTrackedTree = makeTrackedTree
exports.mkdirIfNotExists = mkdirIfNotExists
exports.normalize = normalize
exports.osLocale = osLocale
exports.readFile = readFile
exports.readJsonFile = readJsonFile
exports.removeTrackedTree = removeTrackedTree
exports.removeTree = removeTree
exports.resolvePath = resolvePath
exports.sanitizeName = sanitizeName
exports.shortLocale = shortLocale
exports.splitFromBaseDir = splitFromBaseDir
exports.useBasePath = useBasePath
exports.walkDirectory = walkDirectory
exports.writeFile = writeFile
exports.makeTrackingDirTree = makeTrackingDirTree
