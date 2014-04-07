'use strict';

var shien = require('shien'),
    when = require('when'),
    nodeFn = require('when/node/function'),

    util = require('./utils/core'),

    SORTING_CONDITION = {
        '1': 'asc',
        '-1': 'desc',
        '+': 'asc',
        '-': 'desc'
    };

var Query = exports.Query = function (model, crit, single) {
    this.model = model;

    this.criteria = crit || {};
    this.fields = null;
    this.options = {};
    this.populations = {};

    this.single = !!single;

    if (!this.single) {
        this.options.limit = 20;
    }
};

Query.prototype = new function () {

    this.select = function (fields) {
        if (typeof fields === 'string') {
            fields = fields.split(' ');
        }

        if (!Array.isArray(fields)) {
            throw new Error('Bad fields to select!');
        }

        this.fields = {};

        fields.forEach(function (field) {
            this.fields[field] = true;
        }, this);

        return this;
    };

    this.sort = function (cond) {
        if (typeof cond === 'string') {
            this.options.sort = cond;
            return this;
        }

        if (typeof cond !== 'object') {
            throw new Error('Bad sorting condition!');
        }

        var sort = [];

        for (var prop in cond) {
            if (cond.hasOwnProperty(prop)) {
                var dir = cond[prop];

                if (dir && SORTING_CONDITION[dir.toString()]) {
                    dir = SORTING_CONDITION[dir.toString()];
                }

                if (dir !== 'asc' && dir !== 'desc') {
                    throw new Error('Bad sorting direction!');
                }

                sort.push([ prop, dir ]);
            }
        }

        this.options.sort = sort;

        return this;
    };

    this.limit = function (num) {
        if (this.single) {
            throw new Error('Cannot set limit when querying for a single document!');
        }

        if (typeof num !== 'number') {
            throw new Error('Bad querying limit!');
        }

        this.options.limit = num;

        return this;
    };

    this.skip = function (num) {
        if (typeof num !== 'number') {
            throw new Error('Bad querying skipping!');
        }

        this.options.skip = num;

        return this;
    };

    this.populate = function (fields) {
        if (typeof fields === 'string') {
            this.populations[fields] = {};

        } else {
            if (Array.isArray(fields)) {
                fields.forEach(function (field) {
                    this.populations[field] = {};
                }, this);

            } else if (typeof fields === 'object') {
                for (var field in fields) {
                    if (fields.hasOwnProperty(field)) {
                        this.populations[field] = fields[field] || {};
                    }
                }

            } else {
                throw new Error('Field(s) to populate must be a string/an array/an object!');
            }
        }

        return this;
    };

    this.lean = function () {
        this.raw = true;
    };

    function getArguments() {
        /* jshint validthis: true */

        var args = [ this.criteria ];

        if (this.fields) {
            args.push(this.fields);
        }

        if (!shien.object.isEmpty(this.options)) {
            args.push(this.options);
        }

        return args;
    }

    function executeFunction(args) {
        /* jshint validthis: true */

        var collection = this.model.collection;

        return collection[this.single ? 'findOne' : 'find']
            .apply(collection, args);
    }

    function populate(docs) {
        /* jshint validthis: true */

        var promises = [];

        for (var field in this.populations) {
            if (this.populations.hasOwnProperty(field)) {
                var method = util.method(field);

                if (typeof this.model[method] !== 'function') {
                    throw new Error('Bad population: `' + field + '`!');
                }

                promises.push(
                    this.model[method](docs, this.populations[field])
                );
            }
        }

        return when.all(promises)
            .yield(docs);
    }

    this.apply = function (opts) {
        opts = opts || {};

        if (opts.find) {
            shien.merge(this.criteria, opts.find);
            delete opts.find;
        }

        for (var method in opts) {
            if (opts.hasOwnProperty(method) &&
                    typeof this[method] === 'function' &&
                            [ 'apply', 'exec', 'stream' ].indexOf(method) < 0) {
                this[method](opts[method]);
            }
        }

        return this;
    };

    this.exec = function () {
        var self = this,
            args = getArguments.call(this);

        if (this.single) {
            return when.promise(function (resolve, reject) {
                args.push(function (err, doc) {
                    if (err) {
                        return reject(err);
                    }

                    if (self.raw || !doc) {
                        return resolve(doc);
                    }

                    doc = new self.model(doc);

                    return resolve(
                        populate.call(self, doc)
                    );
                });

                executeFunction.call(self, args);
            });

        } else {
            var q = executeFunction.call(this, args);
            return nodeFn.call(q.toArray.bind(q))
                .then(function (docs) {
                    if (!Array.isArray(docs) || self.raw) {
                        return docs;
                    }

                    docs = docs.map(function (doc) {
                        return (doc ? new self.model(doc) : doc);
                    });

                    return populate.call(self, docs);
                });
        }
    };

    this.stream = function () {
        if (this.single) {
            throw new Error('Cannot stream when querying for a single document!');
        }

        var args = getArguments.call(this);

        return executeFunction.call(this, args)
            .stream();
    };

};
