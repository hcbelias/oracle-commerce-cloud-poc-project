"use strict"

const constants = require("./constants").constants
const exists = require("./utils").exists
const invalidCharacters = require("./wizardUtils").invalidCharacters
const pose = require("./wizardUtils").pose
const stringTooLong = require("./wizardUtils").stringTooLong
const t = require("./i18n").t

let alreadyExists

const questions = [
  {
    name : "widgetName",
    type : "input",
    message : t("enterWidgetNameText"),
    validate : widgetName => {

      if (!widgetName.length) {
        return t("enterWidgetNameText")
      }

      if (stringTooLong(widgetName)) {
        return t("stringTooLong")
      }

      if (invalidCharacters(widgetName)) {
        return t("stringHasInvalidCharacters")
      }

      if (alreadyExists(widgetName)) {
        return t("widgetAlreadyExists", {widgetName})
      }

      return true
    }
  },
  {
    name : "global",
    type : "i18nConfirm",
    message : t("selectGlobalText"),
    default : false
  },
  {
    name : "i18n",
    type : "i18nConfirm",
    message : t("selectI18n"),
    default : false
  },
  {
    name : "configurable",
    type : "i18nConfirm",
    message : t("selectConfigurable"),
    default : false
  },
  {
    name : "withHelpText",
    type : "i18nConfirm",
    message : t("selectWithHelpText"),
    default : true
  },
  {
    name : "syncWithServer",
    type : "i18nConfirm",
    message : t("syncWithServerHelpText"),
    default : true
  }
]

/**
 * Entry point for the widget creation wizard.
 * @param clean
 */
exports.prompt = function (clean) {

  // Note that we need to clean the disk first - this will switch off validation.
  alreadyExists = clean ? () => false : value => exists(`${constants.widgetsDir}/${value}`)

  // Kick off the wizard, passing our list of questions.
  return pose("createWidgetText", questions)
}
