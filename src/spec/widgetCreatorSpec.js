"use strict"

const constants = require("../constants").constants
const mockery = require("./mockery")

describe("widgetCreator", () => {

  const self = this

  beforeEach(() => {

    mockery.use(jasmine.createSpy)

    self.endPointTransceiver = mockery.mockModule("../endPointTransceiver", "getAllWidgetDescriptors")

    mockery.mockModules(self, "../i18n", "../utils", "../logger",
      "../metadata", "../extensionBuilder", "../extensionSender", "../widgetWizard")

    self.extension = jasmine.createSpy("extension")

    self.widgetCreator = mockery.require("../widgetCreator")

    self.widgetWizard.prompt.returnsPromise({
      widgetName : "New Widget Name",
      i18n : true,
      configurable : true,
      withHelpText : true,
      syncWithServer : true
    })

    self.endPointTransceiver.locales = [{name : "en"}]
  })

  afterEach(mockery.stopAll)

  it("should send extensions to the server", done => {

    self.endPointTransceiver.getAllWidgetDescriptors.returnsResponse({
      items : [
        {
          displayName : "New Widget Name",
          repositoryId : "rep909"
        }
      ]
    })

    self.extensionBuilder.buildExtension.and.callFake((idRequestText, manifestNameText, shortName, sourceDir, extensionPathFor, extensionContentsFor, onCompleteCallBack) => {

      self.utils.splitFromBaseDir.returns([".", "widget/CCW Test Widget/display.template"])
      expect(extensionPathFor("widgetType", "widget/CCW Test Widget/display.template")).toEqual("widget/widgetType/templates/display.template")
      self.utils.splitFromBaseDir.returns([".", "widget/CCW Test Widget/widget.less"])
      expect(extensionPathFor("widgetType", "widget/CCW Test Widget/widget.less")).toEqual("widget/widgetType/less/widget.less")
      self.utils.splitFromBaseDir.returns([".", "widget/CCW Test Widget/locales/en/ns.ccwtestwidget.json"])
      expect(extensionPathFor("widgetType", "widget/CCW Test Widget/locales/en/ns.ccwtestwidget.json")).toEqual("widget/widgetType/locales/en/ns.ccwtestwidget.json")
      self.utils.splitFromBaseDir.returns([".", "widget/CCW Test Widget/js/ccwtestwidget.js"])
      expect(extensionPathFor("widgetType", "widget/CCW Test Widget/js/ccwtestwidget.js")).toEqual("widget/widgetType/js/ccwtestwidget.js")
      self.utils.splitFromBaseDir.returns([".", "widget/CCW Test Widget/config/locales/en.json"])
      expect(extensionPathFor("widgetType", "widget/CCW Test Widget/config/locales/en.json")).toEqual("widget/widgetType/config/locales/en.json")
      self.utils.splitFromBaseDir.returns([".", "widget/CCW Test Widget/config/configMetadata.json"])
      expect(extensionPathFor("widgetType", "widget/CCW Test Widget/config/configMetadata.json")).toEqual("widget/widgetType/config/config.json")
      self.utils.splitFromBaseDir.returns([".", "widget/CCW Test Widget/widgetMetadata.json"])
      expect(extensionPathFor("widgetType", "widget/CCW Test Widget/widgetMetadata.json")).toEqual("widget/widgetType/widget.json")

      expect(extensionContentsFor("widget/CCW Test Widget/widgetMetadata.json")).toEqual(
        '{"imports":[],"javascript":"ccwtestwidget","widgetType":"ccwtestwidget","global":false,"i18nresources":"ccwtestwidget"}')
      expect(extensionContentsFor("widget/CCW Test Widget/display.template")).toEqual("template contents")

      onCompleteCallBack(self.extension)
    })

    self.extensionSender.sendExtension.and.callFake((vfsBase, extension, resultHandler) => {
      resultHandler({data : {warnings : ["Widget looked a bit green"], errors : [], success : true}})
    })

    self.metadata.readMetadataFromDisk.returns({
      javascript : "ccwtestwidget",
      widgetType : "ccwtestwidget",
      global : false,
      i18nresources : "ccwtestwidget"
    })

    self.utils.readJsonFile.returns({
      "imports" : []
    })

    self.utils.splitFromBaseDir.returns([])

    self.utils.readFile.returns("template contents")

    self.widgetCreator.create(true).then(() => {

      expect(self.utils.makeTrackedTree).toHaveBeenCalledWith("widget/New Widget Name")
      expect(self.utils.makeTrackedTree).toHaveBeenCalledWith("widget/New Widget Name/js")
      expect(self.utils.makeTrackedTree).toHaveBeenCalledWith("widget/New Widget Name/instances")
      expect(self.utils.makeTrackedTree).toHaveBeenCalledWith("widget/New Widget Name/locales")
      expect(self.utils.makeTrackedTree).toHaveBeenCalledWith("widget/New Widget Name/locales/en")
      expect(self.utils.makeTrackedTree).toHaveBeenCalledWith("widget/New Widget Name/config/locales")

      expect(self.utils.writeFile.calls.all()[0].args[0]).toEqual("widget/New Widget Name/widgetMetadata.json")
      expect(self.utils.writeFile.calls.all()[1].args[0]).toEqual("widget/New Widget Name/js/newwidgetname.js")
      expect(self.utils.writeFile.calls.all()[2].args[0]).toEqual("widget/New Widget Name/display.template")
      expect(self.utils.writeFile.calls.all()[3].args[0]).toEqual("widget/New Widget Name/widget.less")
      expect(self.utils.writeFile.calls.all()[4].args[0]).toEqual("widget/New Widget Name/locales/en/ns.newwidgetname.json")
      expect(self.utils.writeFile.calls.all()[5].args[0]).toEqual("widget/New Widget Name/config/configMetadata.json")
      expect(self.utils.writeFile.calls.all()[6].args[0]).toEqual("widget/New Widget Name/config/locales/en.json")

      expect(self.utils.writeFile.calls.all()[0].args[1]).toContain("exampleStringProperty")

      expect(self.logger.logInfo).toHaveBeenCalledWith("Widget looked a bit green")

      expect(self.metadata.updateMetadata).toHaveBeenCalledWith("widget/New Widget Name", "widget.json", {repositoryId : "rep909"})
      expect(self.metadata.initializeMetadata).toHaveBeenCalled()

      done()
    })
  })

  it("should report back when the extension upload fails", done => {

    self.endPointTransceiver.locale = "en"

    self.extensionSender.sendExtension.and.callFake((vfsBase, extension, resultHandler) => {
      resultHandler({
        data : {
          warnings : ["Widget looked a bit green"],
          errors : ["you've got to be kidding"],
          success : false
        }
      })
    })

    self.extensionBuilder.buildExtension.and.callFake((idRequestText, manifestNameText, shortName, sourceDir, extensionPathFor, extensionContentsFor, onCompleteCallBack) => {
      onCompleteCallBack()
    })

    let called = 1

    self.metadata.widgetTypeExists.and.callFake(() => {
      return called--
    })

    self.widgetCreator.create(false).then(() => {

      expect(self.logger.info).toHaveBeenCalledWith("widgetUploadFailure", {widgetName : 'New Widget Name'})
      expect(self.logger.info).toHaveBeenCalledWith("widgetUploadWarningsFound")
      expect(self.logger.logInfo).toHaveBeenCalledWith("you've got to be kidding")
      expect(self.logger.logInfo).toHaveBeenCalledWith("Widget looked a bit green")
      done()
    })
  })

  it("should not update metadata in transfer mode", done => {

    self.metadata.inTransferMode.returnsTrue()

    self.widgetWizard.prompt.returnsPromise({
      widgetName : "New Widget Name",
      i18n : false,
      configurable : true,
      withHelpText : true,
      syncWithServer : true
    })

    self.extensionBuilder.buildExtension.and.callFake((idRequestText, manifestNameText, shortName, sourceDir, extensionPathFor, extensionContentsFor, onCompleteCallBack) => {
      onCompleteCallBack()
    })

    self.extensionSender.sendExtension.and.callFake((vfsBase, extension, resultHandler) => {
      resultHandler({data : {warnings : [], errors : [], success : true}})
    })

    self.widgetCreator.create(true).then(() => {

      expect(self.metadata.updateMetadata).not.toHaveBeenCalled()
      expect(self.metadata.initializeMetadata).toHaveBeenCalled()
      done()
    })
  })

  it("should detect when global widgets require special handling", done => {

    self.metadata.inTransferMode.returnsTrue()

    self.widgetWizard.prompt.returnsPromise({
      widgetName : "New Widget Name",
      i18n : false,
      global : true,
      configurable : true,
      withHelpText : true,
      syncWithServer : true
    })

    self.endPointTransceiver.serverSupports.returnsFalse()

    self.extensionBuilder.buildExtension.and.callFake((idRequestText, manifestNameText, shortName, sourceDir, extensionPathFor, extensionContentsFor, onCompleteCallBack) => {

      expect(JSON.parse(extensionContentsFor(`/${constants.userWidgetMetadata}`)).name).toEqual("CCW Test Widget")
      onCompleteCallBack()
    })

    self.extensionSender.sendExtension.and.callFake((vfsBase, extension, resultHandler) => {
      resultHandler({data : {warnings : [], errors : [], success : true}})
    })

    self.metadata.readMetadataFromDisk.returns({
      javascript : "ccwtestwidget",
      widgetType : "ccwtestwidget",
      global : true,
      displayName : "CCW Test Widget"
    })

    self.utils.readJsonFile.returns({
      translations : {}
    })

    self.widgetCreator.create(true).then(() => {
      done()
    })
  })
})
