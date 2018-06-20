"use strict"

const constants = require("../constants").constants
const matchers = require('./matchers')
const mockery = require("./mockery")

describe("Widget Grabber", () => {

  const baseWidgetDir = "widget";

  const myLittleWidgetName = "My Little Widget"
  const myLittleWidgetDir = `${baseWidgetDir}/${myLittleWidgetName}`
  const myLittleWidgetJsDir = `${myLittleWidgetDir}/js`
  const myLittleWidgetInstancesDir = `${myLittleWidgetDir}/instances`
  const myLittleWidgetInstanceName = "My Little Widget Instance"
  const myLittleWidgetInstanceDir = `${myLittleWidgetInstancesDir}/${myLittleWidgetInstanceName}`
  const myLittleWidgetInstanceLocalesDir = `${myLittleWidgetInstanceDir}/locales`
  const myLittleWidgetInstanceLocalesEnDir = `${myLittleWidgetInstanceLocalesDir}/en`
  const myLittleWidgetInstanceLocaleEnFile = `${myLittleWidgetInstanceLocalesEnDir}/ns.mylittlewidgettype.json`
  const myLittleWidgetJsFile = `${myLittleWidgetJsDir}/myLittle.js`
  const myLittleWidgetMetadata = `${myLittleWidgetDir}/widget.json`
  const myLittleWidgetInstanceMetadata = `${myLittleWidgetInstanceDir}/widgetInstance.json`
  const myLittleWidgetInstanceDisplayTemplate = `${myLittleWidgetInstanceDir}/display.template`
  const myLittleWidgetInstanceLess = `${myLittleWidgetInstanceDir}/widget.less`
  const myLittleWidgetVersionsDir = `${myLittleWidgetDir}/versions`
  const myLittleWidgetVersionOneDir = `${myLittleWidgetVersionsDir}/1`

  const myHomeMadeWidgetDir = "widget/My Home Made Widget"
  const myHomeMadeWidgetUserMetadata = `${myHomeMadeWidgetDir}/widgetMetadata.json`
  const myUserWidgetConfigMetadata = `${myHomeMadeWidgetDir}/config/configMetadata.json`
  const myHomeMadeWidgetJsFile = `${myHomeMadeWidgetDir}/js/myLittle.js`
  const myHomeMadeWidgetConfigLocaleLocaleEn = `${myHomeMadeWidgetDir}/config/locales/en.json`
  const myHomeMadeWidgetInstanceMetadata = `${myHomeMadeWidgetDir}/instances/My Home Made Instance/widgetInstanceMetadata.json`
  const myHomeMadeWidgetBaseLocaleEnFile = `${myHomeMadeWidgetDir}/locales/en/ns.myhomemadewidgettype.json`
  const myHomeMadeWidgetBaseDisplayTemplate = `${myHomeMadeWidgetDir}/display.template`
  const myHomeMadeWidgetBaseLess = `${myHomeMadeWidgetDir}/widget.less`

  const myLittleWebContentWidgetName = "My Little Web Content Widget"
  const myLittleWebContentInstanceName = `${myLittleWebContentWidgetName} Instance`
  const myLittleWebContentWidgetDir = `widget/${myLittleWebContentWidgetName}`
  const myLittleWebContentWidgetJsDir = `${myLittleWebContentWidgetDir}/js`
  const myLittleWebContentWidgetInstancesDir = `${myLittleWebContentWidgetDir}/instances`
  const myLittleWebContentWidgetInstanceDir = `${myLittleWebContentWidgetInstancesDir}/My Little Web Content Widget Instance`
  const myLittleWebContentWidgetInstanceLocalesDir = `${myLittleWebContentWidgetInstanceDir}/locales`
  const myLittleWebContentWidgetInstanceLocalesEnDir = `${myLittleWebContentWidgetInstanceLocalesDir}/en`
  const myLittleWebContentWidgetInstanceLocalesEnFile = `${myLittleWebContentWidgetInstanceLocalesEnDir}/ns.webcontent.json`
  const myLittleWebContentWidgetMetadata = `${myLittleWebContentWidgetDir}/widget.json`
  const myLittleWebContentWidgetInstanceMetadata = `${myLittleWebContentWidgetInstanceDir}/widgetInstance.json`
  const myLittleWebContentWidgetInstanceDisplayTemplate = `${myLittleWebContentWidgetInstanceDir}/display.template`
  const myLittleWebContentWidgetInstanceContentTemplate = `${myLittleWebContentWidgetInstanceDir}/content.template`
  const myLittleWebContentWidgetInstanceLess = `${myLittleWebContentWidgetInstanceDir}/widget.less`

  const self = this

  beforeEach(() => {

    mockery.use(jasmine.createSpy)
    matchers.add(jasmine)

    self.endPointTransceiver = mockery.mockModule("../endPointTransceiver",
      "getAllWidgetInstances", "getWidgetDescriptorJavascriptInfoById", "getWidgetLocaleContent", "listWidgets",
      "getWidgetDescriptorMetadata", "getConfigMetadataForWidgetDescriptor", "getConfigLocaleContentForWidgetDescriptor",
      "getWidgetDescriptorBaseLocaleContent", "getWidgetMetadata")

    self.endPointTransceiver.locales = [{name: "en"}]

    mockery.mockModules(self, "../utils", "../grabberUtils", "../etags", "../metadata", "../logger")

    self.utils.sanitizeName.returnsFirstArg()

    self.widgetGrabber = mockery.require("../widgetGrabber")

    self.endPointTransceiver.getWidgetLocaleContent.returnsResponse(
      {
        localeData: {
          resources,
          custom: {
            "overrideKey": "Should see this"
          }
        }
      }, "widget locale content etag")

    self.grabberUtils.copyFieldContentsToFile.returnsPromise()

    self.endPointTransceiver.getWidgetDescriptorJavascriptInfoById.returnsResponse(
      {
        jsFiles: [
          {
            name: "myLittle.js"
          }
        ]
      })

    self.endPointTransceiver.get.returnsResponse("some widget js source", "get js etag")
    self.endPointTransceiver.getWidgetDescriptorMetadata.returnsResponse({metadata: {}}, "get metadata etag")
    self.endPointTransceiver.getConfigMetadataForWidgetDescriptor.returnsResponse({metadata: {metadataKey: "metadataValue"}}, "config metadata etag")
    self.endPointTransceiver.getConfigLocaleContentForWidgetDescriptor.returnsResponse({localeData: {localeKey: "localeValue"}}, "config locale etag")
    self.endPointTransceiver.getWidgetDescriptorBaseLocaleContent.returnsResponse({localeData: {resources: {localeKey: "localeValue"}}}, "base locale etag")
    self.endPointTransceiver.getWidgetMetadata.returnsResponse({metadata: {metadataKey: "metadataValue"}}, "instance metadata etag")
  })

  afterEach(mockery.stopAll)

  const resources = {
    "buttonEditCartSummary": "Edit",
    "cartSummaryItemLimitText": "Showing initial __noOfItems__ cart items",
    "colorText": "Color: ",
    "overrideKey": "Should not see this"
  }

  function mockValidInstances() {

    self.endPointTransceiver.getAllWidgetInstances.returnsItems(
      {
        displayName: myLittleWidgetName,
        widgetType: "myLittleWidgetType",
        editableWidget: true,
        jsEditable: true,
        repositoryId: "rep0001",
        id: "rep0001",
        version: 1,
        instances: []
      },
      {
        displayName: "My Home Made Widget",
        widgetType: "myHomeMadeWidgetType",
        editableWidget: true,
        jsEditable: true,
        repositoryId: "rep0010",
        id: "rep0010",
        version: 1,
        instances: [],
        source: 101,
        configurable: true,
        i18nresources: "myhomemadewidgettype"
      }
    )

    self.endPointTransceiver.listWidgets.returnsItems(
      {
        displayName: myLittleWidgetInstanceName,
        repositoryId: "rep0002",
        id: "rep0002",
        descriptor: {
          widgetType: "myLittleWidgetType",
          repositoryId: "rep0001",
          version: 3
        }
      },
      {
        displayName: myLittleWidgetInstanceName,
        repositoryId: "rep0003",
        id: "rep0003",
        descriptor: {
          widgetType: "myLittleWidgetType",
          repositoryId: "rep0001",
          version: 2
        }
      },
      {
        displayName: "My Home Made Instance",
        repositoryId: "rep0020",
        id: "rep0020",
        descriptor: {
          widgetType: "myHomeMadeWidgetType",
          repositoryId: "rep0010",
          version: 4,
          source: 101
        }
      }
    )

    // First call to exists must return false. All later calls must return true.
    let calls = 0
    self.utils.exists.and.callFake(() => {
      return calls++
    })

    self.metadata.readMetadataFromDisk.and.callFake(() => {
      return {
        version: 3
      }
    })
  }

  it("should let you grab all Widgets", (done) => {

    self.endPointTransceiver.serverSupports.returnsTrue()

    mockValidInstances()

    self.widgetGrabber.grabAllWidgets(true).then(() => {

      expect(self.endPointTransceiver.getAllWidgetInstances).toHaveBeenCalledWith("?source=100")
      expect(self.endPointTransceiver.getAllWidgetInstances).toHaveBeenCalledWith("?source=101")
      expect(self.endPointTransceiver.listWidgets).toHaveBeenCalled()

      expect(self.endPointTransceiver.getWidgetDescriptorJavascriptInfoById).toHaveBeenCalledWith(["rep0001"])

      expect(self.endPointTransceiver.getWidgetLocaleContent).urlKeysWere(["rep0020"])
      expect(self.endPointTransceiver.getWidgetLocaleContent).localeWas("en")

      const paths = [
        baseWidgetDir,
        myLittleWidgetDir,
        myLittleWidgetJsDir,
        myLittleWidgetInstancesDir,
        myLittleWidgetInstanceLocalesDir,
        myLittleWidgetInstanceLocalesEnDir
      ]

      paths.forEach(path => expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith(path))

      expect(self.utils.makeTrackedTree).toHaveBeenCalledWith(myLittleWidgetInstanceDir)

      expect(self.utils.writeFile).toHaveBeenCalledWith(myLittleWidgetInstanceLocaleEnFile, JSON.stringify(
        {
          "resources": {
            "buttonEditCartSummary": "Edit",
            "cartSummaryItemLimitText": "Showing initial __noOfItems__ cart items",
            "colorText": "Color: ",
            "overrideKey": "Should see this"
          }
        }, null, 2))

      expect(self.etags.writeEtag).toHaveBeenCalledWith(myLittleWidgetInstanceLocaleEnFile, "widget locale content etag")

      expect(self.grabberUtils.writeFileAndETag).toHaveBeenCalledWith(myLittleWidgetJsFile, "some widget js source", "get js etag")

      expect(self.metadata.writeMetadata).toHaveBeenCalledWith(myLittleWidgetMetadata,
        {repositoryId: "rep0001", widgetType: "myLittleWidgetType", version: 1, displayName: myLittleWidgetName})

      expect(self.metadata.writeMetadata).toHaveBeenCalledWith(myLittleWidgetInstanceMetadata,
        {
          repositoryId: "rep0002",
          descriptorRepositoryId: "rep0001",
          version: 3,
          displayName: myLittleWidgetInstanceName
        })

      expect(self.grabberUtils.copyFieldContentsToFile).toHaveBeenCalledWith("getWidgetSourceCode", "rep0002", "source", myLittleWidgetInstanceDisplayTemplate)
      expect(self.grabberUtils.copyFieldContentsToFile).toHaveBeenCalledWith("getWidgetLess", "rep0002", "source", myLittleWidgetInstanceLess, constants.lessFileSubstitutionReqExp, "#WIDGET_ID-WIDGET_INSTANCE_ID")

      expect(self.logger.info).toHaveBeenCalledWith("grabbingWidget", {name: myLittleWidgetName})
      expect(self.logger.info).toHaveBeenCalledWith("grabbingWidgetInstance", {name: myLittleWidgetInstanceName})

      // See if the directory map is right. Simple case - latest widget.
      expect(self.widgetGrabber.getDirectoryForWidget("myLittleWidgetType", 3, true)).toEqual(myLittleWidgetDir)

      // More complex case - not latest version. Make sure dirs got created.
      expect(self.widgetGrabber.getDirectoryForWidget("myLittleWidgetType", 1, false)).toEqual(myLittleWidgetVersionOneDir)
      expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith(myLittleWidgetVersionsDir)
      expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith(myLittleWidgetVersionOneDir)

      expect(self.grabberUtils.writeFileAndETag).toHaveBeenCalledWith(myHomeMadeWidgetUserMetadata, '{}', 'get metadata etag')
      expect(self.grabberUtils.writeFileAndETag).toHaveBeenCalledWith(myUserWidgetConfigMetadata, '{\n  "metadataKey": "metadataValue"\n}', 'config metadata etag')
      expect(self.grabberUtils.writeFileAndETag).toHaveBeenCalledWith(myHomeMadeWidgetJsFile, 'some widget js source', 'get js etag')
      expect(self.grabberUtils.writeFileAndETag).toHaveBeenCalledWith(myHomeMadeWidgetConfigLocaleLocaleEn, '{\n  "localeKey": "localeValue"\n}', 'config locale etag')
      expect(self.grabberUtils.writeFileAndETag).toHaveBeenCalledWith(myHomeMadeWidgetInstanceMetadata, '{\n  "metadataKey": "metadataValue"\n}', 'instance metadata etag')

      expect(self.utils.writeFile).toHaveBeenCalledWith(myHomeMadeWidgetBaseLocaleEnFile, JSON.stringify(
        {
          "resources": {
            "localeKey": "localeValue"
          }
        }, null, 2))
      expect(self.etags.writeEtag).toHaveBeenCalledWith(myHomeMadeWidgetBaseLocaleEnFile, "base locale etag")

      expect(self.grabberUtils.copyFieldContentsToFile).toHaveBeenCalledWith('getWidgetDescriptorBaseTemplate', 'rep0010', 'source', myHomeMadeWidgetBaseDisplayTemplate)
      expect(self.grabberUtils.copyFieldContentsToFile).toHaveBeenCalledWith('getWidgetDescriptorBaseLess', 'rep0010', 'source', myHomeMadeWidgetBaseLess)

      done()
    })
  })

  it("should let you grab Web Content Widgets", (done) => {

    self.endPointTransceiver.getAllWidgetInstances.returnsItems(
      {
        displayName: myLittleWebContentWidgetName,
        widgetType: "webContent",
        editableWidget: true,
        jsEditable: false,
        repositoryId: "rep0001",
        version: 3,
        instances: [
          {
            displayName: myLittleWebContentInstanceName,
            repositoryId: "rep0002",
            id: "rep0002",
            version: 3
          }
        ]
      })

    self.endPointTransceiver.listWidgets.returnsItems(
      {
        displayName: myLittleWebContentInstanceName,
        repositoryId: "rep0002",
        id: "rep0002",
        descriptor: {
          widgetType: "webContent",
          repositoryId: "rep0001",
          version: 3
        }
      })

    self.endPointTransceiver.getWidgetLocaleContentForLocale = mockery.addConvenienceMethods(jasmine.createSpy("getWidgetLocaleContentForLocale"))
    self.endPointTransceiver.getWidgetLocaleContentForLocale.returnsResponse({localeData: {resources}}, "widget locale content etag")

    self.widgetGrabber.grabAllWidgets(true).then(() => {

      expect(self.endPointTransceiver.getAllWidgetInstances).toHaveBeenCalledWith("?source=100")
      expect(self.endPointTransceiver.getAllWidgetInstances).toHaveBeenCalledWith("?source=101")
      expect(self.endPointTransceiver.listWidgets).toHaveBeenCalled()

      expect(self.endPointTransceiver.getWidgetLocaleContentForLocale).urlKeysWere(["rep0002", "en"])
      expect(self.endPointTransceiver.getWidgetLocaleContentForLocale).localeWas("en")

      const paths = [baseWidgetDir,
        myLittleWebContentWidgetDir,
        myLittleWebContentWidgetInstancesDir,
        myLittleWebContentWidgetInstanceLocalesDir,
        myLittleWebContentWidgetInstanceLocalesEnDir]

      paths.forEach(path => expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith(path))

      expect(self.utils.makeTrackedTree).toHaveBeenCalledWith(myLittleWebContentWidgetInstanceDir)
      expect(self.utils.makeTrackedDirectory).not.toHaveBeenCalledWith(myLittleWebContentWidgetJsDir)

      expect(self.utils.writeFile).toHaveBeenCalledWith(myLittleWebContentWidgetInstanceLocalesEnFile, JSON.stringify({resources}, null, 2))
      expect(self.etags.writeEtag).toHaveBeenCalledWith(myLittleWebContentWidgetInstanceLocalesEnFile, "widget locale content etag")

      expect(self.grabberUtils.writeFileAndETag).not.toHaveBeenCalledWith(myLittleWidgetJsFile, "some widget js source", "get js etag")

      expect(self.metadata.writeMetadata).toHaveBeenCalledWith(myLittleWebContentWidgetMetadata,
        {
          repositoryId: "rep0001",
          widgetType: "webContent",
          version: 3,
          displayName: myLittleWebContentWidgetName
        })

      expect(self.metadata.writeMetadata).toHaveBeenCalledWith(myLittleWebContentWidgetInstanceMetadata,
        {
          repositoryId: "rep0002",
          descriptorRepositoryId: "rep0001",
          version: 3,
          displayName: myLittleWebContentInstanceName
        })

      expect(self.grabberUtils.copyFieldContentsToFile).toHaveBeenCalledWith("getWidgetSourceCode", "rep0002", "source", myLittleWebContentWidgetInstanceDisplayTemplate)
      expect(self.grabberUtils.copyFieldContentsToFile).toHaveBeenCalledWith("getWidgetWebContent", "rep0002", "content", myLittleWebContentWidgetInstanceContentTemplate)
      expect(self.grabberUtils.copyFieldContentsToFile).toHaveBeenCalledWith("getWidgetLess", "rep0002", "source", myLittleWebContentWidgetInstanceLess, constants.lessFileSubstitutionReqExp, "#WIDGET_ID-WIDGET_INSTANCE_ID")

      done()
    })
  })

  it("should warn when endpoints are not available", done => {

    self.endPointTransceiver.serverSupports.returnsFalse()

    mockValidInstances()

    self.widgetGrabber.grabAllWidgets(true).then(() => {
      expect(self.logger.warn).toHaveBeenCalledWith("widgetDescriptorMetadataCannotBeGrabbed")
      expect(self.logger.warn).toHaveBeenCalledWith("baseWidgetContentCannotBeGrabbed")
      expect(self.logger.warn).toHaveBeenCalledWith("widgetDescriptorMetadataCannotBeGrabbed")
      expect(self.logger.warn).toHaveBeenCalledWith("baseWidgetContentCannotBeGrabbed")
      expect(self.logger.warn).toHaveBeenCalledWith("widgetInstanceMetadataCannotBeGrabbed")
      done()
    })
  })
})
