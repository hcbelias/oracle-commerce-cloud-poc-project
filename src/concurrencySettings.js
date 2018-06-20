/**
 * Used to centrally control the level of concurrency when grabbing.
 */
exports.getAllowedConcurrency = (concurrency = 7) => ({concurrency})
