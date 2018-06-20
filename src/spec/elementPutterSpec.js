const constants = require('../constants').constants
const matchers = require('./matchers')
const mockery = require('./mockery')

describe("Element Putter", () => {

  const self = this

  const elementJsPath = "element/Contact Login (for Managed Accounts)/element.js"
  const elementTemplatePath = "element/Contact Login (for Managed Accounts)/element.template"
  const widgetElementJsPath = "widget/Cart Shipping/element/Shipping Address/element.js"
  const widgetElementTemplatePath = "widget/Cart Shipping/element/Shipping Address/element.template"

  beforeEach(() => {

    mockery.use(jasmine.createSpy)
    matchers.add(jasmine)

    self.endPointTransceiver = mockery.mockModule('../endPointTransceiver',
      "updateGlobalElementTemplate", "updateGlobalElementJavaScript",
      "updateFragmentTemplate", "updateFragmentJavaScript")

    mockery.mockModules(self, '../utils', '../metadata', '../putterUtils', '../logger')

    self.elementPutter = mockery.require("../elementPutter")
  })

  afterEach(mockery.stopAll)

  it("should stop you if the server does not support the right endpoints", () => {

    self.endPointTransceiver.serverSupports.returnsFalse()

    self.elementPutter.putGlobalElementJavaScript(elementJsPath)

    expect(self.logger.warn).toHaveBeenCalledWith('elementsCannotBeSent', {path: elementJsPath})
  })

  /**
   * Put the boilerplate in one place.
   */
  function fakeMetadataAndEndpointSupport() {

    self.endPointTransceiver.serverSupports.returnsTrue()

    self.metadata.readMetadata.returnsPromise(
      {
        tag: "my-element-tag",
        etag: "BIG_ELEMENT_ETAG"
      })
  }

  it("should let you put global element JavaScript on the server", (done) => {

    fakeMetadataAndEndpointSupport()
    self.utils.readFile.returns("some javascript")
    const response = self.endPointTransceiver.updateGlobalElementJavaScript.returnsPromise({})

    self.elementPutter.putGlobalElementJavaScript(elementJsPath).then(() => {

      expect(self.endPointTransceiver.updateGlobalElementJavaScript).urlKeysWere(["my-element-tag"])
      expect(self.endPointTransceiver.updateGlobalElementJavaScript).etagWas("BIG_ELEMENT_ETAG")
      expect(self.endPointTransceiver.updateGlobalElementJavaScript).bodyWas({code: {javascript: 'some javascript'}})

      expect(self.putterUtils.processPutResultAndEtag).toHaveBeenCalledWith(elementJsPath, response)
      done()
    })
  })

  it("should let you put global element templates on the server", (done) => {

    fakeMetadataAndEndpointSupport()
    self.utils.readFile.returns("some template")
    const response = self.endPointTransceiver.updateGlobalElementTemplate.returnsPromise({})

    self.elementPutter.putGlobalElementTemplate(elementTemplatePath).then(() => {

      expect(self.endPointTransceiver.updateGlobalElementTemplate).urlKeysWere(["my-element-tag"])
      expect(self.endPointTransceiver.updateGlobalElementTemplate).etagWas("BIG_ELEMENT_ETAG")
      expect(self.endPointTransceiver.updateGlobalElementTemplate).bodyWas({code: {template: 'some template'}})

      expect(self.putterUtils.processPutResultAndEtag).toHaveBeenCalledWith(elementTemplatePath, response)
      done()
    })
  })

  it("should tell you when it cant put global element templates on the server as there is no metadata", (done) => {

    self.endPointTransceiver.serverSupports.returnsTrue()
    self.metadata.readMetadata.returnsPromise(null)

    self.elementPutter.putGlobalElementTemplate(elementTemplatePath).then(() => {

      expect(self.logger.warn).toHaveBeenCalledWith('cannotUpdateElement', {path: elementTemplatePath})
      done()
    })
  })

  it("should let you put widget element templates on the server", (done) => {

    self.endPointTransceiver.serverSupports.returnsTrue()

    self.metadata.readMetadata.returnsPromise(
      {
        tag: "my-element-tag",
        etag: "BIG_ELEMENT_ETAG",
        widgetId: "my-widget-id"
      })

    self.utils.readFile.returns("some javascript")

    const response = self.endPointTransceiver.updateFragmentJavaScript.returnsPromise({})

    self.elementPutter.putElementJavaScript(widgetElementJsPath).then(() => {

      expect(self.endPointTransceiver.updateFragmentJavaScript).urlKeysWere(["my-widget-id", "my-element-tag"])
      expect(self.endPointTransceiver.updateFragmentJavaScript).etagWas("BIG_ELEMENT_ETAG")
      expect(self.endPointTransceiver.updateFragmentJavaScript).bodyWas({code: {javascript: 'some javascript'}})

      expect(self.putterUtils.processPutResultAndEtag).toHaveBeenCalledWith(widgetElementJsPath, response)
      done()
    })
  })

  it("should let you put widget element javascript on the server", (done) => {

    self.endPointTransceiver.serverSupports.returnsTrue()

    self.metadata.readMetadata.returnsPromise(
      {
        tag: "my-element-tag",
        etag: "BIG_ELEMENT_ETAG",
        widgetId: "my-widget-id"
      })

    self.utils.readFile.returns("some template")

    const response = self.endPointTransceiver.updateFragmentTemplate.returnsPromise({})

    self.elementPutter.putElementTemplate(widgetElementTemplatePath).then(() => {

      expect(self.endPointTransceiver.updateFragmentTemplate).urlKeysWere(["my-widget-id", "my-element-tag"])
      expect(self.endPointTransceiver.updateFragmentTemplate).etagWas("BIG_ELEMENT_ETAG")
      expect(self.endPointTransceiver.updateFragmentTemplate).bodyWas({code: {template: 'some template'}})

      expect(self.putterUtils.processPutResultAndEtag).toHaveBeenCalledWith(widgetElementTemplatePath, response)
      done()
    })
  })
})
