/**
 * @fileoverview footer Widget.
 * 
 */
define(
  //-------------------------------------------------------------------
  // DEPENDENCIES
  //-------------------------------------------------------------------
  ['knockout', 'pubsub'],
    
  //-------------------------------------------------------------------
  // MODULE DEFINITION
  //-------------------------------------------------------------------
  function (ko, pubsub) {
  
    "use strict";
        
    return {
      
      onLoad: function(widget) {        
        widget.alertButton = function(){
          alert("Dinho-widget1.");
        },
        widget.name = ko.observable("dinho-widget1");
      },
    };
  }
);
