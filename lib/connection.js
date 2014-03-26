'use strict';

var nodeFn = require('when/node/function'),

    mongo = require('mongodb'),
    Server = mongo.Server,
    Db = mongo.Db;

var Connection = exports.Connection = function (settings, opts) {
    var s = settings || {},
        o = opts || {};

    s.host || (s.host = 'localhost');
    s.port || (s.port = 27017);
    s.db || (s.db = 'yari');

    o.server || (o.server = {});
    o.db || (o.db = {});

    if (!('journal' in o.db || 'j' in o.db || 'fsync' in o.db || 'safe' in o.db || 'w' in o.db)) {
        o.db.w = 1;
    }

    this.settings = s;
    this.options = o;

    this.server = new Server(this.settings.host, this.settings.port, this.options.server);
    this.db = new Db(this.settings.db, this.server, this.options.db);
};

Connection.prototype = new function () {

    this.open = function () {
        return nodeFn.call(this.db.open.bind(this.db));
    };

};
