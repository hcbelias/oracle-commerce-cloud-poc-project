const dirname = require('path').dirname
const Promise = require("bluebird")
const upath = require("upath")

const classify = require("./classifier").classify
const constants = require("./constants").constants
const endPointTransceiver = require("./endPointTransceiver")
const error = require("./logger").error
const exists = require("./utils").exists
const getAllowedConcurrency = require("./concurrencySettings").getAllowedConcurrency
const info = require("./logger").info
const initializeMetadata = require("./metadata").initializeMetadata
const isDirectory = require("./utils").isDirectory
const inTransferMode = require("./metadata").inTransferMode
const normalize = require("./utils").normalize
const putGlobalSnippets = require("./textSnippetPutter").putGlobalSnippets
const readMetadata = require("./metadata").readMetadata
const putApplicationJavaScript = require("./applicationJavaScriptPutter").putApplicationJavaScript
const putElementJavaScript = require("./elementPutter").putElementJavaScript
const putElementTemplate = require("./elementPutter").putElementTemplate
const putGlobalElementJavaScript = require("./elementPutter").putGlobalElementJavaScript
const putGlobalElementTemplate = require("./elementPutter").putGlobalElementTemplate
const putStackInstanceLess = require("./stackPutter").putStackInstanceLess
const putStackInstanceLessVariables = require("./stackPutter").putStackInstanceLessVariables
const putStackInstanceTemplate = require("./stackPutter").putStackInstanceTemplate
const putTheme = require("./themePutter").putTheme
const putThemeAdditionalStyles = require("./themePutter").putThemeAdditionalStyles
const putThemeStyles = require("./themePutter").putThemeStyles
const putThemeVariables = require("./themePutter").putThemeVariables
const putWebContentWidgetInstanceTemplate = require("./widgetPutter").putWebContentWidgetInstanceTemplate
const putWidgetInstanceLess = require("./widgetPutter").putWidgetInstanceLess
const putWidget = require("./widgetPutter").putWidget
const putWidgetBaseTemplate = require("./widgetPutter").putWidgetBaseTemplate
const putWidgetBaseLess = require("./widgetPutter").putWidgetBaseLess
const putWidgetBaseSnippets = require("./widgetPutter").putWidgetBaseSnippets
const putWidgetConfigJson = require("./widgetPutter").putWidgetConfigJson
const putWidgetConfigSnippets = require("./widgetPutter").putWidgetConfigSnippets
const putWidgetInstance = require("./widgetPutter").putWidgetInstance
const putWidgetInstanceModifiableMetadata = require("./widgetPutter").putWidgetInstanceModifiableMetadata
const putWidgetInstanceSnippets = require("./widgetPutter").putWidgetInstanceSnippets
const putWidgetInstanceTemplate = require("./widgetPutter").putWidgetInstanceTemplate
const putWidgetJavaScript = require("./widgetPutter").putWidgetJavaScript
const putWidgetModifiableMetadata = require("./widgetPutter").putWidgetModifiableMetadata
const PuttingFileType = require("./puttingFileType").PuttingFileType
const themeExistsOnTarget = require("./metadata").themeExistsOnTarget
const walkDirectory = require("./utils").walkDirectory
const warn = require("./logger").warn
const widgetExistsOnTarget = require("./metadata").widgetExistsOnTarget
const putWidgetModuleJavaScript = require("./widgetPutter").putWidgetModuleJavaScript
const resolvePath = require("./utils").resolvePath

