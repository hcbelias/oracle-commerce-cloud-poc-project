"use strict"


const basename = require('path').basename
const dust = require('dustjs-linkedin')
const fs = require("fs")
const upath = require("upath")

const buildExtension = require("./extensionBuilder").buildExtension
const classify = require("./classifier").classify
const constants = require("./constants").constants
const endPointTransceiver = require("./endPointTransceiver")
const info = require("./logger").info
const initializeMetadata = require("./metadata").initializeMetadata
const inTransferMode = require("./metadata").inTransferMode
const logInfo = require("./logger").logInfo
const makeTrackedTree = require("./utils").makeTrackedTree
const prompt = require("./widgetWizard").prompt
const PuttingFileType = require("./puttingFileType").PuttingFileType
const readFile = require("./utils").readFile
const readJsonFile = require("./utils").readJsonFile
const readMetadataFromDisk = require("./metadata").readMetadataFromDisk
const removeTrackedTree = require("./utils").removeTrackedTree
const sendExtension = require("./extensionSender").sendExtension
const shortLocale = require("./utils").shortLocale
const t = require("./i18n").t
const updateMetadata = require("./metadata").updateMetadata
const widgetTypeExists = require("./metadata").widgetTypeExists
const writeFile = require("./utils").writeFile
const writeMetadata = require("./metadata").writeMetadata

// Tell dust to preserve cr/nl and such.
dust.optimizers.format = (ctx, node) => node

/**
 * Create a skeleton new widget on disk. Note that we don"t send it to the server.
 */
function create(clean) {

  // Next need to find out what kind of widget the user needs.
  return prompt(clean).then(responses => {
    return buildSkeletonWidget(responses, clean)
  })
}

/**
 * Build the base widget directory and return the path.
 * @param widgetName
 * @param clean
 * @returns The path to the new directory
 */
function buildWidgetDir(responses, clean) {

  // Build up the base widget path.
  const widgetDir = `${constants.widgetsDir}/${responses.widgetName}`

  // See if need to clean anything from disk first.
  clean && removeTrackedTree(widgetDir)

  // Create the base dir.
  makeTrackedTree(widgetDir)

  return widgetDir
}

/**
 * Create all the locale related files and directories.
 * @param widgetDir
 * @param widgetType
 * @param context
 */
function createBaseLocalesDir(widgetDir, widgetType, context) {

  // If they want an international widget, we create directories and resource files for all locales.
  const localesDir = `${widgetDir}/locales`
  makeTrackedTree(localesDir)

  endPointTransceiver.locales.forEach(locale => {
    createLocaleDir(`${localesDir}/${locale.name}`, widgetType, context)
  })
}

/**
 * Create a locale dir and file for specified locale.
 * @param localeDir
 * @param widgetType
 * @param context
 */
function createLocaleDir(localeDir, widgetType, context) {

  // Need sub-directory for each locale.
  makeTrackedTree(localeDir)

  // Add a locale file.
  const localeFilePath = `${localeDir}/ns.${widgetType}.json`

  createWidgetFileFromTemplate(localeFilePath, context, "exampleResourcesJson")
}

/**
 * Create all the config related files and directories.
 * @param widgetDir
 * @param context
 */
function createConfigDir(widgetDir, context) {

  // Build the basic config dir.
  const configDir = `${widgetDir}/config`
  makeTrackedTree(configDir)

  // Create a cut down basic config metadata file.
  const configPath = `${configDir}/${constants.userConfigMetadataJson}`

  createWidgetFileFromTemplate(configPath, context, "exampleConfigMetadataJson")

  // Build the basic locale dir first.
  const localesDir = `${configDir}/locales`
  makeTrackedTree(localesDir)

  // For all defined locales.
  endPointTransceiver.locales.forEach(locale => {

    const localeFilePath = `${localesDir}/${locale.name}.json`

    // Add a empty locale file.
    createWidgetFileFromTemplate(localeFilePath, context, "exampleConfigResourcesJson")
  })
}

/**
 * Create the base JavaScript dir and file.
 * @param widgetDir
 * @param widgetType
 * @param context
 */
