"use strict"

const constants = require('../constants').constants
const mockery = require('./mockery')

describe("Promising Client", () => {

  const self = this

  let clientInstance

  beforeEach(() => {

    mockery.use(jasmine.createSpy)

    self.nodeRestClient = mockery.mockModule("node-rest-client")

    self.nodeRestClient.Client = function() {
      clientInstance = this
      clientInstance.get = jasmine.createSpy("get").and.callFake((url, args, callback) => {
        callback("some data", "some response")
      })
    }

    self.promisingClient = mockery.require("../promisingClient").makePromisingClient()
  })

  afterEach(mockery.stopAll)

  it("should create methods on the client", () => {

    expect(self.promisingClient.getAndPromise).toBeTruthy()
    expect(self.promisingClient.putAndPromise).toBeTruthy()
    expect(self.promisingClient.postAndPromise).toBeTruthy()
    expect(self.promisingClient.deleteAndPromise).toBeTruthy()
  })

  it("should wrap node-rest-client calls in promises", (done) => {

    self.promisingClient.getAndPromise("some url", "some params").then(
      () => {

        expect(clientInstance.get.calls.mostRecent().args[0]).toEqual("some url")
        expect(clientInstance.get.calls.mostRecent().args[1]).toEqual("some params")

        done()
      }
    )
  })
})