// Mapping between file type and putter method.
const putterMap = new Map([
  [PuttingFileType.APPLICATION_LEVEL_JAVASCRIPT, putApplicationJavaScript],
  [PuttingFileType.WIDGET_INSTANCE_TEMPLATE, putWidgetInstanceTemplate],
  [PuttingFileType.WEB_CONTENT_TEMPLATE, putWebContentWidgetInstanceTemplate],
  [PuttingFileType.WIDGET_INSTANCE_LESS, putWidgetInstanceLess],
  [PuttingFileType.WIDGET_INSTANCE_SNIPPETS, putWidgetInstanceSnippets],
  [PuttingFileType.WIDGET_JAVASCRIPT, putWidgetJavaScript],
  [PuttingFileType.WIDGET_MODULE_JAVASCRIPT, putWidgetModuleJavaScript],
  [PuttingFileType.ELEMENT_TEMPLATE, putElementTemplate],
  [PuttingFileType.ELEMENT_JAVASCRIPT, putElementJavaScript],
  [PuttingFileType.GLOBAL_ELEMENT_TEMPLATE, putGlobalElementTemplate],
  [PuttingFileType.GLOBAL_ELEMENT_JAVASCRIPT, putGlobalElementJavaScript],
  [PuttingFileType.THEME_STYLES, putThemeStyles],
  [PuttingFileType.THEME_ADDITIONAL_STYLES, putThemeAdditionalStyles],
  [PuttingFileType.THEME_VARIABLES, putThemeVariables],
  [PuttingFileType.GLOBAL_SNIPPETS, putGlobalSnippets],
  [PuttingFileType.STACK_INSTANCE_LESS, putStackInstanceLess],
  [PuttingFileType.STACK_INSTANCE_VARIABLES_LESS, putStackInstanceLessVariables],
  [PuttingFileType.STACK_INSTANCE_TEMPLATE, putStackInstanceTemplate],
  [PuttingFileType.THEME, putTheme],
  [PuttingFileType.WIDGET, putWidget],
  [PuttingFileType.WIDGET_INSTANCE, putWidgetInstance],
  [PuttingFileType.WIDGET_METADATA_JSON, putWidgetModifiableMetadata],
  [PuttingFileType.WIDGET_INSTANCE_METADATA_JSON, putWidgetInstanceModifiableMetadata],
  [PuttingFileType.WIDGET_BASE_TEMPLATE, putWidgetBaseTemplate],
  [PuttingFileType.WIDGET_BASE_LESS, putWidgetBaseLess],
  [PuttingFileType.WIDGET_BASE_SNIPPETS, putWidgetBaseSnippets],
  [PuttingFileType.WIDGET_CONFIG_JSON, putWidgetConfigJson],
  [PuttingFileType.WIDGET_CONFIG_SNIPPETS, putWidgetConfigSnippets]
])

/**
 * Handy function to filter out hidden files.
 * @param fileStat
 * @returns {boolean}
 */
function hidden(fileStat) {
  return fileStat.name.startsWith(".");
}

/**
 * Determine if file is under the tracking directory.
 * @param fullPath
 * @returns {boolean}
 */
function isTrackedFile(fullPath) {
  return fullPath.includes(`/${constants.trackingDir}/`);
}

/**
 * Send the contents of all the files found beneath the given directory
 * to the appropriate place on the server.
 * @param path
 * @param node
 */
exports.putAll = function (path, node) {

  // Keep a track of all the generated file names.
  const paths = []

  // Walk through the supplied directory, looking at all the files.
  walkDirectory(path, {
    listeners : {
      file : (root, fileStat, next) => {

        // Build the full file name and keep a note of it but not if under the tracking directory or hidden.
        const fullPath = upath.resolve(root, fileStat.name)
        !isTrackedFile(fullPath) && !hidden(fileStat) && paths.push(fullPath)

        next()
      },
      directory : (root, fileStat, next) => {

        // Need to intercept widget instance directories.
        const fullPath = upath.resolve(root, fileStat.name)
        if (!isTrackedFile(fullPath) && !hidden(fileStat) && classify(fullPath) == PuttingFileType.WIDGET_INSTANCE) {
          paths.push(fullPath)
        }
      }
    }
  })

  // So we now have a list of files. Handle Themes and Widgets carefully when they don't exist on the destination box.
  // Wait for each promise in turn to stop us running out of resources.
  return Promise.each(processNonExistentEntities(paths), path => send(path, node))
}

/**
 * We need to do a bit of massaging on the list to ensure that things that don't exist on the target server are created.
 * @param paths
 */
