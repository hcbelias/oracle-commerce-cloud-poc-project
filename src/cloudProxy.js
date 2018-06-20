"use strict"

const constants = require("./constants").constants
const info = require('./logger').info
const exists = require('./utils').exists
const readFile = require('./utils').readFile
const buildLocalDataMaps = require('./proxyInterceptors').buildLocalDataMaps
const doSourceMediaSubstitution = require('./proxyInterceptors').doSourceMediaSubstitution
const doJavascriptFileSubstitution = require('./proxyInterceptors').doJavascriptFileSubstitution
const doTemplateSubstitution = require('./proxyInterceptors').doPageTemplateSubstitution
const doStorefrontCssSubstitution = require('./proxyInterceptors').doStorefrontCssSubstitution
const doTextSnippetSubstitution = require('./proxyInterceptors').doTextSnippetSubstitution

const fs   = require('fs')
const hoxy = require('hoxy')

/**
 * Start the Cloud Developer Proxy and register a set of rules to
 * intercept requests to the current node and replace /file/ requests to
 * equivalent local versions stored under basePath.
 */
exports.startProxyDaemon = function (node, port) {
  // Build maps of Widget/Element resources to filesystem paths.
  buildLocalDataMaps()

  const keyFile = `${constants.trackingDir}/ccproxy-root-ca.key.pem`
  const certFile = `${constants.trackingDir}/ccproxy-private-root-ca.crt.pem`
  let options = {}

  console.info(keyFile)

  if (exists(keyFile) && exists(certFile)) {
    options['certAuthority'] = {
      key: readFile(keyFile),
      cert: readFile(certFile)
    }
  }

  console.info(options)

  const proxy = hoxy.createServer(options).listen(port, function () {
    info('proxyListeningMessage', {node, port})
  })

  proxy.log('error warn debug', process.stderr);
  proxy.log('info', process.stdout);

  // Intercept rule for Javascript Files.
  proxy.intercept({
    method: 'GET',
    phase: 'response',

    // only intercept js pages
    fullUrl: `${node}/file/*`,
    mimeType: 'application/javascript',

    // expose the response body as a big string
    as: 'string'
  },  doJavascriptFileSubstitution)

  proxy.intercept({
    method: 'GET',
    phase: 'response',

    // only intercept html templates
    fullUrl: `${node}/file/*`,
    mimeType: 'text/html',

    // expose the response body as a big string
    as: 'string'
  },  doSourceMediaSubstitution)

  // Intercept rule for Storefront CSS.
  proxy.intercept({
    method: 'GET',
    phase: 'response',

    // Intercept the storefront css request.
    fullUrl: `${node}*/css/${constants.storefrontCss}`,
    mimeType: 'text/css',
    as: 'string'
  }, doStorefrontCssSubstitution)

  // Intercept rule for Templates (Modifies Page response in place).
  proxy.intercept({
    method: 'GET',
    phase: 'response',

    // Intercept the page requests as json data.
    fullUrl: `${node}/ccstoreui/v1/pages/layout/:id*`,
    mimeType: 'application/json',
    as: 'json'
  }, doTemplateSubstitution)

  // Intercept common.json to substitute text snippets.
  proxy.intercept({
    method: 'GET',
    phase: 'response',

    // Intercept strings as json data.
    fullUrl: `${node}/ccstoreui/v1/resources/ns.common*`,
    mimeType: 'application/json',
    as: 'json'
  }, doTextSnippetSubstitution)
}
