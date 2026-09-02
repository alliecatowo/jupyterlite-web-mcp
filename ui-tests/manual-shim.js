/*
 * TEST-ONLY WebMCP shim for driving the extension by hand in a real browser.
 *
 * Browsers do not ship `document.modelContext` yet, so `make-shim-site.sh`
 * copies the built site and injects this file into `lab/index.html` before any
 * application script runs. It captures tool registrations and exposes
 * `window.__webmcp.call(name, args)` so a person, or an agent driving the
 * browser, can invoke the extension's tools exactly the way a WebMCP agent
 * would.
 *
 * This is never part of the extension and never part of the deployed site.
 */
(function () {
  var tools = new Map();
  var duplicates = [];
  var registrations = [];

  var modelContext = {
    registerTool: function (tool) {
      registrations.push(tool.name);
      if (tools.has(tool.name)) {
        duplicates.push(tool.name);
        return Promise.resolve();
      }
      tools.set(tool.name, tool);
      return Promise.resolve();
    },
    getTools: function () {
      return Promise.resolve(
        Array.from(tools.values()).map(function (t) {
          return {
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations,
            origin: location.origin,
            window: window
          };
        })
      );
    },
    ontoolchange: null,
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () {
      return true;
    }
  };

  Object.defineProperty(document, 'modelContext', {
    value: modelContext,
    configurable: true
  });

  window.__webmcp = {
    toolNames: function () {
      return Array.from(tools.keys());
    },
    duplicates: function () {
      return duplicates.slice();
    },
    registrations: function () {
      return registrations.slice();
    },
    definition: function (name) {
      var t = tools.get(name);
      return t
        ? {
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations
          }
        : null;
    },
    call: function (name, args, opts) {
      var t = tools.get(name);
      if (!t) {
        return Promise.reject(new Error('No registered tool named "' + name + '"'));
      }
      var controller = new AbortController();
      if (opts && opts.abortAfterMs !== undefined) {
        setTimeout(function () {
          controller.abort();
        }, opts.abortAfterMs);
      }
      return Promise.resolve(
        t.execute(args || {}, { signal: controller.signal })
      ).then(function (raw) {
        var text = raw && raw.content && raw.content[0] && raw.content[0].text;
        var payload = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch (error) {
          payload = { parseError: String(error), text: text };
        }
        return { ok: !(raw && raw.isError), payload: payload };
      });
    }
  };
})();
