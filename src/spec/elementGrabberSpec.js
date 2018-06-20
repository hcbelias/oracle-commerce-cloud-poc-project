const constants = require('../constants').constants
const mockery = require('./mockery')

describe("Element Grabber", () => {

  const self = this

  beforeEach(() => {

    mockery.use(jasmine.createSpy)

    self.endPointTransceiver = mockery.mockModule('../endPointTransceiver',
      "getFragmentTemplate", "getFragmentJavaScript", "getElements", "grabGlobalElements",
      "listWidgets", "getWidget", "getGlobalElementJavaScript", "getGlobalElementTemplate")

    mockery.mockModules(self, '../utils', '../metadata', '../grabberUtils', '../logger', '../widgetGrabber')

    self.elementGrabber = mockery.require("../elementGrabber")
  })

  afterEach(mockery.stopAll)

  it("should warn you if the server does not support the right endpoints", () => {

    self.endPointTransceiver.serverSupports.returnsFalse()

    self.elementGrabber.grabAllElements()

    expect(self.logger.warn).toHaveBeenCalledWith("elementsCannotBeGrabbed")
  })

  it("should warn you if the server does not support global element endpoints", (done) => {

    self.endPointTransceiver.serverSupports.and.callFake((name) => name != "getElements")

    mockWidgetElementResponses()

    self.elementGrabber.grabAllElements().then(() => {

      expect(self.logger.warn).toHaveBeenCalledWith("globalElementsCannotBeGrabbed")
      done()
    })
  })

  /**
   * About four of the endpoints have very similar responses so this function is used to reduce boilerplate.
   * @param spy
   * @param field
   * @param text
   */
  function mockCodeResponse(spy, field, text) {

    var data = {
      code: {}
    }

    data.code[field] = text

    spy.returnsResponse(data, `${text} etag`)
  }

  /**
   * The boilerplate for widget elements is used in more than one place hence its inclusion here.
   */
  function mockWidgetElementResponses() {

    self.endPointTransceiver.listWidgets.returnsItems(
      {
        repositoryId: "repo0002",
        descriptor: {
          displayName: "My Widget",
          jsEditable: true,
          editableWidget: true,
          repositoryId: "repo0001",
          version: 1
        }
      })

    self.endPointTransceiver.getWidget.returnsResponse(
      {
        fragments: [
          {
            tag: "jim",
            type: "elementType",
            title: "Jim"
          }
        ]
      })

    mockCodeResponse(self.endPointTransceiver.getFragmentJavaScript, "javascript", "some widget fragment javascript")
    mockCodeResponse(self.endPointTransceiver.getFragmentTemplate, "template", "some widget fragment template")

    self.utils.sanitizeName.returnsFirstArg()

    self.widgetGrabber.getDirectoryForWidget.returns('widget/My Widget')
  }

  it("should let you grab all Elements", (done) => {

    self.endPointTransceiver.serverSupports.returnsTrue()

    self.endPointTransceiver.getElements.returnsItems(
      {
        tag: "fred",
        type: "elementType",
        title: "Fred"
      })

    mockCodeResponse(self.endPointTransceiver.getGlobalElementJavaScript, "javascript", "some global javascript")
    mockCodeResponse(self.endPointTransceiver.getGlobalElementTemplate, "template", "some global template")

    mockWidgetElementResponses()

    self.elementGrabber.grabAllElements().then(
      () => {

        expect(self.endPointTransceiver.getFragmentTemplate).toHaveBeenCalledWith(["repo0001", "jim"])
        expect(self.endPointTransceiver.getFragmentJavaScript).toHaveBeenCalledWith(["repo0001", "jim"])
        expect(self.endPointTransceiver.getElements).toHaveBeenCalledWith("?globals=true")
        expect(self.endPointTransceiver.getWidget).toHaveBeenCalledWith(["repo0002"])
        expect(self.endPointTransceiver.getGlobalElementJavaScript).toHaveBeenCalledWith(["fred"])
        expect(self.endPointTransceiver.getGlobalElementTemplate).toHaveBeenCalledWith(["fred"])

        expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith(constants.elementsDir)
        expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith("element/Fred")
        expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith("widget/My Widget/element")
        expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith("widget/My Widget/element/Jim")

        expect(self.logger.info).toHaveBeenCalledWith('grabbingElement', {name: 'Fred'})
        expect(self.logger.info).toHaveBeenCalledWith('grabbingElement', {name: 'Jim'})

        expect(self.grabberUtils.writeFileAndETag).toHaveBeenCalledWith('element/Fred/element.js', 'some global javascript', 'some global javascript etag')
        expect(self.grabberUtils.writeFileAndETag).toHaveBeenCalledWith('element/Fred/element.template', 'some global template', 'some global template etag')
        expect(self.grabberUtils.writeFileAndETag).toHaveBeenCalledWith('widget/My Widget/element/Jim/element.template', 'some widget fragment template', 'some widget fragment template etag')
        expect(self.grabberUtils.writeFileAndETag).toHaveBeenCalledWith('widget/My Widget/element/Jim/element.js', 'some widget fragment javascript', 'some widget fragment javascript etag')

        expect(self.metadata.writeMetadata).toHaveBeenCalledWith('element/Fred/element.json', {tag: 'fred'})
        expect(self.metadata.writeMetadata).toHaveBeenCalledWith('widget/My Widget/element/Jim/element.json', {
          tag: 'jim',
          widgetId: 'repo0001',
          version: 1
        })
        done()
      }
    )
  })
})
