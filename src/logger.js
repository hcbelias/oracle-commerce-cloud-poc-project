"use strict"

const colors = require('colors/safe')

const t = require("./i18n").t

let verbose = false;

/**
 * Used to control debug level logging.
 * @param flag
 */
function setVerboseLogging (flag) {
  verbose = !!flag
}

/**
 * Record that an error has occurred in an international way.
 * @param key
 * @param substitutions
 * @param captionKey - optional key for caption string
 */
function error(key, substitutions, captionKey) {
  logError(t(key, substitutions), captionKey ? t(captionKey) : undefined)
}

/**
 * Record that something has occurred in an international way.
 * @param key
 * @param substitutions
 */
function info(key, substitutions) {
  logInfo(t(key, substitutions))
}

/**
 * Record that something worrying has occurred in an international way.
 * @param key
 * @param substitutions
 */
function warn(key, substitutions) {
  logWarn(t(key, substitutions))
}

/**
 * Record that something uninteresting has occurred in an international way.
 * @param key
 * @param substitutions
 */
function debug(key, substitutions) {
  if (verbose) {
    logDebug(t(key, substitutions))
  }
}

/**
 * Record that an error has occurred.
 * @param text
 */
function logError(text) {
  console.log(colors.red.bold(text))

  // Remember that something went wrong for later.
  exports.hadSeriousError = true
}

/**
 * Record that something has occurred.
 * @param text
 */
function logInfo(text) {
  console.log(text)
}

/**
 * Record that something worrying has occurred.
 * @param text
 * @param caption - optional
 */
function logWarn(text, caption) {
  console.log(colors.magenta.bold(text))
}

/**
 * Record that something uninteresting has occurred.
 * @param text
 * @param caption - optional
 */
function logDebug(text, caption) {
  if (verbose) {
    console.log(colors.gray(text))
  }
}

/**
 * Dump the supplied object in a readable way.
 * @param object
 */
function dump(object) {
  console.log(JSON.stringify(object, null, 2))
}

exports.debug = debug
exports.dump = dump
exports.error = error
exports.hadSeriousError = false
exports.info = info
exports.logError = logError
exports.logInfo = logInfo
exports.logWarn = logWarn
exports.logDebug = logDebug
exports.setVerboseLogging = setVerboseLogging
exports.warn = warn
