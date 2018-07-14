const Promise = require("bluebird")

const constants = require("./constants").constants
const endPointTransceiver = require("./endPointTransceiver")
const getAllowedConcurrency = require("./concurrencySettings").getAllowedConcurrency
const info = require("./logger").info
const makeTrackedDirectory = require("./utils").makeTrackedDirectory
const sanitizeName = require("./utils").sanitizeName
const writeFileAndETag = require("./grabberUtils").writeFileAndETag
const writeMetadata = require("./metadata").writeMetadata

/**
 * Get all the custom themes we can find and download their bits.
 * @returns a Bluebird promise
 */
exports.grabAllThemes = function () {

  // Create a directory to bung the themes in.
  makeTrackedDirectory(constants.themesDir)

  // Firstly get a list of themes.
  return endPointTransceiver.getThemes("?type=custom").then(
    results => Promise.map(results.data.items, theme => grabTheme(theme), getAllowedConcurrency()))
}

/**
 * Write out the supplied theme to the various files.
 * @param theme
 * @returns a Bluebird promise
 */
function grabTheme(theme) {

  // Let the user know something is happening...
  info("grabbingTheme", {name : theme.name})

  // Create a directory for the name.
  const themeDir = `${constants.themesDir}/${sanitizeName(theme.name)}`
  makeTrackedDirectory(themeDir)

  // Save off the metadata.
  const themeJson = {}
  themeJson.repositoryId = theme.repositoryId
  themeJson.displayName = theme.name

  writeMetadata(`${themeDir}/${constants.themeMetadataJson}`, themeJson)

  return endPointTransceiver.getThemeSource([theme.repositoryId]).tap(results => {

    writeFileAndETag(`${themeDir}/${constants.themeVariables}`, results.data.variables, results.response.headers.etag)
    writeFileAndETag(`${themeDir}/${constants.themeStyles}`, results.data.styles, results.response.headers.etag)

    // Only write additional styles if there are any.
    if (results.data.additionalStyles) {
      writeFileAndETag(`${themeDir}/${constants.themeAdditionalStyles}`, results.data.additionalStyles, results.response.headers.etag)
    } else {
      writeFileAndETag(`${themeDir}/${constants.themeAdditionalStyles}`, "", results.response.headers.etag)
    }
  })
}