function createJsEntryPoint(widgetDir, widgetType, context) {

  // Always have a JS directory.
  const jsDir = `${widgetDir}/js`
  makeTrackedTree(jsDir)

  // Create JS entry point.
  const jsPath = `${jsDir}/${widgetType}.js`
  createWidgetFileFromTemplate(jsPath, context, "exampleJs")
}

/**
 * Need a top level file for the widget metadata
 * @param widgetDir
 * @param widgetType
 */
function createWidgetMetadata(context, widgetDir, widgetType) {

  // Create the default internal metadata that the user cannot change.
  const internalMetadata = {
    "widgetType" : widgetType,
    "version" : 1,
    "displayName" : context.widgetName,
    "javascript" : widgetType,
    "global" : context.global,
    "source" : 101
  }

  // Only put in i18n if we have to.
  context.i18n && (internalMetadata.i18nresources = widgetType)

  // Write it out to the tracking dir.
  writeMetadata(`${widgetDir}/${constants.widgetMetadataJson}`, internalMetadata)

  // Load the default user modifiable metadata using the dust template.
  renderWithTemplate(figureWidgetPath("exampleMetadataJson"), context, (err, out) => {

    // Turn it into JSON so we can mess with it.
    const metadata = JSON.parse(out)

    // Add in translations array but only fully populate it if users ask for it.
    metadata.translations = []

    if (context.i18n) {

      endPointTransceiver.locales.forEach(locale => {

        const translation = {
          "language" : locale.name
        }

        // For the default locale, leave off the language.
        if (locale.name == endPointTransceiver.locale) {
          translation.name = context.widgetName
        } else {
          translation.name = `${context.widgetName} [${locale.name}]`
        }

        metadata.translations.push(translation)
      })
    } else {
      metadata.translations.push({
        "language" : endPointTransceiver.locale,
        "name" : context.widgetName
      })
    }

    // Write out the metadata.
    const userWidgetMetadataPath = `${widgetDir}/${constants.userWidgetMetadata}`
    writeFile(userWidgetMetadataPath, JSON.stringify(metadata, null, 2))
  })
}

/**
 * Turn the widget textual name into a short unique name suitable for putting in a template.
 * @param widgetName
 * @returns {string}
 */
function getUniqueWidgetType(widgetName) {

  // Start with the textual name with the spaces taken out and in lower case.
  const defaultWidgetType = widgetName.replace(/ /g, "").toLocaleLowerCase()

  let widgetType = defaultWidgetType
  let widgetTypeCounter = 1

  while (widgetTypeExists(widgetType)) {
    // Looks like the current name already exists - try again.
    widgetType = `${defaultWidgetType}_${widgetTypeCounter++}`
  }

  return widgetType
}

/**
 * Create files for non global widgets.
 * @param widgetDir
 * @param context
 */
function createNonGlobalFiles(widgetDir, context) {

  // Write out the base template.
  const widgetTemplatePath = `${widgetDir}/${constants.widgetTemplate}`
  createWidgetFileFromTemplate(widgetTemplatePath, context, "exampleTemplate")

  // Write out the base less file.
  const widgetLessPath = `${widgetDir}/${constants.widgetLess}`
  createWidgetFileFromTemplate(widgetLessPath, context, "exampleLess")

  // Make the instances dir for later use.
  makeTrackedTree(`${widgetDir}/instances`)
}

/**
 * Get the widget onto the target server as an Extension.
 * @param widgetName
 * @param widgetType
 * @param global
 * @param widgetDir
 * @returns A Bluebird promise.
 */
function createWidgetInExtension(widgetName, widgetType, global, widgetDir) {

  // Build something helpful for the extension id text.
  const currentDateTime = new Date(new Date().getTime())
  const idRequestText = t("widgetExtensionIdRequestDescription",
    {
      widgetName,
      date : currentDateTime.toLocaleDateString(),
      time : currentDateTime.toLocaleTimeString()
    })

  // Build something helpful for the manifest text.
  const manifestNameText = t("widgetExtensionName", {widgetName})

  // Build the extension in memory as a suitably formatted zip file.
  return buildExtension(idRequestText, manifestNameText, widgetType, widgetDir, extensionPathFor, extensionContentsFor, extension => {

    // Now send the zip file to the server and tell the user how it went.
    return sendExtension(`widget_${widgetType}`, extension, results => {
      return handleUploadResults(widgetName, global, results)
    })
  })
}

