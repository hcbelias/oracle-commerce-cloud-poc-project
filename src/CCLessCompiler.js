"use strict"

const endPointTransceiver = require("./endPointTransceiver")
const constants = require("./constants").constants
const exists = require("./utils").exists
const glob = require("./utils").glob
const writeFile = require("./utils").writeFile
const readFile = require("./utils").readFile
const request = require("./requestBuilder").request
const readMetadata = require("./metadata").readMetadataFromDisk
const info = require("./logger").info
const error = require("./logger").error

const filewatcher = require("filewatcher")

/**
 * Compile local less once.
 */
exports.compileOnce = doCompile

/**
 * Start a watcher daemon that will run a compile if any changes occur to
 * local less files under basePath.
 */
exports.compileAuto = function () {
  const watcher = filewatcher()

  glob("**/*.less").forEach((path) => {
    watcher.add(path)
  })

  watcher.on('change', function (file, stat) {
    doCompile()
  })
}

/**
 * Compile our local Less file changes and include standard Cloud Commerce
 * boilerplate styles/variable and theme source if necessary. Output will
 * be written to ${themeDir}/storefront.css
 *
 * @returns Compile CSS for Storefront including local modifications.
 */
function doCompile () {
  endPointTransceiver.getActiveTheme().then((result) => {
    const theme = result.data.items[0]

    // Older versions of CCAdminUI API might not support the less compilation
    // endpoint.
    if (!endPointTransceiver.compileLess) {
      error("lessCompilationUnsupportedError", {node: endPointTransceiver.instance})
      return
    }

    if (theme) {
      const name = theme.name
      info("activeThemeText", {name})

      // Collect our local less files for components and theme then compile.
      const payload = {
        src: getAllComponentLess(),
        themeSrc: getAllThemeLess(name)
      }

      if (payload.src && payload.themeSrc) {
        info("compilingComponentAndThemeLess", {theme: name})
      } else {
        info("compilingComponentLess")
      }

      const requestBuilder = request().withBody(payload)
      endPointTransceiver.compileLess([], requestBuilder).tap((result) => {
        writeFile(`${constants.trackingDir}/${constants.themesDir}/${constants.storefrontCss}`, result.data.src)
        info("allDone")
      })
    }
  })
}

/**
 * Collect all the component less source under widget, element, and stack
 * directories as a single concatenated string.
 *
 * @returns {string} All non-compiled component less code.
 */
function getAllComponentLess () {
  let componentLess = ""
  // Get a big string of widget + element + stack Less.
  glob("widget/**/*.less").forEach((path) => {
    const instanceMD = readMetadata(path, constants.widgetInstanceMetadataJson)

    // Need to do a bit of tinkering to replace the #<widget>-<instance> CSS
    // selector... (This does a similar thing to widgetPutter.js)
    const less = readFile(path).replace(
        constants.widgetInstanceSubstitutionValue,
        `#${instanceMD.descriptorRepositoryId}-${instanceMD.repositoryId}`)

    componentLess += less + "\n"
  })

  // Ensure that variables are scooped up first.
  glob("stack/**/stack-variables.less").forEach((path) => {
    componentLess += readFile(path) + "\n"
  })
  glob("stack/**/stack.less").forEach((path) => {
    componentLess += readFile(path) + "\n"
  })

  return componentLess
}

/**
 * Collect the theme less for theme `name', or empty string if the theme
 * directory doesn't exist.
 *
 * @param name Name of Theme
 * @returns {string} Uncompiled Less code.
 */
function getAllThemeLess (name) {
  let themeLess = ""

  // If we have the active theme locally, get a big string of theme Less.
  const themeDir = `${constants.themesDir}/${name}`
  if (exists(themeDir)) {
    // This is the order we include these on the server.
    themeLess += readFile(`${themeDir}/styles.less`) + "\n"
    themeLess += readFile(`${themeDir}/variables.less`) + "\n"
    themeLess += readFile(`${themeDir}/additionalStyles.less`) + "\n"
  }

  return themeLess
}
