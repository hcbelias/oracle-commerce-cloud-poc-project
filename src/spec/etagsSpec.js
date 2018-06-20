"use strict"

const mockery = require('./mockery')

describe("etags", () => {

  const self = this

  beforeEach(() => {

    mockery.use(jasmine.createSpy)

    mockery.mockModules(self, "../utils", "fs", "path")

    console.log = jasmine.createSpy("log")

    self.etags = mockery.require("../etags")
  })

  afterEach(mockery.stopAll)

  it("should let you dump etags", () => {

    self.etags.dumpEtag(new Buffer("some text"))

    expect(console.log).toHaveBeenCalledWith("some text")
  })

  it("should let you write dummy etags", () => {

    self.etags.writeDummyEtag("/etag/path")

    expect(self.utils.writeFile).toHaveBeenCalledWith('.ccc//etag/path.etag', 'eyJ2ZXJzaW9uIjowLCJ1cmkiOiIvZXRhZy9wYXRoIiwiaGFzaCI6ImR1bW15In0=')
  })

  it("should let you reset etags", () => {

    self.etags.resetEtag("/etag/path")

    expect(self.utils.writeFile).toHaveBeenCalledWith('/etag/path', 'eyJ2ZXJzaW9uIjowLCJ1cmkiOiIvZXRhZy9wYXRoIiwiaGFzaCI6ImR1bW15In0=')
  })
})
