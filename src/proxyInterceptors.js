"use strict"

const constants = require("./constants").constants
const readMetadata = require("./metadata").readMetadataFromDisk
const exists = require('./utils').exists
const glob = require("./utils").glob
const sanitizeName = require("./utils").sanitizeName
const readFile = require('./utils').readFile
const readJsonFile = require('./utils').readJsonFile
const info = require('./logger').info
const warn = require('./logger').warn
const debug = require('./logger').debug

const fs   = require('fs')
const hoxy = require('hoxy')
const path = require('path')
const re = require('xregexp')
const url = require('url')

/**
 * localWidgetMap is a table of {widgetShortName -> Local Directory}
 * localElementMap is a table of {elementShortName -> Element Directory}
 *
 * Element directories can live under widget directories, or under the global
 * element directory.
 */
const localWidgetMap = {}
const localElementMap = {}
const localStackMap = {}
const localMediaMap = {}

/**
 * We want to get path elements relative to our base directory so we
 * can chop off anything before the tracking directory.
 *
 * @param filePath A de-normalized path.
 */
function normalizedPathElements (filePath) {
  const pathElements = filePath.split(path.sep)
  const idx = pathElements.indexOf(constants.trackingDir)

  return pathElements.slice(idx)
}

/**
 * Pre-process locations of Components (Widgets, Elements, Stacks) that we need
 * to swap out when evaluating proxy rules.
 */
exports.buildLocalDataMaps = function () {
  // Match widgets
  glob(`${constants.trackingDir}/${constants.widgetsDir}/**/${constants.widgetMetadataJson}`).forEach((filePath) => {
    const json = readJsonFile(filePath)
    localWidgetMap[json.widgetType] = path.join("widget", sanitizeName(json.displayName))
  })

  // Match widget level elements
  glob(`${constants.trackingDir}/widget/**/${constants.elementMetadataJson}`).forEach((filePath) => {
    const json = readJsonFile(filePath)
    const pathElements = normalizedPathElements(filePath)

    // Path will look like: .ccc / widget / <widget-name> / [version] / element / <element-name> / ...
    // So we need to handle the case where version is missing and keep indices 1, 2, x, y
    if (pathElements.length === 6) {
      localElementMap[json.tag] = path.join(pathElements[1], pathElements[2], pathElements[3], pathElements[4])
    }

    if (pathElements.length === 8) {
      localElementMap[json.tag] = path.join(pathElements[1], pathElements[2], pathElements[5], pathElements[6])
      //localElementMap[json.tag] = path.join(pathElements[1], pathElements[2], pathElements[3], pathElements[4], pathElements[5], pathElements[6])
    }
  })

  // Match stack data
  glob(`${constants.trackingDir}/${constants.stacksDir}/**/${constants.stackMetadataJson}`).forEach((filePath) => {
    const json = readJsonFile(filePath)
    const pathElements = normalizedPathElements(filePath)

    if (pathElements.length > 2) {
      localStackMap[json.stackType] = path.join(pathElements[1], pathElements[2])
    }
  })

  // Match global elements
  glob(`${constants.trackingDir}/${constants.elementsDir}/**/${constants.elementMetadataJson}`).forEach((filePath) => {
    const json = readJsonFile(filePath)
    const pathElements = normalizedPathElements(filePath)

    if (pathElements.length > 2) {
      localElementMap[json.tag] = path.join(pathElements[1], pathElements[2])
    }
  })


  // Debug: Set true to print data maps.
  if (false) {
    console.log(JSON.stringify(localElementMap, null, 2))
    console.log(JSON.stringify(localWidgetMap, null, 2))
    console.log(JSON.stringify(localStackMap, null, 2))
    console.log(JSON.stringify(localMediaMap, null, 2))
  }
}

/**
 * Do the actual substitution of stuff inside a region: Widgets and elements.
 * @param pRegion Region object which is updated by this function.
 */