function processNonExistentEntities(paths) {

  // Maintain a list of new additional paths.commerce/tools/CommerceCloudConnect/src/putter.js
  const additionalPaths = []

  // May need to exclude certain paths and add others.
  const filteredPaths = paths.filter(path => {

    // We are sending a theme file in transfer mode which means that the theme may not exist yet.
    if (path.includes(`/theme/`) && inTransferMode() && !themeExistsOnTarget(path)) {

      // Only put in the theme base directory if it ain't there already.
      (additionalPaths.indexOf(dirname(path)) == -1) && additionalPaths.push(dirname(path))

      // Return false so the widget file path is excluded from the list.
      return false

      // If widget for file does not exist, we need to send the whole widget but ignore
      // instance content - this will be taken care of in other ways.
    } else if (path.includes(`/widget/`) && !path.includes(`/instances/`) && !widgetExistsOnTarget(path)) {

      // Put the base widget directory in the list if not already there.
      (additionalPaths.indexOf(getWidgetDir(path)) == -1) && additionalPaths.push(getWidgetDir(path))

      // Return false so that the file is excluded from the list
      return false
    } else {
      // All other paths are OK.
      return true
    }
  })

  // Return both arrays as one, excluding anything we cannot classify.
  // Make sure files are put in a sensible order e.g. themes before widgets etc.
  return filteredPaths.concat(additionalPaths).filter(path => classify(path)).sort((a, b) => {
    return classify(a).ordinal - classify(b).ordinal
  })
}

/**
 * Figure out the base widget directory from a full path to a widget file.
 * @param path
 */
function getWidgetDir(path) {

  const tokens = path.split("/")
  return tokens.slice(0, tokens.indexOf("widget") + 2).join("/")
}

/**
 * Send the file given by path to the server using the appropriate putter.
 * @param path
 * @param node
 * @returns A Bluebird promise or undefined.
 */
function send(path, node) {

  info("sendingPath", {path, node})

  // Find a putter for the file type.
  const putterFunction = putterMap.get(classify(path))

  // There should always be a putter but make sure.
  if (putterFunction) {
    return putterFunction(path)
  } else {
    warn("fileIsNotRecognized", {name : path})
  }
}

/**
 * Entry point. Send the contents of the file or files given by path to the appropriate
 * place on the server.
 * @param rawPath
 * @param node
 * @param all
 */
exports.put = function (rawPath, node, all) {

  // Normalize the path in case its in windows format.
  const path = normalize(rawPath)

  // Make sure file actually exists.
  if (!exists(path)) {
    error("pathDoesNotExist", {path})
    return
  }

  // If we are doing a putAll or transferAll, path must be a directory.
  if (all && !isDirectory(path)) {
    error("pathIsNotDirectory", {path})
    return
  }

  // Initialize the metadata first.
  return initializeMetadata().then(() => {
    return readMetadata(path, constants.configMetadataJson).then(configMetadata => {

      // Check config.json and make sure we are putting to the same system we grabbed from.
      if (configMetadata.node !== node && !inTransferMode()) {
        error("cannotSendToDifferentNode", {
          path,
          node,
          configMetadataNode : configMetadata.node
        }, "Invalid Operation")
        return
      }

      // We are transferring between diferent servers. Need to do a few extra checks.
      if (inTransferMode()) {

        // Servers must be at the same version.
        if (configMetadata.commerceCloudVersion !== endPointTransceiver.commerceCloudVersion) {
          error("cannotSendToDifferentVersion", {
            path,
            node,
            configMetadataNode : configMetadata.node,
            configMetadataVersion : configMetadata.commerceCloudVersion,
            targetVersion : endPointTransceiver.commerceCloudVersion
          })

          return
        }

        // Servers must be different.
        if (configMetadata.node == node) {

          error("cannotSendToSameNode", {path, node})
          return
        }
      }

      // See if we are sending one file or a whole lot.
      if (all) {
        return exports.putAll(path, node)
      } else {
        return send(path, node)
      }
    })
  })
}
