'use strict';

var shien = require('shien'),
    ObjectId = require('mongodb').ObjectID;

module.exports = new function () {

    var proto = this,
        types = {};

    proto.types = [ 'String', 'Number', 'Boolean', 'Date', 'Mixed', 'ObjectId', 'Array' ];

    function define(name, opts) {
        if (!Array.isArray(opts.alternativeNames)) {
            opts.alternativeNames = [];
        }

        opts.customType = {};
        shien.assign(opts.customType, opts.addons);

        proto[name] = opts.type;
        proto['Custom' + name] = opts.customType;

        types[name] = opts;
    }

    define('String', {
        type: String,
        alternativeNames: [ 'string' ],
        addons: {
            filter: function (v) {
                return String(v);
            }
        }
    });

    define('Number', {
        type: Number,
        alternativeNames: [ 'number', 'num' ],
        addons: {
            filter: function (v) {
                return Number(v);
            },
            validate: function (v) {
                if (typeof v === 'undefined') {
                    return;
                }
                if (typeof v !== 'number' || !isFinite(v)) {
                    return new Error('{field} is not a valid number.');
                }
            }
        }
    });

    define('Boolean', {
        type: Boolean,
        alternativeNames: [ 'boolean', 'bool' ],
        addons: {
            filter: function (v) {
                return !!v;
            }
        }
    });

    define('Date', {
        type: Date,
        alternativeNames: [ 'date' ]
    });

    define('Mixed', {
        type: function Mixed() {},
        alternativeNames: [ 'mixed' ]
    });

    define('ObjectId', {
        type: ObjectId,
        alternativeNames: [ 'object_id', 'id' ]
    });

    define('Array', {
        type: Array,
        addons: {
            validate: function (v) {
                if (typeof v !== 'undefined' && !Array.isArray(v)) {
                    return new Error('{field} is not a valid array.');
                }
            }
        }
    });

    this.get = function (id) {
        if (Array.isArray(id)) {
            return types.Array.customType;
        }

        for (var i = 0, len = proto.types.length; i < len; i++) {
            var typeName = proto.types[i],
                t = types[typeName];

            if (id === typeName || id === t.type || t.alternativeNames.indexOf(id) >= 0) {
                return t.customType;
            }
        }

        return false;
    };

};
