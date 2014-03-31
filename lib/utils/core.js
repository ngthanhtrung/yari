'use strict';

var inflection = require('inflection');

module.exports =  new function () {

    function translate(obj, term) {
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop) && term === obj[prop][0]) {
                return obj[prop][1];
            }
        }
    }

    this.enum = function (obj) {
        obj = obj || {};

        var ret = {},
            e = [];

        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                if (typeof obj[prop] === 'string') {
                    obj[prop] = [
                        obj[prop],
                        inflection.humanize(obj[prop])
                    ];
                }

                ret[prop] = obj[prop][0];
                e.push(obj[prop][0]);
            }
        }

        ret.enum = e;
        ret.translate = translate.bind(this, obj);

        return ret;
    };

    this.field = function (model, many) {
        if (!model) {
            throw new Error('Bad model name!');
        }

        var parts = model.split('/'),
            field = parts.pop();

        if (field === 'index' && parts.length) {
            field = parts.pop();
        }

        field = field.replace('-', '_');
        field = inflection.underscore(field);
        field = inflection.camelize(field, true);

        if (many) {
            field = inflection.pluralize(field);
        }

        return field;
    };

    this.method = function (field, verb) {
        verb = verb || 'populate';
        return verb + field.charAt(0).toUpperCase() + field.slice(1);
    };

};
