const Promise = require("bluebird")

const mockery = require('./mockery')

describe("Exit Handler", () => {

  const self = this

  beforeEach(() => {

    mockery.use(jasmine.createSpy)

    process.exit = jasmine.createSpy("exit")

    mockery.mockModules(self, '../logger')

    self.exitHandler = require("../exitHandler")
  })

  afterEach(mockery.stopAll)

  it("should not set the exit code if everything is OK", done => {

    self.exitHandler.addExitHandler(Promise.method(() => null)()).then(() => {

      expect(process.exit).not.toHaveBeenCalledWith(1)
      done()
    })
  })

  it("should set the exit code if an exception is thrown", done => {

    self.exitHandler.addExitHandler(Promise.method(() => {
      throw "Boom"
    })()).then(() => {

      expect(process.exit).toHaveBeenCalledWith(1)
      done()
    })
  })

  it("should set the exit code if an exception is thrown", () => {

    const program = {
      outputHelp : jasmine.createSpy("outputHelp")
    }

    self.exitHandler.exitDueToInvalidCall(program)

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(program.outputHelp).toHaveBeenCalled()
  })
})
