'use strict';

var shien = require('shien');

module.exports = new function () {

    this.validateRequired = function (v) {
        if (typeof v === 'undefined' || v === null) {
            return new Error('{field} is required.');
        }
    };

    this.validateEnum = function (e, trans, v) {
        if (typeof v !== 'undefined' && e.indexOf(v) < 0) {
            var te = (typeof trans === 'function' ? e.map(trans) : e),
                values = '`' + te.join('`, `') + '`',
                msg = shien.format('{field} must be one of those values: ' +
                    '{values} (without the quotes).', { values: values });
            return new Error(msg);
        }
    };

};
