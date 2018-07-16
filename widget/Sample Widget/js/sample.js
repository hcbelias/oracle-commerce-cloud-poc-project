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
        widget.helloWorld = function(){
          alert("Ivan Sample");
        }
      },    
      
    };
  }
);
