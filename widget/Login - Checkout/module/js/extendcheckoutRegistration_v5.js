/**
 * @fileoverview extendcheckoutRegistration_v5.js.
 *
 * @author Orlando Neto
 */
define(
  //---------------------
  // DEPENDENCIES
  //---------------------
  [],

  //-----------------------
  // MODULE DEFINITION
  //-----------------------
  function () {
 
    "use strict";
    return {
 
      onLoad: function(widget) {
        console.log('extendcheckoutRegistration_v5.js onLoad');
      }, 
      
      beforeAppear: function() {
        console.log('extendcheckoutRegistration_v5.js before appear');
      }
    };
  }
);