/**
 * Build up an object to guide the template generation.
 * @param responses
 * @param widgetType
 */
function buildContext(responses, widgetType) {

  const keys = ["widgetName", "global", "i18n", "configurable", "withHelpText"]

  const context = {widgetType}
  keys.forEach(key => context[key] = responses[key])

  return context
}

/**
 * Create an empty widget on disk based on the information we have just gleaned from the user.
 * @param responses
 */
function buildSkeletonWidget(responses, clean) {

  // Need a shortened unique version of name - all lower case with spaces taken out.
  const widgetType = getUniqueWidgetType(responses.widgetName)

  // Build up the context object for use with template generation.
  const context = buildContext(responses, widgetType)

  // Build the base directory.
  const widgetDir = buildWidgetDir(responses, clean)

  // Need to create metadata files.
  createWidgetMetadata(context, widgetDir, widgetType)

  // Set up the javascript.
  createJsEntryPoint(widgetDir, widgetType, context)

  // Only create instances, templates and less for non-global widgets.
  !responses.global && createNonGlobalFiles(widgetDir, context)

  // See if the widget has an international flavour.
  responses.i18n && createBaseLocalesDir(widgetDir, widgetType, context)

  // Finally, need an extra directory if the widget is to be configurable.
  responses.configurable && createConfigDir(widgetDir, context)

  // Now we have the widget on disk and we want to sync right away, send it to the server.
  if (responses.syncWithServer) {
    return createWidgetInExtension(responses.widgetName, widgetType, responses.global, widgetDir)
  }
}

/**
 * Need to combine the user and internal metadata in the extension.
 * @param fullPath
 */
function spliceWidgetMetadata(fullPath) {

  // Get the internal metadata minus etag.
  const internalMetadata = readMetadataFromDisk(fullPath, constants.widgetMetadataJson, true)

  // Get the user metadata.
  const userMetadata = readJsonFile(fullPath)

  // Carefully splice the two together.
  userMetadata.javascript = internalMetadata.javascript
  userMetadata.widgetType = internalMetadata.widgetType
  userMetadata.global = internalMetadata.global

  // Add in i18n if its in the base metadata.
  internalMetadata.i18nresources && (userMetadata.i18nresources = internalMetadata.i18nresources)

  // Add in name if user metadata has no translations array.
  !userMetadata.translations && (userMetadata.name = internalMetadata.displayName)

  // For global widgets on pre-18.1 systems, we need to set a name and delete translations as the instance gets messed up.
  if (internalMetadata.global && !userMetadata.name && !endPointTransceiver.serverSupports("getWidgetMetadata")) {

    // Use the internal display name that the user gave the widget.
    userMetadata.name = internalMetadata.displayName

    // Get rid of the translations block.
    delete userMetadata.translations
  }

  // Return the massaged metadata as a string.
  return JSON.stringify(userMetadata)
}

/**
 * Get the contents for the supplied path. This allows us to tweak the contents before they get written out.
 * @param fullPath
 * @returns the file contents for the path ready to go in the extension.
 */
function extensionContentsFor(fullPath) {

  // Need to combine user widget metadata with the internal metadata.
  if (fullPath.endsWith(`/${constants.userWidgetMetadata}`)) {

    return spliceWidgetMetadata(fullPath)

  } else {
    // Just read the file and pass back the contents.
    return readFile(fullPath)
  }
}

/**
 * Called to handle the result of the extension upload.
 * @param widgetName
 * @param global
 * @param results
 */
function handleUploadResults(widgetName, global, results) {

  if (results.data.success) {

    info(global ? "globalWidgetUploadSuccess" : "widgetUploadSuccess", {widgetName : widgetName})
    reportWarnings(results.data.warnings)

    // Make sure we are not in transfer mode. If not, need to update metadata with new repo id.
    if (!inTransferMode()) {

      // Need to find out the repository ID of the new widget.
      return endPointTransceiver.getAllWidgetDescriptors().then(widgetDescriptors => {

        // Find the widget descriptor with the same name.
        const newWidgetDescriptor = widgetDescriptors.data.items.find(
          widgetDescriptor => widgetDescriptor.displayName == widgetName)

        // Put it into a data structure that will be overlaid on top of the existing metadata.
        const additionalMetadata = {
          repositoryId : newWidgetDescriptor.repositoryId
        }

        // Update the metadata on disk.
        updateMetadata(`${constants.widgetsDir}/${widgetName}`, constants.widgetMetadataJson, additionalMetadata)

        // Need to refresh the cached metadata after as cache will not know about the new widget.
        return initializeMetadata()
      })
    } else {
      // Not in transfer mode but we still created a new widget so the cache will now be out of wack.
      return initializeMetadata()
    }
  } else {

    info("widgetUploadFailure", {widgetName : widgetName})
    reportErrors(results.data.errors)
    reportWarnings(results.data.warnings)
  }
}