function doRegionContentSubstitution (pRegion) {
  const koSeparator = "<!-- /ko -->"
  const koContextBlock = "<!-- ko setContextVariable"

  // Now let's process the widgets on the region
  pRegion.widgets.forEach((widget) => {


    // Make sure there is a template URL.
    if (widget.templateUrl && widget.templateUrl.endsWith(".template")) {
      const urlSegments = widget.templateUrl.split("/")

      const widgetShortName = (urlSegments.length === 9) ? urlSegments[6] : urlSegments[7]
      const basePath = localWidgetMap[widgetShortName]

      // Check if the basePath is mapped in our local mirror.
      if (!basePath) {
        warn("noLocalSubstituteFoundWarning", {item: widgetShortName})
        return
      }

      const saneInstanceName = sanitizeName(widget.instanceName)
      const localInstanceDir = path.join(basePath, constants.instanceDir, saneInstanceName)
      const localFilePath = path.join(localInstanceDir, constants.widgetTemplate)
      const widgetMD = readMetadata(localFilePath, constants.widgetInstanceMetadataJson)

      let localSrc = widget.templateSrc;
      if (exists(localFilePath)) {
        debug("doResourceSubstitutionMessage", {resource: saneInstanceName, path: localFilePath})
        localSrc = readFile(localFilePath);
      } else {
        warn("mappedFileNotFoundWarning", {resource: saneInstanceName, path: localFilePath})
      }

      // We need to insert element source into the page DOM with the correct
      // ids so that the element binding will find them and not replace with
      // the remote version.
      // First, we'll do it for widget level elements (We can get the correct
      // Id from the element metadata.
      re.forEach(localSrc, /<div\s+data-bind="element:\s*'([a-zA-Z-_]+)/g, (match, i) => {
        const elementId = match[1]
        const elementPath = localElementMap[elementId]

        if (!elementPath) {
          warn("noLocalSubstituteFoundWarning", {item: elementId})
          return
        }

        const elFilePath = path.join(elementPath, constants.elementTemplate)
        if (exists(elFilePath)) {
          const elementMD = readMetadata(elFilePath, constants.elementMetadataJson)

          // Only need to do this for widget level elements
          if (elementMD.widgetId) {
            const tag = `${elementMD.widgetId}-${elementMD.tag}`
            const elementSrc = readFile(elFilePath)

            // Appending the script directly in the widget template seems ok.
            localSrc += `<script type='text/html' id='${tag}'>${elementSrc}</script>`

            debug("doResourceSubstitutionMessage", {resource: tag, path: elFilePath})
          }
        } else {
          warn("mappedFileNotFoundWarning", {resource: elementId, path: elFilePath})
        }
      })

      // For global elements we need to stamp out a copy of the element source
      // for every widget whether or not the widget uses that element - this
      // is just duplicating the behaviour of the element binding. Try not to
      // think about it.
      glob(`element/**/${constants.elementTemplate}`).forEach((template) => {
        const elementMD = readMetadata(template, constants.elementMetadataJson)
        const elementSrc = readFile(template)
        const tag = `${widgetMD.descriptorRepositoryId}-${elementMD.tag}`

        localSrc += `<script type='text/html' id='${tag}'>${elementSrc}</script>`

        debug("doResourceSubstitutionMessage", {resource: tag, path: template})
      })

      if (widget.templateSrc.startsWith(koContextBlock)) {
        // Layout Template with Context Variables.

        // We need to get the Context Variables that the Server resolved for us and put them back
        // into our local template. These will be wrapped in a knockout binding at the top of the
        // template source.
        const contextVars = widget.templateSrc.split(koSeparator)[0] + koSeparator

        if (localSrc.startsWith(koContextBlock)) {
          // Phew - the user didn't delete it. Otherwise we just stick the vars onto
          // the front of whatever they've got and hope.
          localSrc = localSrc.split(koSeparator).slice(1).join(koSeparator)
        }

        widget.templateSrc = contextVars + localSrc
      } else {
        // Plain Layout Template.
        widget.templateSrc = localSrc
      }

      // If the widget has source media, make a note of the resource URI.
      if (widget.sourceMedia) {
        const localContentFile = path.join(localInstanceDir, "content.template")
        const mediaResource = widget.sourceMedia.split("webContent")[1] // Just the end.

        localMediaMap[mediaResource] = localContentFile
      }

      // We'll need to handle widget specific snippets in here too.
      const locale = widget.locale
      if (widget.localeResources && widget.localeResources[locale]) {
        const resourceName = widget.localeResources[locale].namespace
        const resourcePath = path.join(localInstanceDir, "locales", locale, resourceName + ".json")

        if (exists(resourcePath)) {
          console.info("Widget Locale Resources: " + resourcePath)
          widget.localeResources[locale].resources = readJsonFile(resourcePath)
        }
      }
    }
  })
}

/**
 * Handle deconstructing the page request and replacing embedded resources with the contents
 * of local modifications under basePath.
 */
exports.doPageTemplateSubstitution = function (req, resp) {

  // Swap out the widget template.
  resp.json.regions.forEach((region) => {

    // If the region is a stack then we should have a client side template.
    if (region.structure === constants.stackStructure) {

      // First handle sub-region content
      region.regions.forEach((subregion) => {
        doRegionContentSubstitution(subregion)
      })

      // Now we'll do stack templates.
      const basePath = localStackMap[region.stackType]
      const displayName = region.displayName

      if (!basePath) {
        warn("noLocalSubstituteFoundWarning", {item: displayName})
        return
      }

      const localFilePath = path.join(basePath, constants.instanceDir, displayName, constants.stackTemplate)

      const contents = substituteLocalFileContents(displayName, localFilePath)
      if (contents) {
        region.templateSrc = contents
      }
    }

    doRegionContentSubstitution(region)
  })
}

/**
 * Handle substituting source media downloaded by ccc
 * (e.g. Rich Text contents)
 *
 * @param req
 * @param resp
 */
exports.doSourceMediaSubstitution = function (req, resp) {
  const uri = req._data.url

  Object.keys(localMediaMap).forEach((resource) => {
    if (uri.endsWith(resource)) {
      const contents = substituteLocalFileContents(resource, localMediaMap[resource])
      if (contents) {
        resp.string = contents
      }
    }
  })
}

