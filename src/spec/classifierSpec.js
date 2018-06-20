const mockery = require('./mockery')

const PuttingFileType = require("../puttingFileType").PuttingFileType

describe("Classifier", () => {

  const self = this

  beforeEach(() => {

    mockery.use(jasmine.createSpy)

    mockery.mockModules(self, '../utils', '../logger')

    self.classifier = mockery.require("../classifier")
  })

  afterEach(mockery.stopAll)

  it("should be able to classify paths", () => {

    self.utils.splitFromBaseDir.returns([null, "global/myLittle.js"])

    expect(self.classifier.classify("global/myLittle.js").name).toEqual(PuttingFileType.APPLICATION_LEVEL_JAVASCRIPT.name)

    self.utils.splitFromBaseDir.returns([null, ""])
    self.utils.isDirectory.returns(true)

    expect(self.classifier.classify("widget/Cart Summary/instances/Cart Summary Widget/display.template").name).toBe(PuttingFileType.WIDGET_INSTANCE_TEMPLATE.name)
    expect(self.classifier.classify("widget/Cart Summary/instances/Cart Summary Widget/widget.less").name).toBe(PuttingFileType.WIDGET_INSTANCE_LESS.name)
    expect(self.classifier.classify("widget/Cart Summary/instances/Cart Summary Widget/locales/en/ns.checkoutcartsummary.json").name).toBe(PuttingFileType.WIDGET_INSTANCE_SNIPPETS.name)
    expect(self.classifier.classify("widget/Quote Widget with multiple JavaScript files/js/quote-tester.js").name).toBe(PuttingFileType.WIDGET_JAVASCRIPT.name)
    expect(self.classifier.classify("/Users/BMorrow/GIT-NEW/cloud-commerce/commerce/tools/CommerceCloudConnect/widget/VCS QUOTE widget with - dashes test/js/quote-tester.js").name).toBe(PuttingFileType.WIDGET_JAVASCRIPT.name)
    expect(self.classifier.classify("widget/Cart Summary/display.template").name).toBe(PuttingFileType.WIDGET_BASE_TEMPLATE.name)
    expect(self.classifier.classify("widget/Cart Summary/widget.less").name).toBe(PuttingFileType.WIDGET_BASE_LESS.name)
    expect(self.classifier.classify("widget/Cart Summary/locales/en/ns.checkoutcartsummary.json").name).toBe(PuttingFileType.WIDGET_BASE_SNIPPETS.name)
    expect(self.classifier.classify("widget/Cart Summary/config/locales/en.json").name).toBe(PuttingFileType.WIDGET_CONFIG_SNIPPETS.name)
    expect(self.classifier.classify("widget/Cart Summary/config/configMetadata.json").name).toBe(PuttingFileType.WIDGET_CONFIG_JSON.name)
    expect(self.classifier.classify("widget/Cart Summary/instances/Cart Summary Widget").name).toBe(PuttingFileType.WIDGET_INSTANCE.name)
    expect(self.classifier.classify("widget/Cart Summary").name).toBe(PuttingFileType.WIDGET.name)
    expect(self.classifier.classify("widget/CCW Test Widget/widgetMetadata.json").name).toBe(PuttingFileType.WIDGET_METADATA_JSON.name)
    expect(self.classifier.classify("widget/Cart Summary/instances/Cart Summary Widget/widgetInstanceMetadata.json").name).toBe(PuttingFileType.WIDGET_INSTANCE_METADATA_JSON.name)

    self.utils.splitFromBaseDir.returns([null, "element/Company Logo/element.template"])

    expect(self.classifier.classify("element/Company Logo/element.template").name).toBe(PuttingFileType.GLOBAL_ELEMENT_TEMPLATE.name)
    expect(self.classifier.classify("element/Company Logo/element.js").name).toBe(PuttingFileType.GLOBAL_ELEMENT_JAVASCRIPT.name)

    self.utils.splitFromBaseDir.returns([null, ""])

    expect(self.classifier.classify("element/Contact Login (for Managed Accounts)/element.template").name).toBe(PuttingFileType.ELEMENT_TEMPLATE.name)
    expect(self.classifier.classify("element/Contact Login (for Managed Accounts)/element.js").name).toBe(PuttingFileType.ELEMENT_JAVASCRIPT.name)
    expect(self.classifier.classify("theme/Dark Theme/styles.less").name).toBe(PuttingFileType.THEME_STYLES.name)
    expect(self.classifier.classify("theme/Dark Theme/additionalStyles.less").name).toBe(PuttingFileType.THEME_ADDITIONAL_STYLES.name)
    expect(self.classifier.classify("stack/Progress Tracker/instances/Progress Tracker/stack-variables.less").name).toBe(PuttingFileType.STACK_INSTANCE_VARIABLES_LESS.name)
    expect(self.classifier.classify("stack/Progress Tracker/instances/Progress Tracker/stack.template").name).toBe(PuttingFileType.STACK_INSTANCE_TEMPLATE.name)
    expect(self.classifier.classify("theme/Dark Theme/variables.less").name).toBe(PuttingFileType.THEME_VARIABLES.name)
    expect(self.classifier.classify("snippets/en/snippets.json").name).toBe(PuttingFileType.GLOBAL_SNIPPETS.name)
    expect(self.classifier.classify("stack/Progress Tracker/instances/Progress Tracker/stack.less").name).toBe(PuttingFileType.STACK_INSTANCE_LESS.name)
    expect(self.classifier.classify("theme").name).toBe(PuttingFileType.THEME.name)
    expect(self.classifier.classify("theme/Fred").name).toBe(PuttingFileType.THEME.name)
    expect(self.classifier.classify("/Users/BMorrow/GIT-NEW/cloud-commerce/commerce/tools/CommerceCloudConnect/theme/Fred").name).toBe(PuttingFileType.THEME.name)
    expect(self.classifier.classify("widget/Web Content/instances/About Us Web Content Widget/content.template").name).toBe(PuttingFileType.WEB_CONTENT_TEMPLATE.name)
  })

  it("should tell the user about strange paths", () => {

    self.utils.splitFromBaseDir.returns([null, ""])

    expect(self.classifier.classify("silly")).toBeFalsy()
  })
})
