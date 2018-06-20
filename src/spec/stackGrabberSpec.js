const constants = require("../constants").constants
const mockery = require("./mockery")

describe("Stack Grabber", () => {

  const self = this

  const stackDir = `${constants.stacksDir}/My Big Stack`
  const stackInstancesDir = `${stackDir}/instances`
  const myBigStackInstanceDir = `${stackInstancesDir}/My Big Stack Instance Display Name`

  beforeEach(() => {

    mockery.use(jasmine.createSpy)

    self.endPointTransceiver = mockery.mockModule("../endPointTransceiver", "getAllStackInstances")

    mockery.mockModules(self, "../utils", "../grabberUtils", "../metadata", "../logger")

    self.utils.sanitizeName.returnsFirstArg()

    self.stackGrabber = mockery.require("../stackGrabber")
  })

  afterEach(mockery.stopAll)

  it("should stop you if the server does not support the right endpoints", () => {

    self.endPointTransceiver.serverSupports.returnsFalse()

    self.stackGrabber.grabAllStacks()

    expect(self.logger.warn).toHaveBeenCalledWith("stacksCannotBeGrabbed")
  })

  it("should let you grab all Stacks", done => {

    self.endPointTransceiver.serverSupports.returnsTrue()

    self.endPointTransceiver.getAllStackInstances.returnsItems(
      {
        displayName : "My Big Stack",
        repositoryId : "myBigBaseStackId",
        stackType : "bigStack",
        version : 2,
        instances : [
          {
            displayName : "My Big Stack Instance Display Name",
            id : "myBigStackId"
          }
        ]
      })

    self.stackGrabber.grabAllStacks().then(() => {

      expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith(constants.stacksDir)
      expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith(stackDir)
      expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith(stackInstancesDir)
      expect(self.utils.makeTrackedDirectory).toHaveBeenCalledWith(myBigStackInstanceDir)

      expect(self.logger.info).toHaveBeenCalledWith("grabbingStack", {name : "My Big Stack"})

      expect(self.metadata.writeMetadata).toHaveBeenCalledWith(`${myBigStackInstanceDir}/stackInstance.json`,
        {repositoryId : "myBigStackId", displayName : "My Big Stack Instance Display Name"})

      expect(self.metadata.writeMetadata).toHaveBeenCalledWith(`${stackDir}/stack.json`,
        {repositoryId : "myBigBaseStackId", stackType : "bigStack", version : 2, displayName : "My Big Stack"})

      expect(self.grabberUtils.copyFieldContentsToFile).toHaveBeenCalledWith("getStackSourceCode", "myBigStackId", "source", `${myBigStackInstanceDir}/stack.template`)
      expect(self.grabberUtils.copyFieldContentsToFile).toHaveBeenCalledWith("getStackLessVars", "myBigStackId", "source", `${myBigStackInstanceDir}/stack-variables.less`)
      expect(self.grabberUtils.copyFieldContentsToFile).toHaveBeenCalledWith("getStackLess", "myBigStackId", "source", `${myBigStackInstanceDir}/stack.less`)
      done()
    })
  })

  it("should should ignore old stacks", done => {

    self.endPointTransceiver.serverSupports.returnsTrue()

    self.endPointTransceiver.getAllStackInstances.returnsItems(
      {
        displayName : "Multiple Version Stack",
        repositoryId : "multipleVersionBaseStackId",
        stackType : "multipleVersionStack",
        version : 1,
        instances : [
          {
            displayName : "Multiple Version Stack Instance Display Name",
            id : "multipleVersionInstanceStackId",
            descriptor : {
              version : 1
            }
          }
        ]
      })

    self.utils.exists.returnsTrue()

    self.metadata.readMetadataFromDisk.returns({version : 2})

    self.stackGrabber.grabAllStacks().then(() => {

      expect(self.metadata.writeMetadata).not.toHaveBeenCalledWith(`${myBigStackInstanceDir}/stackInstance.json`,
        {repositoryId : "multipleVersionInstanceStackId", displayName : "Multiple Version Stack Instance Display Name"})

      expect(self.grabberUtils.copyFieldContentsToFile).not.toHaveBeenCalled()

      done()
    })
  })
})
