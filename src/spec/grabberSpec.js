"use strict"

const constants = require('../constants').constants
const mockery = require('./mockery')

describe("Grabber", () => {

  const self = this

  beforeEach(() => {

    mockery.use(jasmine.createSpy)

    mockery.mockModules(self,
      '../utils', '../optionsUtils', '../logger', '../metadata',
      "../applicationJavaScriptGrabber", "../themeGrabber", "../textSnippetGrabber",
      "../stackGrabber", "../elementGrabber", "../widgetGrabber")

    self.applicationJavaScriptGrabber.grabAllApplicationJavaScript.returnsPromise({})
    self.themeGrabber.grabAllThemes.returnsPromise({})
    self.textSnippetGrabber.grabCommonTextSnippets.returnsPromise({})
    self.stackGrabber.grabAllStacks.returnsPromise({})
    self.elementGrabber.grabAllElements.returnsPromise({})
    self.widgetGrabber.grabAllWidgets.returnsPromise({})

    self.optionsUtils.checkMetadata.returnsTrue()

    self.grabber = mockery.require("../grabber")
  })

  afterEach(mockery.stopAll)

  const grabbers = () => [
    self.applicationJavaScriptGrabber.grabAllApplicationJavaScript,
    self.themeGrabber.grabAllThemes,
    self.textSnippetGrabber.grabCommonTextSnippets,
    self.stackGrabber.grabAllStacks,
    self.elementGrabber.grabAllElements,
    self.widgetGrabber.grabAllWidgets
  ]

  const directories = () => [
    constants.globalDir,
    constants.widgetsDir,
    constants.elementsDir,
    constants.stacksDir,
    constants.themesDir,
    constants.textSnippetsDir
  ]

  it("should let you grab everything", (done) => {

    self.utils.exists.returnsTrue()

    self.grabber.grab("http://localhost:8080", true).then(() => {

      grabbers().forEach(grabber => expect(grabber).toHaveBeenCalled())

      expect(self.utils.mkdirIfNotExists).toHaveBeenCalledWith(constants.trackingDir)

      expect(self.logger.info).toHaveBeenCalledWith("allDone")

      directories().forEach(directory =>
        expect(self.utils.exists).toHaveBeenCalledWith(directory) &&
        expect(self.utils.removeTree).toHaveBeenCalledWith(directory))

      done()
    })
  })
})
