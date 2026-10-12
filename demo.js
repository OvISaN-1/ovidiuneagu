/* Query tuning demo: loads SQLite in a worker on the first click, then times both queries. */
(function () {
  "use strict";

  var root = document.getElementById("demo");
  if (!root || !window.Worker) return;

  var worker = null;
  var nextId = 0;
  var pending = {};
  var results = {};
  var busy = false;
  var buttons = root.querySelectorAll(".demo-run");
  var summary = root.querySelector(".demo-summary");

  function fmt(n) { return Math.round(n).toLocaleString("en-GB"); }

  function call(msg) {
    if (!worker) {
      worker = new Worker("demo/worker.js");
      worker.onmessage = function (e) {
        var cb = pending[e.data.id];
        delete pending[e.data.id];
        if (cb) cb(e.data);
      };
    }
    return new Promise(function (resolve, reject) {
      msg.id = ++nextId;
      pending[msg.id] = function (data) { data.ok ? resolve(data.result) : reject(new Error(data.error)); };
      worker.postMessage(msg);
    });
  }

  function setBusy(state) {
    busy = state;
    buttons.forEach(function (b) { b.disabled = state; });
  }

  function render(card, r) {
    var out = card.querySelector(".demo-out");
    out.innerHTML = "";

    var time = document.createElement("p");
    time.className = "demo-time";
    time.innerHTML = "<strong>" + fmt(r.ms) + " ms</strong> <span>" + fmt(r.rowCount) + " rows returned</span>";
    out.appendChild(time);

    var label = document.createElement("p");
    label.className = "demo-plan-label";
    label.textContent = "Query plan from SQLite";
    out.appendChild(label);

    var plan = document.createElement("ul");
    plan.className = "demo-plan";
    r.plan.forEach(function (line) {
      var li = document.createElement("li");
      li.textContent = line;
      plan.appendChild(li);
    });
    out.appendChild(plan);
  }

  function updateSummary() {
    var s = results.slow, f = results.fast;
    if (s && f) {
      var times = s.ms / Math.max(f.ms, 1);
      var same = s.rowCount === f.rowCount && s.checksum === f.checksum;
      summary.textContent = "The tuned query was " + fmt(times) + " times faster" +
        (same ? ", and both returned the same " + fmt(s.rowCount) + " rows with the same totals." : ".");
    } else if (s || f) {
      summary.textContent = "Now run the other one to compare.";
    }
  }

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (busy) return;
      var key = btn.getAttribute("data-query");
      var card = btn.closest(".demo-card");
      var sql = card.querySelector("code").textContent;
      var label = btn.textContent;

      setBusy(true);
      btn.textContent = worker ? "Running..." : "Loading SQLite...";
      call({ type: "init" })
        .then(function () {
          btn.textContent = "Running...";
          return call({ type: "run", sql: sql });
        })
        .then(function (r) {
          results[key] = r;
          render(card, r);
          updateSummary();
        })
        .catch(function () {
          card.querySelector(".demo-out").textContent = "The demo could not start in this browser.";
        })
        .then(function () {
          btn.textContent = label;
          setBusy(false);
        });
    });
  });
})();
