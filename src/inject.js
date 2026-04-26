// Runs via page.addInitScript — executes before any page script.
//
// The Claude Design bundle ships React's UMD build. React UMD does:
//
//     (global.React = {}, factory(global.React));
//
// so the assignment to window.React happens BEFORE createElement exists.
// A setter on window.React therefore sees an empty {}. We handle this by
// defining a getter/setter on React.createElement itself the moment
// window.React is first assigned, intercepting the function when the
// factory body later assigns it. Same trick for the jsx-runtime variants.
//
// On every React.createElement / React.jsx call we inspect props for two
// signatures:
//   (a) width + height + duration numeric props → Stage component
//   (b) props.value with the TimelineContext shape → TimelineContext.Provider
// and stash handles to window.__stageProps / window.__stage respectively.
//
// The Stage-detection heuristic mirrors src/sniff.js (which is what tests
// drive). We inline it here because addInitScript only takes a string —
// keep the two in sync if you change either.

const { MIN_DIM, MAX_DIM } = require('./sniff.js');

module.exports = `
(function () {
  if (window.__stageHooked) return;
  window.__stageHooked = true;
  window.__stageDebug = {
    sniffCalls: 0,
    patchedAt: null,
    reactSetAt: null,
    stageCandidates: 0,
    stagePropsHasName: false,
  };

  var MIN_DIM = ${MIN_DIM};
  var MAX_DIM = ${MAX_DIM};

  function isStageProps(props) {
    return (
      typeof props.width === 'number' &&
      typeof props.height === 'number' &&
      typeof props.duration === 'number' &&
      props.width >= MIN_DIM &&
      props.height >= MIN_DIM &&
      props.width <= MAX_DIM &&
      props.height <= MAX_DIM &&
      props.duration > 0
    );
  }

  function isTimelineValue(v) {
    return (
      v && typeof v === 'object' &&
      typeof v.setTime === 'function' &&
      typeof v.setPlaying === 'function' &&
      'time' in v && 'duration' in v && 'playing' in v
    );
  }

  function typeNameContainsStage(type) {
    if (!type) return false;
    if (typeof type === 'string') return /stage/i.test(type);
    if (typeof type === 'function' || typeof type === 'object') {
      var name = type.displayName || type.name;
      return typeof name === 'string' && /stage/i.test(name);
    }
    return false;
  }

  function sniff(type, props) {
    window.__stageDebug.sniffCalls++;
    if (!props || typeof props !== 'object') return;

    if (isStageProps(props)) {
      var hasName = typeNameContainsStage(type);
      var current = window.__stageProps;
      var currentHasName = window.__stageDebug.stagePropsHasName;
      // Replace candidate if (a) we have nothing yet, (b) new candidate has
      // a Stage-y type name and current doesn't, or (c) neither has a name
      // (last-seen wins — Stage usually mounts last as the root).
      if (!current || (hasName && !currentHasName) || !currentHasName) {
        window.__stageProps = {
          width: props.width,
          height: props.height,
          duration: props.duration,
          fps: typeof props.fps === 'number' ? props.fps : 60,
        };
        window.__stageDebug.stagePropsHasName = hasName;
        window.__stageDebug.stageCandidates++;
      }
    }

    if (isTimelineValue(props.value)) {
      var v = props.value;
      window.__stage = {
        setTime: v.setTime,
        setPlaying: v.setPlaying,
        duration: v.duration,
      };
    }
  }

  // Install a get/set trap on React[name]; stored function is wrapped to
  // sniff (type, props) before delegating.
  function trapMethod(obj, name) {
    var _fn;
    try {
      Object.defineProperty(obj, name, {
        configurable: true,
        enumerable: true,
        get: function () { return _fn; },
        set: function (fn) {
          if (typeof fn !== 'function') { _fn = fn; return; }
          _fn = function (type, props) {
            try { sniff(type, props); } catch (e) {}
            return fn.apply(this, arguments);
          };
          // Copy static props like createElement.isValidElement if any.
          Object.keys(fn).forEach(function (k) {
            try { _fn[k] = fn[k]; } catch (e) {}
          });
        },
      });
    } catch (e) {}
  }

  function patch(React) {
    if (!React || React.__stagePatched) return;
    React.__stagePatched = true;
    window.__stageDebug.patchedAt = Date.now();

    // If React was fully initialized before we got here (unlikely but safe),
    // wrap the existing function; otherwise install a trap that wraps
    // whatever gets assigned next.
    ['createElement', 'jsx', 'jsxs', 'jsxDEV'].forEach(function (name) {
      var existing = React[name];
      if (typeof existing === 'function') {
        try { delete React[name]; } catch (e) {}
        trapMethod(React, name);
        React[name] = existing;
      } else {
        trapMethod(React, name);
      }
    });
  }

  if (window.React) { patch(window.React); return; }

  var _React;
  try {
    Object.defineProperty(window, 'React', {
      configurable: true,
      enumerable: true,
      get: function () { return _React; },
      set: function (v) {
        _React = v;
        window.__stageDebug.reactSetAt = Date.now();
        patch(v);
      },
    });
  } catch (e) {
    window.__stageDebug.defineErr = String(e && e.message || e);
  }
})();
`;
