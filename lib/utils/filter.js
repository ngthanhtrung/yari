'use strict';

module.exports = new function () {

    this.trim = function (v) {
        return v;
    };

    this.lowercase = function (v) {
        return (typeof v === 'string' ? v.toLowerCase() : v);
    };

};
