const mockery = require('./mockery')
const mockCommander = require('./commanderMockery').mockCommander

describe("main", () => {

  const self = this

  beforeEach(() => {

    mockery.use(jasmine.createSpy)

    self.commander = mockCommander(jasmine)

    mockery.mockModules(self, "../logger",
      "../endPointTransceiver", "../exitHandler", "../i18n", "../metadata",
      "../optionsUtils", "../utils", "../widgetCreator", '../../package.json')

    self.endPointTransceiver.init.returnsPromise()

    self.optionsUtils.addCommonOptions.returnsFirstArg()
    self.optionsUtils.getPassword.returns("admin")
    self.optionsUtils.getApplicationKey.returnsFirstArg()

    self.exitHandler.addExitHandler.returnsFirstArg()

    self.mainModule = mockery.require("../ccwMain")
  })

  afterEach(mockery.stopAll)

  it("should let you create new widgets", done => {

    self.commander.createWidget = true

    self.mainModule.main().then(() => {

      expect(self.endPointTransceiver.init).toHaveBeenCalledWith("http://somehost:8090", "admin", "admin", undefined, undefined, true)
      expect(self.widgetCreator.create).toHaveBeenCalledWith(false)
      done()
    })
  })

  it("should stop you calling it with no arguments", () => {

    self.mainModule.main()

    expect(self.exitHandler.exitDueToInvalidCall).toHaveBeenCalledWith(self.commander)
  })

  it("should use the last node if none was supplied", () => {

    delete self.commander.node
    self.commander.createWidget = true

    self.mainModule.main()

    expect(self.metadata.getLastNode).toHaveBeenCalled()
  })
})
