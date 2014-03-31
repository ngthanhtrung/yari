'use strict';

var shien = require('shien'),
    when = require('when'),

    util = require('./utils/core'),
    Connection = require('./connection').Connection,
    type = require('./type'),
    ModelCreator = require('./model/creator').ModelCreator;

function Yari() {
    this.models = {};
}

Yari.prototype = new function () {

    shien.enhance(this, util);

    this.Yari = Yari;
    this.ModelCreator = ModelCreator;

    // Add type constants to `yari`
    type.types.forEach(function iterateTypeNames(typeName) {
        this[typeName] = type[typeName];
    }, this);

    this.connect = function (settings, opts) {
        var self = this;

        this.connection = new Connection(settings, opts);

        return when.resolve(this.connection.open())
            .then(function openedConnectionSuccessfully(db) {
                self.db = db;
            })
            .yield(this);
    };

    this.modelize = function (name, creator, opts) {
        if (arguments.length === 1) {
            return this.models[name];
        }

        var c = new ModelCreator(
            name,
            this.db,
            this.modelize.bind(this),
            opts
        );

        if (typeof creator === 'function') {
            creator.call(c);
        }

        var model = c.create();

        return (this.models[name] = model);
    };

};

module.exports = new Yari;
