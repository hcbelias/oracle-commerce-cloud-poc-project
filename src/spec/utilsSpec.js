const constants = require("../constants").constants
const mockery = require('./mockery')
const tmp = require('tmp')
const upath = require('upath')

describe("Utils", () => {

  const self = this

  beforeEach((done) => {

    mockery.use(jasmine.createSpy)

    self.logger = mockery.mockModule('../logger')
    self.endPointTransceiver = mockery.mockModule('../endPointTransceiver', "getWidgetLess")

    self.utils = mockery.require("../utils")
    self.etags = mockery.require("../etags")
    self.putterUtils = mockery.require("../putterUtils")
    self.grabberUtils = mockery.require("../grabberUtils")
    self.metadata = mockery.require("../metadata")

    self.temporaryWorkDirectory = tmp.dirSync()
    self.temporaryWorkDirectoryName = self.temporaryWorkDirectory.name
    self.utils.useBasePath(self.temporaryWorkDirectoryName)
    self.utils.mkdirIfNotExists(constants.trackingDir)

    setTimeout(() => {
      done()
    }, 1)
  })

  afterEach(() => {
    mockery.stopAll()
    self.utils.removeTree(self.temporaryWorkDirectoryName)
  })

  it("should let us read and write etags", () => {

    self.utils.makeTrackedTree(`${constants.widgetsDir}/My Widget/js`)

    const relativeJsFileName = `${constants.widgetsDir}/My Widget/js/my-widget.js`
    self.grabberUtils.writeFileAndETag(relativeJsFileName, "some js", "etag value")

    // Should work for relative file names.
    expect(self.utils.exists(relativeJsFileName)).toEqual(true)
    expect(self.etags.eTagFor(relativeJsFileName)).toEqual("etag value")

    // Make sure it also works for full paths.
    const fullJsFileName = upath.join(self.temporaryWorkDirectoryName, relativeJsFileName)

    expect(self.utils.exists(fullJsFileName)).toEqual(true)
    expect(self.etags.eTagFor(fullJsFileName)).toEqual("etag value")
  })

  it("should write files when the sub-directory does not exist", () => {

    self.utils.writeFile(`${constants.widgetsDir}/My Widget/locales/de/ns.mywidget.json`, "some content")

    expect(self.utils.readFile(`${constants.widgetsDir}/My Widget/locales/de/ns.mywidget.json`)).toEqual("some content")
  })

  it("should let us read and write metadata", () => {

    const widgetInstanceDir = "widget/Collection Navigation/instances/Collection Navigation Widget"
    self.utils.makeTree(`${constants.trackingDir}/${widgetInstanceDir}`)

    self.metadata.writeMetadata(`${constants.configMetadataJson}`, {node : "http://localhost:9080"})

    expect(self.metadata.getLastNode(`${widgetInstanceDir}/display.template`)).toEqual("http://localhost:9080")
  })

  it("should let us read and write element metadata", (done) => {

    const elementDir = "element/Company Logo"
    self.utils.makeTree(`${constants.trackingDir}/${elementDir}`)

    self.metadata.writeMetadata(`${elementDir}/${constants.elementMetadataJson}`, {
      tag : "element-tag",
      widgetId : "rep1234"
    })

    return self.metadata.readMetadata(`${elementDir}/element.template`, constants.elementMetadataJson).then(
      (elementMetadata) => {
        expect(elementMetadata.tag).toEqual("element-tag")
        expect(elementMetadata.widgetId).toEqual("rep1234")
        done()
      }
    )
  })

  it("should let us read and write stack metadata", (done) => {

    const stackInstanceDir = "stack/Progress Tracker/instances/My Stack Instance"
    self.utils.makeTree(`${constants.trackingDir}/${stackInstanceDir}`)

    self.metadata.writeMetadata(`${stackInstanceDir}/${constants.stackInstanceMetadataJson}`, {repositoryId : "rep5678"})

    return self.metadata.readMetadata(`${stackInstanceDir}/stack.template`, constants.stackInstanceMetadataJson).then(
      (metadata) => {

        expect(metadata.repositoryId).toEqual("rep5678")
        done()
      }
    )
  })

  it("should let us read and write theme metadata", (done) => {

    const themeDir = "theme/Mono Theme"
    self.utils.makeTree(`${constants.trackingDir}/${themeDir}`)

    self.metadata.writeMetadata(`${themeDir}/${constants.themeMetadataJson}`, {repositoryId : "rep9012"})

    return self.metadata.readMetadata(`${themeDir}/styles.less`, constants.themeMetadataJson).then(
      (metadata) => {
        expect(metadata.repositoryId).toEqual("rep9012")
        done()
      })
  })

  it("should let us read and write widget metadata", (done) => {

    const widgetDir = "widget/Collection Navigation"
    self.utils.makeTree(`${constants.trackingDir}/${widgetDir}`)

    self.metadata.writeMetadata(`${widgetDir}/${constants.widgetMetadataJson}`, {
      repositoryId : "rep3456",
      widgetType : "my-widget"
    })

    return self.metadata.readMetadata(`${widgetDir}/js/my-widget.js`, constants.widgetMetadataJson).then(
      (widgetMetadata) => {

        expect(widgetMetadata.repositoryId).toEqual("rep3456")
        expect(widgetMetadata.widgetType).toEqual("my-widget")
        done()
      }
    )
  })

  it("should let us read and write widget instance metadata", (done) => {

    const widgetInstanceDir = "widget/Collection Navigation/instances/Collection Navigation Widget"
    self.utils.makeTree(`${constants.trackingDir}/${widgetInstanceDir}`)

    self.metadata.writeMetadata(`${widgetInstanceDir}/${constants.widgetInstanceMetadataJson}`, {repositoryId : "rep7890"})

    return self.metadata.readMetadata(`${widgetInstanceDir}/display.template`, constants.widgetInstanceMetadataJson).then(
      (metadata) => {

        expect(metadata.repositoryId).toEqual("rep7890")
        done()
      }
    )
  })

  it("should process successful put results", () => {

    self.utils.makeTrackedTree(`${constants.widgetsDir}/My Widget/js`)

    const jsFileName = `${constants.widgetsDir}/My Widget/js/my-widget.js`
    self.grabberUtils.writeFileAndETag(jsFileName, "some js", "etag value")

    self.putterUtils.processPutResultAndEtag(jsFileName, {
      response : {
        statusCode : 200,
        headers : {
          etag : "new etag value"
        }
      }
    })

    expect(self.etags.eTagFor(jsFileName)).toEqual("new etag value")
  })

  it("should process optimistic locks", () => {

    self.utils.makeTrackedTree(`${constants.widgetsDir}/My Widget/js`)

    const jsFileName = `${constants.widgetsDir}/My Widget/js/my-widget.js`
    self.grabberUtils.writeFileAndETag(jsFileName, "some js", "etag value")

    self.putterUtils.processPutResultAndEtag(jsFileName, {
      response : {
        statusCode : 412,
        headers : {
          etag : "new etag value"
        }
      }
    })

    expect(self.etags.eTagFor(jsFileName)).toEqual("etag value") // etag should be unchanged.
    expect(self.logger.error).toHaveBeenCalledWith("alreadyBeenModified",
      {path : "widget/My Widget/js/my-widget.js"}, "optimisticLock")
  })

  it("should process internal errors", () => {

    self.utils.makeTrackedTree(`${constants.widgetsDir}/My Widget/js`)

    const jsFileName = `${constants.widgetsDir}/My Widget/js/my-widget.js`
    self.grabberUtils.writeFileAndETag(jsFileName, "some js", "etag value")

    self.putterUtils.processPutResultAndEtag(jsFileName, {
      response : {
        statusCode : 500,
        headers : {
          etag : "new etag value"
        }
      },
      data : {
        errorCode : "9999",
        message : "Things are really bad"
      }
    })

    expect(self.etags.eTagFor(jsFileName)).toEqual("etag value")
    expect(self.logger.error).not.toHaveBeenCalledWith("unexpectedErrorSending",
      {
        path : 'widget/My Widget/js/my-widget.js',
        statusCode : 500,
        errorCode : '9999',
        message : 'Things are really bad'
      },
      "unexpectedError")
  })

  it("should be able to call a simple endpoint and process the results", (done) => {

    // We are using a less file here as less file processing has an extra wrinkle.
    self.endPointTransceiver.getWidgetLess.returnsResponse({source : "#repo-repo {}"}, "new etag")
    self.utils.makeTrackedTree(`${constants.widgetsDir}/My Widget/instances/My Widget Instance`)
    const lessFilePath = `${constants.widgetsDir}/My Widget/instances/My Widget Instance/${constants.widgetLess}`

    self.grabberUtils.copyFieldContentsToFile("getWidgetLess", "wi1234", "source",
      lessFilePath, constants.lessFileSubstitutionReqExp, constants.widgetInstanceSubstitutionValue).then(
      () => {

        expect(self.etags.eTagFor(lessFilePath)).toEqual("new etag")
        expect(self.utils.readFile(lessFilePath)).toEqual("#WIDGET_ID-WIDGET_INSTANCE_ID {}") // Make sure less contents are OK.
        done()
      }
    )
  })

  it("should be able to sanitize file names", () => {
    expect(self.utils.sanitizeName("funny name ¬!\"£$%^&*()_+{})[]:@~;'#,./<>?")).toEqual("funny name ¬! £$%^& ()_+{})[] @~;'#,")
  })

  it("should be able create tracked directories", () => {

    self.utils.makeTrackedDirectory(constants.widgetsDir)

    expect(self.utils.exists(constants.widgetsDir)).toEqual(true)
    expect(self.utils.exists(`${constants.trackingDir}/${constants.widgetsDir}`)).toEqual(true)
  })

  it("should be able return the base path", () => {

    expect(self.utils.getBasePath()).toEqual(self.utils.normalize(self.temporaryWorkDirectoryName))
  })

  it("should be able resolve paths", () => {

    expect(self.utils.resolvePath("theme/Mono Theme/additionalStyles.less")).toEqual(
      `${self.utils.normalize(self.temporaryWorkDirectoryName)}/theme/Mono Theme/additionalStyles.less`)

    expect(self.utils.resolvePath("/full/path/theme/Mono Theme/additionalStyles.less")).toEqual(
      "/full/path/theme/Mono Theme/additionalStyles.less")

    expect(self.utils.resolvePath(
      `${self.utils.normalize(self.temporaryWorkDirectoryName)}/theme/Mono Theme/additionalStyles.less`)).toEqual(
      `${self.utils.normalize(self.temporaryWorkDirectoryName)}/theme/Mono Theme/additionalStyles.less`)

    self.utils.useBasePath(null)

    expect(self.utils.resolvePath("theme/Mono Theme/additionalStyles.less")).toEqual(
      "theme/Mono Theme/additionalStyles.less")

    self.utils.useBasePath("work")

    expect(self.utils.resolvePath("theme/Mono Theme/additionalStyles.less")).toEqual(
      "work/theme/Mono Theme/additionalStyles.less")

    expect(self.utils.resolvePath("work/theme/Mono Theme/additionalStyles.less")).toEqual(
      "work/theme/Mono Theme/additionalStyles.less")
  })

  it("should shorten a locale string", () => {
    expect(self.utils.shortLocale("en-US")).toEqual("en")
  })

  it("should let us remove tracked trees", () => {

    const trackedDirectoryPath = `${constants.widgetsDir}/My Widget/js`

    self.utils.makeTrackedTree(trackedDirectoryPath)

    expect(self.utils.exists(trackedDirectoryPath)).toEqual(true)
    expect(self.utils.exists(`${constants.trackingDir}/${trackedDirectoryPath}`)).toEqual(true)

    self.utils.removeTrackedTree(trackedDirectoryPath)

    expect(self.utils.exists(trackedDirectoryPath)).toEqual(false)
    expect(self.utils.exists(`${constants.trackingDir}/${trackedDirectoryPath}`)).toEqual(false)
  })

  it("should return the os locale", () => {
    expect(self.utils.osLocale()).not.toEqual(undefined)
  })

  it("should let us walk directories", () => {

    const directoryPath = `${constants.widgetsDir}/My Widget/js`

    self.utils.makeTree(directoryPath)
    self.utils.writeFile(`${directoryPath}/my.js`, "some JS code")

    const files = []
    const dirs = []

    self.utils.walkDirectory(constants.widgetsDir, {
      listeners : {
        file : (root, fileStat, next) => {
          files.push(fileStat.name)
          next()
        },
        directory : (root, fileStat, next) => {
          dirs.push(fileStat.name)
          next()
        }
      }
    })

    expect(files).toEqual(['my.js'])
    expect(dirs).toEqual(['My Widget', 'js'])
  })

  it("should let us walk directories", () => {

    const directoryPath = `${constants.widgetsDir}/My Widget/js`

    self.utils.makeTree(directoryPath)
    self.utils.writeFile(`${directoryPath}/a.js`, "some JS code")
    self.utils.writeFile(`${directoryPath}/b.js`, "some JS code")
    self.utils.writeFile(`${directoryPath}/c.js`, "some JS code")

    const files = []

    self.utils.glob(`${constants.widgetsDir}/**/*.js`).forEach(filePath => {
      files.push(filePath)
    })

    expect(files.length).toEqual(3)
  })
})
