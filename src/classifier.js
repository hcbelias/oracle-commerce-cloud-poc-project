"use strict"

const constants = require("./constants").constants
const isDirectory = require("./utils").isDirectory
const PuttingFileType = require("./puttingFileType").PuttingFileType
const resolvePath = require("./utils").resolvePath
const splitFromBaseDir = require("./utils").splitFromBaseDir
const warn = require("./logger").warn

/**
 * Figure out what kind of file we have so we know what endpoint to call.
 * @param path
 */
exports.classify = function (path) {

  // Split the path up to help with analysis.
  const splitDirs = splitFromBaseDir(path)
  const baseDir = splitDirs[0], subDir = splitDirs[1]

  switch (true) {
    case subDir.startsWith(constants.globalDir) && path.endsWith(".js"):
      return PuttingFileType.APPLICATION_LEVEL_JAVASCRIPT
    case /.*widget\/[^/]*\/display.template/.test(path):
      return PuttingFileType.WIDGET_BASE_TEMPLATE
    case /.*widget\/[^/]*\/widget.less/.test(path):
      return PuttingFileType.WIDGET_BASE_LESS
    case /.*widget\/[^/]*\/locales\/[^/]*\/ns\.\w*\.json/.test(path):
      return PuttingFileType.WIDGET_BASE_SNIPPETS
    case /.*widget\/[^/]*\/config\/locales\/\w*\.json/.test(path):
      return PuttingFileType.WIDGET_CONFIG_SNIPPETS
    case path.endsWith(constants.userConfigMetadataJson):
      return PuttingFileType.WIDGET_CONFIG_JSON
    case path.endsWith(constants.widgetTemplate):
      return PuttingFileType.WIDGET_INSTANCE_TEMPLATE
    case path.endsWith(constants.webContentTemplate):
      return PuttingFileType.WEB_CONTENT_TEMPLATE
    case path.endsWith(constants.widgetLess):
      return PuttingFileType.WIDGET_INSTANCE_LESS
    case /.*\/ns\.\w*\.json/.test(path):
      return PuttingFileType.WIDGET_INSTANCE_SNIPPETS
    case /.*widget\/[^/]*\/js\/[^/]*.js/.test(path):
      return PuttingFileType.WIDGET_JAVASCRIPT
    case /.*widget\/[^/]*\/module\/js\/[^/]*.js/.test(path):
      return PuttingFileType.WIDGET_MODULE_JAVASCRIPT
    case subDir.startsWith(`${constants.elementsDir}/`) && path.endsWith(constants.elementTemplate):
      return PuttingFileType.GLOBAL_ELEMENT_TEMPLATE
    case subDir.startsWith(`${constants.elementsDir}/`) && path.endsWith(constants.elementJavaScript):
      return PuttingFileType.GLOBAL_ELEMENT_JAVASCRIPT
    case path.endsWith(constants.elementTemplate):
      return PuttingFileType.ELEMENT_TEMPLATE
    case path.endsWith(constants.elementJavaScript):
      return PuttingFileType.ELEMENT_JAVASCRIPT
    case path.endsWith(constants.themeStyles):
      return PuttingFileType.THEME_STYLES
    case path.endsWith(constants.themeAdditionalStyles):
      return PuttingFileType.THEME_ADDITIONAL_STYLES
    case path.endsWith(constants.stackVariablesLess):
      return PuttingFileType.STACK_INSTANCE_VARIABLES_LESS
    case path.endsWith(constants.stackTemplate):
      return PuttingFileType.STACK_INSTANCE_TEMPLATE
    case path.endsWith(constants.themeVariables):
      return PuttingFileType.THEME_VARIABLES
    case path.endsWith(constants.snippetsJson):
      return PuttingFileType.GLOBAL_SNIPPETS
    case path.endsWith(constants.stackLess):
      return PuttingFileType.STACK_INSTANCE_LESS
    case path.endsWith(constants.userWidgetMetadata):
      return PuttingFileType.WIDGET_METADATA_JSON
    case path.endsWith(constants.userWidgetInstanceMetadata):
      return PuttingFileType.WIDGET_INSTANCE_METADATA_JSON
    case (/.*theme\/[^/]*/.test(path) || path.endsWith(constants.themesDir)) && isDirectory(resolvePath(path)):
      return PuttingFileType.THEME
    case /.*widget\/[^/]*\/instances\/[^/]*$/.test(path) && isDirectory(resolvePath(path)):
      return PuttingFileType.WIDGET_INSTANCE
    case /.*widget\/[^/]*$/.test(path) && isDirectory(resolvePath(path)):
      return PuttingFileType.WIDGET
  }
}
