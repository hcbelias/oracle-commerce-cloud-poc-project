const constants = require('../constants').constants
const matchers = require('./matchers')
const mockery = require('./mockery')

describe("Stack Putter", () => {

  const self = this

  const stackInstanceLessPath = "stack/Progress Tracker/instances/Progress Tracker/stack.less"
  const stackInstanceTemplatePath = "stack/Progress Tracker/instances/Progress Tracker/stack.template"
  const stackVariablesInstancePath = "stack/Progress Tracker/instances/Progress Tracker/stack-variables.less"

  beforeEach(() => {

    mockery.use(jasmine.createSpy)
    matchers.add(jasmine)

    self.endPointTransceiver = mockery.mockModule('../endPointTransceiver', "updateStackLess", "updateStackLessVars", "updateStackSourceCode")

    mockery.mockModules(self, '../putterUtils', '../utils', '../metadata', '../logger')

    self.metadata.readMetadata.returnsPromise(
      {
        repositoryId: "stackInstanceRepositoryId",
        etag: "STACK_ETAG"
      })

    self.stackPutter = mockery.require("../stackPutter")
  })

  afterEach(mockery.stopAll)

  it("should stop you if the server does not support the right endpoints", () => {

    self.endPointTransceiver.serverSupports.returnsFalse()

    self.stackPutter.putStackInstanceLess(stackInstanceLessPath)

    expect(self.logger.warn).toHaveBeenCalledWith('stacksCannotBeSent', {path: stackInstanceLessPath})
  })

  it("should warn you if there is no metadata", (done) => {

    self.endPointTransceiver.serverSupports.returnsTrue()

    self.metadata.readMetadata.returnsPromise(null)

    self.stackPutter.putStackInstanceLess(stackInstanceLessPath).then(() => {

      expect(self.logger.warn).toHaveBeenCalledWith('cannotUpdateStack', {path: stackInstanceLessPath})
      done()
    })
  })

  it("should let you send the stack less file", (done) => {

    self.endPointTransceiver.serverSupports.returnsTrue()
    const results = self.endPointTransceiver.updateStackLess.returnsPromise({})

    self.stackPutter.putStackInstanceLess(stackInstanceLessPath).then(() => {

      expect(self.endPointTransceiver.updateStackLess).urlKeysWere(["stackInstanceRepositoryId"])
      expect(self.endPointTransceiver.updateStackLess).pathWas(stackInstanceLessPath)
      expect(self.endPointTransceiver.updateStackLess).fieldWas("source")
      expect(self.endPointTransceiver.updateStackLess).etagWas("STACK_ETAG")

      expect(self.putterUtils.processPutResultAndEtag).toHaveBeenCalledWith(stackInstanceLessPath, results)

      done()
    })
  })

  it("should let you send the stack template", (done) => {

    self.endPointTransceiver.serverSupports.returnsTrue()
    const results = self.endPointTransceiver.updateStackSourceCode.returnsPromise({})

    self.stackPutter.putStackInstanceTemplate(stackInstanceTemplatePath).then(() => {

      expect(self.endPointTransceiver.updateStackSourceCode).urlKeysWere(["stackInstanceRepositoryId"])
      expect(self.endPointTransceiver.updateStackSourceCode).pathWas(stackInstanceTemplatePath)
      expect(self.endPointTransceiver.updateStackSourceCode).fieldWas("source")
      expect(self.endPointTransceiver.updateStackSourceCode).etagWas("STACK_ETAG")

      expect(self.putterUtils.processPutResultAndEtag).toHaveBeenCalledWith(stackInstanceTemplatePath, results)

      done()
    })
  })

  it("should let you send the stack variables", (done) => {

    self.endPointTransceiver.serverSupports.returnsTrue()
    const results = self.endPointTransceiver.updateStackLessVars.returnsPromise({})

    self.stackPutter.putStackInstanceLessVariables(stackVariablesInstancePath).then(() => {

      expect(self.endPointTransceiver.updateStackLessVars).urlKeysWere(["stackInstanceRepositoryId"])
      expect(self.endPointTransceiver.updateStackLessVars).pathWas(stackVariablesInstancePath)
      expect(self.endPointTransceiver.updateStackLessVars).fieldWas("source")
      expect(self.endPointTransceiver.updateStackLessVars).etagWas("STACK_ETAG")

      expect(self.putterUtils.processPutResultAndEtag).toHaveBeenCalledWith(stackVariablesInstancePath, results)

      done()
    })
  })
})