/**
 * Handle locating and substituting Javascript resources.
 * Javascript files may be:
 *   - Application level Javascript
 *   - Widget Javascript (inc Global)
 *   - Element Javascript (inc Global)
 *
 * Additionally resources may be versioned so we need to resolve
 * the version from the URL and locate the appropriate files
 * under basePath.
 */
exports.doJavascriptFileSubstitution = function (req, resp) {
  // Look out for widget files.
  const uri = req._data.url
  const urlSegments = uri.substring(1).split("/")

  if (urlSegments[2] === "widget") {
    if (urlSegments.length === 6 || urlSegments.length === 7) { // Widget JS
      // Suck out the bits we need.
      const widgetShortName = (urlSegments.length === 7) ? urlSegments[4] : urlSegments[3]
      let jsFileName = (urlSegments.length === 7) ? urlSegments[6] : urlSegments[5]

      const queryParamsIndex = jsFileName.indexOf('?')
      if (queryParamsIndex >= 0) {
        jsFileName = jsFileName.substr(0, queryParamsIndex)
      }

      const minifyIndex = jsFileName.indexOf('.min.js')
      if (minifyIndex >= 0) {
        jsFileName = jsFileName.substr(0, minifyIndex) + ".js"
      }

      // Get the base path from the ID
      const basePath = localWidgetMap[widgetShortName]
      if (!basePath) {
        warn("noLocalSubstituteFoundWarning", {item: jsFileName})
        return
      }

      const contents = substituteLocalFileContents(jsFileName, path.join(basePath, "js", jsFileName))
      if (contents) {
        resp.string = contents
      }
    }

    if (urlSegments.length === 8 || urlSegments.length === 9) { // Widget Element JS
      // Suck out the bits we need.
      const elShortName = (urlSegments.length === 9) ? urlSegments[6] : urlSegments[5]

      // Get the base path from the ID
      const basePath = localElementMap[elShortName]
      if (!basePath) {
        warn("noLocalSubstituteFoundWarning", {item: elShortName})
        return
      }

      const contents = substituteLocalFileContents(elShortName, path.join(basePath, constants.elementJavaScript))
      if (contents) {
        resp.string = contents
      }
    }
  }

  if (urlSegments[2] === "element") {
    // Suck out the bits we need.
    const elShortName = urlSegments[3]

    // Get the base path from the ID
    const basePath = localElementMap[elShortName]
    if (!basePath) {
      warn("noLocalSubstituteFoundWarning", {item: elShortName})
      return
    }

    const contents = substituteLocalFileContents(elShortName, path.join(basePath, constants.elementJavaScript))
    if (contents) {
      resp.string = contents
    }
  }

  if (urlSegments[2] === "global") {
    // Suck out the bits we need.
    let jsFileName = urlSegments[3]

    const queryParamsIndex = jsFileName.indexOf('?')
    if (queryParamsIndex >= 0) {
      jsFileName = jsFileName.substr(0, queryParamsIndex)
    }

    const basePath = path.join("global", jsFileName)
    const contents = substituteLocalFileContents(jsFileName, basePath)
    if (contents) {
      resp.string = contents
    }
  }
}

function substituteLocalFileContents (resourceName, localFilePath) {
  if (!exists(localFilePath)) {
    warn("mappedFileNotFoundWarning", {resource: resourceName, path: localFilePath})
    return null
  }

  // Substitute out the local copy of the widget file.
  debug("doResourceSubstitutionMessage", {resource: resourceName, path: localFilePath})
  return readFile(localFilePath)
}

/**
 * Handle locating and substituting the storefront CSS file. If we have a
 * local compiled version of storefront.css under our metadata directory, use
 * this as it will contain any locally made theme / less modifications.
 */
exports.doStorefrontCssSubstitution = function (req, resp) {
  const localStorefrontCSS = `${constants.trackingDir}/${constants.themesDir}/${constants.storefrontCss}`
  const contents = substituteLocalFileContents("storefront.css", localStorefrontCSS)
  if (contents) {
    resp.string = contents
  }
}

/**
 * Handle substituting Text Snippets modified locally by the user.
 * Text snippets are returned for the current locale already in SF, so we
 * should look at the URL and find the corresponding locale in the snippets
 * directory if it exists.
 *
 * Our snippets files organize strings into bundles by component type. The
 * storefront resources are flattened, so here we just iterate our individual
 * local bundles and stick everything into the response resource map.
 */
exports.doTextSnippetSubstitution = function (req, resp) {
  const resources = resp.json.resources
  const urlParts = url.parse(req._data.url, true)

  // Check if we're grabbing resources for a different locale but fall back
  // to en
  const locale = urlParts.query.locale || 'en'
  const snippetsFile = `${constants.textSnippetsDir}/${locale}/${constants.snippetsJson}`

  // We might not have grabbed resources for all locales
  if (exists(snippetsFile)) {
    const stringPacks = readJsonFile(snippetsFile)

    Object.keys(stringPacks).forEach((bundle) => {
      const strings = stringPacks[bundle]
      Object.keys(strings).forEach((key) => {
        resources[key] = strings[key]
      })
    })
  } else {
    warn("noSnippetsAvailableForLocale", {locale})
  }
}
