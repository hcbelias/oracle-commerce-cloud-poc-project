const constants = require('../constants').constants
const mockery = require('./mockery')

const PuttingFileType = require("../puttingFileType").PuttingFileType

describe("Metadata Handler", () => {

  const self = this

  const elementTemplatePath = "element/Company Logo/element.template"
  const widgetElementTemplatePath = "widget/Product Details/element/Add to Cart Button/element.template"
  const stackInstanceTemplatePath = "stack/Progress Tracker/instances/Progress Tracker/stack.template"
  const otherStackInstanceTemplatePath = "stack/Progress Tracker/instances/Not Progress Tracker/stack.template"
  const widgetJsPath = "widget/Cart Summary/js/something.js"
  const otherWidgetJsPath = "widget/Not Cart Summary/js/something.js"
  const widgetInstanceTemplatePath = "widget/Cart Summary/instances/Cart Summary Widget/display.template"
  const otherWidgetInstanceTemplatePath = "widget/Cart Summary/instances/Not Cart Summary Widget/display.template"
  const themeDirectoryPath = "theme/Red Theme"
  const otherThemeDirectoryPath = "theme/Green Theme"

  const putResults = {}

  beforeEach(() => {

    mockery.use(jasmine.createSpy)

    mockery.mockModules(self, '../utils', '../etags', '../logger', '../classifier')

    self.endPointTransceiver = mockery.mockModule('../endPointTransceiver',
      "getThemes", "listWidgets", "getWidget", "getElements", "getAllStackInstances", "getAllWidgetInstances",
      "getAllWidgetDescriptors")

    self.endPointTransceiver.getThemes.returnsItems(
      {
        name: "Red Theme",
        repositoryId: "111"
      }
    )

    self.endPointTransceiver.listWidgets.returnsItems(
      {
        descriptor: {
          editableWidget: true,
          repositoryId: "cswiRepo0001",
          version: 1
        },
        repositoryId: "wid1234",
        displayName: "Cart Summary Widget"
      },
      {
        descriptor: {
          editableWidget: false
        },
        repositoryId: "widNeverUsed"
      })

    self.endPointTransceiver.getWidget.returnsResponse(
      {
        fragments: [
          {
            tag: "my-widget-element"
          }
        ],
        instance: {
          descriptor: {
            version: 1,
            displayName: "Product Details"
          }
        }
      })

    self.endPointTransceiver.getElements.returnsItems(
      {
        tag: "my-element"
      }
    )

    self.endPointTransceiver.getAllStackInstances.returnsItems(
      {
        instances: [
          {
            displayName: "Progress Tracker",
            repositoryId: "stack-repo-id"
          }
        ]
      }
    )

    self.endPointTransceiver.getAllWidgetDescriptors.returnsItems(
      {
        version: 1,
        displayName: "Cart Summary",
        repositoryId: "csRepo0001",
        widgetType: "cartSummary"
      }
    )

    self.metadata = mockery.require("../metadata")
  })

  afterEach(mockery.stopAll)

  /**
   * Does all the boilerplate to make it look like we read something from disk.
   * @param path
   * @param contents
   */
  function mockDiskMetadataAs(path, contents) {

    self.utils.splitFromBaseDir.returns(["", path])
    self.utils.exists.returnsTrue()
    self.utils.readJsonFile.returns(contents)
  }

  it("should get Theme metadata from target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(themeDirectoryPath, {displayName: "Red Theme"})

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(themeDirectoryPath, constants.themeMetadataJson).then(metadata => {

        expect(metadata.repositoryId).toBe("111")
        expect(self.logger.info).toHaveBeenCalledWith('matchingThemeFound', {name: 'Red Theme'})

        done()
      }))
  })

  it("should be able to detect when a theme exists on the target server", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(themeDirectoryPath, {displayName: "Red Theme"})

    self.metadata.initializeMetadata().then(() => {

      expect(self.metadata.themeExistsOnTarget(themeDirectoryPath)).toBeTruthy()
      done()
    })
  })

  it("should tell you when it cannot get Theme metadata from the target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(otherThemeDirectoryPath, {displayName: "Green Theme"})

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(otherThemeDirectoryPath, constants.themeMetadataJson).then(metadata => {

        expect(metadata).toBe(null)
        expect(self.logger.warn).toHaveBeenCalledWith('noMatchingThemeFound', {name: 'Green Theme'})

        done()
      }))
  })

  it("should get Global Element metadata from target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)
    self.endPointTransceiver.serverSupports.returnsTrue()

    self.classifier.classify.returns(PuttingFileType.GLOBAL_ELEMENT_TEMPLATE)

    mockDiskMetadataAs(elementTemplatePath, {tag: "my-element"})

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(elementTemplatePath, constants.elementMetadataJson).then(metadata => {

        expect(metadata.tag).toBe("my-element")
        expect(self.logger.info).toHaveBeenCalledWith('matchingElementFound', {path: elementTemplatePath})
        done()
      }))
  })

  it("should tell you when it cannot get Global Element metadata from the target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    self.classifier.classify.returns(PuttingFileType.GLOBAL_ELEMENT_TEMPLATE)

    mockDiskMetadataAs(elementTemplatePath, {tag: "not-my-element", displayName: "Company Logo", version: 1})

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(elementTemplatePath, constants.elementMetadataJson).then(metadata => {

        expect(metadata).toBe(null)
        expect(self.logger.warn).toHaveBeenCalledWith('noMatchingElementFound', {path: elementTemplatePath})

        done()
      }))
  })

  it("should get Widget Element metadata from target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(widgetElementTemplatePath, {
      tag: "my-widget-element",
      displayName: "Product Details",
      version: 1
    })

    self.classifier.classify.returns(PuttingFileType.ELEMENT_TEMPLATE)

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(widgetElementTemplatePath, constants.elementMetadataJson).then(metadata => {

        expect(metadata.tag).toBe("my-widget-element")
        expect(self.logger.info).toHaveBeenCalledWith('matchingElementFound', {path: widgetElementTemplatePath})
        done()
      }))
  })

  it("should tell you when you cannot get Widget Element metadata from target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(widgetElementTemplatePath, {tag: "not-my-widget-element"})

    self.classifier.classify.returns(PuttingFileType.ELEMENT_TEMPLATE)

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(widgetElementTemplatePath, constants.elementMetadataJson).then(metadata => {

        expect(metadata).toBe(null)
        expect(self.logger.warn).toHaveBeenCalledWith('noMatchingElementFound', {path: widgetElementTemplatePath})

        done()
      }))
  })

  it("should get Stack Instance metadata from target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(stackInstanceTemplatePath, {displayName: "Progress Tracker"})

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(stackInstanceTemplatePath, constants.stackInstanceMetadataJson).then(metadata => {

        expect(metadata.repositoryId).toBe("stack-repo-id")
        expect(self.logger.info).toHaveBeenCalledWith('matchingStackInstanceFound', {path: stackInstanceTemplatePath})

        done()
      }))
  })

  it("should tell you when you cannot get Stack Instance metadata from target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(otherStackInstanceTemplatePath, {})

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(otherStackInstanceTemplatePath, constants.stackInstanceMetadataJson).then(metadata => {

        expect(metadata).toBe(null)
        expect(self.logger.warn).toHaveBeenCalledWith('noMatchingStackInstanceFound', {path: otherStackInstanceTemplatePath})

        done()
      }))
  })

  it("should get Widget metadata from target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(widgetJsPath, {displayName: "Cart Summary", version: 1})

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(widgetJsPath, constants.widgetMetadataJson).then(metadata => {

        expect(metadata.repositoryId).toBe("csRepo0001")
        expect(self.logger.info).toHaveBeenCalledWith('matchingWidgetFound', {path: widgetJsPath})

        done()
      }))
  })

  it("should tell you when it cannot get Widget metadata from target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(otherWidgetJsPath, {displayName: "Not Cart Summary", version: 1})

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(otherWidgetJsPath, constants.widgetMetadataJson).then(metadata => {

        expect(metadata).toBeNull()
        expect(self.logger.warn).toHaveBeenCalledWith('noMatchingWidgetFound', {path: otherWidgetJsPath})

        done()
      }))
  })

  it("should be able to detect when a widget exists on the target server", (done) => {

    mockDiskMetadataAs(widgetJsPath, {displayName: "Cart Summary", version: 1})

    self.metadata.initializeMetadata().then(() => {

      expect(self.metadata.widgetExistsOnTarget(widgetJsPath)).toBeTruthy()
      done()
    })
  })

  it("should get Widget instance metadata from target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(widgetInstanceTemplatePath, {displayName: "Cart Summary Widget", version: 1})

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(widgetInstanceTemplatePath, constants.widgetInstanceMetadataJson).then(metadata => {

        expect(metadata.repositoryId).toBe("wid1234")
        expect(metadata.descriptorRepositoryId).toBe("cswiRepo0001")
        expect(self.logger.info).toHaveBeenCalledWith('matchingWidgetInstanceFound', {path: widgetInstanceTemplatePath})

        done()
      }))
  })

  it("should tell you when it cannot get Widget instance metadata from target server in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(otherWidgetInstanceTemplatePath, {displayName: "Not Cart Summary Widget", version: 1})

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(otherWidgetInstanceTemplatePath, constants.widgetInstanceMetadataJson).then(metadata => {

        expect(metadata).toBeNull()
        expect(self.logger.warn).toHaveBeenCalledWith('noMatchingWidgetInstanceFound', {path: otherWidgetInstanceTemplatePath})

        done()
      }))
  })

  it("should tell you when it cannot get Widget instance metadata from target server in transfer mode", (done) => {

    self.utils.splitFromBaseDir.returns(["", otherWidgetInstanceTemplatePath])

    self.metadata.initializeMetadata().then(() => {

      const metadata = self.metadata.readMetadataFromDisk(otherWidgetInstanceTemplatePath, constants.widgetInstanceMetadataJson)
      expect(metadata).toBeNull()

      done()
    })
  })

  it("should return config metadata from disk in transfer mode", (done) => {

    self.metadata.inTransferMode(true)

    mockDiskMetadataAs(otherWidgetInstanceTemplatePath, {
      "node": "http://localhost:9080",
      "commerceCloudVersion": "SNAPSHOT-RELEASE",
      "packageVersion": "1.0.1"
    })

    self.metadata.initializeMetadata().then(() =>
      self.metadata.readMetadata(otherWidgetInstanceTemplatePath, constants.configMetadataJson)).then(metadata => {

      expect(metadata.commerceCloudVersion).toEqual("SNAPSHOT-RELEASE")

      done()
    })
  })

  it("should detect if a widget type is already used in the metadata", () => {

    const widgetType = "cartSummaryWidget"

    self.utils.readJsonFile.returns({widgetType})

    self.utils.walkDirectory.and.callFake((path, config) => {
      expect(path).toEqual(".ccc/widget")
      config.listeners.file(".ccc/widget/Cart Summary Widget", {name: constants.widgetMetadataJson}, () => {
      })
    })

    expect(self.metadata.widgetTypeExists(widgetType)).toBeTruthy()
  })

  it("should let us update existing metadata", () => {

    mockDiskMetadataAs(widgetJsPath, {displayName: "Cart Summary", version: 1})

    self.metadata.updateMetadata(widgetJsPath, constants.widgetMetadataJson, {displayName: "Old Cart Summary"})

    expect(self.utils.writeFile).toHaveBeenCalledWith("/.ccc/widget/Cart Summary/widget.json", '{\n  "displayName": "Old Cart Summary",\n  "version": 1\n}')
  })
})
