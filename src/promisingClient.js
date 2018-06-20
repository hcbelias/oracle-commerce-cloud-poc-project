const Promise = require("bluebird")
const Client = require("node-rest-client").Client

const warn = require("./logger").warn

// Set the default client configuration in case the users want to override it.
let defaultClientConfig

// See if the user wants to override request config.
try {
  defaultClientConfig = require("./userClientConfig")
} catch (e) {
  // This may fail so swallow this.
}

/**
 * Create the node-rest-client instance and augment it to work with Bluebird promises.
 * @param client
 */
exports.makePromisingClient = function () {

  // Create an instance of the basic node-rest-client first.
  const client = new Client(defaultClientConfig)

  // Walk through each of the HTTP verb methods.
  const methodNames = ["post", "get", "put", "delete"]
  methodNames.forEach(methodName => {

    // Create another version of the current function with returns a promise.
    client[methodName + "AndPromise"] = (url, args) => {

      return new Promise((resolve, reject) => {
        try {
          // Call the original function which needs a callback.
          client[methodName](url, args, (data, response) => {

            // Log anything that looks like an error.
            recordAnyErrors(url, data, response)

            // If get in here, it looks like the call has worked, treat self as success for promise purposes.
            resolve({data, response})
          })
        } catch (error) {
          // Something went wrong - break the promise.
          reject(error)
        }
      })
    }
  })

  return client
}

/**
 * Boilerplate for logging errors.
 * @param url
 * @param response
 * @param data
 */
function logAsWarning(url, response, data) {

  warn("unexpectedErrorSending",
    {
      path: url,
      statusCode: response.statusCode,
      errorCode: data.errorCode,
      message: data.message
    })
}

/**
 * Look at the response and data and log anything that looks funny.
 * @param url
 * @param data
 * @param response
 */
function recordAnyErrors(url, data, response) {

  // Ignore any optimistic locks.
  if (response.statusCode != 412) {

    // Check out the HTTP error code.
    if (response.statusCode < 200 || response.statusCode > 299) {

      logAsWarning(url, response, data);
    } else if (data.errorCode) {

      // HTTP code may be OK but call could still have gone wrong.
      logAsWarning(url, response, data);
    }
  }
}