/**
 * Output any warnings that came back from the extension upload.
 * @param warnings
 */
function reportWarnings(warnings) {

  if (warnings.length) {
    info("widgetUploadWarningsFound")

    warnings.forEach(warning => {
      logInfo(warning)
    })
  }
}

/**
 * Output any warnings that came back from the extension upload.
 * @param errors
 */
function reportErrors(errors) {

  errors.forEach(error => logInfo(error))
}

/**
 * Given a path to a file on disk, figure out where it needs to go in the extension.
 * Paths and names on disk are not always the same as in the extension so there is a bit of mapping required.
 * @param widgetType
 * @param filePath
 */
function extensionPathFor(widgetType, filePath) {

  const widgetBasePath = `widget/${widgetType}`

  // Chop the path up.
  const tokens = filePath.split("/")

  // See what kind of file it is.
  const puttingFileType = classify(filePath)

  // There are only certain file types we support right now.
  switch (puttingFileType) {
    case PuttingFileType.WIDGET_BASE_TEMPLATE:
      return `${widgetBasePath}/templates/${constants.widgetTemplate}`
    case PuttingFileType.WIDGET_BASE_LESS:
      return `${widgetBasePath}/less/${constants.widgetLess}`
    case PuttingFileType.WIDGET_METADATA_JSON:
      return `${widgetBasePath}/${constants.widgetMetadataJson}`
    case PuttingFileType.WIDGET_BASE_SNIPPETS:
      return `${widgetBasePath}/locales/${tokens[tokens.length - 2]}/${tokens[tokens.length - 1]}`
    case PuttingFileType.WIDGET_JAVASCRIPT:
      return `${widgetBasePath}/js/${basename(filePath)}`
    case PuttingFileType.WIDGET_CONFIG_SNIPPETS:
      return `${widgetBasePath}/config/locales/${tokens[tokens.length - 1]}`
    case PuttingFileType.WIDGET_CONFIG_JSON:
      return `${widgetBasePath}/config/config.json`
  }

  // If the file type is undefined, we bung the file in the extension anyway.
  if (!puttingFileType) {

    // Need to cut off the widget/My Widget pieces.
    return `${widgetBasePath}/${filePath.replace(/.*widget\/[^/]*\//, "")}`
  }
}

/**
 * Load up the template, compile it and render it via the callback.
 * @param name
 * @param context
 * @param renderHandler
 */
function renderWithTemplate(name, context, renderHandler) {

  const src = fs.readFileSync(upath.resolve(__dirname, `${figureExamplePath(name)}.dust`), 'utf8')
  dust.loadSource(dust.compile(src, name))

  // Render it based on what the user wants to do.
  dust.render(name, context, renderHandler)
}

/**
 * Given an output path, a set of user responses an a template name, render an example file.
 * @param outputPath
 * @param context
 * @param name
 */
function createFileFromTemplate(outputPath, context, name) {

  renderWithTemplate(name, context, (err, out) => writeFile(outputPath, out))
}

/**
 * Given an output path, a set of user responses an a template name, render an example widget file.
 * @param outputPath
 * @param context
 * @param name
 */
function createWidgetFileFromTemplate(outputPath, context, name) {
  createFileFromTemplate(outputPath, context, figureWidgetPath(name))
}

/**
 * Put the path handling logic in one place.
 * @param path
 * @returns {string}
 */
function figureExamplePath(path) {
  return `./examples/${path}`
}

/**
 * Put the path logic in one place.
 * @param path
 * @returns {string}
 */
function figureWidgetPath(path) {
  return `widget/${path}`
}

exports.create = create
exports.createWidgetInExtension = createWidgetInExtension
