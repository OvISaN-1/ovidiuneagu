/* Runs SQLite (sql.js) off the main thread so the page stays responsive during the slow query. */
importScripts("sql-wasm.js?v=20261013");

var db = null;

var ORDERS = 40000;
var CUSTOMERS = 500;

/* Small seeded random generator, so every visitor gets the same sample data. */
function rng(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function build(SQL) {
  db = new SQL.Database();
  /* No indexes on purpose, and stop SQLite from creating temporary ones, so it behaves like a table nobody indexed. */
  db.run("PRAGMA automatic_index = OFF;");
  /* A schema called dbo, so the queries can be written exactly as they would be in SQL Server. */
  db.run("ATTACH DATABASE ':memory:' AS dbo;");
  db.run("CREATE TABLE dbo.Customers (CustomerID INTEGER, Name TEXT);");
  db.run("CREATE TABLE dbo.Orders (OrderID INTEGER, CustomerID INTEGER, OrderDate TEXT, Amount REAL);");

  var rand = rng(42);
  db.run("BEGIN;");
  var c = db.prepare("INSERT INTO dbo.Customers VALUES (?, ?);");
  for (var i = 1; i <= CUSTOMERS; i++) c.run([i, "Customer " + i]);
  c.free();

  var o = db.prepare("INSERT INTO dbo.Orders VALUES (?, ?, ?, ?);");
  var start = Date.UTC(2023, 0, 1);
  for (var j = 1; j <= ORDERS; j++) {
    var day = new Date(start + Math.floor(rand() * 730) * 86400000).toISOString().slice(0, 10);
    o.run([j, 1 + Math.floor(rand() * CUSTOMERS), day, Math.round(rand() * 50000) / 100]);
  }
  o.free();
  db.run("COMMIT;");
}

function run(sql) {
  var t0 = performance.now();
  var res = db.exec(sql);
  var ms = performance.now() - t0;
  var rows = res.length ? res[0].values : [];
  var columns = res.length ? res[0].columns : [];

  /* A simple fingerprint of the full result, so the page can show both queries agree. */
  var total = 0;
  for (var i = 0; i < rows.length; i++) total += rows[i][2] || 0;

  var plan = db.exec("EXPLAIN QUERY PLAN " + sql);
  var planLines = plan.length ? plan[0].values.map(function (r) { return r[3]; }) : [];

  return {
    ms: ms,
    rowCount: rows.length,
    checksum: Math.round(total * 100) / 100,
    columns: columns,
    sample: rows.slice(0, 3),
    plan: planLines
  };
}

var ready = initSqlJs({ locateFile: function (f) { return f; } }).then(function (SQL) {
  var t0 = performance.now();
  build(SQL);
  return { ms: performance.now() - t0, orders: ORDERS, customers: CUSTOMERS };
});

self.onmessage = function (e) {
  var msg = e.data;
  ready.then(function (info) {
    if (msg.type === "init") {
      self.postMessage({ id: msg.id, ok: true, result: info });
    } else if (msg.type === "run") {
      self.postMessage({ id: msg.id, ok: true, result: run(msg.sql) });
    }
  }).catch(function (err) {
    self.postMessage({ id: msg.id, ok: false, error: String(err && err.message || err) });
  });
};
