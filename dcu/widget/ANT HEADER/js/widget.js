define(
    ['jquery', 'knockout'],
    function($, ko) {
       'use strict';
        var SOME_CONSTANT = 1024;
        var privateMethod = function () {
         // ...
        };

        return {
            hello: ko.observable("Hello World 222!")
        }
});
  