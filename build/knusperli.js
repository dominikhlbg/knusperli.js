// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// Author:  Ruud van Asseldonk <ruuda@google.com>
// JS port: Dominik Homberger <dominikhlbg@gmail.com>


// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');
    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function shell_read() { throw 'no read() available' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return new Uint8Array(xhr.response);
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function shell_print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function shell_printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}
if (!Module['quit']) {
  Module['quit'] = function(status, toThrow) {
    throw toThrow;
  }
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
    return value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      // optimize away arguments usage in common cases
      if (sig.length === 1) {
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func);
        };
      } else if (sig.length === 2) {
        sigCache[func] = function dynCall_wrapper(arg) {
          return Runtime.dynCall(sig, func, [arg]);
        };
      } else {
        // general case
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func, Array.prototype.slice.call(arguments));
        };
      }
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + size)|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { var ret = HEAP32[DYNAMICTOP_PTR>>2];var end = (((ret + size + 15)|0) & -16);HEAP32[DYNAMICTOP_PTR>>2] = end;if (end >= TOTAL_MEMORY) {var success = enlargeMemory();if (!success) {HEAP32[DYNAMICTOP_PTR>>2] = ret;return 0;}}return ret;},
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}







//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = Runtime.stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface.
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }

  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();



/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}


/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}


var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate






// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}


// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if (!runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}


/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}


// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}


// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}


// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}


// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}


// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var __cxa_demangle_func = Module['___cxa_demangle'] || Module['__cxa_demangle'];
  if (__cxa_demangle_func) {
    try {
      var s =
        func.substr(1);
      var len = lengthBytesUTF8(s)+1;
      var buf = _malloc(len);
      stringToUTF8(s, buf, len);
      var status = _malloc(4);
      var ret = __cxa_demangle_func(buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed
    } catch(e) {
      // ignore problems here
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
    // failure when using libcxxabi, don't demangle
    return func;
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}


// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;



function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 167772160;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}


function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}


function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}


function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}


function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}


// Tools

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}


function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  Runtime.warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}


function writeArrayToMemory(array, buffer) {
  HEAP8.set(array, buffer);
}


function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}


function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

if (!Math['trunc']) Math['trunc'] = function(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
};
Math.trunc = Math['trunc'];

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled

function getUniqueRunDependency(id) {
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
}


function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}


Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;






// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = Runtime.GLOBAL_BASE;

STATICTOP = STATIC_BASE + 12864;
/* global initializers */  __ATINIT__.push();


/* memory initializer */ allocate([200,19,0,0,249,42,0,0,240,19,0,0,89,43,0,0,32,0,0,0,0,0,0,0,240,19,0,0,6,43,0,0,48,0,0,0,0,0,0,0,200,19,0,0,39,43,0,0,240,19,0,0,52,43,0,0,16,0,0,0,0,0,0,0,240,19,0,0,123,43,0,0,8,0,0,0,0,0,0,0,240,19,0,0,139,43,0,0,72,0,0,0,0,0,0,0,240,19,0,0,192,43,0,0,32,0,0,0,0,0,0,0,240,19,0,0,156,43,0,0,104,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,8,0,0,0,16,0,0,0,9,0,0,0,2,0,0,0,3,0,0,0,10,0,0,0,17,0,0,0,24,0,0,0,32,0,0,0,25,0,0,0,18,0,0,0,11,0,0,0,4,0,0,0,5,0,0,0,12,0,0,0,19,0,0,0,26,0,0,0,33,0,0,0,40,0,0,0,48,0,0,0,41,0,0,0,34,0,0,0,27,0,0,0,20,0,0,0,13,0,0,0,6,0,0,0,7,0,0,0,14,0,0,0,21,0,0,0,28,0,0,0,35,0,0,0,42,0,0,0,49,0,0,0,56,0,0,0,57,0,0,0,50,0,0,0,43,0,0,0,36,0,0,0,29,0,0,0,22,0,0,0,15,0,0,0,23,0,0,0,30,0,0,0,37,0,0,0,44,0,0,0,51,0,0,0,58,0,0,0,59,0,0,0,52,0,0,0,45,0,0,0,38,0,0,0,31,0,0,0,39,0,0,0,46,0,0,0,53,0,0,0,60,0,0,0,61,0,0,0,54,0,0,0,47,0,0,0,55,0,0,0,62,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,63,0,0,0,77,255,255,255,78,255,255,255,79,255,255,255,81,255,255,255,82,255,255,255,84,255,255,255,85,255,255,255,86,255,255,255,88,255,255,255,89,255,255,255,91,255,255,255,92,255,255,255,93,255,255,255,95,255,255,255,96,255,255,255,98,255,255,255,99,255,255,255,100,255,255,255,102,255,255,255,103,255,255,255,105,255,255,255,106,255,255,255,107,255,255,255,109,255,255,255,110,255,255,255,112,255,255,255,113,255,255,255,114,255,255,255,116,255,255,255,117,255,255,255,119,255,255,255,120,255,255,255,121,255,255,255,123,255,255,255,124,255,255,255,126,255,255,255,127,255,255,255,128,255,255,255,130,255,255,255,131,255,255,255,133,255,255,255,134,255,255,255,135,255,255,255,137,255,255,255,138,255,255,255,140,255,255,255,141,255,255,255,142,255,255,255,144,255,255,255,145,255,255,255,147,255,255,255,148,255,255,255,149,255,255,255,151,255,255,255,152,255,255,255,154,255,255,255,155,255,255,255,156,255,255,255,158,255,255,255,159,255,255,255,161,255,255,255,162,255,255,255,163,255,255,255,165,255,255,255,166,255,255,255,168,255,255,255,169,255,255,255,170,255,255,255,172,255,255,255,173,255,255,255,175,255,255,255,176,255,255,255,177,255,255,255,179,255,255,255,180,255,255,255,182,255,255,255,183,255,255,255,184,255,255,255,186,255,255,255,187,255,255,255,189,255,255,255,190,255,255,255,192,255,255,255,193,255,255,255,194,255,255,255,196,255,255,255,197,255,255,255,199,255,255,255,200,255,255,255,201,255,255,255,203,255,255,255,204,255,255,255,206,255,255,255,207,255,255,255,208,255,255,255,210,255,255,255,211,255,255,255,213,255,255,255,214,255,255,255,215,255,255,255,217,255,255,255,218,255,255,255,220,255,255,255,221,255,255,255,222,255,255,255,224,255,255,255,225,255,255,255,227,255,255,255,228,255,255,255,229,255,255,255,231,255,255,255,232,255,255,255,234,255,255,255,235,255,255,255,236,255,255,255,238,255,255,255,239,255,255,255,241,255,255,255,242,255,255,255,243,255,255,255,245,255,255,255,246,255,255,255,248,255,255,255,249,255,255,255,250,255,255,255,252,255,255,255,253,255,255,255,255,255,255,255,0,0,0,0,1,0,0,0,3,0,0,0,4,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,10,0,0,0,11,0,0,0,13,0,0,0,14,0,0,0,15,0,0,0,17,0,0,0,18,0,0,0,20,0,0,0,21,0,0,0,22,0,0,0,24,0,0,0,25,0,0,0,27,0,0,0,28,0,0,0,29,0,0,0,31,0,0,0,32,0,0,0,34,0,0,0,35,0,0,0,36,0,0,0,38,0,0,0,39,0,0,0,41,0,0,0,42,0,0,0,43,0,0,0,45,0,0,0,46,0,0,0,48,0,0,0,49,0,0,0,50,0,0,0,52,0,0,0,53,0,0,0,55,0,0,0,56,0,0,0,57,0,0,0,59,0,0,0,60,0,0,0,62,0,0,0,63,0,0,0,64,0,0,0,66,0,0,0,67,0,0,0,69,0,0,0,70,0,0,0,72,0,0,0,73,0,0,0,74,0,0,0,76,0,0,0,77,0,0,0,79,0,0,0,80,0,0,0,81,0,0,0,83,0,0,0,84,0,0,0,86,0,0,0,87,0,0,0,88,0,0,0,90,0,0,0,91,0,0,0,93,0,0,0,94,0,0,0,95,0,0,0,97,0,0,0,98,0,0,0,100,0,0,0,101,0,0,0,102,0,0,0,104,0,0,0,105,0,0,0,107,0,0,0,108,0,0,0,109,0,0,0,111,0,0,0,112,0,0,0,114,0,0,0,115,0,0,0,116,0,0,0,118,0,0,0,119,0,0,0,121,0,0,0,122,0,0,0,123,0,0,0,125,0,0,0,126,0,0,0,128,0,0,0,129,0,0,0,130,0,0,0,132,0,0,0,133,0,0,0,135,0,0,0,136,0,0,0,137,0,0,0,139,0,0,0,140,0,0,0,142,0,0,0,143,0,0,0,144,0,0,0,146,0,0,0,147,0,0,0,149,0,0,0,150,0,0,0,151,0,0,0,153,0,0,0,154,0,0,0,156,0,0,0,157,0,0,0,158,0,0,0,160,0,0,0,161,0,0,0,163,0,0,0,164,0,0,0,165,0,0,0,167,0,0,0,168,0,0,0,170,0,0,0,171,0,0,0,172,0,0,0,174,0,0,0,175,0,0,0,177,0,0,0,178,0,0,0,0,105,91,0,46,178,90,0,92,251,89,0,138,68,89,0,184,141,88,0,230,214,87,0,20,32,87,0,66,105,86,0,112,178,85,0,158,251,84,0,204,68,84,0,250,141,83,0,40,215,82,0,86,32,82,0,132,105,81,0,178,178,80,0,224,251,79,0,14,69,79,0,60,142,78,0,106,215,77,0,152,32,77,0,198,105,76,0,244,178,75,0,34,252,74,0,80,69,74,0,126,142,73,0,172,215,72,0,218,32,72,0,8,106,71,0,54,179,70,0,100,252,69,0,146,69,69,0,192,142,68,0,238,215,67,0,28,33,67,0,74,106,66,0,120,179,65,0,166,252,64,0,212,69,64,0,2,143,63,0,48,216,62,0,94,33,62,0,140,106,61,0,186,179,60,0,232,252,59,0,22,70,59,0,68,143,58,0,114,216,57,0,160,33,57,0,206,106,56,0,252,179,55,0,42,253,54,0,88,70,54,0,134,143,53,0,180,216,52,0,226,33,52,0,16,107,51,0,62,180,50,0,108,253,49,0,154,70,49,0,200,143,48,0,246,216,47,0,36,34,47,0,82,107,46,0,128,180,45,0,174,253,44,0,220,70,44,0,10,144,43,0,56,217,42,0,102,34,42,0,148,107,41,0,194,180,40,0,240,253,39,0,30,71,39,0,76,144,38,0,122,217,37,0,168,34,37,0,214,107,36,0,4,181,35,0,50,254,34,0,96,71,34,0,142,144,33,0,188,217,32,0,234,34,32,0,24,108,31,0,70,181,30,0,116,254,29,0,162,71,29,0,208,144,28,0,254,217,27,0,44,35,27,0,90,108,26,0,136,181,25,0,182,254,24,0,228,71,24,0,18,145,23,0,64,218,22,0,110,35,22,0,156,108,21,0,202,181,20,0,248,254,19,0,38,72,19,0,84,145,18,0,130,218,17,0,176,35,17,0,222,108,16,0,12,182,15,0,58,255,14,0,104,72,14,0,150,145,13,0,196,218,12,0,242,35,12,0,32,109,11,0,78,182,10,0,124,255,9,0,170,72,9,0,216,145,8,0,6,219,7,0,52,36,7,0,98,109,6,0,144,182,5,0,190,255,4,0,236,72,4,0,26,146,3,0,72,219,2,0,118,36,2,0,164,109,1,0,210,182,0,0,0,0,0,0,46,73,255,255,92,146,254,255,138,219,253,255,184,36,253,255,230,109,252,255,20,183,251,255,66,0,251,255,112,73,250,255,158,146,249,255,204,219,248,255,250,36,248,255,40,110,247,255,86,183,246,255,132,0,246,255,178,73,245,255,224,146,244,255,14,220,243,255,60,37,243,255,106,110,242,255,152,183,241,255,198,0,241,255,244,73,240,255,34,147,239,255,80,220,238,255,126,37,238,255,172,110,237,255,218,183,236,255,8,1,236,255,54,74,235,255,100,147,234,255,146,220,233,255,192,37,233,255,238,110,232,255,28,184,231,255,74,1,231,255,120,74,230,255,166,147,229,255,212,220,228,255,2,38,228,255,48,111,227,255,94,184,226,255,140,1,226,255,186,74,225,255,232,147,224,255,22,221,223,255,68,38,223,255,114,111,222,255,160,184,221,255,206,1,221,255,252,74,220,255,42,148,219,255,88,221,218,255,134,38,218,255,180,111,217,255,226,184,216,255,16,2,216,255,62,75,215,255,108,148,214,255,154,221,213,255,200,38,213,255,246,111,212,255,36,185,211,255,82,2,211,255,128,75,210,255,174,148,209,255,220,221,208,255,10,39,208,255,56,112,207,255,102,185,206,255,148,2,206,255,194,75,205,255,240,148,204,255,30,222,203,255,76,39,203,255,122,112,202,255,168,185,201,255,214,2,201,255,4,76,200,255,50,149,199,255,96,222,198,255,142,39,198,255,188,112,197,255,234,185,196,255,24,3,196,255,70,76,195,255,116,149,194,255,162,222,193,255,208,39,193,255,254,112,192,255,44,186,191,255,90,3,191,255,136,76,190,255,182,149,189,255,228,222,188,255,18,40,188,255,64,113,187,255,110,186,186,255,156,3,186,255,202,76,185,255,248,149,184,255,38,223,183,255,84,40,183,255,130,113,182,255,176,186,181,255,222,3,181,255,12,77,180,255,58,150,179,255,104,223,178,255,150,40,178,255,196,113,177,255,242,186,176,255,32,4,176,255,78,77,175,255,124,150,174,255,170,223,173,255,216,40,173,255,6,114,172,255,52,187,171,255,98,4,171,255,144,77,170,255,190,150,169,255,236,223,168,255,26,41,168,255,72,114,167,255,118,187,166,255,164,4,166,255,210,77,165,255,0,141,44,0,230,52,44,0,204,220,43,0,178,132,43,0,152,44,43,0,126,212,42,0,100,124,42,0,74,36,42,0,48,204,41,0,22,116,41,0,252,27,41,0,226,195,40,0,200,107,40,0,174,19,40,0,148,187,39,0,122,99,39,0,96,11,39,0,70,179,38,0,44,91,38,0,18,3,38,0,248,170,37,0,222,82,37,0,196,250,36,0,170,162,36,0,144,74,36,0,118,242,35,0,92,154,35,0,66,66,35,0,40,234,34,0,14,146,34,0,244,57,34,0,218,225,33,0,192,137,33,0,166,49,33,0,140,217,32,0,114,129,32,0,88,41,32,0,62,209,31,0,36,121,31,0,10,33,31,0,240,200,30,0,214,112,30,0,188,24,30,0,162,192,29,0,136,104,29,0,110,16,29,0,84,184,28,0,58,96,28,0,32,8,28,0,6,176,27,0,236,87,27,0,210,255,26,0,184,167,26,0,158,79,26,0,132,247,25,0,106,159,25,0,80,71,25,0,54,239,24,0,28,151,24,0,2,63,24,0,232,230,23,0,206,142,23,0,180,54,23,0,154,222,22,0,128,134,22,0,102,46,22,0,76,214,21,0,50,126,21,0,24,38,21,0,254,205,20,0,228,117,20,0,202,29,20,0,176,197,19,0,150,109,19,0,124,21,19,0,98,189,18,0,72,101,18,0,46,13,18,0,20,181,17,0,250,92,17,0,224,4,17,0,198,172,16,0,172,84,16,0,146,252,15,0,120,164,15,0,94,76,15,0,68,244,14,0,42,156,14,0,16,68,14,0,246,235,13,0,220,147,13,0,194,59,13,0,168,227,12,0,142,139,12,0,116,51,12,0,90,219,11,0,64,131,11,0,38,43,11,0,12,211,10,0,242,122,10,0,216,34,10,0,190,202,9,0,164,114,9,0,138,26,9,0,112,194,8,0,86,106,8,0,60,18,8,0,34,186,7,0,8,98,7,0,238,9,7,0,212,177,6,0,186,89,6,0,160,1,6,0,134,169,5,0,108,81,5,0,82,249,4,0,56,161,4,0,30,73,4,0,4,241,3,0,234,152,3,0,208,64,3,0,182,232,2,0,156,144,2,0,130,56,2,0,104,224,1,0,78,136,1,0,52,48,1,0,26,216,0,0,0,128,0,0,230,39,0,0,204,207,255,255,178,119,255,255,152,31,255,255,126,199,254,255,100,111,254,255,74,23,254,255,48,191,253,255,22,103,253,255,252,14,253,255,226,182,252,255,200,94,252,255,174,6,252,255,148,174,251,255,122,86,251,255,96,254,250,255,70,166,250,255,44,78,250,255,18,246,249,255,248,157,249,255,222,69,249,255,196,237,248,255,170,149,248,255,144,61,248,255,118,229,247,255,92,141,247,255,66,53,247,255,40,221,246,255,14,133,246,255,244,44,246,255,218,212,245,255,192,124,245,255,166,36,245,255,140,204,244,255,114,116,244,255,88,28,244,255,62,196,243,255,36,108,243,255,10,20,243,255,240,187,242,255,214,99,242,255,188,11,242,255,162,179,241,255,136,91,241,255,110,3,241,255,84,171,240,255,58,83,240,255,32,251,239,255,6,163,239,255,236,74,239,255,210,242,238,255,184,154,238,255,158,66,238,255,132,234,237,255,106,146,237,255,80,58,237,255,54,226,236,255,28,138,236,255,2,50,236,255,232,217,235,255,206,129,235,255,180,41,235,255,154,209,234,255,128,121,234,255,102,33,234,255,76,201,233,255,50,113,233,255,24,25,233,255,254,192,232,255,228,104,232,255,202,16,232,255,176,184,231,255,150,96,231,255,124,8,231,255,98,176,230,255,72,88,230,255,46,0,230,255,20,168,229,255,250,79,229,255,224,247,228,255,198,159,228,255,172,71,228,255,146,239,227,255,120,151,227,255,94,63,227,255,68,231,226,255,42,143,226,255,16,55,226,255,246,222,225,255,220,134,225,255,194,46,225,255,168,214,224,255,142,126,224,255,116,38,224,255,90,206,223,255,64,118,223,255,38,30,223,255,12,198,222,255,242,109,222,255,216,21,222,255,190,189,221,255,164,101,221,255,138,13,221,255,112,181,220,255,86,93,220,255,60,5,220,255,34,173,219,255,8,85,219,255,238,252,218,255,212,164,218,255,186,76,218,255,160,244,217,255,134,156,217,255,108,68,217,255,82,236,216,255,56,148,216,255,30,60,216,255,4,228,215,255,234,139,215,255,208,51,215,255,182,219,214,255,156,131,214,255,130,43,214,255,104,211,213,255,78,123,213,255,52,35,213,255,26,203,212,255,29,255,255,255,31,255,255,255,33,255,255,255,34,255,255,255,36,255,255,255,38,255,255,255,40,255,255,255,42,255,255,255,43,255,255,255,45,255,255,255,47,255,255,255,49,255,255,255,50,255,255,255,52,255,255,255,54,255,255,255,56,255,255,255,58,255,255,255,59,255,255,255,61,255,255,255,63,255,255,255,65,255,255,255,66,255,255,255,68,255,255,255,70,255,255,255,72,255,255,255,73,255,255,255,75,255,255,255,77,255,255,255,79,255,255,255,81,255,255,255,82,255,255,255,84,255,255,255,86,255,255,255,88,255,255,255,89,255,255,255,91,255,255,255,93,255,255,255,95,255,255,255,97,255,255,255,98,255,255,255,100,255,255,255,102,255,255,255,104,255,255,255,105,255,255,255,107,255,255,255,109,255,255,255,111,255,255,255,112,255,255,255,114,255,255,255,116,255,255,255,118,255,255,255,120,255,255,255,121,255,255,255,123,255,255,255,125,255,255,255,127,255,255,255,128,255,255,255,130,255,255,255,132,255,255,255,134,255,255,255,136,255,255,255,137,255,255,255,139,255,255,255,141,255,255,255,143,255,255,255,144,255,255,255,146,255,255,255,148,255,255,255,150,255,255,255,151,255,255,255,153,255,255,255,155,255,255,255,157,255,255,255,159,255,255,255,160,255,255,255,162,255,255,255,164,255,255,255,166,255,255,255,167,255,255,255,169,255,255,255,171,255,255,255,173,255,255,255,174,255,255,255,176,255,255,255,178,255,255,255,180,255,255,255,182,255,255,255,183,255,255,255,185,255,255,255,187,255,255,255,189,255,255,255,190,255,255,255,192,255,255,255,194,255,255,255,196,255,255,255,198,255,255,255,199,255,255,255,201,255,255,255,203,255,255,255,205,255,255,255,206,255,255,255,208,255,255,255,210,255,255,255,212,255,255,255,213,255,255,255,215,255,255,255,217,255,255,255,219,255,255,255,221,255,255,255,222,255,255,255,224,255,255,255,226,255,255,255,228,255,255,255,229,255,255,255,231,255,255,255,233,255,255,255,235,255,255,255,237,255,255,255,238,255,255,255,240,255,255,255,242,255,255,255,244,255,255,255,245,255,255,255,247,255,255,255,249,255,255,255,251,255,255,255,252,255,255,255,254,255,255,255,0,0,0,0,2,0,0,0,4,0,0,0,5,0,0,0,7,0,0,0,9,0,0,0,11,0,0,0,12,0,0,0,14,0,0,0,16,0,0,0,18,0,0,0,19,0,0,0,21,0,0,0,23,0,0,0,25,0,0,0,27,0,0,0,28,0,0,0,30,0,0,0,32,0,0,0,34,0,0,0,35,0,0,0,37,0,0,0,39,0,0,0,41,0,0,0,43,0,0,0,44,0,0,0,46,0,0,0,48,0,0,0,50,0,0,0,51,0,0,0,53,0,0,0,55,0,0,0,57,0,0,0,58,0,0,0,60,0,0,0,62,0,0,0,64,0,0,0,66,0,0,0,67,0,0,0,69,0,0,0,71,0,0,0,73,0,0,0,74,0,0,0,76,0,0,0,78,0,0,0,80,0,0,0,82,0,0,0,83,0,0,0,85,0,0,0,87,0,0,0,89,0,0,0,90,0,0,0,92,0,0,0,94,0,0,0,96,0,0,0,97,0,0,0,99,0,0,0,101,0,0,0,103,0,0,0,105,0,0,0,106,0,0,0,108,0,0,0,110,0,0,0,112,0,0,0,113,0,0,0,115,0,0,0,117,0,0,0,119,0,0,0,120,0,0,0,122,0,0,0,124,0,0,0,126,0,0,0,128,0,0,0,129,0,0,0,131,0,0,0,133,0,0,0,135,0,0,0,136,0,0,0,138,0,0,0,140,0,0,0,142,0,0,0,144,0,0,0,145,0,0,0,147,0,0,0,149,0,0,0,151,0,0,0,152,0,0,0,154,0,0,0,156,0,0,0,158,0,0,0,159,0,0,0,161,0,0,0,163,0,0,0,165,0,0,0,167,0,0,0,168,0,0,0,170,0,0,0,172,0,0,0,174,0,0,0,175,0,0,0,177,0,0,0,179,0,0,0,181,0,0,0,183,0,0,0,184,0,0,0,186,0,0,0,188,0,0,0,190,0,0,0,191,0,0,0,193,0,0,0,195,0,0,0,197,0,0,0,198,0,0,0,200,0,0,0,202,0,0,0,204,0,0,0,206,0,0,0,207,0,0,0,209,0,0,0,211,0,0,0,213,0,0,0,214,0,0,0,216,0,0,0,218,0,0,0,220,0,0,0,222,0,0,0,223,0,0,0,225,0,0,0,204,17,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,2,0,0,0,48,46,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,46,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,64,19,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,2,0,0,0,56,46,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,64,19,0,0,0,0,0,0,16,0,0,0,1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0,4,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,56,0,0,0,1,0,0,0,5,0,0,0,3,0,0,0,4,0,0,0,4,0,0,0,2,0,0,0,2,0,0,0,2,0,0,0,0,0,0,0,72,0,0,0,6,0,0,0,7,0,0,0,2,0,0,0,0,0,0,0,88,0,0,0,6,0,0,0,8,0,0,0,2,0,0,0,69,114,114,111,114,32,114,101,97,100,105,110,103,32,106,112,101,103,32,100,97,116,97,32,102,114,111,109,32,105,110,112,117,116,32,102,105,108,101,46,0,70,97,105,108,101,100,32,116,111,32,100,101,99,111,100,101,46,0,77,97,114,107,101,114,32,98,121,116,101,32,40,48,120,102,102,41,32,101,120,112,101,99,116,101,100,44,32,102,111,117,110,100,58,32,37,100,32,112,111,115,61,37,100,32,108,101,110,61,37,100,10,0,68,105,100,32,110,111,116,32,102,105,110,100,32,101,120,112,101,99,116,101,100,32,83,79,73,32,109,97,114,107,101,114,44,32,97,99,116,117,97,108,61,37,100,10,0,85,110,115,117,112,112,111,114,116,101,100,32,109,97,114,107,101,114,58,32,37,100,32,112,111,115,61,37,100,32,108,101,110,61,37,100,10,0,77,105,115,115,105,110,103,32,83,79,70,32,109,97,114,107,101,114,46,10,0,78,101,101,100,32,97,116,32,108,101,97,115,116,32,111,110,101,32,72,117,102,102,109,97,110,32,99,111,100,101,32,116,97,98,108,101,46,10,0,84,111,111,32,109,97,110,121,32,72,117,102,102,109,97,110,32,116,97,98,108,101,115,46,10,0,81,117,97,110,116,105,122,97,116,105,111,110,32,116,97,98,108,101,32,119,105,116,104,32,105,110,100,101,120,32,37,100,32,110,111,116,32,102,111,117,110,100,10,0,85,110,101,120,112,101,99,116,101,100,32,101,110,100,32,111,102,32,105,110,112,117,116,58,32,112,111,115,61,37,100,32,110,101,101,100,61,37,100,32,108,101,110,61,37,100,10,0,73,110,118,97,108,105,100,32,37,115,58,32,37,100,10,0,109,97,114,107,101,114,95,108,101,110,0,68,117,112,108,105,99,97,116,101,32,68,82,73,32,109,97,114,107,101,114,46,10,0,73,110,118,97,108,105,100,32,109,97,114,107,101,114,32,108,101,110,103,116,104,58,32,100,101,99,108,97,114,101,100,61,37,100,32,97,99,116,117,97,108,61,37,100,10,0,68,81,84,32,109,97,114,107,101,114,58,32,110,111,32,113,117,97,110,116,105,122,97,116,105,111,110,32,116,97,98,108,101,32,102,111,117,110,100,10,0,113,117,97,110,116,95,116,97,98,108,101,95,105,110,100,101,120,0,113,117,97,110,116,95,118,97,108,0,79,118,101,114,108,97,112,112,105,110,103,32,115,99,97,110,115,58,32,99,111,109,112,111,110,101,110,116,61,37,100,32,107,61,37,100,32,112,114,101,118,95,109,97,115,107,61,37,100,32,99,117,114,95,109,97,115,107,61,37,100,10,0,73,110,118,97,108,105,100,32,115,99,97,110,32,111,114,100,101,114,44,32,97,32,109,111,114,101,32,114,101,102,105,110,101,100,32,115,99,97,110,32,119,97,115,32,97,108,114,101,97,100,121,32,100,111,110,101,58,32,99,111,109,112,111,110,101,110,116,61,37,100,32,107,61,37,100,32,112,114,101,118,95,109,97,115,107,61,37,100,32,99,117,114,95,109,97,115,107,61,37,100,10,0,83,99,97,110,32,112,97,114,97,109,101,116,101,114,32,65,108,61,37,100,32,105,115,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,105,110,32,107,110,117,115,112,101,114,108,105,46,10,0,69,110,100,45,111,102,45,98,108,111,99,107,32,114,117,110,32,116,111,111,32,108,111,110,103,46,10,0,85,110,101,120,112,101,99,116,101,100,32,101,110,100,32,111,102,32,102,105,108,101,32,100,117,114,105,110,103,32,115,99,97,110,46,32,112,111,115,61,37,100,32,108,101,110,61,37,100,10,0,85,110,101,120,112,101,99,116,101,100,32,101,110,100,32,111,102,32,115,99,97,110,46,10,0,73,110,118,97,108,105,100,32,72,117,102,102,109,97,110,32,115,121,109,98,111,108,32,37,100,32,102,111,114,32,65,67,32,99,111,101,102,102,105,99,105,101,110,116,32,37,100,10,0,69,110,100,45,111,102,45,98,108,111,99,107,32,114,117,110,32,99,114,111,115,115,105,110,103,32,68,67,32,99,111,101,102,102,46,10,0,79,117,116,45,111,102,45,98,97,110,100,32,99,111,101,102,102,105,99,105,101,110,116,32,37,100,32,98,97,110,100,32,119,97,115,32,37,100,45,37,100,10,0,69,120,116,114,97,32,122,101,114,111,32,114,117,110,32,98,101,102,111,114,101,32,101,110,100,45,111,102,45,98,108,111,99,107,46,10,0,73,110,118,97,108,105,100,32,72,117,102,102,109,97,110,32,115,121,109,98,111,108,32,37,100,32,102,111,114,32,68,67,32,99,111,101,102,102,105,99,105,101,110,116,46,10,0,73,110,118,97,108,105,100,32,68,67,32,99,111,101,102,102,105,99,105,101,110,116,32,37,100,10,0,79,117,116,32,111,102,32,114,97,110,103,101,32,65,67,32,99,111,101,102,102,105,99,105,101,110,116,32,118,97,108,117,101,58,32,115,61,37,100,32,65,108,61,37,100,32,107,61,37,100,10,0,68,105,100,32,110,111,116,32,102,105,110,100,32,101,120,112,101,99,116,101,100,32,114,101,115,116,97,114,116,32,109,97,114,107,101,114,32,37,100,32,97,99,116,117,97,108,61,37,100,10,0,99,111,109,112,115,95,105,110,95,115,99,97,110,0,68,117,112,108,105,99,97,116,101,32,73,68,32,37,100,32,105,110,32,83,79,83,46,10,0,83,79,83,32,109,97,114,107,101,114,58,32,67,111,117,108,100,32,110,111,116,32,102,105,110,100,32,99,111,109,112,111,110,101,110,116,32,119,105,116,104,32,105,100,32,37,100,10,0,100,99,95,116,98,108,95,105,100,120,0,97,99,95,116,98,108,95,105,100,120,0,115,99,97,110,95,105,110,102,111,46,83,115,0,115,99,97,110,95,105,110,102,111,46,83,101,0,83,79,83,32,109,97,114,107,101,114,58,32,67,111,117,108,100,32,110,111,116,32,102,105,110,100,32,68,67,32,72,117,102,102,109,97,110,32,116,97,98,108,101,32,119,105,116,104,32,105,110,100,101,120,32,37,100,10,0,83,79,83,32,109,97,114,107,101,114,58,32,67,111,117,108,100,32,110,111,116,32,102,105,110,100,32,65,67,32,72,117,102,102,109,97,110,32,116,97,98,108,101,32,119,105,116,104,32,105,110,100,101,120,32,37,100,10,0,68,72,84,32,109,97,114,107,101,114,58,32,110,111,32,72,117,102,102,109,97,110,32,116,97,98,108,101,32,102,111,117,110,100,10,0,104,117,102,102,109,97,110,95,105,110,100,101,120,0,116,111,116,97,108,95,99,111,117,110,116,0,118,97,108,117,101,0,68,117,112,108,105,99,97,116,101,32,72,117,102,102,109,97,110,32,99,111,100,101,32,118,97,108,117,101,32,37,100,10,0,73,110,118,97,108,105,100,32,72,117,102,102,109,97,110,32,99,111,100,101,32,108,101,110,103,116,104,115,46,10,0,70,97,105,108,101,100,32,116,111,32,98,117,105,108,100,32,72,117,102,102,109,97,110,32,116,97,98,108,101,46,10,0,68,117,112,108,105,99,97,116,101,32,83,79,70,32,109,97,114,107,101,114,46,10,0,112,114,101,99,105,115,105,111,110,0,104,101,105,103,104,116,0,119,105,100,116,104,0,110,117,109,95,99,111,109,112,111,110,101,110,116,115,0,68,117,112,108,105,99,97,116,101,32,73,68,32,37,100,32,105,110,32,83,79,70,46,10,0,104,95,115,97,109,112,95,102,97,99,116,111,114,0,118,95,115,97,109,112,95,102,97,99,116,111,114,0,78,111,110,45,105,110,116,101,103,114,97,108,32,115,117,98,115,97,109,112,108,105,110,103,32,114,97,116,105,111,115,46,10,0,73,109,97,103,101,32,116,111,111,32,108,97,114,103,101,46,10,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,1,1,1,0,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,97,108,108,111,99,97,116,111,114,60,84,62,58,58,97,108,108,111,99,97,116,101,40,115,105,122,101,95,116,32,110,41,32,39,110,39,32,101,120,99,101,101,100,115,32,109,97,120,105,109,117,109,32,115,117,112,112,111,114,116,101,100,32,115,105,122,101,0,98,108,111,99,107,95,120,32,60,32,119,105,100,116,104,95,105,110,95,98,108,111,99,107,115,95,0,111,117,116,112,117,116,95,105,109,97,103,101,46,99,99,0,98,108,111,99,107,95,121,32,60,32,104,101,105,103,104,116,95,105,110,95,98,108,111,99,107,115,95,0,120,109,105,110,32,62,61,32,48,0,84,111,80,105,120,101,108,115,0,121,109,105,110,32,62,61,32,48,0,120,109,105,110,32,60,32,119,105,100,116,104,95,0,121,109,105,110,32,60,32,104,101,105,103,104,116,95,0,83,101,116,67,111,101,102,102,66,108,111,99,107,0,83,97,109,112,108,105,110,103,32,114,97,116,105,111,32,110,111,116,32,115,117,112,112,111,114,116,101,100,58,32,102,97,99,116,111,114,95,120,32,61,32,37,100,32,102,97,99,116,111,114,95,121,32,61,32,37,100,10,0,119,105,100,116,104,95,105,110,95,98,108,111,99,107,115,95,32,60,61,32,99,111,109,112,46,119,105,100,116,104,95,105,110,95,98,108,111,99,107,115,0,67,111,112,121,70,114,111,109,74,112,101,103,67,111,109,112,111,110,101,110,116,0,104,101,105,103,104,116,95,105,110,95,98,108,111,99,107,115,95,32,60,61,32,99,111,109,112,46,104,101,105,103,104,116,95,105,110,95,98,108,111,99,107,115,0,106,112,103,46,109,97,120,95,104,95,115,97,109,112,95,102,97,99,116,111,114,32,37,32,99,111,109,112,46,104,95,115,97,109,112,95,102,97,99,116,111,114,32,61,61,32,48,0,67,111,112,121,70,114,111,109,74,112,101,103,68,97,116,97,0,106,112,103,46,109,97,120,95,118,95,115,97,109,112,95,102,97,99,116,111,114,32,37,32,99,111,109,112,46,118,95,115,97,109,112,95,102,97,99,116,111,114,32,61,61,32,48,0,99,111,109,112,46,113,117,97,110,116,95,105,100,120,32,60,32,106,112,103,46,113,117,97,110,116,46,115,105,122,101,40,41,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,45,43,32,32,32,48,88,48,120,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,46,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);
/* memory initializer */ allocate([114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0,83,116,57,101,120,99,101,112,116,105,111,110,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,54,95,95,115,104,105,109,95,116,121,112,101,95,105,110,102,111,69,0,83,116,57,116,121,112,101,95,105,110,102,111,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,48,95,95,115,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,83,116,49,49,108,111,103,105,99,95,101,114,114,111,114,0,83,116,49,50,108,101,110,103,116,104,95,101,114,114,111,114,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,57,95,95,112,111,105,110,116,101,114,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,112,98,97,115,101,95,116,121,112,101,95,105,110,102,111,69,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE+10240);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


   

   

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Module['dynCall_vi'](info.destructor, ptr);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((Runtime.setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((Runtime.setTempRet0(0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((Runtime.setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((Runtime.setTempRet0(throwntype),thrown)|0);
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
    }

   

   

   

  function _abort() {
      Module['abort']();
    }

  
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC);   

  function ___lock() {}

  function ___unlock() {}

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

   

  
    

  function ___assert_fail(condition, filename, line, func) {
      ABORT = true;
      throw 'Assertion failed: ' + Pointer_stringify(condition) + ', at: ' + [filename ? Pointer_stringify(filename) : 'unknown filename', line, func ? Pointer_stringify(func) : 'unknown function'] + ' at ' + stackTrace();
    }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      return value;
    } 

  
  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    }  

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___gxx_personality_v0() {
    }

   


  
  function __exit(status) {
      // void _exit(int status);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/exit.html
      Module['exit'](status);
    }function _exit(status) {
      __exit(status);
    }

   

  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
DYNAMICTOP_PTR = allocate(1, "i32", ALLOC_STATIC);

STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory


function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_iiii": invoke_iiii, "invoke_viiiii": invoke_viiiii, "invoke_vi": invoke_vi, "invoke_ii": invoke_ii, "invoke_v": invoke_v, "invoke_viiiiii": invoke_viiiiii, "invoke_viiii": invoke_viiii, "___syscall54": ___syscall54, "___cxa_throw": ___cxa_throw, "___assert_fail": ___assert_fail, "___lock": ___lock, "___syscall6": ___syscall6, "___setErrNo": ___setErrNo, "_abort": _abort, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "_emscripten_memcpy_big": _emscripten_memcpy_big, "___gxx_personality_v0": ___gxx_personality_v0, "___unlock": ___unlock, "___resumeException": ___resumeException, "_exit": _exit, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "__exit": __exit, "___cxa_allocate_exception": ___cxa_allocate_exception, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
'use asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var invoke_iiii=env.invoke_iiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_vi=env.invoke_vi;
  var invoke_ii=env.invoke_ii;
  var invoke_v=env.invoke_v;
  var invoke_viiiiii=env.invoke_viiiiii;
  var invoke_viiii=env.invoke_viiii;
  var ___syscall54=env.___syscall54;
  var ___cxa_throw=env.___cxa_throw;
  var ___assert_fail=env.___assert_fail;
  var ___lock=env.___lock;
  var ___syscall6=env.___syscall6;
  var ___setErrNo=env.___setErrNo;
  var _abort=env._abort;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___unlock=env.___unlock;
  var ___resumeException=env.___resumeException;
  var _exit=env._exit;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var __exit=env.__exit;
  var ___cxa_allocate_exception=env.___cxa_allocate_exception;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function _width($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$06 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0;
 $2 = sp;
 __ZN9knusperli8JPEGDataC2Ev($2);
 $3 = (__ZN9knusperli8ReadJpegEPKhjNS_12JpegReadModeEPNS_8JPEGDataE($0,$1,0,$2)|0);
 if ($3) {
  $4 = HEAP32[$2>>2]|0;
  $$06 = $4;
 } else {
  (_puts(5176)|0);
  $$06 = 1;
 }
 __ZN9knusperli8JPEGDataD2Ev($2);
 STACKTOP = sp;return ($$06|0);
}
function __ZN9knusperli8JPEGDataC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $1 = ((($0)) + 4|0);
 HEAP32[$1>>2] = 0;
 $2 = ((($0)) + 8|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 12|0);
 HEAP32[$3>>2] = 1;
 $4 = ((($0)) + 16|0);
 HEAP32[$4>>2] = 1;
 $5 = ((($0)) + 20|0);
 _memset(($5|0),0,132)|0;
 return;
}
function __ZN9knusperli8JPEGDataD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 128|0);
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1);
 $2 = ((($0)) + 116|0);
 __ZNSt3__213__vector_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEED2Ev($2);
 $3 = ((($0)) + 104|0);
 __ZNSt3__213__vector_baseIhNS_9allocatorIhEEED2Ev($3);
 $4 = ((($0)) + 92|0);
 __ZNSt3__213__vector_baseIN9knusperli12JPEGScanInfoENS_9allocatorIS2_EEED2Ev($4);
 $5 = ((($0)) + 80|0);
 __ZNSt3__213__vector_baseIN9knusperli13JPEGComponentENS_9allocatorIS2_EEED2Ev($5);
 $6 = ((($0)) + 68|0);
 __ZNSt3__213__vector_baseIN9knusperli15JPEGHuffmanCodeENS_9allocatorIS2_EEED2Ev($6);
 $7 = ((($0)) + 56|0);
 __ZNSt3__213__vector_baseIN9knusperli14JPEGQuantTableENS_9allocatorIS2_EEED2Ev($7);
 $8 = ((($0)) + 44|0);
 __ZNSt3__213__vector_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEED2Ev($8);
 $9 = ((($0)) + 32|0);
 __ZNSt3__213__vector_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEED2Ev($9);
 return;
}
function _height($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$06 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0;
 $2 = sp;
 __ZN9knusperli8JPEGDataC2Ev($2);
 $3 = (__ZN9knusperli8ReadJpegEPKhjNS_12JpegReadModeEPNS_8JPEGDataE($0,$1,0,$2)|0);
 if ($3) {
  $4 = ((($2)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  $$06 = $5;
 } else {
  (_puts(5176)|0);
  $$06 = 1;
 }
 __ZN9knusperli8JPEGDataD2Ev($2);
 STACKTOP = sp;return ($$06|0);
}
function _decode($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $$03238 = 0, $$03339 = 0, $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 192|0;
 $$byval_copy = sp + 177|0;
 $4 = sp + 176|0;
 $5 = sp + 24|0;
 $6 = sp + 12|0;
 $7 = sp;
 __ZN9knusperli8JPEGDataC2Ev($5);
 HEAP32[$6>>2] = 0;
 $8 = ((($6)) + 4|0);
 HEAP32[$8>>2] = 0;
 $9 = ((($6)) + 8|0);
 HEAP32[$9>>2] = 0;
 $10 = (__ZN9knusperli8ReadJpegEPKhjNS_12JpegReadModeEPNS_8JPEGDataE($0,$1,2,$5)|0);
 do {
  if ($10) {
   __ZN9knusperli15DecodeJpegToRGBERKNS_8JPEGDataE($7,$5);
   ;HEAP8[$$byval_copy>>0]=HEAP8[$4>>0]|0;
   __ZNSt3__26vectorIhNS_9allocatorIhEEE13__move_assignERS3_NS_17integral_constantIbLb1EEE($6,$7,$$byval_copy);
   __ZNSt3__213__vector_baseIhNS_9allocatorIhEEED2Ev($7);
   $11 = HEAP32[$6>>2]|0;
   $12 = HEAP32[$8>>2]|0;
   $13 = ($11|0)==($12|0);
   if ($13) {
    (_puts(5217)|0);
    $$0 = 1;
    break;
   }
   $14 = HEAP32[$5>>2]|0;
   $15 = ($14|0)>(0);
   if ($15) {
    $16 = ((($5)) + 4|0);
    $$03339 = 0;
    while(1) {
     $17 = HEAP32[$16>>2]|0;
     $18 = ($17|0)>(0);
     if ($18) {
      $$03238 = 0;
      while(1) {
       $22 = HEAP32[$5>>2]|0;
       $23 = Math_imul($22, $$03238)|0;
       $24 = (($23) + ($$03339))|0;
       $25 = $24 << 2;
       $26 = ($24*3)|0;
       $27 = HEAP32[$6>>2]|0;
       $28 = (($27) + ($26)|0);
       $29 = HEAP8[$28>>0]|0;
       $30 = (($2) + ($25)|0);
       HEAP8[$30>>0] = $29;
       $31 = (($26) + 1)|0;
       $32 = (($27) + ($31)|0);
       $33 = HEAP8[$32>>0]|0;
       $34 = $25 | 1;
       $35 = (($2) + ($34)|0);
       HEAP8[$35>>0] = $33;
       $36 = (($26) + 2)|0;
       $37 = HEAP32[$6>>2]|0;
       $38 = (($37) + ($36)|0);
       $39 = HEAP8[$38>>0]|0;
       $40 = $25 | 2;
       $41 = (($2) + ($40)|0);
       HEAP8[$41>>0] = $39;
       $42 = $25 | 3;
       $43 = (($2) + ($42)|0);
       HEAP8[$43>>0] = -1;
       $44 = (($$03238) + 1)|0;
       $45 = HEAP32[$16>>2]|0;
       $46 = ($44|0)<($45|0);
       if ($46) {
        $$03238 = $44;
       } else {
        break;
       }
      }
     }
     $19 = (($$03339) + 1)|0;
     $20 = HEAP32[$5>>2]|0;
     $21 = ($19|0)<($20|0);
     if ($21) {
      $$03339 = $19;
     } else {
      $$0 = 0;
      break;
     }
    }
   } else {
    $$0 = 0;
   }
  } else {
   (_puts(5176)|0);
   $$0 = 1;
  }
 } while(0);
 __ZNSt3__213__vector_baseIhNS_9allocatorIhEEED2Ev($6);
 __ZN9knusperli8JPEGDataD2Ev($5);
 STACKTOP = sp;return ($$0|0);
}
function __ZNSt3__213__vector_baseIhNS_9allocatorIhEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -1|0);
   $8 = ($6|0)==($1|0);
   if ($8) {
    break;
   } else {
    $7 = $6;
   }
  }
  HEAP32[$3>>2] = $6;
 }
 $9 = HEAP32[$0>>2]|0;
 __ZdlPv($9);
 return;
}
function __ZNSt3__213__vector_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -12|0);
   HEAP32[$3>>2] = $6;
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($1|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 __ZdlPv($10);
 return;
}
function __ZNSt3__213__vector_baseIN9knusperli12JPEGScanInfoENS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -28|0);
   HEAP32[$3>>2] = $6;
   __ZN9knusperli12JPEGScanInfoD2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($1|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 __ZdlPv($10);
 return;
}
function __ZNSt3__213__vector_baseIN9knusperli13JPEGComponentENS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -40|0);
   HEAP32[$3>>2] = $6;
   __ZN9knusperli13JPEGComponentD2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($1|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 __ZdlPv($10);
 return;
}
function __ZNSt3__213__vector_baseIN9knusperli15JPEGHuffmanCodeENS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -32|0);
   HEAP32[$3>>2] = $6;
   __ZN9knusperli15JPEGHuffmanCodeD2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($1|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 __ZdlPv($10);
 return;
}
function __ZNSt3__213__vector_baseIN9knusperli14JPEGQuantTableENS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -24|0);
   HEAP32[$3>>2] = $6;
   __ZN9knusperli14JPEGQuantTableD2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($1|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 __ZdlPv($10);
 return;
}
function __ZN9knusperli12JPEGScanInfoD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 16|0);
 __ZNSt3__213__vector_baseIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEED2Ev($1);
 return;
}
function __ZNSt3__213__vector_baseIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i = 0, $scevgep4$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $scevgep$i$i = ((($4)) + -12|0);
  $6 = $scevgep$i$i;
  $7 = $1;
  $8 = (($6) - ($7))|0;
  $9 = (($8>>>0) / 12)&-1;
  $10 = $9 ^ -1;
  $scevgep4$i$i = (($4) + (($10*12)|0)|0);
  HEAP32[$3>>2] = $scevgep4$i$i;
 }
 $11 = HEAP32[$0>>2]|0;
 __ZdlPv($11);
 return;
}
function __ZN9knusperli13JPEGComponentD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 28|0);
 __ZNSt3__213__vector_baseIsNS_9allocatorIsEEED2Ev($1);
 return;
}
function __ZNSt3__213__vector_baseIsNS_9allocatorIsEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i = 0, $scevgep4$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $scevgep$i$i = ((($4)) + -2|0);
  $6 = $scevgep$i$i;
  $7 = $1;
  $8 = (($6) - ($7))|0;
  $9 = $8 >>> 1;
  $10 = $9 ^ -1;
  $scevgep4$i$i = (($4) + ($10<<1)|0);
  HEAP32[$3>>2] = $scevgep4$i$i;
 }
 $11 = HEAP32[$0>>2]|0;
 __ZdlPv($11);
 return;
}
function __ZN9knusperli15JPEGHuffmanCodeD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 12|0);
 __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($1);
 __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($0);
 return;
}
function __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i = 0, $scevgep4$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $scevgep$i$i = ((($4)) + -4|0);
  $6 = $scevgep$i$i;
  $7 = $1;
  $8 = (($6) - ($7))|0;
  $9 = $8 >>> 2;
  $10 = $9 ^ -1;
  $scevgep4$i$i = (($4) + ($10<<2)|0);
  HEAP32[$3>>2] = $scevgep4$i$i;
 }
 $11 = HEAP32[$0>>2]|0;
 __ZdlPv($11);
 return;
}
function __ZN9knusperli14JPEGQuantTableD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($0);
 return;
}
function __ZNSt3__26vectorIhNS_9allocatorIhEEE13__move_assignERS3_NS_17integral_constantIbLb1EEE($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt3__26vectorIhNS_9allocatorIhEEE10deallocateEv($0);
 $3 = HEAP32[$1>>2]|0;
 HEAP32[$0>>2] = $3;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ((($0)) + 4|0);
 HEAP32[$6>>2] = $5;
 $7 = ((($1)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 8|0);
 HEAP32[$9>>2] = $8;
 HEAP32[$7>>2] = 0;
 HEAP32[$4>>2] = 0;
 HEAP32[$1>>2] = 0;
 return;
}
function __ZNSt3__26vectorIhNS_9allocatorIhEEE10deallocateEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -1|0);
   $8 = ($6|0)==($1|0);
   if ($8) {
    break;
   } else {
    $7 = $6;
   }
  }
  HEAP32[$3>>2] = $6;
 }
 $9 = HEAP32[$0>>2]|0;
 __ZdlPv($9);
 $10 = ((($0)) + 8|0);
 HEAP32[$10>>2] = 0;
 HEAP32[$3>>2] = 0;
 HEAP32[$0>>2] = 0;
 return;
}
function __ZN9knusperli16ComputeBlockIDCTEPKsPh($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$03552 = 0, $$03650 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0;
 var $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0;
 var $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0;
 var $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0;
 var $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0;
 var $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0, $exitcond54 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0;
 $2 = sp + 32|0;
 $3 = sp;
 $4 = ((($3)) + 4|0);
 $5 = ((($3)) + 8|0);
 $6 = ((($3)) + 12|0);
 $7 = ((($3)) + 16|0);
 $8 = ((($3)) + 20|0);
 $9 = ((($3)) + 24|0);
 $10 = ((($3)) + 28|0);
 $$03552 = 0;
 while(1) {
  ;HEAP32[$3>>2]=0|0;HEAP32[$3+4>>2]=0|0;HEAP32[$3+8>>2]=0|0;HEAP32[$3+12>>2]=0|0;HEAP32[$3+16>>2]=0|0;HEAP32[$3+20>>2]=0|0;HEAP32[$3+24>>2]=0|0;HEAP32[$3+28>>2]=0|0;
  $18 = (($0) + ($$03552<<1)|0);
  __ZN9knusperli13Compute1dIDCTEPKsiPi($18,8,$3);
  $19 = HEAP32[$3>>2]|0;
  $20 = (($19) + 1024)|0;
  $21 = $20 >>> 11;
  $22 = $21&65535;
  $23 = (($2) + ($$03552<<1)|0);
  HEAP16[$23>>1] = $22;
  $24 = HEAP32[$4>>2]|0;
  $25 = (($24) + 1024)|0;
  $26 = $25 >>> 11;
  $27 = $26&65535;
  $28 = (($$03552) + 8)|0;
  $29 = (($2) + ($28<<1)|0);
  HEAP16[$29>>1] = $27;
  $30 = HEAP32[$5>>2]|0;
  $31 = (($30) + 1024)|0;
  $32 = $31 >>> 11;
  $33 = $32&65535;
  $34 = (($$03552) + 16)|0;
  $35 = (($2) + ($34<<1)|0);
  HEAP16[$35>>1] = $33;
  $36 = HEAP32[$6>>2]|0;
  $37 = (($36) + 1024)|0;
  $38 = $37 >>> 11;
  $39 = $38&65535;
  $40 = (($$03552) + 24)|0;
  $41 = (($2) + ($40<<1)|0);
  HEAP16[$41>>1] = $39;
  $42 = HEAP32[$7>>2]|0;
  $43 = (($42) + 1024)|0;
  $44 = $43 >>> 11;
  $45 = $44&65535;
  $46 = (($$03552) + 32)|0;
  $47 = (($2) + ($46<<1)|0);
  HEAP16[$47>>1] = $45;
  $48 = HEAP32[$8>>2]|0;
  $49 = (($48) + 1024)|0;
  $50 = $49 >>> 11;
  $51 = $50&65535;
  $52 = (($$03552) + 40)|0;
  $53 = (($2) + ($52<<1)|0);
  HEAP16[$53>>1] = $51;
  $54 = HEAP32[$9>>2]|0;
  $55 = (($54) + 1024)|0;
  $56 = $55 >>> 11;
  $57 = $56&65535;
  $58 = (($$03552) + 48)|0;
  $59 = (($2) + ($58<<1)|0);
  HEAP16[$59>>1] = $57;
  $60 = HEAP32[$10>>2]|0;
  $61 = (($60) + 1024)|0;
  $62 = $61 >>> 11;
  $63 = $62&65535;
  $64 = (($$03552) + 56)|0;
  $65 = (($2) + ($64<<1)|0);
  HEAP16[$65>>1] = $63;
  $66 = (($$03552) + 1)|0;
  $exitcond54 = ($66|0)==(8);
  if ($exitcond54) {
   break;
  } else {
   $$03552 = $66;
  }
 }
 $11 = ((($3)) + 4|0);
 $12 = ((($3)) + 8|0);
 $13 = ((($3)) + 12|0);
 $14 = ((($3)) + 16|0);
 $15 = ((($3)) + 20|0);
 $16 = ((($3)) + 24|0);
 $17 = ((($3)) + 28|0);
 $$03650 = 0;
 while(1) {
  $67 = $$03650 << 3;
  ;HEAP32[$3>>2]=0|0;HEAP32[$3+4>>2]=0|0;HEAP32[$3+8>>2]=0|0;HEAP32[$3+12>>2]=0|0;HEAP32[$3+16>>2]=0|0;HEAP32[$3+20>>2]=0|0;HEAP32[$3+24>>2]=0|0;HEAP32[$3+28>>2]=0|0;
  $68 = (($2) + ($67<<1)|0);
  __ZN9knusperli13Compute1dIDCTEPKsiPi($68,1,$3);
  $69 = HEAP32[$3>>2]|0;
  $70 = (($69) + 33685504)|0;
  $71 = $70 >> 18;
  $72 = ($71|0)<(255);
  $73 = $72 ? $71 : 255;
  $74 = ($71|0)>(0);
  $75 = $73&255;
  $76 = $74 ? $75 : 0;
  $77 = (($1) + ($67)|0);
  HEAP8[$77>>0] = $76;
  $78 = HEAP32[$11>>2]|0;
  $79 = (($78) + 33685504)|0;
  $80 = $79 >> 18;
  $81 = ($80|0)<(255);
  $82 = $81 ? $80 : 255;
  $83 = ($80|0)>(0);
  $84 = $82&255;
  $85 = $83 ? $84 : 0;
  $86 = $67 | 1;
  $87 = (($1) + ($86)|0);
  HEAP8[$87>>0] = $85;
  $88 = HEAP32[$12>>2]|0;
  $89 = (($88) + 33685504)|0;
  $90 = $89 >> 18;
  $91 = ($90|0)<(255);
  $92 = $91 ? $90 : 255;
  $93 = ($90|0)>(0);
  $94 = $92&255;
  $95 = $93 ? $94 : 0;
  $96 = $67 | 2;
  $97 = (($1) + ($96)|0);
  HEAP8[$97>>0] = $95;
  $98 = HEAP32[$13>>2]|0;
  $99 = (($98) + 33685504)|0;
  $100 = $99 >> 18;
  $101 = ($100|0)<(255);
  $102 = $101 ? $100 : 255;
  $103 = ($100|0)>(0);
  $104 = $102&255;
  $105 = $103 ? $104 : 0;
  $106 = $67 | 3;
  $107 = (($1) + ($106)|0);
  HEAP8[$107>>0] = $105;
  $108 = HEAP32[$14>>2]|0;
  $109 = (($108) + 33685504)|0;
  $110 = $109 >> 18;
  $111 = ($110|0)<(255);
  $112 = $111 ? $110 : 255;
  $113 = ($110|0)>(0);
  $114 = $112&255;
  $115 = $113 ? $114 : 0;
  $116 = $67 | 4;
  $117 = (($1) + ($116)|0);
  HEAP8[$117>>0] = $115;
  $118 = HEAP32[$15>>2]|0;
  $119 = (($118) + 33685504)|0;
  $120 = $119 >> 18;
  $121 = ($120|0)<(255);
  $122 = $121 ? $120 : 255;
  $123 = ($120|0)>(0);
  $124 = $122&255;
  $125 = $123 ? $124 : 0;
  $126 = $67 | 5;
  $127 = (($1) + ($126)|0);
  HEAP8[$127>>0] = $125;
  $128 = HEAP32[$16>>2]|0;
  $129 = (($128) + 33685504)|0;
  $130 = $129 >> 18;
  $131 = ($130|0)<(255);
  $132 = $131 ? $130 : 255;
  $133 = ($130|0)>(0);
  $134 = $132&255;
  $135 = $133 ? $134 : 0;
  $136 = $67 | 6;
  $137 = (($1) + ($136)|0);
  HEAP8[$137>>0] = $135;
  $138 = HEAP32[$17>>2]|0;
  $139 = (($138) + 33685504)|0;
  $140 = $139 >> 18;
  $141 = ($140|0)<(255);
  $142 = $141 ? $140 : 255;
  $143 = ($140|0)>(0);
  $144 = $142&255;
  $145 = $143 ? $144 : 0;
  $146 = $67 | 7;
  $147 = (($1) + ($146)|0);
  HEAP8[$147>>0] = $145;
  $148 = (($$03650) + 1)|0;
  $exitcond = ($148|0)==(8);
  if ($exitcond) {
   break;
  } else {
   $$03650 = $148;
  }
 }
 STACKTOP = sp;return;
}
function __ZN9knusperli13Compute1dIDCTEPKsiPi($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0;
 var $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0;
 var $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0;
 var $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0;
 var $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP16[$0>>1]|0;
 $4 = $3 << 16 >> 16;
 $5 = $4 << 13;
 $6 = ((($2)) + 28|0);
 HEAP32[$6>>2] = $5;
 $7 = ((($2)) + 24|0);
 HEAP32[$7>>2] = $5;
 $8 = ((($2)) + 20|0);
 HEAP32[$8>>2] = $5;
 $9 = ((($2)) + 16|0);
 HEAP32[$9>>2] = $5;
 $10 = ((($2)) + 12|0);
 HEAP32[$10>>2] = $5;
 $11 = ((($2)) + 8|0);
 HEAP32[$11>>2] = $5;
 $12 = ((($2)) + 4|0);
 HEAP32[$12>>2] = $5;
 $13 = (($0) + ($1<<1)|0);
 $14 = HEAP16[$13>>1]|0;
 $15 = $14 << 16 >> 16;
 $16 = ($15*11363)|0;
 $17 = ($15*9633)|0;
 $18 = ($15*6437)|0;
 $19 = ($15*2260)|0;
 $20 = (($16) + ($5))|0;
 HEAP32[$2>>2] = $20;
 $21 = HEAP32[$12>>2]|0;
 $22 = (($21) + ($17))|0;
 HEAP32[$12>>2] = $22;
 $23 = HEAP32[$11>>2]|0;
 $24 = (($23) + ($18))|0;
 HEAP32[$11>>2] = $24;
 $25 = HEAP32[$10>>2]|0;
 $26 = (($25) + ($19))|0;
 HEAP32[$10>>2] = $26;
 $27 = HEAP32[$9>>2]|0;
 $28 = (($27) - ($19))|0;
 HEAP32[$9>>2] = $28;
 $29 = HEAP32[$8>>2]|0;
 $30 = (($29) - ($18))|0;
 HEAP32[$8>>2] = $30;
 $31 = HEAP32[$7>>2]|0;
 $32 = (($31) - ($17))|0;
 HEAP32[$7>>2] = $32;
 $33 = HEAP32[$6>>2]|0;
 $34 = (($33) - ($16))|0;
 HEAP32[$6>>2] = $34;
 $35 = $1 << 1;
 $36 = (($0) + ($35<<1)|0);
 $37 = HEAP16[$36>>1]|0;
 $38 = $37 << 16 >> 16;
 $39 = ($38*10703)|0;
 $40 = ($38*4433)|0;
 $41 = HEAP32[$2>>2]|0;
 $42 = (($39) + ($41))|0;
 HEAP32[$2>>2] = $42;
 $43 = HEAP32[$12>>2]|0;
 $44 = (($43) + ($40))|0;
 HEAP32[$12>>2] = $44;
 $45 = HEAP32[$11>>2]|0;
 $46 = (($45) - ($40))|0;
 HEAP32[$11>>2] = $46;
 $47 = HEAP32[$10>>2]|0;
 $48 = (($47) - ($39))|0;
 HEAP32[$10>>2] = $48;
 $49 = HEAP32[$9>>2]|0;
 $50 = (($49) - ($39))|0;
 HEAP32[$9>>2] = $50;
 $51 = HEAP32[$8>>2]|0;
 $52 = (($51) - ($40))|0;
 HEAP32[$8>>2] = $52;
 $53 = HEAP32[$7>>2]|0;
 $54 = (($53) + ($40))|0;
 HEAP32[$7>>2] = $54;
 $55 = HEAP32[$6>>2]|0;
 $56 = (($55) + ($39))|0;
 HEAP32[$6>>2] = $56;
 $57 = ($1*3)|0;
 $58 = (($0) + ($57<<1)|0);
 $59 = HEAP16[$58>>1]|0;
 $60 = $59 << 16 >> 16;
 $61 = ($60*9633)|0;
 $62 = Math_imul($60, -2259)|0;
 $63 = Math_imul($60, -11362)|0;
 $64 = Math_imul($60, -6436)|0;
 $65 = HEAP32[$2>>2]|0;
 $66 = (($61) + ($65))|0;
 HEAP32[$2>>2] = $66;
 $67 = HEAP32[$12>>2]|0;
 $68 = (($67) + ($62))|0;
 HEAP32[$12>>2] = $68;
 $69 = HEAP32[$11>>2]|0;
 $70 = (($69) + ($63))|0;
 HEAP32[$11>>2] = $70;
 $71 = HEAP32[$10>>2]|0;
 $72 = (($71) + ($64))|0;
 HEAP32[$10>>2] = $72;
 $73 = HEAP32[$9>>2]|0;
 $74 = (($73) - ($64))|0;
 HEAP32[$9>>2] = $74;
 $75 = HEAP32[$8>>2]|0;
 $76 = (($75) - ($63))|0;
 HEAP32[$8>>2] = $76;
 $77 = HEAP32[$7>>2]|0;
 $78 = (($77) - ($62))|0;
 HEAP32[$7>>2] = $78;
 $79 = HEAP32[$6>>2]|0;
 $80 = (($79) - ($61))|0;
 HEAP32[$6>>2] = $80;
 $81 = $1 << 2;
 $82 = (($0) + ($81<<1)|0);
 $83 = HEAP16[$82>>1]|0;
 $84 = $83 << 16 >> 16;
 $85 = $84 << 13;
 $86 = HEAP32[$2>>2]|0;
 $87 = (($85) + ($86))|0;
 HEAP32[$2>>2] = $87;
 $88 = HEAP32[$12>>2]|0;
 $89 = (($88) - ($85))|0;
 HEAP32[$12>>2] = $89;
 $90 = HEAP32[$11>>2]|0;
 $91 = (($90) - ($85))|0;
 HEAP32[$11>>2] = $91;
 $92 = HEAP32[$10>>2]|0;
 $93 = (($92) + ($85))|0;
 HEAP32[$10>>2] = $93;
 $94 = HEAP32[$9>>2]|0;
 $95 = (($94) + ($85))|0;
 HEAP32[$9>>2] = $95;
 $96 = HEAP32[$8>>2]|0;
 $97 = (($96) - ($85))|0;
 HEAP32[$8>>2] = $97;
 $98 = HEAP32[$7>>2]|0;
 $99 = (($98) - ($85))|0;
 HEAP32[$7>>2] = $99;
 $100 = HEAP32[$6>>2]|0;
 $101 = (($100) + ($85))|0;
 HEAP32[$6>>2] = $101;
 $102 = ($1*5)|0;
 $103 = (($0) + ($102<<1)|0);
 $104 = HEAP16[$103>>1]|0;
 $105 = $104 << 16 >> 16;
 $106 = ($105*6437)|0;
 $107 = Math_imul($105, -11362)|0;
 $108 = ($105*2261)|0;
 $109 = ($105*9633)|0;
 $110 = HEAP32[$2>>2]|0;
 $111 = (($106) + ($110))|0;
 HEAP32[$2>>2] = $111;
 $112 = HEAP32[$12>>2]|0;
 $113 = (($112) + ($107))|0;
 HEAP32[$12>>2] = $113;
 $114 = HEAP32[$11>>2]|0;
 $115 = (($114) + ($108))|0;
 HEAP32[$11>>2] = $115;
 $116 = HEAP32[$10>>2]|0;
 $117 = (($116) + ($109))|0;
 HEAP32[$10>>2] = $117;
 $118 = HEAP32[$9>>2]|0;
 $119 = (($118) - ($109))|0;
 HEAP32[$9>>2] = $119;
 $120 = HEAP32[$8>>2]|0;
 $121 = (($120) - ($108))|0;
 HEAP32[$8>>2] = $121;
 $122 = HEAP32[$7>>2]|0;
 $123 = (($122) - ($107))|0;
 HEAP32[$7>>2] = $123;
 $124 = HEAP32[$6>>2]|0;
 $125 = (($124) - ($106))|0;
 HEAP32[$6>>2] = $125;
 $126 = ($1*6)|0;
 $127 = (($0) + ($126<<1)|0);
 $128 = HEAP16[$127>>1]|0;
 $129 = $128 << 16 >> 16;
 $130 = ($129*4433)|0;
 $131 = Math_imul($129, -10704)|0;
 $132 = HEAP32[$2>>2]|0;
 $133 = (($130) + ($132))|0;
 HEAP32[$2>>2] = $133;
 $134 = HEAP32[$12>>2]|0;
 $135 = (($134) + ($131))|0;
 HEAP32[$12>>2] = $135;
 $136 = HEAP32[$11>>2]|0;
 $137 = (($136) - ($131))|0;
 HEAP32[$11>>2] = $137;
 $138 = HEAP32[$10>>2]|0;
 $139 = (($138) - ($130))|0;
 HEAP32[$10>>2] = $139;
 $140 = HEAP32[$9>>2]|0;
 $141 = (($140) - ($130))|0;
 HEAP32[$9>>2] = $141;
 $142 = HEAP32[$8>>2]|0;
 $143 = (($142) - ($131))|0;
 HEAP32[$8>>2] = $143;
 $144 = HEAP32[$7>>2]|0;
 $145 = (($144) + ($131))|0;
 HEAP32[$7>>2] = $145;
 $146 = HEAP32[$6>>2]|0;
 $147 = (($146) + ($130))|0;
 HEAP32[$6>>2] = $147;
 $148 = ($1*7)|0;
 $149 = (($0) + ($148<<1)|0);
 $150 = HEAP16[$149>>1]|0;
 $151 = $150 << 16 >> 16;
 $152 = ($151*2260)|0;
 $153 = Math_imul($151, -6436)|0;
 $154 = ($151*9633)|0;
 $155 = Math_imul($151, -11363)|0;
 $156 = HEAP32[$2>>2]|0;
 $157 = (($152) + ($156))|0;
 HEAP32[$2>>2] = $157;
 $158 = HEAP32[$12>>2]|0;
 $159 = (($158) + ($153))|0;
 HEAP32[$12>>2] = $159;
 $160 = HEAP32[$11>>2]|0;
 $161 = (($160) + ($154))|0;
 HEAP32[$11>>2] = $161;
 $162 = HEAP32[$10>>2]|0;
 $163 = (($162) + ($155))|0;
 HEAP32[$10>>2] = $163;
 $164 = HEAP32[$9>>2]|0;
 $165 = (($164) - ($155))|0;
 HEAP32[$9>>2] = $165;
 $166 = HEAP32[$8>>2]|0;
 $167 = (($166) - ($154))|0;
 HEAP32[$8>>2] = $167;
 $168 = HEAP32[$7>>2]|0;
 $169 = (($168) - ($153))|0;
 HEAP32[$7>>2] = $169;
 $170 = HEAP32[$6>>2]|0;
 $171 = (($170) - ($152))|0;
 HEAP32[$6>>2] = $171;
 return;
}
function __ZNK9knusperli8JPEGData5Is420Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 80|0);
 $2 = ((($0)) + 84|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = HEAP32[$1>>2]|0;
 $5 = (($3) - ($4))|0;
 $6 = ($5|0)==(120);
 if (!($6)) {
  $32 = 0;
  return ($32|0);
 }
 $7 = ((($0)) + 12|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(2);
 if (!($9)) {
  $32 = 0;
  return ($32|0);
 }
 $10 = ((($0)) + 16|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ($11|0)==(2);
 if (!($12)) {
  $32 = 0;
  return ($32|0);
 }
 $13 = HEAP32[$1>>2]|0;
 $14 = ((($13)) + 4|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = ($15|0)==(2);
 if (!($16)) {
  $32 = 0;
  return ($32|0);
 }
 $17 = ((($13)) + 8|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ($18|0)==(2);
 if (!($19)) {
  $32 = 0;
  return ($32|0);
 }
 $20 = ((($13)) + 44|0);
 $21 = HEAP32[$20>>2]|0;
 $22 = ($21|0)==(1);
 if (!($22)) {
  $32 = 0;
  return ($32|0);
 }
 $23 = ((($13)) + 48|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ($24|0)==(1);
 if (!($25)) {
  $32 = 0;
  return ($32|0);
 }
 $26 = ((($13)) + 84|0);
 $27 = HEAP32[$26>>2]|0;
 $28 = ($27|0)==(1);
 if (!($28)) {
  $32 = 0;
  return ($32|0);
 }
 $29 = ((($13)) + 88|0);
 $30 = HEAP32[$29>>2]|0;
 $31 = ($30|0)==(1);
 $32 = $31;
 return ($32|0);
}
function __ZNK9knusperli8JPEGData5Is444Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 80|0);
 $2 = ((($0)) + 84|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = HEAP32[$1>>2]|0;
 $5 = (($3) - ($4))|0;
 $6 = ($5|0)==(120);
 if (!($6)) {
  $32 = 0;
  return ($32|0);
 }
 $7 = ((($0)) + 12|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(1);
 if (!($9)) {
  $32 = 0;
  return ($32|0);
 }
 $10 = ((($0)) + 16|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ($11|0)==(1);
 if (!($12)) {
  $32 = 0;
  return ($32|0);
 }
 $13 = HEAP32[$1>>2]|0;
 $14 = ((($13)) + 4|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = ($15|0)==(1);
 if (!($16)) {
  $32 = 0;
  return ($32|0);
 }
 $17 = ((($13)) + 8|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ($18|0)==(1);
 if (!($19)) {
  $32 = 0;
  return ($32|0);
 }
 $20 = ((($13)) + 44|0);
 $21 = HEAP32[$20>>2]|0;
 $22 = ($21|0)==(1);
 if (!($22)) {
  $32 = 0;
  return ($32|0);
 }
 $23 = ((($13)) + 48|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ($24|0)==(1);
 if (!($25)) {
  $32 = 0;
  return ($32|0);
 }
 $26 = ((($13)) + 84|0);
 $27 = HEAP32[$26>>2]|0;
 $28 = ($27|0)==(1);
 if (!($28)) {
  $32 = 0;
  return ($32|0);
 }
 $29 = ((($13)) + 88|0);
 $30 = HEAP32[$29>>2]|0;
 $31 = ($30|0)==(1);
 $32 = $31;
 return ($32|0);
}
function __ZNSt3__26vectorIN9knusperli13JPEGComponentENS_9allocatorIS2_EEE6resizeEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = HEAP32[$0>>2]|0;
 $5 = (($3) - ($4))|0;
 $6 = (($5|0) / 40)&-1;
 $7 = ($6>>>0)<($1>>>0);
 if ($7) {
  $8 = (($1) - ($6))|0;
  __ZNSt3__26vectorIN9knusperli13JPEGComponentENS_9allocatorIS2_EEE8__appendEj($0,$8);
  return;
 }
 $9 = ($6>>>0)>($1>>>0);
 if (!($9)) {
  return;
 }
 $10 = HEAP32[$0>>2]|0;
 $11 = (($10) + (($1*40)|0)|0);
 $12 = HEAP32[$2>>2]|0;
 $13 = ($12|0)==($11|0);
 if ($13) {
  return;
 } else {
  $15 = $12;
 }
 while(1) {
  $14 = ((($15)) + -40|0);
  HEAP32[$2>>2] = $14;
  __ZN9knusperli13JPEGComponentD2Ev($14);
  $16 = HEAP32[$2>>2]|0;
  $17 = ($16|0)==($11|0);
  if ($17) {
   break;
  } else {
   $15 = $16;
  }
 }
 return;
}
function __ZNSt3__26vectorIsNS_9allocatorIsEEE6resizeEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i = 0, $scevgep4$i$i = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = HEAP32[$0>>2]|0;
 $5 = (($3) - ($4))|0;
 $6 = $5 >> 1;
 $7 = ($6>>>0)<($1>>>0);
 if ($7) {
  $8 = (($1) - ($6))|0;
  __ZNSt3__26vectorIsNS_9allocatorIsEEE8__appendEj($0,$8);
  return;
 }
 $9 = ($6>>>0)>($1>>>0);
 if (!($9)) {
  return;
 }
 $10 = HEAP32[$0>>2]|0;
 $11 = (($10) + ($1<<1)|0);
 $12 = HEAP32[$2>>2]|0;
 $13 = ($12|0)==($11|0);
 if ($13) {
  return;
 }
 $scevgep$i$i = ((($12)) + -2|0);
 $14 = $scevgep$i$i;
 $15 = $11;
 $16 = (($14) - ($15))|0;
 $17 = $16 >>> 1;
 $18 = $17 ^ -1;
 $scevgep4$i$i = (($12) + ($18<<1)|0);
 HEAP32[$2>>2] = $scevgep4$i$i;
 return;
}
function __ZNSt3__26vectorIsNS_9allocatorIsEEE8__appendEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $2 = sp;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (($4) - ($6))|0;
 $8 = $7 >> 1;
 $9 = ($8>>>0)<($1>>>0);
 if (!($9)) {
  __ZNSt3__26vectorIsNS_9allocatorIsEEE18__construct_at_endEj($0,$1);
  STACKTOP = sp;return;
 }
 $10 = HEAP32[$5>>2]|0;
 $11 = HEAP32[$0>>2]|0;
 $12 = (($10) - ($11))|0;
 $13 = $12 >> 1;
 $14 = (($13) + ($1))|0;
 $15 = (__ZNKSt3__26vectorIsNS_9allocatorIsEEE8max_sizeEv($0)|0);
 $16 = ($15>>>0)<($14>>>0);
 if ($16) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $17 = ((($0)) + 8|0);
 $18 = ((($0)) + 8|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = HEAP32[$0>>2]|0;
 $21 = (($19) - ($20))|0;
 $22 = $21 >> 1;
 $23 = $15 >>> 1;
 $24 = ($22>>>0)<($23>>>0);
 $25 = ($21>>>0)<($14>>>0);
 $$sroa$speculated$i = $25 ? $14 : $21;
 $$sroa$speculated$$i = $24 ? $$sroa$speculated$i : $15;
 $26 = HEAP32[$5>>2]|0;
 $27 = (($26) - ($20))|0;
 $28 = $27 >> 1;
 __ZNSt3__214__split_bufferIsRNS_9allocatorIsEEEC2EjjS3_($2,$$sroa$speculated$$i,$28,$17);
 __ZNSt3__214__split_bufferIsRNS_9allocatorIsEEE18__construct_at_endEj($2,$1);
 __ZNSt3__26vectorIsNS_9allocatorIsEEE26__swap_out_circular_bufferERNS_14__split_bufferIsRS2_EE($0,$2);
 __ZNSt3__214__split_bufferIsRNS_9allocatorIsEEED2Ev($2);
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIsNS_9allocatorIsEEE18__construct_at_endEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$promoted = 0, $2 = 0, $3 = 0, $scevgep = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $$promoted = HEAP32[$2>>2]|0;
 $3 = $1 << 1;
 _memset(($$promoted|0),0,($3|0))|0;
 $scevgep = (($$promoted) + ($1<<1)|0);
 HEAP32[$2>>2] = $scevgep;
 return;
}
function __ZNKSt3__26vectorIsNS_9allocatorIsEEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2147483647;
}
function __ZNSt3__214__split_bufferIsRNS_9allocatorIsEEEC2EjjS3_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 12|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 16|0);
 HEAP32[$5>>2] = $3;
 $6 = ($1|0)==(0);
 do {
  if ($6) {
   $11 = 0;
  } else {
   $7 = ($1|0)<(0);
   if ($7) {
    $8 = (___cxa_allocate_exception(8)|0);
    __ZNSt11logic_errorC2EPKc($8,7028);
    HEAP32[$8>>2] = (5164);
    ___cxa_throw(($8|0),(88|0),(6|0));
    // unreachable;
   } else {
    $9 = $1 << 1;
    $10 = (__Znwj($9)|0);
    $11 = $10;
    break;
   }
  }
 } while(0);
 HEAP32[$0>>2] = $11;
 $12 = (($11) + ($2<<1)|0);
 $13 = ((($0)) + 8|0);
 HEAP32[$13>>2] = $12;
 $14 = ((($0)) + 4|0);
 HEAP32[$14>>2] = $12;
 $15 = (($11) + ($1<<1)|0);
 $16 = ((($0)) + 12|0);
 HEAP32[$16>>2] = $15;
 return;
}
function __ZNSt3__214__split_bufferIsRNS_9allocatorIsEEE18__construct_at_endEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$promoted = 0, $2 = 0, $3 = 0, $scevgep = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 8|0);
 $$promoted = HEAP32[$2>>2]|0;
 $3 = $1 << 1;
 _memset(($$promoted|0),0,($3|0))|0;
 $scevgep = (($$promoted) + ($1<<1)|0);
 HEAP32[$2>>2] = $scevgep;
 return;
}
function __ZNSt3__26vectorIsNS_9allocatorIsEEE26__swap_out_circular_bufferERNS_14__split_bufferIsRS2_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($1)) + 4|0);
 $6 = $2;
 $7 = (($4) - ($6))|0;
 $8 = $7 >> 1;
 $9 = HEAP32[$5>>2]|0;
 $10 = (0 - ($8))|0;
 $11 = (($9) + ($10<<1)|0);
 HEAP32[$5>>2] = $11;
 $12 = ($7|0)>(0);
 if ($12) {
  _memcpy(($11|0),($2|0),($7|0))|0;
 }
 $13 = HEAP32[$0>>2]|0;
 $14 = HEAP32[$5>>2]|0;
 HEAP32[$0>>2] = $14;
 HEAP32[$5>>2] = $13;
 $15 = ((($1)) + 8|0);
 $16 = HEAP32[$3>>2]|0;
 $17 = HEAP32[$15>>2]|0;
 HEAP32[$3>>2] = $17;
 HEAP32[$15>>2] = $16;
 $18 = ((($0)) + 8|0);
 $19 = ((($1)) + 12|0);
 $20 = HEAP32[$18>>2]|0;
 $21 = HEAP32[$19>>2]|0;
 HEAP32[$18>>2] = $21;
 HEAP32[$19>>2] = $20;
 $22 = HEAP32[$5>>2]|0;
 HEAP32[$1>>2] = $22;
 return;
}
function __ZNSt3__214__split_bufferIsRNS_9allocatorIsEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i$i = 0, $scevgep4$i$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($2|0);
 if (!($5)) {
  $scevgep$i$i$i = ((($4)) + -2|0);
  $6 = $scevgep$i$i$i;
  $7 = $2;
  $8 = (($6) - ($7))|0;
  $9 = $8 >>> 1;
  $10 = $9 ^ -1;
  $scevgep4$i$i$i = (($4) + ($10<<1)|0);
  HEAP32[$3>>2] = $scevgep4$i$i$i;
 }
 $11 = HEAP32[$0>>2]|0;
 $12 = ($11|0)==(0|0);
 if ($12) {
  return;
 }
 __ZdlPv($11);
 return;
}
function __ZNSt3__26vectorIN9knusperli13JPEGComponentENS_9allocatorIS2_EEE8__appendEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $2 = sp;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (($4) - ($6))|0;
 $8 = (($7|0) / 40)&-1;
 $9 = ($8>>>0)<($1>>>0);
 if (!($9)) {
  __ZNSt3__26vectorIN9knusperli13JPEGComponentENS_9allocatorIS2_EEE18__construct_at_endEj($0,$1);
  STACKTOP = sp;return;
 }
 $10 = HEAP32[$5>>2]|0;
 $11 = HEAP32[$0>>2]|0;
 $12 = (($10) - ($11))|0;
 $13 = (($12|0) / 40)&-1;
 $14 = (($13) + ($1))|0;
 $15 = (__ZNKSt3__26vectorIN9knusperli13JPEGComponentENS_9allocatorIS2_EEE8max_sizeEv($0)|0);
 $16 = ($15>>>0)<($14>>>0);
 if ($16) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $17 = ((($0)) + 8|0);
 $18 = ((($0)) + 8|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = HEAP32[$0>>2]|0;
 $21 = (($19) - ($20))|0;
 $22 = (($21|0) / 40)&-1;
 $23 = $15 >>> 1;
 $24 = ($22>>>0)<($23>>>0);
 $25 = $22 << 1;
 $26 = ($25>>>0)<($14>>>0);
 $$sroa$speculated$i = $26 ? $14 : $25;
 $$sroa$speculated$$i = $24 ? $$sroa$speculated$i : $15;
 $27 = HEAP32[$5>>2]|0;
 $28 = (($27) - ($20))|0;
 $29 = (($28|0) / 40)&-1;
 __ZNSt3__214__split_bufferIN9knusperli13JPEGComponentERNS_9allocatorIS2_EEEC2EjjS5_($2,$$sroa$speculated$$i,$29,$17);
 __ZNSt3__214__split_bufferIN9knusperli13JPEGComponentERNS_9allocatorIS2_EEE18__construct_at_endEj($2,$1);
 __ZNSt3__26vectorIN9knusperli13JPEGComponentENS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$2);
 __ZNSt3__214__split_bufferIN9knusperli13JPEGComponentERNS_9allocatorIS2_EEED2Ev($2);
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIN9knusperli13JPEGComponentENS_9allocatorIS2_EEE18__construct_at_endEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $$0 = $1;
 while(1) {
  $3 = HEAP32[$2>>2]|0;
  __ZN9knusperli13JPEGComponentC2Ev($3);
  $4 = HEAP32[$2>>2]|0;
  $5 = ((($4)) + 40|0);
  HEAP32[$2>>2] = $5;
  $6 = (($$0) + -1)|0;
  $7 = ($6|0)==(0);
  if ($7) {
   break;
  } else {
   $$0 = $6;
  }
 }
 return;
}
function __ZNKSt3__26vectorIN9knusperli13JPEGComponentENS_9allocatorIS2_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 107374182;
}
function __ZNSt3__214__split_bufferIN9knusperli13JPEGComponentERNS_9allocatorIS2_EEEC2EjjS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 12|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 16|0);
 HEAP32[$5>>2] = $3;
 $6 = ($1|0)==(0);
 do {
  if ($6) {
   $11 = 0;
  } else {
   $7 = ($1>>>0)>(107374182);
   if ($7) {
    $8 = (___cxa_allocate_exception(8)|0);
    __ZNSt11logic_errorC2EPKc($8,7028);
    HEAP32[$8>>2] = (5164);
    ___cxa_throw(($8|0),(88|0),(6|0));
    // unreachable;
   } else {
    $9 = ($1*40)|0;
    $10 = (__Znwj($9)|0);
    $11 = $10;
    break;
   }
  }
 } while(0);
 HEAP32[$0>>2] = $11;
 $12 = (($11) + (($2*40)|0)|0);
 $13 = ((($0)) + 8|0);
 HEAP32[$13>>2] = $12;
 $14 = ((($0)) + 4|0);
 HEAP32[$14>>2] = $12;
 $15 = (($11) + (($1*40)|0)|0);
 $16 = ((($0)) + 12|0);
 HEAP32[$16>>2] = $15;
 return;
}
function __ZNSt3__214__split_bufferIN9knusperli13JPEGComponentERNS_9allocatorIS2_EEE18__construct_at_endEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 8|0);
 $$0 = $1;
 while(1) {
  $3 = HEAP32[$2>>2]|0;
  __ZN9knusperli13JPEGComponentC2Ev($3);
  $4 = HEAP32[$2>>2]|0;
  $5 = ((($4)) + 40|0);
  HEAP32[$2>>2] = $5;
  $6 = (($$0) + -1)|0;
  $7 = ($6|0)==(0);
  if ($7) {
   break;
  } else {
   $$0 = $6;
  }
 }
 return;
}
function __ZNSt3__26vectorIN9knusperli13JPEGComponentENS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$06$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($1)) + 4|0);
 $6 = ($4|0)==($2|0);
 if (!($6)) {
  $$06$i = $4;
  while(1) {
   $7 = HEAP32[$5>>2]|0;
   $8 = ((($7)) + -40|0);
   $9 = ((($$06$i)) + -40|0);
   __ZN9knusperli13JPEGComponentC2EOS0_($8,$9);
   $10 = HEAP32[$5>>2]|0;
   $11 = ((($10)) + -40|0);
   HEAP32[$5>>2] = $11;
   $12 = ($9|0)==($2|0);
   if ($12) {
    break;
   } else {
    $$06$i = $9;
   }
  }
 }
 $13 = HEAP32[$0>>2]|0;
 $14 = HEAP32[$5>>2]|0;
 HEAP32[$0>>2] = $14;
 HEAP32[$5>>2] = $13;
 $15 = ((($1)) + 8|0);
 $16 = HEAP32[$3>>2]|0;
 $17 = HEAP32[$15>>2]|0;
 HEAP32[$3>>2] = $17;
 HEAP32[$15>>2] = $16;
 $18 = ((($0)) + 8|0);
 $19 = ((($1)) + 12|0);
 $20 = HEAP32[$18>>2]|0;
 $21 = HEAP32[$19>>2]|0;
 HEAP32[$18>>2] = $21;
 HEAP32[$19>>2] = $20;
 $22 = HEAP32[$5>>2]|0;
 HEAP32[$1>>2] = $22;
 return;
}
function __ZNSt3__214__split_bufferIN9knusperli13JPEGComponentERNS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($2|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -40|0);
   HEAP32[$3>>2] = $6;
   __ZN9knusperli13JPEGComponentD2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($2|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 $11 = ($10|0)==(0|0);
 if ($11) {
  return;
 }
 __ZdlPv($10);
 return;
}
function __ZN9knusperli13JPEGComponentC2EOS0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 ;HEAP32[$0>>2]=HEAP32[$1>>2]|0;HEAP32[$0+4>>2]=HEAP32[$1+4>>2]|0;HEAP32[$0+8>>2]=HEAP32[$1+8>>2]|0;HEAP32[$0+12>>2]=HEAP32[$1+12>>2]|0;HEAP32[$0+16>>2]=HEAP32[$1+16>>2]|0;HEAP32[$0+20>>2]=HEAP32[$1+20>>2]|0;HEAP32[$0+24>>2]=HEAP32[$1+24>>2]|0;
 $2 = ((($0)) + 28|0);
 $3 = ((($1)) + 28|0);
 HEAP32[$2>>2] = 0;
 $4 = ((($0)) + 32|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 36|0);
 HEAP32[$5>>2] = 0;
 $6 = HEAP32[$3>>2]|0;
 HEAP32[$2>>2] = $6;
 $7 = ((($1)) + 32|0);
 $8 = HEAP32[$7>>2]|0;
 HEAP32[$4>>2] = $8;
 $9 = ((($1)) + 36|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 36|0);
 HEAP32[$11>>2] = $10;
 HEAP32[$9>>2] = 0;
 HEAP32[$7>>2] = 0;
 HEAP32[$3>>2] = 0;
 return;
}
function __ZN9knusperli13JPEGComponentC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $1 = ((($0)) + 4|0);
 HEAP32[$1>>2] = 1;
 $2 = ((($0)) + 8|0);
 HEAP32[$2>>2] = 1;
 $3 = ((($0)) + 12|0);
 HEAP32[$3>>2] = 0;
 $4 = ((($0)) + 16|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 20|0);
 HEAP32[$5>>2] = 0;
 $6 = ((($0)) + 28|0);
 HEAP32[$6>>2] = 0;
 $7 = ((($0)) + 32|0);
 HEAP32[$7>>2] = 0;
 $8 = ((($0)) + 36|0);
 HEAP32[$8>>2] = 0;
 return;
}
function __ZNKSt3__26vectorIN9knusperli14JPEGQuantTableENS_9allocatorIS2_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 178956970;
}
function __ZNSt3__214__split_bufferIN9knusperli14JPEGQuantTableERNS_9allocatorIS2_EEEC2EjjS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 12|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 16|0);
 HEAP32[$5>>2] = $3;
 $6 = ($1|0)==(0);
 do {
  if ($6) {
   $11 = 0;
  } else {
   $7 = ($1>>>0)>(178956970);
   if ($7) {
    $8 = (___cxa_allocate_exception(8)|0);
    __ZNSt11logic_errorC2EPKc($8,7028);
    HEAP32[$8>>2] = (5164);
    ___cxa_throw(($8|0),(88|0),(6|0));
    // unreachable;
   } else {
    $9 = ($1*24)|0;
    $10 = (__Znwj($9)|0);
    $11 = $10;
    break;
   }
  }
 } while(0);
 HEAP32[$0>>2] = $11;
 $12 = (($11) + (($2*24)|0)|0);
 $13 = ((($0)) + 8|0);
 HEAP32[$13>>2] = $12;
 $14 = ((($0)) + 4|0);
 HEAP32[$14>>2] = $12;
 $15 = (($11) + (($1*24)|0)|0);
 $16 = ((($0)) + 12|0);
 HEAP32[$16>>2] = $15;
 return;
}
function __ZNSt3__26vectorIN9knusperli14JPEGQuantTableENS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$06$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($1)) + 4|0);
 $6 = ($4|0)==($2|0);
 if (!($6)) {
  $$06$i = $4;
  while(1) {
   $7 = HEAP32[$5>>2]|0;
   $8 = ((($7)) + -24|0);
   $9 = ((($$06$i)) + -24|0);
   __ZN9knusperli14JPEGQuantTableC2EOS0_($8,$9);
   $10 = HEAP32[$5>>2]|0;
   $11 = ((($10)) + -24|0);
   HEAP32[$5>>2] = $11;
   $12 = ($9|0)==($2|0);
   if ($12) {
    break;
   } else {
    $$06$i = $9;
   }
  }
 }
 $13 = HEAP32[$0>>2]|0;
 $14 = HEAP32[$5>>2]|0;
 HEAP32[$0>>2] = $14;
 HEAP32[$5>>2] = $13;
 $15 = ((($1)) + 8|0);
 $16 = HEAP32[$3>>2]|0;
 $17 = HEAP32[$15>>2]|0;
 HEAP32[$3>>2] = $17;
 HEAP32[$15>>2] = $16;
 $18 = ((($0)) + 8|0);
 $19 = ((($1)) + 12|0);
 $20 = HEAP32[$18>>2]|0;
 $21 = HEAP32[$19>>2]|0;
 HEAP32[$18>>2] = $21;
 HEAP32[$19>>2] = $20;
 $22 = HEAP32[$5>>2]|0;
 HEAP32[$1>>2] = $22;
 return;
}
function __ZNSt3__214__split_bufferIN9knusperli14JPEGQuantTableERNS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($2|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -24|0);
   HEAP32[$3>>2] = $6;
   __ZN9knusperli14JPEGQuantTableD2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($2|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 $11 = ($10|0)==(0|0);
 if ($11) {
  return;
 }
 __ZdlPv($10);
 return;
}
function __ZN9knusperli14JPEGQuantTableC2EOS0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = 0;
 $4 = HEAP32[$1>>2]|0;
 HEAP32[$0>>2] = $4;
 $5 = ((($1)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 HEAP32[$2>>2] = $6;
 $7 = ((($1)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 8|0);
 HEAP32[$9>>2] = $8;
 HEAP32[$7>>2] = 0;
 HEAP32[$5>>2] = 0;
 HEAP32[$1>>2] = 0;
 $10 = ((($0)) + 12|0);
 $11 = ((($1)) + 12|0);
 ;HEAP32[$10>>2]=HEAP32[$11>>2]|0;HEAP32[$10+4>>2]=HEAP32[$11+4>>2]|0;HEAP8[$10+8>>0]=HEAP8[$11+8>>0]|0;
 return;
}
function __ZN9knusperli14JPEGQuantTableC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt3__26vectorIiNS_9allocatorIiEEEC2Ej($0,64);
 $1 = ((($0)) + 12|0);
 HEAP32[$1>>2] = 0;
 $2 = ((($0)) + 16|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 20|0);
 HEAP8[$3>>0] = 1;
 return;
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEEC2Ej($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = 0;
 $4 = ($1|0)==(0);
 if ($4) {
  return;
 }
 __ZNSt3__26vectorIiNS_9allocatorIiEEE8allocateEj($0,$1);
 __ZNSt3__26vectorIiNS_9allocatorIiEEE18__construct_at_endEj($0,$1);
 return;
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (__ZNKSt3__26vectorIiNS_9allocatorIiEEE8max_sizeEv($0)|0);
 $3 = ($2>>>0)<($1>>>0);
 if ($3) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $4 = ($1>>>0)>(1073741823);
 if ($4) {
  $5 = (___cxa_allocate_exception(8)|0);
  __ZNSt11logic_errorC2EPKc($5,7028);
  HEAP32[$5>>2] = (5164);
  ___cxa_throw(($5|0),(88|0),(6|0));
  // unreachable;
 } else {
  $6 = $1 << 2;
  $7 = (__Znwj($6)|0);
  $8 = ((($0)) + 4|0);
  HEAP32[$8>>2] = $7;
  HEAP32[$0>>2] = $7;
  $9 = (($7) + ($1<<2)|0);
  $10 = ((($0)) + 8|0);
  HEAP32[$10>>2] = $9;
  return;
 }
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEE18__construct_at_endEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$promoted = 0, $2 = 0, $3 = 0, $scevgep = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $$promoted = HEAP32[$2>>2]|0;
 $3 = $1 << 2;
 _memset(($$promoted|0),0,($3|0))|0;
 $scevgep = (($$promoted) + ($1<<2)|0);
 HEAP32[$2>>2] = $scevgep;
 return;
}
function __ZNKSt3__26vectorIiNS_9allocatorIiEEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1073741823;
}
function __ZN9knusperli14JPEGQuantTableC2ERKS0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt3__26vectorIiNS_9allocatorIiEEEC2ERKS3_($0,$1);
 $2 = ((($0)) + 12|0);
 $3 = ((($1)) + 12|0);
 ;HEAP32[$2>>2]=HEAP32[$3>>2]|0;HEAP32[$2+4>>2]=HEAP32[$3+4>>2]|0;HEAP8[$2+8>>0]=HEAP8[$3+8>>0]|0;
 return;
}
function __ZNSt3__26vectorIN9knusperli14JPEGQuantTableENS_9allocatorIS2_EEE21__push_back_slow_pathIRKS2_EEvOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $2 = sp;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = HEAP32[$0>>2]|0;
 $6 = (($4) - ($5))|0;
 $7 = (($6|0) / 24)&-1;
 $8 = (($7) + 1)|0;
 $9 = (__ZNKSt3__26vectorIN9knusperli14JPEGQuantTableENS_9allocatorIS2_EEE8max_sizeEv($0)|0);
 $10 = ($9>>>0)<($8>>>0);
 if ($10) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 } else {
  $11 = ((($0)) + 8|0);
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = HEAP32[$0>>2]|0;
  $15 = (($13) - ($14))|0;
  $16 = (($15|0) / 24)&-1;
  $17 = $9 >>> 1;
  $18 = ($16>>>0)<($17>>>0);
  $19 = $16 << 1;
  $20 = ($19>>>0)<($8>>>0);
  $$sroa$speculated$i = $20 ? $8 : $19;
  $$sroa$speculated$$i = $18 ? $$sroa$speculated$i : $9;
  $21 = HEAP32[$3>>2]|0;
  $22 = (($21) - ($14))|0;
  $23 = (($22|0) / 24)&-1;
  __ZNSt3__214__split_bufferIN9knusperli14JPEGQuantTableERNS_9allocatorIS2_EEEC2EjjS5_($2,$$sroa$speculated$$i,$23,$11);
  $24 = ((($2)) + 8|0);
  $25 = HEAP32[$24>>2]|0;
  __ZN9knusperli14JPEGQuantTableC2ERKS0_($25,$1);
  $26 = HEAP32[$24>>2]|0;
  $27 = ((($26)) + 24|0);
  HEAP32[$24>>2] = $27;
  __ZNSt3__26vectorIN9knusperli14JPEGQuantTableENS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$2);
  __ZNSt3__214__split_bufferIN9knusperli14JPEGQuantTableERNS_9allocatorIS2_EEED2Ev($2);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEEC2ERKS3_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = 0;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = HEAP32[$1>>2]|0;
 $7 = (($5) - ($6))|0;
 $8 = $7 >> 2;
 $9 = ($8|0)==(0);
 if ($9) {
  return;
 }
 __ZNSt3__26vectorIiNS_9allocatorIiEEE8allocateEj($0,$8);
 $10 = HEAP32[$1>>2]|0;
 $11 = HEAP32[$4>>2]|0;
 __ZNSt3__26vectorIiNS_9allocatorIiEEE18__construct_at_endIPiEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES7_S7_j($0,$10,$11,$8);
 return;
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEE18__construct_at_endIPiEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES7_S7_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 4|0);
 $5 = $2;
 $6 = $1;
 $7 = (($5) - ($6))|0;
 $8 = ($7|0)>(0);
 if (!($8)) {
  return;
 }
 $9 = $7 >>> 2;
 $10 = HEAP32[$4>>2]|0;
 _memcpy(($10|0),($1|0),($7|0))|0;
 $11 = HEAP32[$4>>2]|0;
 $12 = (($11) + ($9<<2)|0);
 HEAP32[$4>>2] = $12;
 return;
}
function __ZN9knusperli18HasYCbCrColorSpaceERKNS_8JPEGDataE($0) {
 $0 = $0|0;
 var $$028$off061 = 0, $$03260 = 0, $$230$off0$ph = 0, $$234$ph = 0, $$3 = 0, $$sroa$047$059 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 32|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 36|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2|0)==($4|0);
 if (!($5)) {
  $$028$off061 = 0;$$03260 = 0;$$sroa$047$059 = $2;
  while(1) {
   $6 = ((($$sroa$047$059)) + 11|0);
   $7 = HEAP8[$6>>0]|0;
   $8 = ($7<<24>>24)<(0);
   if ($8) {
    $9 = HEAP32[$$sroa$047$059>>2]|0;
    $11 = $9;
   } else {
    $11 = $$sroa$047$059;
   }
   $10 = HEAP8[$11>>0]|0;
   $12 = ($10<<24>>24)==(-32);
   if ($12) {
    $$3 = 1;
    label = 23;
    break;
   }
   $13 = HEAP8[$6>>0]|0;
   $14 = ($13<<24>>24)<(0);
   if ($14) {
    $15 = HEAP32[$$sroa$047$059>>2]|0;
    $17 = $15;
   } else {
    $17 = $$sroa$047$059;
   }
   $16 = HEAP8[$17>>0]|0;
   $18 = ($16<<24>>24)==(-18);
   if ($18) {
    $19 = HEAP8[$6>>0]|0;
    $20 = ($19<<24>>24)<(0);
    if ($20) {
     $21 = ((($$sroa$047$059)) + 4|0);
     $22 = HEAP32[$21>>2]|0;
     $25 = $22;
    } else {
     $23 = $19&255;
     $25 = $23;
    }
    $24 = ($25>>>0)>(14);
    if ($24) {
     $26 = HEAP8[$6>>0]|0;
     $27 = ($26<<24>>24)<(0);
     if ($27) {
      $28 = HEAP32[$$sroa$047$059>>2]|0;
      $30 = $28;
     } else {
      $30 = $$sroa$047$059;
     }
     $29 = ((($30)) + 14|0);
     $31 = HEAP8[$29>>0]|0;
     $$230$off0$ph = 1;$$234$ph = $31;
    } else {
     $$230$off0$ph = $$028$off061;$$234$ph = $$03260;
    }
   } else {
    $$230$off0$ph = $$028$off061;$$234$ph = $$03260;
   }
   $32 = ((($$sroa$047$059)) + 12|0);
   $33 = ($32|0)==($4|0);
   if ($33) {
    break;
   } else {
    $$028$off061 = $$230$off0$ph;$$03260 = $$234$ph;$$sroa$047$059 = $32;
   }
  }
  if ((label|0) == 23) {
   return ($$3|0);
  }
  if ($$230$off0$ph) {
   $34 = ($$234$ph<<24>>24)!=(0);
   $$3 = $34;
   return ($$3|0);
  }
 }
 $35 = ((($0)) + 80|0);
 $36 = HEAP32[$35>>2]|0;
 $37 = HEAP32[$36>>2]|0;
 $38 = ((($36)) + 40|0);
 $39 = HEAP32[$38>>2]|0;
 $40 = ($37|0)!=(82);
 $41 = ($39|0)!=(71);
 $or$cond = $40 | $41;
 if ($or$cond) {
  $$3 = 1;
  return ($$3|0);
 }
 $42 = ((($36)) + 80|0);
 $43 = HEAP32[$42>>2]|0;
 $44 = ($43|0)!=(66);
 $$3 = $44;
 return ($$3|0);
}
function __ZN9knusperli15DecodeJpegToRGBERKNS_8JPEGDataE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $2 = sp;
 $3 = ((($1)) + 80|0);
 $4 = ((($1)) + 84|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = HEAP32[$3>>2]|0;
 $7 = (($5) - ($6))|0;
 $8 = (($7|0) / 40)&-1;
 switch ($8|0) {
 case 1:  {
  label = 5;
  break;
 }
 case 3:  {
  $9 = (__ZN9knusperli18HasYCbCrColorSpaceERKNS_8JPEGDataE($1)|0);
  if ($9) {
   $10 = (__ZNK9knusperli8JPEGData5Is420Ev($1)|0);
   if ($10) {
    label = 5;
   } else {
    $11 = (__ZNK9knusperli8JPEGData5Is444Ev($1)|0);
    if ($11) {
     label = 5;
    } else {
     label = 6;
    }
   }
  } else {
   label = 6;
  }
  break;
 }
 default: {
  label = 6;
 }
 }
 if ((label|0) == 5) {
  $12 = HEAP32[$1>>2]|0;
  $13 = ((($1)) + 4|0);
  $14 = HEAP32[$13>>2]|0;
  __ZN9knusperli11OutputImageC2Eii($2,$12,$14);
  __ZN9knusperli11OutputImage16CopyFromJpegDataERKNS_8JPEGDataE($2,$1);
  __ZNK9knusperli11OutputImage6ToSRGBEv($0,$2);
  __ZN9knusperli11OutputImageD2Ev($2);
  STACKTOP = sp;return;
 }
 else if ((label|0) == 6) {
  HEAP32[$0>>2] = 0;
  $15 = ((($0)) + 4|0);
  HEAP32[$15>>2] = 0;
  $16 = ((($0)) + 8|0);
  HEAP32[$16>>2] = 0;
  STACKTOP = sp;return;
 }
}
function __ZN9knusperli11OutputImageD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 8|0);
 __ZNSt3__213__vector_baseIN9knusperli20OutputImageComponentENS_9allocatorIS2_EEED2Ev($1);
 return;
}
function __ZNSt3__213__vector_baseIN9knusperli20OutputImageComponentENS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -308|0);
   HEAP32[$3>>2] = $6;
   __ZN9knusperli20OutputImageComponentD2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($1|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 __ZdlPv($10);
 return;
}
function __ZN9knusperli20OutputImageComponentD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 40|0);
 __ZNSt3__213__vector_baseItNS_9allocatorItEEED2Ev($1);
 $2 = ((($0)) + 28|0);
 __ZNSt3__213__vector_baseIsNS_9allocatorIsEEED2Ev($2);
 return;
}
function __ZNSt3__213__vector_baseItNS_9allocatorItEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i = 0, $scevgep4$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $scevgep$i$i = ((($4)) + -2|0);
  $6 = $scevgep$i$i;
  $7 = $1;
  $8 = (($6) - ($7))|0;
  $9 = $8 >>> 1;
  $10 = $9 ^ -1;
  $scevgep4$i$i = (($4) + ($10<<1)|0);
  HEAP32[$3>>2] = $scevgep4$i$i;
 }
 $11 = HEAP32[$0>>2]|0;
 __ZdlPv($11);
 return;
}
function __ZN9knusperli8ReadJpegEPKhjNS_12JpegReadModeEPNS_8JPEGDataE($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0$i$i = 0, $$0$shrunk = 0, $$090$off0 = 0, $$093$off0 = 0, $$096$off0 = 0, $$191$off0161 = 0, $$194$off0 = 0, $$194$off0160 = 0, $$197$off0159 = 0, $$3 = 0, $$5 = 0, $$not$not = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0;
 var $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0;
 var $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0;
 var $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0;
 var $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0;
 var $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0;
 var $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $brmerge$not = 0, $brmerge153$not = 0, $or$cond = 0, $vararg_buffer = 0, $vararg_buffer11 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_ptr1 = 0, $vararg_ptr10 = 0, $vararg_ptr14 = 0, $vararg_ptr15 = 0;
 var $vararg_ptr2 = 0, $vararg_ptr9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 624|0;
 $vararg_buffer11 = sp + 40|0;
 $vararg_buffer6 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $4 = sp + 608|0;
 $5 = sp + 88|0;
 $6 = sp + 76|0;
 $7 = sp + 64|0;
 $8 = sp + 96|0;
 $9 = sp + 52|0;
 HEAP32[$5>>2] = 0;
 $10 = ($1>>>0)<(2);
 if (!($10)) {
  $11 = HEAP8[$0>>0]|0;
  $12 = ($11<<24>>24)==(-1);
  if ($12) {
   $21 = ((($0)) + 1|0);
   $22 = HEAP8[$21>>0]|0;
   HEAP32[$5>>2] = 2;
   $23 = ($22<<24>>24)==(-40);
   if (!($23)) {
    $24 = $22&255;
    $25 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer3>>2] = $24;
    (_fprintf($25,5289,$vararg_buffer3)|0);
    $26 = ((($3)) + 148|0);
    HEAP32[$26>>2] = 1;
    $$5 = 0;
    STACKTOP = sp;return ($$5|0);
   }
   __ZNSt3__26vectorIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEEC2Ej($6,3032);
   __ZNSt3__26vectorIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEEC2Ej($7,3032);
   _memset(($8|0),0,512)|0;
   $27 = ((($3)) + 108|0);
   $28 = ((($3)) + 112|0);
   $$not$not = ($2|0)==(0);
   $29 = ((($3)) + 104|0);
   $30 = ($2|0)==(2);
   $31 = ($2|0)==(1);
   $32 = ($2|0)==(1);
   $33 = ((($3)) + 108|0);
   $34 = ((($3)) + 112|0);
   $35 = ((($9)) + 11|0);
   $36 = ((($3)) + 120|0);
   $37 = ((($3)) + 124|0);
   $38 = ((($3)) + 116|0);
   $39 = ((($9)) + 8|0);
   $40 = ((($9)) + 4|0);
   $41 = ((($3)) + 104|0);
   $$090$off0 = 0;$$093$off0 = 0;$$096$off0 = 0;
   L8: while(1) {
    $42 = HEAP32[$5>>2]|0;
    $43 = (__ZN9knusperli12_GLOBAL__N_114FindNextMarkerEPKhjj($0,$1,$42)|0);
    $44 = ($43|0)==(0);
    if (!($44)) {
     HEAP8[$4>>0] = -1;
     $45 = HEAP32[$33>>2]|0;
     $46 = HEAP32[$34>>2]|0;
     $47 = ($45>>>0)<($46>>>0);
     if ($47) {
      HEAP8[$45>>0] = -1;
      $48 = HEAP32[$33>>2]|0;
      $49 = ((($48)) + 1|0);
      HEAP32[$33>>2] = $49;
     } else {
      __ZNSt3__26vectorIhNS_9allocatorIhEEE21__push_back_slow_pathIhEEvOT_($41,$4);
     }
     $50 = HEAP32[$5>>2]|0;
     $51 = (($0) + ($50)|0);
     ;HEAP32[$9>>2]=0|0;HEAP32[$9+4>>2]=0|0;HEAP32[$9+8>>2]=0|0;
     $52 = ($43>>>0)>(4294967279);
     if ($52) {
      label = 14;
      break;
     }
     $53 = ($43>>>0)<(11);
     if ($53) {
      $54 = $43&255;
      HEAP8[$35>>0] = $54;
      $$0$i$i = $9;
     } else {
      $55 = (($43) + 16)|0;
      $56 = $55 & -16;
      $57 = (__Znwj($56)|0);
      HEAP32[$9>>2] = $57;
      $58 = $56 | -2147483648;
      HEAP32[$39>>2] = $58;
      HEAP32[$40>>2] = $43;
      $$0$i$i = $57;
     }
     (__ZNSt3__211char_traitsIcE4copyEPcPKcj($$0$i$i,$51,$43)|0);
     $59 = (($$0$i$i) + ($43)|0);
     HEAP8[$4>>0] = 0;
     __ZNSt3__211char_traitsIcE6assignERcRKc($59,$4);
     $60 = HEAP32[$36>>2]|0;
     $61 = HEAP32[$37>>2]|0;
     $62 = ($60>>>0)<($61>>>0);
     if ($62) {
      ;HEAP32[$60>>2]=HEAP32[$9>>2]|0;HEAP32[$60+4>>2]=HEAP32[$9+4>>2]|0;HEAP32[$60+8>>2]=HEAP32[$9+8>>2]|0;
      ;HEAP32[$9>>2]=0|0;HEAP32[$9+4>>2]=0|0;HEAP32[$9+8>>2]=0|0;
      $63 = HEAP32[$36>>2]|0;
      $64 = ((($63)) + 12|0);
      HEAP32[$36>>2] = $64;
     } else {
      __ZNSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE21__push_back_slow_pathIS6_EEvOT_($38,$9);
     }
     __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($9);
     $65 = HEAP32[$5>>2]|0;
     $66 = (($65) + ($43))|0;
     HEAP32[$5>>2] = $66;
    }
    $67 = HEAP32[$5>>2]|0;
    $68 = (($67) + 2)|0;
    $69 = ($68>>>0)>($1>>>0);
    if ($69) {
     label = 24;
     break;
    }
    $70 = (($0) + ($67)|0);
    $71 = HEAP8[$70>>0]|0;
    $72 = ($71<<24>>24)==(-1);
    if (!($72)) {
     label = 24;
     break;
    }
    $80 = (($67) + 1)|0;
    $81 = (($0) + ($80)|0);
    $82 = HEAP8[$81>>0]|0;
    HEAP32[$5>>2] = $68;
    switch ($82<<24>>24) {
    case -62: case -63: case -64:  {
     $83 = (__ZN9knusperli12_GLOBAL__N_110ProcessSOFEPKhjNS_12JpegReadModeEPjPNS_8JPEGDataE($0,$1,$2,$5,$3)|0);
     $84 = ($82<<24>>24)==(-62);
     if ($83) {
      $$191$off0161 = $84;$$194$off0160 = $$093$off0;$$197$off0159 = 1;
     } else {
      $$3 = 0;
      break L8;
     }
     break;
    }
    case -60:  {
     $85 = (__ZN9knusperli12_GLOBAL__N_110ProcessDHTEPKhjNS_12JpegReadModeEPNSt3__26vectorINS_17HuffmanTableEntryENS4_9allocatorIS6_EEEESA_PjPNS_8JPEGDataE($0,$1,$2,$6,$7,$5,$3)|0);
     $$0$shrunk = $85;$$194$off0 = 1;
     label = 39;
     break;
    }
    case -39: case -41: case -42: case -43: case -44: case -45: case -46: case -47: case -48:  {
     $$191$off0161 = $$090$off0;$$194$off0160 = $$093$off0;$$197$off0159 = $$096$off0;
     break;
    }
    case -38:  {
     if ($30) {
      $86 = (__ZN9knusperli12_GLOBAL__N_111ProcessScanEPKhjRKNSt3__26vectorINS_17HuffmanTableEntryENS3_9allocatorIS5_EEEESA_PA64_tbPjPNS_8JPEGDataE($0,$1,$6,$7,$8,$$090$off0,$5,$3)|0);
      $$0$shrunk = $86;$$194$off0 = $$093$off0;
      label = 39;
     } else {
      $$191$off0161 = $$090$off0;$$194$off0160 = $$093$off0;$$197$off0159 = $$096$off0;
     }
     break;
    }
    case -37:  {
     $87 = (__ZN9knusperli12_GLOBAL__N_110ProcessDQTEPKhjPjPNS_8JPEGDataE($0,$1,$5,$3)|0);
     $$0$shrunk = $87;$$194$off0 = $$093$off0;
     label = 39;
     break;
    }
    case -35:  {
     $88 = (__ZN9knusperli12_GLOBAL__N_110ProcessDRIEPKhjPjPNS_8JPEGDataE($0,$1,$5,$3)|0);
     if ($88) {
      $$191$off0161 = $$090$off0;$$194$off0160 = $$093$off0;$$197$off0159 = $$096$off0;
     } else {
      $$3 = 0;
      break L8;
     }
     break;
    }
    case -17: case -18: case -19: case -20: case -21: case -22: case -23: case -24: case -25: case -26: case -27: case -28: case -29: case -30: case -31: case -32:  {
     if ($31) {
      $$191$off0161 = $$090$off0;$$194$off0160 = $$093$off0;$$197$off0159 = $$096$off0;
     } else {
      $89 = (__ZN9knusperli12_GLOBAL__N_110ProcessAPPEPKhjPjPNS_8JPEGDataE($0,$1,$5,$3)|0);
      $$0$shrunk = $89;$$194$off0 = $$093$off0;
      label = 39;
     }
     break;
    }
    case -2:  {
     if ($32) {
      $$191$off0161 = $$090$off0;$$194$off0160 = $$093$off0;$$197$off0159 = $$096$off0;
     } else {
      $90 = (__ZN9knusperli12_GLOBAL__N_110ProcessCOMEPKhjPjPNS_8JPEGDataE($0,$1,$5,$3)|0);
      $$0$shrunk = $90;$$194$off0 = $$093$off0;
      label = 39;
     }
     break;
    }
    default: {
     label = 38;
     break L8;
    }
    }
    if ((label|0) == 39) {
     label = 0;
     if ($$0$shrunk) {
      $$191$off0161 = $$090$off0;$$194$off0160 = $$194$off0;$$197$off0159 = $$096$off0;
     } else {
      $$3 = 0;
      break;
     }
    }
    HEAP8[$4>>0] = $82;
    $94 = HEAP32[$27>>2]|0;
    $95 = HEAP32[$28>>2]|0;
    $96 = ($94>>>0)<($95>>>0);
    if ($96) {
     HEAP8[$94>>0] = $82;
     $97 = HEAP32[$27>>2]|0;
     $98 = ((($97)) + 1|0);
     HEAP32[$27>>2] = $98;
    } else {
     __ZNSt3__26vectorIhNS_9allocatorIhEEE21__push_back_slow_pathIhEEvOT_($29,$4);
    }
    $brmerge$not = $$not$not & $$197$off0159;
    $brmerge153$not = $$194$off0160 & $brmerge$not;
    $99 = ($82<<24>>24)==(-39);
    $or$cond = $99 | $brmerge153$not;
    if ($or$cond) {
     label = 44;
     break;
    } else {
     $$090$off0 = $$191$off0161;$$093$off0 = $$194$off0160;$$096$off0 = $$197$off0159;
    }
   }
   do {
    if ((label|0) == 14) {
     __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($9);
     // unreachable;
    }
    else if ((label|0) == 24) {
     $73 = HEAP32[1138]|0;
     $74 = ($67>>>0)<($1>>>0);
     if ($74) {
      $75 = (($0) + ($67)|0);
      $76 = HEAP8[$75>>0]|0;
      $77 = $76&255;
      $78 = $77;
     } else {
      $78 = 0;
     }
     HEAP32[$vararg_buffer6>>2] = $78;
     $vararg_ptr9 = ((($vararg_buffer6)) + 4|0);
     HEAP32[$vararg_ptr9>>2] = $67;
     $vararg_ptr10 = ((($vararg_buffer6)) + 8|0);
     HEAP32[$vararg_ptr10>>2] = $1;
     (_fprintf($73,5235,$vararg_buffer6)|0);
     $79 = ((($3)) + 148|0);
     HEAP32[$79>>2] = 4;
     $$3 = 0;
    }
    else if ((label|0) == 38) {
     $91 = $82&255;
     $92 = HEAP32[1138]|0;
     HEAP32[$vararg_buffer11>>2] = $91;
     $vararg_ptr14 = ((($vararg_buffer11)) + 4|0);
     HEAP32[$vararg_ptr14>>2] = $68;
     $vararg_ptr15 = ((($vararg_buffer11)) + 8|0);
     HEAP32[$vararg_ptr15>>2] = $1;
     (_fprintf($92,5334,$vararg_buffer11)|0);
     $93 = ((($3)) + 148|0);
     HEAP32[$93>>2] = 5;
     $$3 = 0;
    }
    else if ((label|0) == 44) {
     if (!($$197$off0159)) {
      $100 = HEAP32[1138]|0;
      (_fwrite(5372,20,1,$100)|0);
      $101 = ((($3)) + 148|0);
      HEAP32[$101>>2] = 2;
      $$3 = 0;
      break;
     }
     $102 = ($2|0)==(2);
     if ($102) {
      $103 = HEAP32[$5>>2]|0;
      $104 = ($103>>>0)<($1>>>0);
      if ($104) {
       $105 = ((($3)) + 128|0);
       $106 = (($0) + ($103)|0);
       $107 = (($1) - ($103))|0;
       (__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6assignEPKcj($105,$106,$107)|0);
      }
      $108 = (__ZN9knusperli12_GLOBAL__N_112FixupIndexesEPNS_8JPEGDataE($3)|0);
      if ($108) {
       $109 = ((($3)) + 68|0);
       $110 = ((($3)) + 72|0);
       $111 = HEAP32[$110>>2]|0;
       $112 = HEAP32[$109>>2]|0;
       $113 = (($111) - ($112))|0;
       $114 = $113 >> 5;
       $115 = ($114|0)==(0);
       if ($115) {
        $116 = HEAP32[1138]|0;
        (_fwrite(5393,38,1,$116)|0);
        $117 = ((($3)) + 148|0);
        HEAP32[$117>>2] = 35;
        $$3 = 0;
        break;
       }
       $118 = ($114>>>0)>(511);
       if ($118) {
        $119 = HEAP32[1138]|0;
        (_fwrite(5432,25,1,$119)|0);
        $120 = ((($3)) + 148|0);
        HEAP32[$120>>2] = 35;
        $$3 = 0;
       } else {
        $$3 = 1;
       }
      } else {
       $$3 = 0;
      }
     } else {
      $$3 = 1;
     }
    }
   } while(0);
   __ZNSt3__213__vector_baseIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEED2Ev($7);
   __ZNSt3__213__vector_baseIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEED2Ev($6);
   $$5 = $$3;
   STACKTOP = sp;return ($$5|0);
  }
 }
 $13 = HEAP32[1138]|0;
 $14 = HEAP32[$5>>2]|0;
 $15 = ($14>>>0)<($1>>>0);
 if ($15) {
  $16 = (($0) + ($14)|0);
  $17 = HEAP8[$16>>0]|0;
  $18 = $17&255;
  $19 = $18;
 } else {
  $19 = 0;
 }
 HEAP32[$vararg_buffer>>2] = $19;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $14;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 (_fprintf($13,5235,$vararg_buffer)|0);
 $20 = ((($3)) + 148|0);
 HEAP32[$20>>2] = 4;
 $$5 = 0;
 STACKTOP = sp;return ($$5|0);
}
function __ZNSt3__26vectorIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEEC2Ej($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = 0;
 $4 = ($1|0)==(0);
 if ($4) {
  return;
 }
 __ZNSt3__26vectorIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEE8allocateEj($0,$1);
 __ZNSt3__26vectorIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEE18__construct_at_endEj($0,$1);
 return;
}
function __ZN9knusperli12_GLOBAL__N_114FindNextMarkerEPKhjj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$01314 = 0, $$01314$phi = 0, $$015 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = (($2) + 1)|0;
 $4 = ($3>>>0)<($1>>>0);
 if ($4) {
  $$01314 = $2;$$015 = 0;$9 = $3;
 } else {
  $$0$lcssa = 0;
  return ($$0$lcssa|0);
 }
 while(1) {
  $5 = (($0) + ($$01314)|0);
  $6 = HEAP8[$5>>0]|0;
  $7 = ($6<<24>>24)==(-1);
  if ($7) {
   $8 = (($0) + ($9)|0);
   $10 = HEAP8[$8>>0]|0;
   $11 = ($10&255)<(192);
   if (!($11)) {
    $12 = $10&255;
    $13 = (($12) + -192)|0;
    $14 = (6964 + ($13)|0);
    $15 = HEAP8[$14>>0]|0;
    $16 = ($15<<24>>24)==(0);
    if (!($16)) {
     $$0$lcssa = $$015;
     label = 6;
     break;
    }
   }
  }
  $17 = (($$015) + 1)|0;
  $18 = (($9) + 1)|0;
  $19 = ($18>>>0)<($1>>>0);
  if ($19) {
   $$01314$phi = $9;$$015 = $17;$9 = $18;$$01314 = $$01314$phi;
  } else {
   $$0$lcssa = $17;
   label = 6;
   break;
  }
 }
 if ((label|0) == 6) {
  return ($$0$lcssa|0);
 }
 return (0)|0;
}
function __ZNSt3__26vectorIhNS_9allocatorIhEEE21__push_back_slow_pathIhEEvOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $2 = sp;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = HEAP32[$0>>2]|0;
 $6 = (($4) - ($5))|0;
 $7 = (($6) + 1)|0;
 $8 = (__ZNKSt3__26vectorIhNS_9allocatorIhEEE8max_sizeEv($0)|0);
 $9 = ($8>>>0)<($7>>>0);
 if ($9) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 } else {
  $10 = ((($0)) + 8|0);
  $11 = ((($0)) + 8|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = HEAP32[$0>>2]|0;
  $14 = (($12) - ($13))|0;
  $15 = $8 >>> 1;
  $16 = ($14>>>0)<($15>>>0);
  $17 = $14 << 1;
  $18 = ($17>>>0)<($7>>>0);
  $$sroa$speculated$i = $18 ? $7 : $17;
  $$sroa$speculated$$i = $16 ? $$sroa$speculated$i : $8;
  $19 = HEAP32[$3>>2]|0;
  $20 = (($19) - ($13))|0;
  __ZNSt3__214__split_bufferIhRNS_9allocatorIhEEEC2EjjS3_($2,$$sroa$speculated$$i,$20,$10);
  $21 = ((($2)) + 8|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = HEAP8[$1>>0]|0;
  HEAP8[$22>>0] = $23;
  $24 = HEAP32[$21>>2]|0;
  $25 = ((($24)) + 1|0);
  HEAP32[$21>>2] = $25;
  __ZNSt3__26vectorIhNS_9allocatorIhEEE26__swap_out_circular_bufferERNS_14__split_bufferIhRS2_EE($0,$2);
  __ZNSt3__214__split_bufferIhRNS_9allocatorIhEEED2Ev($2);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__211char_traitsIcE4copyEPcPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($2|0)==(0);
 if (!($3)) {
  _memcpy(($0|0),($1|0),($2|0))|0;
 }
 return ($0|0);
}
function __ZNSt3__211char_traitsIcE6assignERcRKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$1>>0]|0;
 HEAP8[$0>>0] = $2;
 return;
}
function __ZNSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE21__push_back_slow_pathIS6_EEvOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $2 = sp;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = HEAP32[$0>>2]|0;
 $6 = (($4) - ($5))|0;
 $7 = (($6|0) / 12)&-1;
 $8 = (($7) + 1)|0;
 $9 = (__ZNKSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE8max_sizeEv($0)|0);
 $10 = ($9>>>0)<($8>>>0);
 if ($10) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 } else {
  $11 = ((($0)) + 8|0);
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = HEAP32[$0>>2]|0;
  $15 = (($13) - ($14))|0;
  $16 = (($15|0) / 12)&-1;
  $17 = $9 >>> 1;
  $18 = ($16>>>0)<($17>>>0);
  $19 = $16 << 1;
  $20 = ($19>>>0)<($8>>>0);
  $$sroa$speculated$i = $20 ? $8 : $19;
  $$sroa$speculated$$i = $18 ? $$sroa$speculated$i : $9;
  $21 = HEAP32[$3>>2]|0;
  $22 = (($21) - ($14))|0;
  $23 = (($22|0) / 12)&-1;
  __ZNSt3__214__split_bufferINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS6_EEEC2EjjS8_($2,$$sroa$speculated$$i,$23,$11);
  $24 = ((($2)) + 8|0);
  $25 = HEAP32[$24>>2]|0;
  ;HEAP32[$25>>2]=HEAP32[$1>>2]|0;HEAP32[$25+4>>2]=HEAP32[$1+4>>2]|0;HEAP32[$25+8>>2]=HEAP32[$1+8>>2]|0;
  ;HEAP32[$1>>2]=0|0;HEAP32[$1+4>>2]=0|0;HEAP32[$1+8>>2]=0|0;
  $26 = HEAP32[$24>>2]|0;
  $27 = ((($26)) + 12|0);
  HEAP32[$24>>2] = $27;
  __ZNSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS6_RS7_EE($0,$2);
  __ZNSt3__214__split_bufferINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS6_EEED2Ev($2);
  STACKTOP = sp;return;
 }
}
function __ZN9knusperli12_GLOBAL__N_110ProcessSOFEPKhjNS_12JpegReadModeEPjPNS_8JPEGDataE($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$ = 0, $$0$189 = 0, $$0$193 = 0, $$0176227 = 0, $$0177228 = 0, $$11 = 0, $$8 = 0, $$off = 0, $$off184 = 0, $$off185 = 0, $$off186 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0;
 var $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0;
 var $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0;
 var $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer11 = 0;
 var $vararg_buffer15 = 0, $vararg_buffer19 = 0, $vararg_buffer24 = 0, $vararg_buffer27 = 0, $vararg_buffer3 = 0, $vararg_buffer31 = 0, $vararg_buffer35 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr10 = 0, $vararg_ptr14 = 0, $vararg_ptr18 = 0, $vararg_ptr2 = 0, $vararg_ptr22 = 0, $vararg_ptr23 = 0, $vararg_ptr30 = 0, $vararg_ptr34 = 0, $vararg_ptr38 = 0, $vararg_ptr6 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0;
 $vararg_buffer35 = sp + 88|0;
 $vararg_buffer31 = sp + 80|0;
 $vararg_buffer27 = sp + 72|0;
 $vararg_buffer24 = sp + 64|0;
 $vararg_buffer19 = sp + 48|0;
 $vararg_buffer15 = sp + 40|0;
 $vararg_buffer11 = sp + 32|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $5 = sp + 104|0;
 $6 = sp + 100|0;
 $7 = sp + 96|0;
 $8 = HEAP32[$4>>2]|0;
 $9 = ($8|0)==(0);
 if (!($9)) {
  $10 = HEAP32[1138]|0;
  (_fwrite(6798,22,1,$10)|0);
  $11 = ((($4)) + 148|0);
  HEAP32[$11>>2] = 30;
  $$11 = 0;
  STACKTOP = sp;return ($$11|0);
 }
 $12 = HEAP32[$3>>2]|0;
 $13 = (($12) + 8)|0;
 $14 = ($13>>>0)>($1>>>0);
 if ($14) {
  $15 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer>>2] = $12;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 8;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $1;
  (_fprintf($15,5502,$vararg_buffer)|0);
  $16 = ((($4)) + 148|0);
  HEAP32[$16>>2] = 3;
  $$11 = 0;
  STACKTOP = sp;return ($$11|0);
 }
 $17 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$3)|0);
 $18 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$3)|0);
 $19 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$3)|0);
 $20 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$3)|0);
 $21 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$3)|0);
 $22 = ($18|0)==(8);
 if (!($22)) {
  $23 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer3>>2] = 6821;
  $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
  HEAP32[$vararg_ptr6>>2] = $18;
  (_fprintf($23,5550,$vararg_buffer3)|0);
  $24 = ((($4)) + 148|0);
  HEAP32[$24>>2] = 7;
  $$11 = 0;
  STACKTOP = sp;return ($$11|0);
 }
 $$off = (($19) + -1)|0;
 $25 = ($$off>>>0)>(65534);
 if ($25) {
  $26 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer7>>2] = 6831;
  $vararg_ptr10 = ((($vararg_buffer7)) + 4|0);
  HEAP32[$vararg_ptr10>>2] = $19;
  (_fprintf($26,5550,$vararg_buffer7)|0);
  $27 = ((($4)) + 148|0);
  HEAP32[$27>>2] = 9;
  $$11 = 0;
  STACKTOP = sp;return ($$11|0);
 }
 $$off184 = (($20) + -1)|0;
 $28 = ($$off184>>>0)>(65534);
 if ($28) {
  $29 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer11>>2] = 6838;
  $vararg_ptr14 = ((($vararg_buffer11)) + 4|0);
  HEAP32[$vararg_ptr14>>2] = $20;
  (_fprintf($29,5550,$vararg_buffer11)|0);
  $30 = ((($4)) + 148|0);
  HEAP32[$30>>2] = 8;
  $$11 = 0;
  STACKTOP = sp;return ($$11|0);
 }
 $$off185 = (($21) + -1)|0;
 $31 = ($$off185>>>0)>(3);
 if ($31) {
  $32 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer15>>2] = 6844;
  $vararg_ptr18 = ((($vararg_buffer15)) + 4|0);
  HEAP32[$vararg_ptr18>>2] = $21;
  (_fprintf($32,5550,$vararg_buffer15)|0);
  $33 = ((($4)) + 148|0);
  HEAP32[$33>>2] = 10;
  $$11 = 0;
  STACKTOP = sp;return ($$11|0);
 }
 $34 = HEAP32[$3>>2]|0;
 $35 = ($21*3)|0;
 $36 = (($34) + ($35))|0;
 $37 = ($36>>>0)>($1>>>0);
 if ($37) {
  $38 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer19>>2] = $34;
  $vararg_ptr22 = ((($vararg_buffer19)) + 4|0);
  HEAP32[$vararg_ptr22>>2] = $35;
  $vararg_ptr23 = ((($vararg_buffer19)) + 8|0);
  HEAP32[$vararg_ptr23>>2] = $1;
  (_fprintf($38,5502,$vararg_buffer19)|0);
  $39 = ((($4)) + 148|0);
  HEAP32[$39>>2] = 3;
  $$11 = 0;
  STACKTOP = sp;return ($$11|0);
 }
 $40 = ((($4)) + 4|0);
 HEAP32[$40>>2] = $19;
 HEAP32[$4>>2] = $20;
 $41 = ((($4)) + 80|0);
 __ZNSt3__26vectorIN9knusperli13JPEGComponentENS_9allocatorIS2_EEE6resizeEj($41,$21);
 HEAP8[$6>>0] = 0;
 __ZNSt3__26vectorIbNS_9allocatorIbEEEC2EjRKb($5,256,$6);
 $42 = ((($4)) + 84|0);
 $43 = HEAP32[$42>>2]|0;
 $44 = HEAP32[$41>>2]|0;
 $45 = ($43|0)==($44|0);
 L29: do {
  if ($45) {
   label = 25;
  } else {
   $46 = ((($4)) + 12|0);
   $47 = ((($4)) + 16|0);
   $$0177228 = 0;
   while(1) {
    $48 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$3)|0);
    $49 = HEAP32[$5>>2]|0;
    $50 = $48 >>> 5;
    $51 = (($49) + ($50<<2)|0);
    $52 = $48 & 31;
    $53 = 1 << $52;
    $54 = HEAP32[$51>>2]|0;
    $55 = $53 & $54;
    $56 = ($55|0)==(0);
    if (!($56)) {
     label = 18;
     break;
    }
    $59 = $54 | $53;
    HEAP32[$51>>2] = $59;
    $60 = HEAP32[$41>>2]|0;
    $61 = (($60) + (($$0177228*40)|0)|0);
    HEAP32[$61>>2] = $48;
    $62 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$3)|0);
    $63 = $62 >> 4;
    HEAP32[$6>>2] = $63;
    $64 = $62 & 15;
    HEAP32[$7>>2] = $64;
    $$off186 = (($63) + -1)|0;
    $65 = ($$off186>>>0)>(14);
    if ($65) {
     label = 20;
     break;
    }
    $67 = ($64|0)==(0);
    if ($67) {
     label = 22;
     break;
    }
    $70 = HEAP32[$41>>2]|0;
    $71 = (((($70) + (($$0177228*40)|0)|0)) + 4|0);
    HEAP32[$71>>2] = $63;
    $$0$ = HEAP32[$7>>2]|0;
    $72 = HEAP32[$41>>2]|0;
    $73 = (((($72) + (($$0177228*40)|0)|0)) + 8|0);
    HEAP32[$73>>2] = $$0$;
    $74 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$3)|0);
    $75 = HEAP32[$41>>2]|0;
    $76 = (((($75) + (($$0177228*40)|0)|0)) + 12|0);
    HEAP32[$76>>2] = $74;
    $77 = HEAP32[$46>>2]|0;
    $$0$193 = HEAP32[$6>>2]|0;
    $78 = ($77|0)<($$0$193|0);
    $79 = $78 ? $$0$193 : $77;
    HEAP32[$46>>2] = $79;
    $80 = HEAP32[$47>>2]|0;
    $$0$189 = HEAP32[$7>>2]|0;
    $81 = ($80|0)<($$0$189|0);
    $82 = $81 ? $$0$189 : $80;
    HEAP32[$47>>2] = $82;
    $83 = (($$0177228) + 1)|0;
    $84 = HEAP32[$42>>2]|0;
    $85 = HEAP32[$41>>2]|0;
    $86 = (($84) - ($85))|0;
    $87 = (($86|0) / 40)&-1;
    $88 = ($83>>>0)<($87>>>0);
    if ($88) {
     $$0177228 = $83;
    } else {
     label = 25;
     break L29;
    }
   }
   if ((label|0) == 18) {
    $57 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer24>>2] = $48;
    (_fprintf($57,6859,$vararg_buffer24)|0);
    $58 = ((($4)) + 148|0);
    HEAP32[$58>>2] = 32;
    $$8 = 0;
    break;
   }
   else if ((label|0) == 20) {
    $66 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer27>>2] = 6884;
    $vararg_ptr30 = ((($vararg_buffer27)) + 4|0);
    HEAP32[$vararg_ptr30>>2] = $63;
    (_fprintf($66,5550,$vararg_buffer27)|0);
   }
   else if ((label|0) == 22) {
    $68 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer31>>2] = 6898;
    $vararg_ptr34 = ((($vararg_buffer31)) + 4|0);
    HEAP32[$vararg_ptr34>>2] = $64;
    (_fprintf($68,5550,$vararg_buffer31)|0);
   }
   $69 = ((($4)) + 148|0);
   HEAP32[$69>>2] = 11;
   $$8 = 0;
  }
 } while(0);
 L41: do {
  if ((label|0) == 25) {
   $89 = HEAP32[$40>>2]|0;
   $90 = ((($4)) + 16|0);
   $91 = HEAP32[$90>>2]|0;
   $92 = $91 << 3;
   $93 = (__ZN9knusperli12_GLOBAL__N_17DivCeilEii($89,$92)|0);
   $94 = ((($4)) + 20|0);
   HEAP32[$94>>2] = $93;
   $95 = HEAP32[$4>>2]|0;
   $96 = ((($4)) + 12|0);
   $97 = HEAP32[$96>>2]|0;
   $98 = $97 << 3;
   $99 = (__ZN9knusperli12_GLOBAL__N_17DivCeilEii($95,$98)|0);
   $100 = ((($4)) + 24|0);
   HEAP32[$100>>2] = $99;
   $101 = ($2|0)==(2);
   L43: do {
    if ($101) {
     $102 = HEAP32[$42>>2]|0;
     $103 = HEAP32[$41>>2]|0;
     $104 = ($102|0)==($103|0);
     if (!($104)) {
      $$0176227 = 0;
      while(1) {
       $105 = HEAP32[$41>>2]|0;
       $106 = HEAP32[$96>>2]|0;
       $107 = (((($105) + (($$0176227*40)|0)|0)) + 4|0);
       $108 = HEAP32[$107>>2]|0;
       $109 = (($106|0) % ($108|0))&-1;
       $110 = ($109|0)==(0);
       if (!($110)) {
        label = 30;
        break;
       }
       $111 = HEAP32[$90>>2]|0;
       $112 = (((($105) + (($$0176227*40)|0)|0)) + 8|0);
       $113 = HEAP32[$112>>2]|0;
       $114 = (($111|0) % ($113|0))&-1;
       $115 = ($114|0)==(0);
       if (!($115)) {
        label = 30;
        break;
       }
       $118 = HEAP32[$100>>2]|0;
       $119 = Math_imul($118, $108)|0;
       $120 = (((($105) + (($$0176227*40)|0)|0)) + 16|0);
       HEAP32[$120>>2] = $119;
       $121 = HEAP32[$94>>2]|0;
       $122 = Math_imul($121, $113)|0;
       $123 = (((($105) + (($$0176227*40)|0)|0)) + 20|0);
       HEAP32[$123>>2] = $122;
       $124 = ($119|0)<(0);
       $125 = $124 << 31 >> 31;
       $126 = ($122|0)<(0);
       $127 = $126 << 31 >> 31;
       $128 = (___muldi3(($122|0),($127|0),($119|0),($125|0))|0);
       $129 = tempRet0;
       $130 = ($129>>>0)>(0);
       $131 = ($128>>>0)>(2097152);
       $132 = ($129|0)==(0);
       $133 = $132 & $131;
       $134 = $130 | $133;
       if ($134) {
        label = 32;
        break;
       }
       $137 = (((($105) + (($$0176227*40)|0)|0)) + 24|0);
       HEAP32[$137>>2] = $128;
       $138 = (((($105) + (($$0176227*40)|0)|0)) + 28|0);
       $139 = $128 << 6;
       __ZNSt3__26vectorIsNS_9allocatorIsEEE6resizeEj($138,$139);
       $140 = (($$0176227) + 1)|0;
       $141 = HEAP32[$42>>2]|0;
       $142 = HEAP32[$41>>2]|0;
       $143 = (($141) - ($142))|0;
       $144 = (($143|0) / 40)&-1;
       $145 = ($140>>>0)<($144>>>0);
       if ($145) {
        $$0176227 = $140;
       } else {
        break L43;
       }
      }
      if ((label|0) == 30) {
       $116 = HEAP32[1138]|0;
       (_fwrite(6912,33,1,$116)|0);
       $117 = ((($4)) + 148|0);
       HEAP32[$117>>2] = 20;
       $$8 = 0;
       break L41;
      }
      else if ((label|0) == 32) {
       $135 = HEAP32[1138]|0;
       (_fwrite(6946,17,1,$135)|0);
       $136 = ((($4)) + 148|0);
       HEAP32[$136>>2] = 41;
       $$8 = 0;
       break L41;
      }
     }
    }
   } while(0);
   $146 = (($17) + ($12))|0;
   $147 = HEAP32[$3>>2]|0;
   $148 = ($146|0)==($147|0);
   if ($148) {
    $$8 = 1;
   } else {
    $149 = ((($4)) + 148|0);
    $150 = (($147) - ($12))|0;
    $151 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer35>>2] = $17;
    $vararg_ptr38 = ((($vararg_buffer35)) + 4|0);
    HEAP32[$vararg_ptr38>>2] = $150;
    (_fprintf($151,5600,$vararg_buffer35)|0);
    HEAP32[$149>>2] = 6;
    $$8 = 0;
   }
  }
 } while(0);
 __ZNSt3__26vectorIbNS_9allocatorIbEEED2Ev($5);
 $$11 = $$8;
 STACKTOP = sp;return ($$11|0);
}
function __ZN9knusperli12_GLOBAL__N_110ProcessDHTEPKhjNS_12JpegReadModeEPNSt3__26vectorINS_17HuffmanTableEntryENS4_9allocatorIS6_EEEESA_PjPNS_8JPEGDataE($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 var $$0151200 = 0, $$0157199 = 0, $$0158$$0157 = 0, $$0158198 = 0, $$0160197 = 0, $$0161196 = 0, $$0201 = 0, $$2154 = 0, $$4156 = 0, $$8 = 0, $$not = 0, $$sink = 0, $$sink170 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0;
 var $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $13 = 0, $14 = 0, $15 = 0;
 var $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0;
 var $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0;
 var $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0;
 var $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $cond1 = 0, $exitcond = 0, $exitcond211 = 0, $or$cond = 0, $or$cond171 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer16 = 0, $vararg_buffer20 = 0, $vararg_buffer24 = 0, $vararg_buffer29 = 0, $vararg_buffer3 = 0, $vararg_buffer33 = 0;
 var $vararg_buffer36 = 0, $vararg_buffer8 = 0, $vararg_ptr1 = 0, $vararg_ptr11 = 0, $vararg_ptr15 = 0, $vararg_ptr19 = 0, $vararg_ptr2 = 0, $vararg_ptr23 = 0, $vararg_ptr27 = 0, $vararg_ptr28 = 0, $vararg_ptr32 = 0, $vararg_ptr39 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0;
 $vararg_buffer36 = sp + 96|0;
 $vararg_buffer33 = sp + 88|0;
 $vararg_buffer29 = sp + 80|0;
 $vararg_buffer24 = sp + 64|0;
 $vararg_buffer20 = sp + 56|0;
 $vararg_buffer16 = sp + 48|0;
 $vararg_buffer12 = sp + 40|0;
 $vararg_buffer8 = sp + 32|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $7 = sp + 120|0;
 $8 = sp + 104|0;
 $9 = sp + 152|0;
 $10 = HEAP32[$5>>2]|0;
 $11 = (($10) + 2)|0;
 $12 = ($11>>>0)>($1>>>0);
 if ($12) {
  $13 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer>>2] = $10;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 2;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $1;
  (_fprintf($13,5502,$vararg_buffer)|0);
  $14 = ((($6)) + 148|0);
  HEAP32[$14>>2] = 3;
  $$8 = 0;
  STACKTOP = sp;return ($$8|0);
 }
 $15 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$5)|0);
 $16 = ($15|0)==(2);
 if ($16) {
  $38 = HEAP32[1138]|0;
  (_fwrite(6634,35,1,$38)|0);
  $39 = ((($6)) + 148|0);
  HEAP32[$39>>2] = 37;
  $$8 = 0;
  STACKTOP = sp;return ($$8|0);
 }
 $17 = (($15) + ($10))|0;
 $18 = ((($7)) + 24|0);
 $19 = HEAP32[1138]|0;
 $20 = ((($6)) + 148|0);
 $21 = ((($6)) + 148|0);
 $22 = ((($6)) + 148|0);
 $23 = ((($7)) + 12|0);
 $24 = HEAP32[1138]|0;
 $25 = ((($6)) + 148|0);
 $26 = ((($7)) + 28|0);
 $27 = ($2|0)==(2);
 $28 = ((($6)) + 148|0);
 $29 = ((($6)) + 72|0);
 $30 = ((($6)) + 76|0);
 $31 = ((($6)) + 68|0);
 $32 = ((($7)) + 12|0);
 $33 = HEAP32[1138]|0;
 $34 = ((($6)) + 148|0);
 $35 = ((($6)) + 148|0);
 $36 = ((($6)) + 148|0);
 $37 = ((($6)) + 148|0);
 while(1) {
  $40 = HEAP32[$5>>2]|0;
  $41 = ($40>>>0)<($17>>>0);
  if (!($41)) {
   label = 43;
   break;
  }
  $42 = (($40) + 17)|0;
  $43 = ($42>>>0)>($1>>>0);
  if ($43) {
   label = 8;
   break;
  }
  __ZN9knusperli15JPEGHuffmanCodeC2Ev($7);
  $46 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$5)|0);
  HEAP32[$18>>2] = $46;
  $47 = $46 & 16;
  $48 = ($47|0)!=(0);
  if ($48) {
   $49 = (($46) + -16)|0;
   $50 = ($46|0)<(16);
   $51 = ($49|0)>(3);
   $or$cond = $50 | $51;
   if ($or$cond) {
    HEAP32[$vararg_buffer8>>2] = 6670;
    $vararg_ptr11 = ((($vararg_buffer8)) + 4|0);
    HEAP32[$vararg_ptr11>>2] = $49;
    (_fprintf($19,5550,$vararg_buffer8)|0);
    HEAP32[$20>>2] = 16;
    $$4156 = 1;
   } else {
    $$sink = $4;$$sink170 = $49;
    label = 14;
   }
  } else {
   $52 = ($46>>>0)>(3);
   if ($52) {
    HEAP32[$vararg_buffer12>>2] = 6670;
    $vararg_ptr15 = ((($vararg_buffer12)) + 4|0);
    HEAP32[$vararg_ptr15>>2] = $46;
    (_fprintf($33,5550,$vararg_buffer12)|0);
    HEAP32[$37>>2] = 16;
    $$4156 = 1;
   } else {
    $$sink = $3;$$sink170 = $46;
    label = 14;
   }
  }
  do {
   if ((label|0) == 14) {
    label = 0;
    $53 = HEAP32[$$sink>>2]|0;
    $54 = HEAP32[$7>>2]|0;
    HEAP32[$54>>2] = 0;
    $$0157199 = 1;$$0158198 = 1;$$0160197 = 65536;$$0161196 = 0;
    while(1) {
     $57 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$5)|0);
     $58 = ($57|0)==(0);
     $$0158$$0157 = $58 ? $$0158198 : $$0157199;
     $59 = HEAP32[$7>>2]|0;
     $60 = (($59) + ($$0157199<<2)|0);
     HEAP32[$60>>2] = $57;
     $61 = (($57) + ($$0161196))|0;
     $62 = (16 - ($$0157199))|0;
     $63 = $57 << $62;
     $64 = (($$0160197) - ($63))|0;
     $65 = (($$0157199) + 1)|0;
     $exitcond = ($65|0)==(17);
     if ($exitcond) {
      break;
     } else {
      $$0157199 = $65;$$0158198 = $$0158$$0157;$$0160197 = $64;$$0161196 = $61;
     }
    }
    $55 = ($$sink170*758)|0;
    $56 = (($53) + ($55<<2)|0);
    if ($48) {
     $66 = ($61>>>0)>(256);
     if ($66) {
      HEAP32[$vararg_buffer16>>2] = 6684;
      $vararg_ptr19 = ((($vararg_buffer16)) + 4|0);
      HEAP32[$vararg_ptr19>>2] = $61;
      (_fprintf($19,5550,$vararg_buffer16)|0);
      HEAP32[$21>>2] = 21;
      $$4156 = 1;
      break;
     }
    } else {
     $67 = ($61>>>0)>(12);
     if ($67) {
      HEAP32[$vararg_buffer20>>2] = 6684;
      $vararg_ptr23 = ((($vararg_buffer20)) + 4|0);
      HEAP32[$vararg_ptr23>>2] = $61;
      (_fprintf($33,5550,$vararg_buffer20)|0);
      HEAP32[$36>>2] = 21;
      $$4156 = 1;
      break;
     }
    }
    $68 = HEAP32[$5>>2]|0;
    $69 = (($68) + ($61))|0;
    $70 = ($69>>>0)>($1>>>0);
    if ($70) {
     HEAP32[$vararg_buffer24>>2] = $68;
     $vararg_ptr27 = ((($vararg_buffer24)) + 4|0);
     HEAP32[$vararg_ptr27>>2] = $61;
     $vararg_ptr28 = ((($vararg_buffer24)) + 8|0);
     HEAP32[$vararg_ptr28>>2] = $1;
     (_fprintf($19,5502,$vararg_buffer24)|0);
     HEAP32[$22>>2] = 3;
     $$4156 = 1;
     break;
    }
    HEAP8[$9>>0] = 0;
    __ZNSt3__26vectorIbNS_9allocatorIbEEEC2EjRKb($8,256,$9);
    $71 = ($61|0)>(0);
    L32: do {
     if ($71) {
      $$not = $48 ^ 1;
      $$0151200 = 0;
      while(1) {
       $72 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$5)|0);
       $73 = $72 & 255;
       $74 = ($73>>>0)>(11);
       $or$cond171 = $74 & $$not;
       if ($or$cond171) {
        label = 26;
        break;
       }
       $75 = HEAP32[$8>>2]|0;
       $76 = $73 >>> 5;
       $77 = (($75) + ($76<<2)|0);
       $78 = $72 & 31;
       $79 = 1 << $78;
       $80 = HEAP32[$77>>2]|0;
       $81 = $80 & $79;
       $82 = ($81|0)==(0);
       if (!($82)) {
        label = 28;
        break;
       }
       $83 = $80 | $79;
       HEAP32[$77>>2] = $83;
       $84 = HEAP32[$32>>2]|0;
       $85 = (($84) + ($$0151200<<2)|0);
       HEAP32[$85>>2] = $73;
       $86 = (($$0151200) + 1)|0;
       $87 = ($86|0)<($61|0);
       if ($87) {
        $$0151200 = $86;
       } else {
        label = 30;
        break L32;
       }
      }
      if ((label|0) == 26) {
       label = 0;
       HEAP32[$vararg_buffer29>>2] = 6696;
       $vararg_ptr32 = ((($vararg_buffer29)) + 4|0);
       HEAP32[$vararg_ptr32>>2] = $73;
       (_fprintf($33,5550,$vararg_buffer29)|0);
       HEAP32[$34>>2] = 21;
       $$2154 = 1;
       break;
      }
      else if ((label|0) == 28) {
       label = 0;
       HEAP32[$vararg_buffer33>>2] = $73;
       (_fprintf($33,6702,$vararg_buffer33)|0);
       HEAP32[$35>>2] = 21;
       $$2154 = 1;
       break;
      }
     } else {
      label = 30;
     }
    } while(0);
    do {
     if ((label|0) == 30) {
      label = 0;
      $88 = HEAP32[$7>>2]|0;
      $89 = (($88) + ($$0158$$0157<<2)|0);
      $90 = HEAP32[$89>>2]|0;
      $91 = (($90) + 1)|0;
      HEAP32[$89>>2] = $91;
      $92 = HEAP32[$23>>2]|0;
      $93 = (($92) + ($61<<2)|0);
      HEAP32[$93>>2] = 256;
      $94 = (16 - ($$0158$$0157))|0;
      $95 = 1 << $94;
      $96 = (($64) - ($95))|0;
      $97 = ($96|0)<(0);
      if ($97) {
       (_fwrite(6735,30,1,$24)|0);
       HEAP32[$25>>2] = 21;
       $$2154 = 1;
       break;
      }
      $98 = ($96|0)==(0);
      if (!($98)) {
       $99 = (((($53) + ($55<<2)|0)) + 2|0);
       $100 = HEAP16[$99>>1]|0;
       $101 = ($100<<16>>16)==(-1);
       if (!($101)) {
        $$0201 = 0;
        while(1) {
         $102 = (($56) + ($$0201<<2)|0);
         HEAP8[$102>>0] = 0;
         $103 = (((($56) + ($$0201<<2)|0)) + 2|0);
         HEAP16[$103>>1] = -1;
         $104 = (($$0201) + 1)|0;
         $exitcond211 = ($104|0)==(758);
         if ($exitcond211) {
          break;
         } else {
          $$0201 = $104;
         }
        }
       }
      }
      $105 = HEAP32[$5>>2]|0;
      $106 = ($105|0)==($17|0);
      $107 = $106&1;
      HEAP8[$26>>0] = $107;
      if ($27) {
       $108 = HEAP32[$7>>2]|0;
       $109 = HEAP32[$23>>2]|0;
       $110 = (__ZN9knusperli21BuildJpegHuffmanTableEPKiS1_PNS_17HuffmanTableEntryE($108,$109,$56)|0);
       $111 = ($110|0)==(0);
       if ($111) {
        (_fwrite(6766,31,1,$24)|0);
        HEAP32[$28>>2] = 21;
        $$2154 = 1;
        break;
       }
      }
      $112 = HEAP32[$29>>2]|0;
      $113 = HEAP32[$30>>2]|0;
      $114 = ($112|0)==($113|0);
      if ($114) {
       __ZNSt3__26vectorIN9knusperli15JPEGHuffmanCodeENS_9allocatorIS2_EEE21__push_back_slow_pathIRKS2_EEvOT_($31,$7);
       $$2154 = 0;
       break;
      } else {
       __ZN9knusperli15JPEGHuffmanCodeC2ERKS0_($112,$7);
       $115 = HEAP32[$29>>2]|0;
       $116 = ((($115)) + 32|0);
       HEAP32[$29>>2] = $116;
       $$2154 = 0;
       break;
      }
     }
    } while(0);
    __ZNSt3__26vectorIbNS_9allocatorIbEEED2Ev($8);
    $$4156 = $$2154;
   }
  } while(0);
  __ZN9knusperli15JPEGHuffmanCodeD2Ev($7);
  $cond1 = ($$4156|0)==(0);
  if (!($cond1)) {
   $$8 = 0;
   label = 45;
   break;
  }
 }
 if ((label|0) == 8) {
  $44 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer3>>2] = $40;
  $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
  HEAP32[$vararg_ptr6>>2] = 17;
  $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
  HEAP32[$vararg_ptr7>>2] = $1;
  (_fprintf($44,5502,$vararg_buffer3)|0);
  $45 = ((($6)) + 148|0);
  HEAP32[$45>>2] = 3;
  $$8 = 0;
  STACKTOP = sp;return ($$8|0);
 }
 else if ((label|0) == 43) {
  $117 = ($17|0)==($40|0);
  if ($117) {
   $$8 = 1;
   STACKTOP = sp;return ($$8|0);
  }
  $118 = ((($6)) + 148|0);
  $119 = (($40) - ($10))|0;
  $120 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer36>>2] = $15;
  $vararg_ptr39 = ((($vararg_buffer36)) + 4|0);
  HEAP32[$vararg_ptr39>>2] = $119;
  (_fprintf($120,5600,$vararg_buffer36)|0);
  HEAP32[$118>>2] = 6;
  $$8 = 0;
  STACKTOP = sp;return ($$8|0);
 }
 else if ((label|0) == 45) {
  STACKTOP = sp;return ($$8|0);
 }
 return (0)|0;
}
function __ZN9knusperli12_GLOBAL__N_111ProcessScanEPKhjRKNSt3__26vectorINS_17HuffmanTableEntryENS3_9allocatorIS5_EEEESA_PA64_tbPjPNS_8JPEGDataE($0,$1,$2,$3,$4,$5,$6,$7) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 var $$0218 = 0, $$0219 = 0, $$0220317 = 0, $$0225296 = 0, $$0226298 = 0, $$0237323 = 0, $$0248319 = 0, $$0249314 = 0, $$0250306 = 0, $$0251300 = 0, $$1221$lcssa = 0, $$1221309 = 0, $$14 = 0, $$15 = 0, $$2222 = 0, $$3223 = 0, $$sink = 0, $$sink252$ph = 0, $10 = 0, $100 = 0;
 var $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0;
 var $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0;
 var $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0;
 var $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0;
 var $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $not$ = 0;
 var $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer13 = 0, $vararg_buffer4 = 0, $vararg_ptr1 = 0, $vararg_ptr16 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr7 = 0, $vararg_ptr8 = 0, $vararg_ptr9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0;
 $vararg_buffer13 = sp + 80|0;
 $vararg_buffer10 = sp + 72|0;
 $vararg_buffer4 = sp + 56|0;
 $vararg_buffer = sp + 40|0;
 $8 = sp + 32|0;
 $9 = sp;
 $10 = sp + 92|0;
 $11 = sp + 88|0;
 $12 = (__ZN9knusperli12_GLOBAL__N_110ProcessSOSEPKhjPjPNS_8JPEGDataE($0,$1,$6,$7)|0);
 if (!($12)) {
  $$15 = 0;
  STACKTOP = sp;return ($$15|0);
 }
 $13 = ((($7)) + 96|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($14)) + -12|0);
 $16 = ((($14)) + -8|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = HEAP32[$15>>2]|0;
 $19 = (($17) - ($18))|0;
 $20 = (($19|0) / 12)&-1;
 $21 = ($20>>>0)>(1);
 if ($21) {
  $22 = ((($7)) + 24|0);
  $23 = HEAP32[$22>>2]|0;
  $24 = ((($7)) + 20|0);
  $25 = HEAP32[$24>>2]|0;
  $$0218 = $23;$$0219 = $25;
 } else {
  $26 = HEAP32[$15>>2]|0;
  $27 = HEAP32[$26>>2]|0;
  $28 = ((($7)) + 80|0);
  $29 = HEAP32[$28>>2]|0;
  $30 = HEAP32[$7>>2]|0;
  $31 = (((($29) + (($27*40)|0)|0)) + 4|0);
  $32 = HEAP32[$31>>2]|0;
  $33 = Math_imul($32, $30)|0;
  $34 = ((($7)) + 12|0);
  $35 = HEAP32[$34>>2]|0;
  $36 = $35 << 3;
  $37 = (__ZN9knusperli12_GLOBAL__N_17DivCeilEii($33,$36)|0);
  $38 = ((($7)) + 4|0);
  $39 = HEAP32[$38>>2]|0;
  $40 = (((($29) + (($27*40)|0)|0)) + 8|0);
  $41 = HEAP32[$40>>2]|0;
  $42 = Math_imul($41, $39)|0;
  $43 = ((($7)) + 16|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = $44 << 3;
  $46 = (__ZN9knusperli12_GLOBAL__N_17DivCeilEii($42,$45)|0);
  $$0218 = $37;$$0219 = $46;
 }
 $47 = $8;
 $48 = $47;
 HEAP32[$48>>2] = 0;
 $49 = (($47) + 4)|0;
 $50 = $49;
 HEAP32[$50>>2] = 0;
 $51 = HEAP32[$6>>2]|0;
 __ZN9knusperli12_GLOBAL__N_114BitReaderStateC2EPKhjj($9,$0,$1,$51);
 $52 = ((($7)) + 28|0);
 $53 = HEAP32[$52>>2]|0;
 HEAP32[$10>>2] = 0;
 HEAP32[$11>>2] = -1;
 $54 = ((($14)) + -16|0);
 $55 = HEAP32[$54>>2]|0;
 $56 = $5 ? $55 : 0;
 $57 = ((($14)) + -20|0);
 $58 = HEAP32[$57>>2]|0;
 $59 = ((($14)) + -28|0);
 $60 = HEAP32[$59>>2]|0;
 $61 = $5 ? $60 : 0;
 $62 = ((($14)) + -24|0);
 $63 = HEAP32[$62>>2]|0;
 $64 = $5 ? $63 : 63;
 $65 = ($58|0)==(0);
 $not$ = $5 ^ 1;
 $66 = $65 | $not$;
 $$sink = $66 ? 65535 : 1;
 $67 = $$sink << $56;
 $68 = HEAP32[$16>>2]|0;
 $69 = HEAP32[$15>>2]|0;
 $70 = ($68|0)==($69|0);
 L8: do {
  if ($70) {
   label = 15;
  } else {
   $71 = 1 << $56;
   $72 = (($71) + 65535)|0;
   $73 = HEAP32[$15>>2]|0;
   $74 = ($61|0)>($64|0);
   $75 = $67 & 65535;
   $$0237323 = 0;
   L10: while(1) {
    $76 = (($73) + (($$0237323*12)|0)|0);
    $77 = HEAP32[$76>>2]|0;
    if (!($74)) {
     $$0248319 = $61;
     while(1) {
      $78 = ((($4) + ($77<<7)|0) + ($$0248319<<1)|0);
      $79 = HEAP16[$78>>1]|0;
      $80 = $79&65535;
      $81 = $80 & $75;
      $82 = ($81|0)==(0);
      if (!($82)) {
       label = 9;
       break L10;
      }
      $87 = $72 & $80;
      $88 = ($87|0)==(0);
      if (!($88)) {
       label = 11;
       break L10;
      }
      $93 = $80 | $67;
      $94 = $93&65535;
      HEAP16[$78>>1] = $94;
      $95 = (($$0248319) + 1)|0;
      $96 = ($$0248319|0)<($64|0);
      if ($96) {
       $$0248319 = $95;
      } else {
       break;
      }
     }
    }
    $97 = (($$0237323) + 1)|0;
    $98 = HEAP32[$16>>2]|0;
    $99 = HEAP32[$15>>2]|0;
    $100 = (($98) - ($99))|0;
    $101 = (($100|0) / 12)&-1;
    $102 = ($97>>>0)<($101>>>0);
    if ($102) {
     $$0237323 = $97;
    } else {
     label = 15;
     break L8;
    }
   }
   if ((label|0) == 9) {
    $83 = HEAP32[1138]|0;
    $84 = ((($4) + ($$0237323<<7)|0) + ($$0248319<<1)|0);
    $85 = HEAP16[$84>>1]|0;
    $86 = $85&65535;
    HEAP32[$vararg_buffer>>2] = $77;
    $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
    HEAP32[$vararg_ptr1>>2] = $$0248319;
    $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
    HEAP32[$vararg_ptr2>>2] = $86;
    $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
    HEAP32[$vararg_ptr3>>2] = $75;
    (_fprintf($83,5715,$vararg_buffer)|0);
    $$sink252$ph = 26;
   }
   else if ((label|0) == 11) {
    $89 = HEAP32[1138]|0;
    $90 = ((($4) + ($$0237323<<7)|0) + ($$0248319<<1)|0);
    $91 = HEAP16[$90>>1]|0;
    $92 = $91&65535;
    HEAP32[$vararg_buffer4>>2] = $77;
    $vararg_ptr7 = ((($vararg_buffer4)) + 4|0);
    HEAP32[$vararg_ptr7>>2] = $$0248319;
    $vararg_ptr8 = ((($vararg_buffer4)) + 8|0);
    HEAP32[$vararg_ptr8>>2] = $92;
    $vararg_ptr9 = ((($vararg_buffer4)) + 12|0);
    HEAP32[$vararg_ptr9>>2] = $75;
    (_fprintf($89,5778,$vararg_buffer4)|0);
    $$sink252$ph = 27;
   }
   $103 = ((($7)) + 148|0);
   HEAP32[$103>>2] = $$sink252$ph;
   $$14 = 0;
  }
 } while(0);
 L22: do {
  if ((label|0) == 15) {
   $104 = ($56|0)>(10);
   if ($104) {
    $108 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer10>>2] = $56;
    (_fprintf($108,5880,$vararg_buffer10)|0);
    $109 = ((($7)) + 148|0);
    HEAP32[$109>>2] = 24;
    $$14 = 0;
    break;
   }
   $105 = ($$0219|0)>(0);
   L27: do {
    if ($105) {
     $106 = ($$0218|0)>(0);
     $107 = ((($7)) + 80|0);
     $$0220317 = $53;$$0249314 = 0;
     L29: while(1) {
      if ($106) {
       $$0250306 = 0;$$1221309 = $$0220317;
       while(1) {
        $110 = HEAP32[$52>>2]|0;
        $111 = ($110|0)>(0);
        if ($111) {
         $112 = ($$1221309|0)==(0);
         if ($112) {
          $113 = (__ZN9knusperli12_GLOBAL__N_114ProcessRestartEPKhjPiPNS0_14BitReaderStateEPNS_8JPEGDataE($0,$1,$10,$9,$7)|0);
          if (!($113)) {
           $$14 = 0;
           break L22;
          }
          $114 = HEAP32[$52>>2]|0;
          $115 = $8;
          $116 = $115;
          HEAP32[$116>>2] = 0;
          $117 = (($115) + 4)|0;
          $118 = $117;
          HEAP32[$118>>2] = 0;
          $119 = HEAP32[$11>>2]|0;
          $120 = ($119|0)>(0);
          if ($120) {
           break L29;
          }
          HEAP32[$11>>2] = -1;
          $$2222 = $114;
         } else {
          $$2222 = $$1221309;
         }
         $123 = (($$2222) + -1)|0;
         $$3223 = $123;
        } else {
         $$3223 = $$1221309;
        }
        $124 = HEAP32[$16>>2]|0;
        $125 = HEAP32[$15>>2]|0;
        $126 = ($124|0)==($125|0);
        if (!($126)) {
         $$0251300 = 0;
         while(1) {
          $127 = HEAP32[$15>>2]|0;
          $128 = (($127) + (($$0251300*12)|0)|0);
          $129 = HEAP32[$128>>2]|0;
          $130 = HEAP32[$107>>2]|0;
          $131 = (((($127) + (($$0251300*12)|0)|0)) + 4|0);
          $132 = HEAP32[$131>>2]|0;
          $133 = ($132*758)|0;
          $134 = HEAP32[$2>>2]|0;
          $135 = (($134) + ($133<<2)|0);
          $136 = (((($127) + (($$0251300*12)|0)|0)) + 8|0);
          $137 = HEAP32[$136>>2]|0;
          $138 = ($137*758)|0;
          $139 = HEAP32[$3>>2]|0;
          $140 = (($139) + ($138<<2)|0);
          $141 = (((($130) + (($129*40)|0)|0)) + 8|0);
          $142 = HEAP32[$141>>2]|0;
          $143 = $21 ? $142 : 1;
          $144 = (((($130) + (($129*40)|0)|0)) + 4|0);
          $145 = HEAP32[$144>>2]|0;
          $146 = $21 ? $145 : 1;
          $147 = ($143|0)>(0);
          if ($147) {
           $148 = ($146|0)>(0);
           $149 = Math_imul($143, $$0249314)|0;
           $150 = Math_imul($146, $$0250306)|0;
           $151 = (((($130) + (($129*40)|0)|0)) + 16|0);
           $152 = (((($130) + (($129*40)|0)|0)) + 28|0);
           $$0226298 = 0;
           while(1) {
            if ($148) {
             $153 = (($$0226298) + ($149))|0;
             $$0225296 = 0;
             while(1) {
              $154 = (($$0225296) + ($150))|0;
              $155 = HEAP32[$151>>2]|0;
              $156 = Math_imul($155, $153)|0;
              $157 = (($154) + ($156))|0;
              $158 = $157 << 6;
              $159 = HEAP32[$152>>2]|0;
              $160 = (($159) + ($158<<1)|0);
              if ($66) {
               $161 = HEAP32[$128>>2]|0;
               $162 = (($8) + ($161<<1)|0);
               $163 = (__ZN9knusperli12_GLOBAL__N_114DecodeDCTBlockEPKNS_17HuffmanTableEntryES3_iiiPiPNS0_14BitReaderStateEPNS_8JPEGDataEPsS9_($135,$140,$61,$64,$56,$11,$9,$7,$162,$160)|0);
               if (!($163)) {
                $$14 = 0;
                break L22;
               }
              } else {
               $164 = (__ZN9knusperli12_GLOBAL__N_114RefineDCTBlockEPKNS_17HuffmanTableEntryEiiiPiPNS0_14BitReaderStateEPNS_8JPEGDataEPs($140,$61,$64,$56,$11,$9,$7,$160)|0);
               if (!($164)) {
                $$14 = 0;
                break L22;
               }
              }
              $165 = (($$0225296) + 1)|0;
              $166 = ($165|0)<($146|0);
              if ($166) {
               $$0225296 = $165;
              } else {
               break;
              }
             }
            }
            $167 = (($$0226298) + 1)|0;
            $168 = ($167|0)<($143|0);
            if ($168) {
             $$0226298 = $167;
            } else {
             break;
            }
           }
          }
          $169 = (($$0251300) + 1)|0;
          $170 = HEAP32[$16>>2]|0;
          $171 = HEAP32[$15>>2]|0;
          $172 = (($170) - ($171))|0;
          $173 = (($172|0) / 12)&-1;
          $174 = ($169>>>0)<($173>>>0);
          if ($174) {
           $$0251300 = $169;
          } else {
           break;
          }
         }
        }
        $175 = (($$0250306) + 1)|0;
        $176 = ($175|0)<($$0218|0);
        if ($176) {
         $$0250306 = $175;$$1221309 = $$3223;
        } else {
         $$1221$lcssa = $$3223;
         break;
        }
       }
      } else {
       $$1221$lcssa = $$0220317;
      }
      $177 = (($$0249314) + 1)|0;
      $178 = ($177|0)<($$0219|0);
      if ($178) {
       $$0220317 = $$1221$lcssa;$$0249314 = $177;
      } else {
       break L27;
      }
     }
     $121 = HEAP32[1138]|0;
     (_fwrite(5933,27,1,$121)|0);
     $122 = ((($7)) + 148|0);
     HEAP32[$122>>2] = 40;
     $$14 = 0;
     break L22;
    }
   } while(0);
   $179 = HEAP32[$11>>2]|0;
   $180 = ($179|0)>(0);
   if ($180) {
    $181 = HEAP32[1138]|0;
    (_fwrite(5933,27,1,$181)|0);
    $182 = ((($7)) + 148|0);
    HEAP32[$182>>2] = 40;
    $$14 = 0;
    break;
   }
   $183 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState12FinishStreamEPj($9,$6)|0);
   if (!($183)) {
    $184 = ((($7)) + 148|0);
    HEAP32[$184>>2] = 25;
    $$14 = 0;
    break;
   }
   $185 = HEAP32[$6>>2]|0;
   $186 = ($185>>>0)>($1>>>0);
   if ($186) {
    $187 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer13>>2] = $185;
    $vararg_ptr16 = ((($vararg_buffer13)) + 4|0);
    HEAP32[$vararg_ptr16>>2] = $1;
    (_fprintf($187,5961,$vararg_buffer13)|0);
    $188 = ((($7)) + 148|0);
    HEAP32[$188>>2] = 3;
    $$14 = 0;
   } else {
    $$14 = 1;
   }
  }
 } while(0);
 $$15 = $$14;
 STACKTOP = sp;return ($$15|0);
}
function __ZN9knusperli12_GLOBAL__N_110ProcessDQTEPKhjPjPNS_8JPEGDataE($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$087120 = 0, $$6 = 0, $$off = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer17 = 0, $vararg_buffer21 = 0, $vararg_buffer3 = 0, $vararg_buffer8 = 0, $vararg_ptr1 = 0, $vararg_ptr11 = 0;
 var $vararg_ptr15 = 0, $vararg_ptr16 = 0, $vararg_ptr2 = 0, $vararg_ptr20 = 0, $vararg_ptr24 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0;
 $vararg_buffer21 = sp + 64|0;
 $vararg_buffer17 = sp + 56|0;
 $vararg_buffer12 = sp + 40|0;
 $vararg_buffer8 = sp + 32|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $4 = sp + 72|0;
 $5 = HEAP32[$2>>2]|0;
 $6 = (($5) + 2)|0;
 $7 = ($6>>>0)>($1>>>0);
 if ($7) {
  $8 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer>>2] = $5;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 2;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $1;
  (_fprintf($8,5502,$vararg_buffer)|0);
  $9 = ((($3)) + 148|0);
  HEAP32[$9>>2] = 3;
  $$6 = 0;
  STACKTOP = sp;return ($$6|0);
 }
 $10 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$2)|0);
 $11 = ($10|0)==(2);
 if ($11) {
  $21 = HEAP32[1138]|0;
  (_fwrite(5646,40,1,$21)|0);
  $22 = ((($3)) + 148|0);
  HEAP32[$22>>2] = 38;
  $$6 = 0;
  STACKTOP = sp;return ($$6|0);
 }
 $12 = HEAP32[$2>>2]|0;
 $13 = (($10) + ($5))|0;
 $14 = ($12>>>0)<($13>>>0);
 L9: do {
  if ($14) {
   $15 = ((($3)) + 56|0);
   $16 = ((($3)) + 60|0);
   $17 = ((($4)) + 16|0);
   $18 = ((($4)) + 12|0);
   $19 = ((($4)) + 20|0);
   $20 = ((($3)) + 64|0);
   $29 = $12;
   L11: while(1) {
    $23 = HEAP32[$16>>2]|0;
    $24 = HEAP32[$15>>2]|0;
    $25 = (($23) - ($24))|0;
    $26 = (($25|0) / 24)&-1;
    $27 = ($26>>>0)<(4);
    if (!($27)) {
     break L9;
    }
    $28 = (($29) + 1)|0;
    $30 = ($28>>>0)>($1>>>0);
    if ($30) {
     label = 9;
     break;
    }
    $33 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$2)|0);
    $34 = $33 >> 4;
    $35 = $33 & 15;
    $36 = ($35>>>0)>(3);
    if ($36) {
     label = 11;
     break;
    }
    $39 = HEAP32[$2>>2]|0;
    $40 = ($34|0)!=(0);
    $41 = $40 ? 128 : 64;
    $42 = (($39) + ($41))|0;
    $43 = ($42>>>0)>($1>>>0);
    if ($43) {
     label = 13;
     break;
    }
    __ZN9knusperli14JPEGQuantTableC2Ev($4);
    HEAP32[$17>>2] = $35;
    HEAP32[$18>>2] = $34;
    $$087120 = 0;
    while(1) {
     if ($40) {
      $46 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$2)|0);
      $48 = $46;
     } else {
      $47 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$2)|0);
      $48 = $47;
     }
     $$off = (($48) + -1)|0;
     $49 = ($$off>>>0)>(65534);
     if ($49) {
      label = 20;
      break L11;
     }
     $50 = (136 + ($$087120<<2)|0);
     $51 = HEAP32[$50>>2]|0;
     $52 = HEAP32[$4>>2]|0;
     $53 = (($52) + ($51<<2)|0);
     HEAP32[$53>>2] = $48;
     $54 = (($$087120) + 1)|0;
     $55 = ($54|0)<(64);
     if ($55) {
      $$087120 = $54;
     } else {
      break;
     }
    }
    $58 = HEAP32[$2>>2]|0;
    $59 = ($58|0)==($13|0);
    $60 = $59&1;
    HEAP8[$19>>0] = $60;
    $61 = HEAP32[$16>>2]|0;
    $62 = HEAP32[$20>>2]|0;
    $63 = ($61|0)==($62|0);
    if ($63) {
     __ZNSt3__26vectorIN9knusperli14JPEGQuantTableENS_9allocatorIS2_EEE21__push_back_slow_pathIRKS2_EEvOT_($15,$4);
    } else {
     __ZN9knusperli14JPEGQuantTableC2ERKS0_($61,$4);
     $64 = HEAP32[$16>>2]|0;
     $65 = ((($64)) + 24|0);
     HEAP32[$16>>2] = $65;
    }
    __ZN9knusperli14JPEGQuantTableD2Ev($4);
    $66 = HEAP32[$2>>2]|0;
    $67 = ($66>>>0)<($13>>>0);
    if ($67) {
     $29 = $66;
    } else {
     break L9;
    }
   }
   if ((label|0) == 9) {
    $31 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer3>>2] = $29;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = 1;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $1;
    (_fprintf($31,5502,$vararg_buffer3)|0);
    $32 = ((($3)) + 148|0);
    HEAP32[$32>>2] = 3;
    $$6 = 0;
    STACKTOP = sp;return ($$6|0);
   }
   else if ((label|0) == 11) {
    $37 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer8>>2] = 5687;
    $vararg_ptr11 = ((($vararg_buffer8)) + 4|0);
    HEAP32[$vararg_ptr11>>2] = $35;
    (_fprintf($37,5550,$vararg_buffer8)|0);
    $38 = ((($3)) + 148|0);
    HEAP32[$38>>2] = 17;
    $$6 = 0;
    STACKTOP = sp;return ($$6|0);
   }
   else if ((label|0) == 13) {
    $44 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer12>>2] = $39;
    $vararg_ptr15 = ((($vararg_buffer12)) + 4|0);
    HEAP32[$vararg_ptr15>>2] = $41;
    $vararg_ptr16 = ((($vararg_buffer12)) + 8|0);
    HEAP32[$vararg_ptr16>>2] = $1;
    (_fprintf($44,5502,$vararg_buffer12)|0);
    $45 = ((($3)) + 148|0);
    HEAP32[$45>>2] = 3;
    $$6 = 0;
    STACKTOP = sp;return ($$6|0);
   }
   else if ((label|0) == 20) {
    $56 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer17>>2] = 5705;
    $vararg_ptr20 = ((($vararg_buffer17)) + 4|0);
    HEAP32[$vararg_ptr20>>2] = $48;
    (_fprintf($56,5550,$vararg_buffer17)|0);
    $57 = ((($3)) + 148|0);
    HEAP32[$57>>2] = 18;
    __ZN9knusperli14JPEGQuantTableD2Ev($4);
    $$6 = 0;
    STACKTOP = sp;return ($$6|0);
   }
  }
 } while(0);
 $68 = HEAP32[$2>>2]|0;
 $69 = ($13|0)==($68|0);
 if ($69) {
  $$6 = 1;
  STACKTOP = sp;return ($$6|0);
 }
 $70 = ((($3)) + 148|0);
 $71 = (($68) - ($5))|0;
 $72 = HEAP32[1138]|0;
 HEAP32[$vararg_buffer21>>2] = $10;
 $vararg_ptr24 = ((($vararg_buffer21)) + 4|0);
 HEAP32[$vararg_ptr24>>2] = $71;
 (_fprintf($72,5600,$vararg_buffer21)|0);
 HEAP32[$70>>2] = 6;
 $$6 = 0;
 STACKTOP = sp;return ($$6|0);
}
function __ZN9knusperli12_GLOBAL__N_110ProcessDRIEPKhjPjPNS_8JPEGDataE($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$2 = 0, $$sink = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0;
 var $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $4 = ((($3)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)>(0);
 do {
  if ($6) {
   $7 = HEAP32[1138]|0;
   (_fwrite(5577,22,1,$7)|0);
   $$sink = 29;
  } else {
   $8 = HEAP32[$2>>2]|0;
   $9 = (($8) + 4)|0;
   $10 = ($9>>>0)>($1>>>0);
   if ($10) {
    $11 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer>>2] = $8;
    $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
    HEAP32[$vararg_ptr1>>2] = 4;
    $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
    HEAP32[$vararg_ptr2>>2] = $1;
    (_fprintf($11,5502,$vararg_buffer)|0);
    $$sink = 3;
    break;
   }
   $12 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$2)|0);
   $13 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$2)|0);
   HEAP32[$4>>2] = $13;
   $14 = (($12) + ($8))|0;
   $15 = HEAP32[$2>>2]|0;
   $16 = ($14|0)==($15|0);
   if ($16) {
    $$2 = 1;
    STACKTOP = sp;return ($$2|0);
   } else {
    $17 = HEAP32[1138]|0;
    $18 = (($15) - ($8))|0;
    HEAP32[$vararg_buffer3>>2] = $12;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $18;
    (_fprintf($17,5600,$vararg_buffer3)|0);
    $$sink = 6;
    break;
   }
  }
 } while(0);
 $19 = ((($3)) + 148|0);
 HEAP32[$19>>2] = $$sink;
 $$2 = 0;
 STACKTOP = sp;return ($$2|0);
}
function __ZN9knusperli12_GLOBAL__N_110ProcessAPPEPKhjPjPNS_8JPEGDataE($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0$i$i = 0, $$1 = 0, $$off = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr10 = 0, $vararg_ptr11 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $4 = sp + 48|0;
 $5 = sp + 36|0;
 $6 = HEAP32[$2>>2]|0;
 $7 = (($6) + 2)|0;
 $8 = ($7>>>0)>($1>>>0);
 if ($8) {
  $9 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer>>2] = $6;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 2;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $1;
  (_fprintf($9,5502,$vararg_buffer)|0);
  $10 = ((($3)) + 148|0);
  HEAP32[$10>>2] = 3;
  $$1 = 0;
  STACKTOP = sp;return ($$1|0);
 }
 $11 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$2)|0);
 $$off = (($11) + -2)|0;
 $12 = ($$off>>>0)>(65533);
 if ($12) {
  $13 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer3>>2] = 5566;
  $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
  HEAP32[$vararg_ptr6>>2] = $11;
  (_fprintf($13,5550,$vararg_buffer3)|0);
  $14 = ((($3)) + 148|0);
  HEAP32[$14>>2] = 19;
  $$1 = 0;
  STACKTOP = sp;return ($$1|0);
 }
 $15 = HEAP32[$2>>2]|0;
 $16 = (($15) + ($$off))|0;
 $17 = ($16>>>0)>($1>>>0);
 if ($17) {
  $18 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer7>>2] = $15;
  $vararg_ptr10 = ((($vararg_buffer7)) + 4|0);
  HEAP32[$vararg_ptr10>>2] = $$off;
  $vararg_ptr11 = ((($vararg_buffer7)) + 8|0);
  HEAP32[$vararg_ptr11>>2] = $1;
  (_fprintf($18,5502,$vararg_buffer7)|0);
  $19 = ((($3)) + 148|0);
  HEAP32[$19>>2] = 3;
  $$1 = 0;
  STACKTOP = sp;return ($$1|0);
 }
 $20 = HEAP32[$2>>2]|0;
 $21 = (($20) + -3)|0;
 $22 = (($0) + ($21)|0);
 $23 = (($11) + 1)|0;
 ;HEAP32[$5>>2]=0|0;HEAP32[$5+4>>2]=0|0;HEAP32[$5+8>>2]=0|0;
 $24 = ($23>>>0)>(4294967279);
 if ($24) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($5);
  // unreachable;
 }
 $25 = ($23>>>0)<(11);
 if ($25) {
  $26 = $23&255;
  $27 = ((($5)) + 11|0);
  HEAP8[$27>>0] = $26;
  $$0$i$i = $5;
 } else {
  $28 = (($11) + 17)|0;
  $29 = $28 & -16;
  $30 = (__Znwj($29)|0);
  HEAP32[$5>>2] = $30;
  $31 = $29 | -2147483648;
  $32 = ((($5)) + 8|0);
  HEAP32[$32>>2] = $31;
  $33 = ((($5)) + 4|0);
  HEAP32[$33>>2] = $23;
  $$0$i$i = $30;
 }
 (__ZNSt3__211char_traitsIcE4copyEPcPKcj($$0$i$i,$22,$23)|0);
 $34 = (($$0$i$i) + ($23)|0);
 HEAP8[$4>>0] = 0;
 __ZNSt3__211char_traitsIcE6assignERcRKc($34,$4);
 $35 = HEAP32[$2>>2]|0;
 $36 = (($35) + ($$off))|0;
 HEAP32[$2>>2] = $36;
 $37 = ((($3)) + 36|0);
 $38 = HEAP32[$37>>2]|0;
 $39 = ((($3)) + 40|0);
 $40 = HEAP32[$39>>2]|0;
 $41 = ($38|0)==($40|0);
 if ($41) {
  $44 = ((($3)) + 32|0);
  __ZNSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE21__push_back_slow_pathIRKS6_EEvOT_($44,$5);
 } else {
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC2ERKS5_($38,$5);
  $42 = HEAP32[$37>>2]|0;
  $43 = ((($42)) + 12|0);
  HEAP32[$37>>2] = $43;
 }
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($5);
 $$1 = 1;
 STACKTOP = sp;return ($$1|0);
}
function __ZN9knusperli12_GLOBAL__N_110ProcessCOMEPKhjPjPNS_8JPEGDataE($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0$i$i = 0, $$1 = 0, $$off = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr10 = 0, $vararg_ptr11 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $4 = sp + 48|0;
 $5 = sp + 36|0;
 $6 = HEAP32[$2>>2]|0;
 $7 = (($6) + 2)|0;
 $8 = ($7>>>0)>($1>>>0);
 if ($8) {
  $9 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer>>2] = $6;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 2;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $1;
  (_fprintf($9,5502,$vararg_buffer)|0);
  $10 = ((($3)) + 148|0);
  HEAP32[$10>>2] = 3;
  $$1 = 0;
  STACKTOP = sp;return ($$1|0);
 }
 $11 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$2)|0);
 $$off = (($11) + -2)|0;
 $12 = ($$off>>>0)>(65533);
 if ($12) {
  $13 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer3>>2] = 5566;
  $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
  HEAP32[$vararg_ptr6>>2] = $11;
  (_fprintf($13,5550,$vararg_buffer3)|0);
  $14 = ((($3)) + 148|0);
  HEAP32[$14>>2] = 19;
  $$1 = 0;
  STACKTOP = sp;return ($$1|0);
 }
 $15 = HEAP32[$2>>2]|0;
 $16 = (($15) + ($$off))|0;
 $17 = ($16>>>0)>($1>>>0);
 if ($17) {
  $18 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer7>>2] = $15;
  $vararg_ptr10 = ((($vararg_buffer7)) + 4|0);
  HEAP32[$vararg_ptr10>>2] = $$off;
  $vararg_ptr11 = ((($vararg_buffer7)) + 8|0);
  HEAP32[$vararg_ptr11>>2] = $1;
  (_fprintf($18,5502,$vararg_buffer7)|0);
  $19 = ((($3)) + 148|0);
  HEAP32[$19>>2] = 3;
  $$1 = 0;
  STACKTOP = sp;return ($$1|0);
 }
 $20 = HEAP32[$2>>2]|0;
 $21 = (($20) + -2)|0;
 $22 = (($0) + ($21)|0);
 ;HEAP32[$5>>2]=0|0;HEAP32[$5+4>>2]=0|0;HEAP32[$5+8>>2]=0|0;
 $23 = ($11>>>0)<(11);
 if ($23) {
  $24 = $11&255;
  $25 = ((($5)) + 11|0);
  HEAP8[$25>>0] = $24;
  $$0$i$i = $5;
 } else {
  $26 = (($11) + 16)|0;
  $27 = $26 & -16;
  $28 = (__Znwj($27)|0);
  HEAP32[$5>>2] = $28;
  $29 = $27 | -2147483648;
  $30 = ((($5)) + 8|0);
  HEAP32[$30>>2] = $29;
  $31 = ((($5)) + 4|0);
  HEAP32[$31>>2] = $11;
  $$0$i$i = $28;
 }
 (__ZNSt3__211char_traitsIcE4copyEPcPKcj($$0$i$i,$22,$11)|0);
 $32 = (($$0$i$i) + ($11)|0);
 HEAP8[$4>>0] = 0;
 __ZNSt3__211char_traitsIcE6assignERcRKc($32,$4);
 $33 = HEAP32[$2>>2]|0;
 $34 = (($33) + ($$off))|0;
 HEAP32[$2>>2] = $34;
 $35 = ((($3)) + 48|0);
 $36 = HEAP32[$35>>2]|0;
 $37 = ((($3)) + 52|0);
 $38 = HEAP32[$37>>2]|0;
 $39 = ($36|0)==($38|0);
 if ($39) {
  $42 = ((($3)) + 44|0);
  __ZNSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE21__push_back_slow_pathIRKS6_EEvOT_($42,$5);
 } else {
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC2ERKS5_($36,$5);
  $40 = HEAP32[$35>>2]|0;
  $41 = ((($40)) + 12|0);
  HEAP32[$35>>2] = $41;
 }
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($5);
 $$1 = 1;
 STACKTOP = sp;return ($$1|0);
}
function __ZN9knusperli12_GLOBAL__N_112FixupIndexesEPNS_8JPEGDataE($0) {
 $0 = $0|0;
 var $$02636 = 0, $$0263643 = 0, $$031 = 0, $$125 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $vararg_buffer = sp;
 $1 = ((($0)) + 80|0);
 $2 = ((($0)) + 84|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = HEAP32[$1>>2]|0;
 $5 = ($3|0)==($4|0);
 if ($5) {
  $$125 = 1;
  STACKTOP = sp;return ($$125|0);
 }
 $6 = HEAP32[$1>>2]|0;
 $7 = ((($0)) + 56|0);
 $8 = ((($0)) + 60|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = HEAP32[$7>>2]|0;
 $11 = ($9|0)==($10|0);
 $$02636 = 0;
 L4: while(1) {
  if ($11) {
   $$0263643 = 0;
   break;
  }
  $12 = HEAP32[$7>>2]|0;
  $13 = (((($6) + (($$02636*40)|0)|0)) + 12|0);
  $14 = HEAP32[$13>>2]|0;
  $$031 = 0;
  while(1) {
   $15 = (((($12) + (($$031*24)|0)|0)) + 16|0);
   $16 = HEAP32[$15>>2]|0;
   $17 = ($16|0)==($14|0);
   if ($17) {
    break;
   }
   $18 = (($$031) + 1)|0;
   $19 = HEAP32[$8>>2]|0;
   $20 = HEAP32[$7>>2]|0;
   $21 = (($19) - ($20))|0;
   $22 = (($21|0) / 24)&-1;
   $23 = ($18>>>0)<($22>>>0);
   if ($23) {
    $$031 = $18;
   } else {
    $$0263643 = $$02636;
    break L4;
   }
  }
  HEAP32[$13>>2] = $$031;
  $28 = (($$02636) + 1)|0;
  $29 = HEAP32[$2>>2]|0;
  $30 = HEAP32[$1>>2]|0;
  $31 = (($29) - ($30))|0;
  $32 = (($31|0) / 40)&-1;
  $33 = ($28>>>0)<($32>>>0);
  if ($33) {
   $$02636 = $28;
  } else {
   $$125 = 1;
   label = 9;
   break;
  }
 }
 if ((label|0) == 9) {
  STACKTOP = sp;return ($$125|0);
 }
 $24 = HEAP32[1138]|0;
 $25 = (((($6) + (($$0263643*40)|0)|0)) + 12|0);
 $26 = HEAP32[$25>>2]|0;
 HEAP32[$vararg_buffer>>2] = $26;
 (_fprintf($24,5458,$vararg_buffer)|0);
 $27 = ((($0)) + 148|0);
 HEAP32[$27>>2] = 36;
 $$125 = 0;
 STACKTOP = sp;return ($$125|0);
}
function __ZNSt3__213__vector_baseIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i = 0, $scevgep4$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $scevgep$i$i = ((($4)) + -4|0);
  $6 = $scevgep$i$i;
  $7 = $1;
  $8 = (($6) - ($7))|0;
  $9 = $8 >>> 2;
  $10 = $9 ^ -1;
  $scevgep4$i$i = (($4) + ($10<<2)|0);
  HEAP32[$3>>2] = $scevgep4$i$i;
 }
 $11 = HEAP32[$0>>2]|0;
 __ZdlPv($11);
 return;
}
function __ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$1>>2]|0;
 $3 = (($0) + ($2)|0);
 $4 = HEAP8[$3>>0]|0;
 $5 = $4&255;
 $6 = $5 << 8;
 $7 = (($2) + 1)|0;
 $8 = (($0) + ($7)|0);
 $9 = HEAP8[$8>>0]|0;
 $10 = $9&255;
 $11 = $6 | $10;
 $12 = (($2) + 2)|0;
 HEAP32[$1>>2] = $12;
 return ($11|0);
}
function __ZNSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE21__push_back_slow_pathIRKS6_EEvOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $2 = sp;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = HEAP32[$0>>2]|0;
 $6 = (($4) - ($5))|0;
 $7 = (($6|0) / 12)&-1;
 $8 = (($7) + 1)|0;
 $9 = (__ZNKSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE8max_sizeEv($0)|0);
 $10 = ($9>>>0)<($8>>>0);
 if ($10) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 } else {
  $11 = ((($0)) + 8|0);
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = HEAP32[$0>>2]|0;
  $15 = (($13) - ($14))|0;
  $16 = (($15|0) / 12)&-1;
  $17 = $9 >>> 1;
  $18 = ($16>>>0)<($17>>>0);
  $19 = $16 << 1;
  $20 = ($19>>>0)<($8>>>0);
  $$sroa$speculated$i = $20 ? $8 : $19;
  $$sroa$speculated$$i = $18 ? $$sroa$speculated$i : $9;
  $21 = HEAP32[$3>>2]|0;
  $22 = (($21) - ($14))|0;
  $23 = (($22|0) / 12)&-1;
  __ZNSt3__214__split_bufferINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS6_EEEC2EjjS8_($2,$$sroa$speculated$$i,$23,$11);
  $24 = ((($2)) + 8|0);
  $25 = HEAP32[$24>>2]|0;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC2ERKS5_($25,$1);
  $26 = HEAP32[$24>>2]|0;
  $27 = ((($26)) + 12|0);
  HEAP32[$24>>2] = $27;
  __ZNSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS6_RS7_EE($0,$2);
  __ZNSt3__214__split_bufferINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS6_EEED2Ev($2);
  STACKTOP = sp;return;
 }
}
function __ZNKSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 357913941;
}
function __ZNSt3__214__split_bufferINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS6_EEEC2EjjS8_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 12|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 16|0);
 HEAP32[$5>>2] = $3;
 $6 = ($1|0)==(0);
 do {
  if ($6) {
   $11 = 0;
  } else {
   $7 = ($1>>>0)>(357913941);
   if ($7) {
    $8 = (___cxa_allocate_exception(8)|0);
    __ZNSt11logic_errorC2EPKc($8,7028);
    HEAP32[$8>>2] = (5164);
    ___cxa_throw(($8|0),(88|0),(6|0));
    // unreachable;
   } else {
    $9 = ($1*12)|0;
    $10 = (__Znwj($9)|0);
    $11 = $10;
    break;
   }
  }
 } while(0);
 HEAP32[$0>>2] = $11;
 $12 = (($11) + (($2*12)|0)|0);
 $13 = ((($0)) + 8|0);
 HEAP32[$13>>2] = $12;
 $14 = ((($0)) + 4|0);
 HEAP32[$14>>2] = $12;
 $15 = (($11) + (($1*12)|0)|0);
 $16 = ((($0)) + 12|0);
 HEAP32[$16>>2] = $15;
 return;
}
function __ZNSt3__26vectorINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS6_RS7_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$06$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($1)) + 4|0);
 $6 = ($4|0)==($2|0);
 if (!($6)) {
  $$06$i = $4;
  while(1) {
   $7 = HEAP32[$5>>2]|0;
   $8 = ((($7)) + -12|0);
   $9 = ((($$06$i)) + -12|0);
   ;HEAP32[$8>>2]=HEAP32[$9>>2]|0;HEAP32[$8+4>>2]=HEAP32[$9+4>>2]|0;HEAP32[$8+8>>2]=HEAP32[$9+8>>2]|0;
   ;HEAP32[$9>>2]=0|0;HEAP32[$9+4>>2]=0|0;HEAP32[$9+8>>2]=0|0;
   $10 = HEAP32[$5>>2]|0;
   $11 = ((($10)) + -12|0);
   HEAP32[$5>>2] = $11;
   $12 = ($9|0)==($2|0);
   if ($12) {
    break;
   } else {
    $$06$i = $9;
   }
  }
 }
 $13 = HEAP32[$0>>2]|0;
 $14 = HEAP32[$5>>2]|0;
 HEAP32[$0>>2] = $14;
 HEAP32[$5>>2] = $13;
 $15 = ((($1)) + 8|0);
 $16 = HEAP32[$3>>2]|0;
 $17 = HEAP32[$15>>2]|0;
 HEAP32[$3>>2] = $17;
 HEAP32[$15>>2] = $16;
 $18 = ((($0)) + 8|0);
 $19 = ((($1)) + 12|0);
 $20 = HEAP32[$18>>2]|0;
 $21 = HEAP32[$19>>2]|0;
 HEAP32[$18>>2] = $21;
 HEAP32[$19>>2] = $20;
 $22 = HEAP32[$5>>2]|0;
 HEAP32[$1>>2] = $22;
 return;
}
function __ZNSt3__214__split_bufferINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS6_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($2|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -12|0);
   HEAP32[$3>>2] = $6;
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($2|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 $11 = ($10|0)==(0|0);
 if ($11) {
  return;
 }
 __ZdlPv($10);
 return;
}
function __ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$1>>2]|0;
 $3 = (($2) + 1)|0;
 HEAP32[$1>>2] = $3;
 $4 = (($0) + ($2)|0);
 $5 = HEAP8[$4>>0]|0;
 $6 = $5&255;
 return ($6|0);
}
function __ZN9knusperli12_GLOBAL__N_110ProcessSOSEPKhjPjPNS_8JPEGDataE($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$$0148$off0 = 0, $$0147200 = 0, $$0148$off0$lcssa = 0, $$0148$off0199 = 0, $$0150$off0$lcssa = 0, $$0150$off0198 = 0, $$0152202 = 0, $$0169210 = 0, $$0170205 = 0, $$0171$off0204 = 0, $$10 = 0, $$1149$off0 = 0, $$1151$off0 = 0, $$1172$off0 = 0, $$12 = 0, $$9 = 0, $$cast = 0, $$cast214 = 0, $$not = 0, $$not179 = 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var $brmerge = 0, $brmerge180 = 0, $or$cond178 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer22 = 0, $vararg_buffer26 = 0, $vararg_buffer3 = 0, $vararg_buffer31 = 0, $vararg_buffer35 = 0, $vararg_buffer39 = 0, $vararg_buffer42 = 0, $vararg_buffer45 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr10 = 0, $vararg_ptr11 = 0, $vararg_ptr2 = 0;
 var $vararg_ptr21 = 0, $vararg_ptr25 = 0, $vararg_ptr29 = 0, $vararg_ptr30 = 0, $vararg_ptr34 = 0, $vararg_ptr38 = 0, $vararg_ptr48 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 176|0;
 $vararg_buffer45 = sp + 120|0;
 $vararg_buffer42 = sp + 112|0;
 $vararg_buffer39 = sp + 104|0;
 $vararg_buffer35 = sp + 96|0;
 $vararg_buffer31 = sp + 88|0;
 $vararg_buffer26 = sp + 72|0;
 $vararg_buffer22 = sp + 64|0;
 $vararg_buffer18 = sp + 56|0;
 $vararg_buffer15 = sp + 48|0;
 $vararg_buffer12 = sp + 40|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $4 = sp + 140|0;
 $5 = sp + 128|0;
 $6 = sp + 168|0;
 $7 = HEAP32[$2>>2]|0;
 $8 = (($7) + 3)|0;
 $9 = ($8>>>0)>($1>>>0);
 if ($9) {
  $10 = HEAP32[1138]|0;
  HEAP32[$vararg_buffer>>2] = $7;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 3;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $1;
  (_fprintf($10,5502,$vararg_buffer)|0);
  $11 = ((($3)) + 148|0);
  HEAP32[$11>>2] = 3;
  $$12 = 0;
  STACKTOP = sp;return ($$12|0);
 }
 $12 = (__ZN9knusperli12_GLOBAL__N_110ReadUint16EPKhPj($0,$2)|0);
 $13 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$2)|0);
 $14 = ($13|0)<(1);
 if (!($14)) {
  $15 = ((($3)) + 80|0);
  $16 = ((($3)) + 84|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = HEAP32[$15>>2]|0;
  $19 = (($17) - ($18))|0;
  $20 = (($19|0) / 40)&-1;
  $21 = ($13>>>0)>($20>>>0);
  if (!($21)) {
   __ZN9knusperli12JPEGScanInfoC2Ev($4);
   $24 = ((($4)) + 16|0);
   __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE6resizeEj($24,$13);
   $25 = HEAP32[$2>>2]|0;
   $26 = $13 << 1;
   $27 = (($25) + ($26))|0;
   $28 = ($27>>>0)>($1>>>0);
   if ($28) {
    $29 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer7>>2] = $25;
    $vararg_ptr10 = ((($vararg_buffer7)) + 4|0);
    HEAP32[$vararg_ptr10>>2] = $26;
    $vararg_ptr11 = ((($vararg_buffer7)) + 8|0);
    HEAP32[$vararg_ptr11>>2] = $1;
    (_fprintf($29,5502,$vararg_buffer7)|0);
    $30 = ((($3)) + 148|0);
    HEAP32[$30>>2] = 3;
    $$10 = 0;
   } else {
    HEAP8[$6>>0] = 0;
    __ZNSt3__26vectorIbNS_9allocatorIbEEEC2EjRKb($5,256,$6);
    $$0169210 = 0;
    while(1) {
     $31 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$2)|0);
     $32 = HEAP32[$5>>2]|0;
     $33 = $31 >>> 5;
     $34 = (($32) + ($33<<2)|0);
     $35 = $31 & 31;
     $36 = 1 << $35;
     $37 = HEAP32[$34>>2]|0;
     $38 = $36 & $37;
     $39 = ($38|0)==(0);
     if (!($39)) {
      label = 10;
      break;
     }
     $42 = $37 | $36;
     HEAP32[$34>>2] = $42;
     $43 = HEAP32[$16>>2]|0;
     $44 = HEAP32[$15>>2]|0;
     $45 = ($43|0)==($44|0);
     if ($45) {
      label = 17;
      break;
     }
     $46 = HEAP32[$15>>2]|0;
     $47 = HEAP32[$24>>2]|0;
     $48 = (($47) + (($$0169210*12)|0)|0);
     $49 = HEAP32[$16>>2]|0;
     $$cast214 = $46;
     $50 = (($49) - ($$cast214))|0;
     $51 = (($50|0) / 40)&-1;
     $$0170205 = 0;$$0171$off0204 = 0;
     while(1) {
      $52 = (($46) + (($$0170205*40)|0)|0);
      $53 = HEAP32[$52>>2]|0;
      $54 = ($53|0)==($31|0);
      if ($54) {
       HEAP32[$48>>2] = $$0170205;
       $$1172$off0 = 1;
      } else {
       $$1172$off0 = $$0171$off0204;
      }
      $55 = (($$0170205) + 1)|0;
      $56 = ($55>>>0)<($51>>>0);
      if ($56) {
       $$0170205 = $55;$$0171$off0204 = $$1172$off0;
      } else {
       break;
      }
     }
     if (!($$1172$off0)) {
      label = 17;
      break;
     }
     $59 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$2)|0);
     $60 = $59 >> 4;
     $61 = $59 & 15;
     $62 = ($60>>>0)>(3);
     if ($62) {
      label = 19;
      break;
     }
     $65 = ($61>>>0)>(3);
     if ($65) {
      label = 21;
      break;
     }
     $68 = HEAP32[$24>>2]|0;
     $69 = (((($68) + (($$0169210*12)|0)|0)) + 4|0);
     HEAP32[$69>>2] = $60;
     $70 = HEAP32[$24>>2]|0;
     $71 = (((($70) + (($$0169210*12)|0)|0)) + 8|0);
     HEAP32[$71>>2] = $61;
     $72 = (($$0169210) + 1)|0;
     $73 = ($72|0)<($13|0);
     if ($73) {
      $$0169210 = $72;
     } else {
      label = 23;
      break;
     }
    }
    L24: do {
     if ((label|0) == 10) {
      $40 = HEAP32[1138]|0;
      HEAP32[$vararg_buffer12>>2] = $31;
      (_fprintf($40,6394,$vararg_buffer12)|0);
      $41 = ((($3)) + 148|0);
      HEAP32[$41>>2] = 32;
      $$9 = 0;
     }
     else if ((label|0) == 17) {
      $57 = HEAP32[1138]|0;
      HEAP32[$vararg_buffer15>>2] = $31;
      (_fprintf($57,6419,$vararg_buffer15)|0);
      $58 = ((($3)) + 148|0);
      HEAP32[$58>>2] = 33;
      $$9 = 0;
     }
     else if ((label|0) == 19) {
      $63 = HEAP32[1138]|0;
      HEAP32[$vararg_buffer18>>2] = 6468;
      $vararg_ptr21 = ((($vararg_buffer18)) + 4|0);
      HEAP32[$vararg_ptr21>>2] = $60;
      (_fprintf($63,5550,$vararg_buffer18)|0);
      $64 = ((($3)) + 148|0);
      HEAP32[$64>>2] = 16;
      $$9 = 0;
     }
     else if ((label|0) == 21) {
      $66 = HEAP32[1138]|0;
      HEAP32[$vararg_buffer22>>2] = 6479;
      $vararg_ptr25 = ((($vararg_buffer22)) + 4|0);
      HEAP32[$vararg_ptr25>>2] = $61;
      (_fprintf($66,5550,$vararg_buffer22)|0);
      $67 = ((($3)) + 148|0);
      HEAP32[$67>>2] = 16;
      $$9 = 0;
     }
     else if ((label|0) == 23) {
      $74 = HEAP32[$2>>2]|0;
      $75 = (($74) + 3)|0;
      $76 = ($75>>>0)>($1>>>0);
      if ($76) {
       $77 = HEAP32[1138]|0;
       HEAP32[$vararg_buffer26>>2] = $74;
       $vararg_ptr29 = ((($vararg_buffer26)) + 4|0);
       HEAP32[$vararg_ptr29>>2] = 3;
       $vararg_ptr30 = ((($vararg_buffer26)) + 8|0);
       HEAP32[$vararg_ptr30>>2] = $1;
       (_fprintf($77,5502,$vararg_buffer26)|0);
       $78 = ((($3)) + 148|0);
       HEAP32[$78>>2] = 3;
       $$9 = 0;
       break;
      }
      $79 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$2)|0);
      HEAP32[$4>>2] = $79;
      $80 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$2)|0);
      $81 = ((($4)) + 4|0);
      HEAP32[$81>>2] = $80;
      $82 = HEAP32[$4>>2]|0;
      $83 = ($82>>>0)>(63);
      if ($83) {
       $84 = HEAP32[1138]|0;
       HEAP32[$vararg_buffer31>>2] = 6490;
       $vararg_ptr34 = ((($vararg_buffer31)) + 4|0);
       HEAP32[$vararg_ptr34>>2] = $82;
       (_fprintf($84,5550,$vararg_buffer31)|0);
       $85 = ((($3)) + 148|0);
       HEAP32[$85>>2] = 12;
       $$9 = 0;
       break;
      }
      $86 = ($80|0)<($82|0);
      $87 = ($80|0)>(63);
      $or$cond178 = $87 | $86;
      if ($or$cond178) {
       $88 = HEAP32[1138]|0;
       HEAP32[$vararg_buffer35>>2] = 6503;
       $vararg_ptr38 = ((($vararg_buffer35)) + 4|0);
       HEAP32[$vararg_ptr38>>2] = $80;
       (_fprintf($88,5550,$vararg_buffer35)|0);
       $89 = ((($3)) + 148|0);
       HEAP32[$89>>2] = 13;
       $$9 = 0;
       break;
      }
      $90 = (__ZN9knusperli12_GLOBAL__N_19ReadUint8EPKhPj($0,$2)|0);
      $91 = $90 >> 4;
      $92 = ((($4)) + 8|0);
      HEAP32[$92>>2] = $91;
      $93 = $90 & 15;
      $94 = ((($4)) + 12|0);
      HEAP32[$94>>2] = $93;
      $95 = ($13|0)>(0);
      L36: do {
       if ($95) {
        $96 = ((($3)) + 68|0);
        $97 = ((($3)) + 72|0);
        $98 = HEAP32[$97>>2]|0;
        $99 = HEAP32[$96>>2]|0;
        $100 = ($98|0)==($99|0);
        $101 = HEAP32[$4>>2]|0;
        $$not = ($101|0)!=(0);
        $102 = HEAP32[$81>>2]|0;
        $$not179 = ($102|0)<(1);
        $103 = HEAP32[$24>>2]|0;
        $$0152202 = 0;
        while(1) {
         if ($100) {
          $$0148$off0$lcssa = 0;$$0150$off0$lcssa = 0;
         } else {
          $104 = HEAP32[$96>>2]|0;
          $105 = (((($103) + (($$0152202*12)|0)|0)) + 4|0);
          $106 = HEAP32[$105>>2]|0;
          $107 = HEAP32[$97>>2]|0;
          $$cast = $104;
          $108 = (($107) - ($$cast))|0;
          $109 = $108 >> 5;
          $110 = (((($103) + (($$0152202*12)|0)|0)) + 8|0);
          $$0147200 = 0;$$0148$off0199 = 0;$$0150$off0198 = 0;
          while(1) {
           $111 = (((($104) + ($$0147200<<5)|0)) + 24|0);
           $112 = HEAP32[$111>>2]|0;
           $113 = ($112|0)==($106|0);
           if ($113) {
            $$1149$off0 = $$0148$off0199;$$1151$off0 = 1;
           } else {
            $114 = HEAP32[$110>>2]|0;
            $115 = (($114) + 16)|0;
            $116 = ($112|0)==($115|0);
            $$$0148$off0 = $$0148$off0199 | $116;
            $$1149$off0 = $$$0148$off0;$$1151$off0 = $$0150$off0198;
           }
           $117 = (($$0147200) + 1)|0;
           $118 = ($117>>>0)<($109>>>0);
           if ($118) {
            $$0147200 = $117;$$0148$off0199 = $$1149$off0;$$0150$off0198 = $$1151$off0;
           } else {
            $$0148$off0$lcssa = $$1149$off0;$$0150$off0$lcssa = $$1151$off0;
            break;
           }
          }
         }
         $brmerge = $$0150$off0$lcssa | $$not;
         if (!($brmerge)) {
          label = 37;
          break;
         }
         $brmerge180 = $$0148$off0$lcssa | $$not179;
         if (!($brmerge180)) {
          label = 39;
          break;
         }
         $127 = (($$0152202) + 1)|0;
         $128 = ($127|0)<($13|0);
         if ($128) {
          $$0152202 = $127;
         } else {
          break L36;
         }
        }
        if ((label|0) == 37) {
         $119 = HEAP32[1138]|0;
         $120 = HEAP32[$24>>2]|0;
         $121 = (((($120) + (($$0152202*12)|0)|0)) + 4|0);
         $122 = HEAP32[$121>>2]|0;
         HEAP32[$vararg_buffer39>>2] = $122;
         (_fprintf($119,6516,$vararg_buffer39)|0);
        }
        else if ((label|0) == 39) {
         $123 = HEAP32[1138]|0;
         $124 = HEAP32[$24>>2]|0;
         $125 = (((($124) + (($$0152202*12)|0)|0)) + 8|0);
         $126 = HEAP32[$125>>2]|0;
         HEAP32[$vararg_buffer42>>2] = $126;
         (_fprintf($123,6575,$vararg_buffer42)|0);
        }
        $129 = ((($3)) + 148|0);
        HEAP32[$129>>2] = 34;
        $$9 = 0;
        break L24;
       }
      } while(0);
      $130 = ((($3)) + 96|0);
      $131 = HEAP32[$130>>2]|0;
      $132 = ((($3)) + 100|0);
      $133 = HEAP32[$132>>2]|0;
      $134 = ($131|0)==($133|0);
      if ($134) {
       $137 = ((($3)) + 92|0);
       __ZNSt3__26vectorIN9knusperli12JPEGScanInfoENS_9allocatorIS2_EEE21__push_back_slow_pathIRKS2_EEvOT_($137,$4);
      } else {
       __ZN9knusperli12JPEGScanInfoC2ERKS0_($131,$4);
       $135 = HEAP32[$130>>2]|0;
       $136 = ((($135)) + 28|0);
       HEAP32[$130>>2] = $136;
      }
      $138 = (($12) + ($7))|0;
      $139 = HEAP32[$2>>2]|0;
      $140 = ($138|0)==($139|0);
      if ($140) {
       $$9 = 1;
      } else {
       $141 = ((($3)) + 148|0);
       $142 = (($139) - ($7))|0;
       $143 = HEAP32[1138]|0;
       HEAP32[$vararg_buffer45>>2] = $12;
       $vararg_ptr48 = ((($vararg_buffer45)) + 4|0);
       HEAP32[$vararg_ptr48>>2] = $142;
       (_fprintf($143,5600,$vararg_buffer45)|0);
       HEAP32[$141>>2] = 6;
       $$9 = 0;
      }
     }
    } while(0);
    __ZNSt3__26vectorIbNS_9allocatorIbEEED2Ev($5);
    $$10 = $$9;
   }
   __ZN9knusperli12JPEGScanInfoD2Ev($4);
   $$12 = $$10;
   STACKTOP = sp;return ($$12|0);
  }
 }
 $22 = HEAP32[1138]|0;
 HEAP32[$vararg_buffer3>>2] = 6380;
 $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
 HEAP32[$vararg_ptr6>>2] = $13;
 (_fprintf($22,5550,$vararg_buffer3)|0);
 $23 = ((($3)) + 148|0);
 HEAP32[$23>>2] = 15;
 $$12 = 0;
 STACKTOP = sp;return ($$12|0);
}
function __ZN9knusperli12_GLOBAL__N_17DivCeilEii($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (($0) + -1)|0;
 $3 = (($2) + ($1))|0;
 $4 = (($3|0) / ($1|0))&-1;
 return ($4|0);
}
function __ZN9knusperli12_GLOBAL__N_114BitReaderStateC2EPKhjj($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = $1;
 $4 = ((($0)) + 4|0);
 HEAP32[$4>>2] = $2;
 __ZN9knusperli12_GLOBAL__N_114BitReaderState5ResetEj($0,$3);
 return;
}
function __ZN9knusperli12_GLOBAL__N_114ProcessRestartEPKhjPiPNS0_14BitReaderStateEPNS_8JPEGDataE($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$2 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $5 = sp + 24|0;
 HEAP32[$5>>2] = 0;
 $6 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState12FinishStreamEPj($3,$5)|0);
 if (!($6)) {
  $7 = ((($4)) + 148|0);
  HEAP32[$7>>2] = 25;
  $$2 = 0;
  STACKTOP = sp;return ($$2|0);
 }
 $8 = HEAP32[$2>>2]|0;
 $9 = (($8) + 208)|0;
 $10 = HEAP32[$5>>2]|0;
 $11 = (($10) + 2)|0;
 $12 = ($11>>>0)>($1>>>0);
 if (!($12)) {
  $13 = (($0) + ($10)|0);
  $14 = HEAP8[$13>>0]|0;
  $15 = ($14<<24>>24)==(-1);
  if ($15) {
   $23 = (($10) + 1)|0;
   $24 = (($0) + ($23)|0);
   $25 = HEAP8[$24>>0]|0;
   $26 = $25&255;
   $27 = ($26|0)==($9|0);
   if ($27) {
    __ZN9knusperli12_GLOBAL__N_114BitReaderState5ResetEj($3,$11);
    $30 = HEAP32[$2>>2]|0;
    $31 = (($30) + 1)|0;
    $32 = $31 & 7;
    HEAP32[$2>>2] = $32;
    $$2 = 1;
    STACKTOP = sp;return ($$2|0);
   } else {
    $28 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer3>>2] = $9;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $26;
    (_fprintf($28,6329,$vararg_buffer3)|0);
    $29 = ((($4)) + 148|0);
    HEAP32[$29>>2] = 31;
    $$2 = 0;
    STACKTOP = sp;return ($$2|0);
   }
  }
 }
 $16 = HEAP32[1138]|0;
 $17 = ($10>>>0)<($1>>>0);
 if ($17) {
  $18 = (($0) + ($10)|0);
  $19 = HEAP8[$18>>0]|0;
  $20 = $19&255;
  $21 = $20;
 } else {
  $21 = 0;
 }
 HEAP32[$vararg_buffer>>2] = $21;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $10;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 (_fprintf($16,5235,$vararg_buffer)|0);
 $22 = ((($4)) + 148|0);
 HEAP32[$22>>2] = 4;
 $$2 = 0;
 STACKTOP = sp;return ($$2|0);
}
function __ZN9knusperli12_GLOBAL__N_114DecodeDCTBlockEPKNS_17HuffmanTableEntryES3_iiiPiPNS0_14BitReaderStateEPNS_8JPEGDataEPsS9_($0,$1,$2,$3,$4,$5,$6,$7,$8,$9) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 $8 = $8|0;
 $9 = $9|0;
 var $$0109 = 0, $$090 = 0, $$1 = 0, $$189 = 0, $$3 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $sext = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer13 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, $vararg_ptr11 = 0, $vararg_ptr12 = 0, $vararg_ptr16 = 0, $vararg_ptr17 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $vararg_buffer13 = sp + 40|0;
 $vararg_buffer8 = sp + 24|0;
 $vararg_buffer4 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $10 = ($2|0)>(0);
 $11 = ($2|0)==(0);
 do {
  if ($11) {
   $12 = (__ZN9knusperli12_GLOBAL__N_110ReadSymbolEPKNS_17HuffmanTableEntryEPNS0_14BitReaderStateE($0,$6)|0);
   $13 = ($12|0)>(11);
   if ($13) {
    $14 = HEAP32[1138]|0;
    HEAP32[$vararg_buffer>>2] = $12;
    (_fprintf($14,6203,$vararg_buffer)|0);
    $15 = ((($7)) + 148|0);
    HEAP32[$15>>2] = 22;
    $$3 = 0;
    STACKTOP = sp;return ($$3|0);
   }
   $16 = ($12|0)>(0);
   if ($16) {
    $17 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState8ReadBitsEi($6,$12)|0);
    $18 = (__ZN9knusperli12_GLOBAL__N_110HuffExtendEii($17,$12)|0);
    $$090 = $18;
   } else {
    $$090 = $12;
   }
   $19 = HEAP16[$8>>1]|0;
   $20 = $19 << 16 >> 16;
   $21 = (($20) + ($$090))|0;
   $22 = $21 << $4;
   $23 = $22&65535;
   HEAP16[$9>>1] = $23;
   $sext = $22 << 16;
   $24 = $sext >> 16;
   $25 = ($22|0)==($24|0);
   if ($25) {
    $26 = $21&65535;
    HEAP16[$8>>1] = $26;
    $$189 = 1;
    break;
   }
   $27 = HEAP32[1138]|0;
   HEAP32[$vararg_buffer1>>2] = $22;
   (_fprintf($27,6250,$vararg_buffer1)|0);
   $28 = ((($7)) + 148|0);
   HEAP32[$28>>2] = 23;
   $$3 = 0;
   STACKTOP = sp;return ($$3|0);
  } else {
   $$189 = $2;
  }
 } while(0);
 $29 = ($$189|0)>($3|0);
 if ($29) {
  $$3 = 1;
  STACKTOP = sp;return ($$3|0);
 }
 $30 = HEAP32[$5>>2]|0;
 $31 = ($30|0)>(0);
 if ($31) {
  $32 = (($30) + -1)|0;
  HEAP32[$5>>2] = $32;
  $$3 = 1;
  STACKTOP = sp;return ($$3|0);
 } else {
  $$0109 = $$189;
 }
 while(1) {
  $33 = (__ZN9knusperli12_GLOBAL__N_110ReadSymbolEPKNS_17HuffmanTableEntryEPNS0_14BitReaderStateE($1,$6)|0);
  $34 = ($33|0)>(255);
  if ($34) {
   label = 13;
   break;
  }
  $37 = $33 >> 4;
  $38 = $33 & 15;
  $39 = ($38|0)==(0);
  if ($39) {
   $55 = ($37|0)==(15);
   if (!($55)) {
    label = 22;
    break;
   }
   $56 = (($$0109) + 15)|0;
   $$1 = $56;
  } else {
   $40 = (($37) + ($$0109))|0;
   $41 = ($40|0)>($3|0);
   if ($41) {
    label = 16;
    break;
   }
   $44 = (($38) + ($4))|0;
   $45 = ($44|0)>(11);
   if ($45) {
    label = 18;
    break;
   }
   $48 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState8ReadBitsEi($6,$38)|0);
   $49 = (__ZN9knusperli12_GLOBAL__N_110HuffExtendEii($48,$38)|0);
   $50 = $49 << $4;
   $51 = $50&65535;
   $52 = (136 + ($40<<2)|0);
   $53 = HEAP32[$52>>2]|0;
   $54 = (($9) + ($53<<1)|0);
   HEAP16[$54>>1] = $51;
   $$1 = $40;
  }
  $64 = (($$1) + 1)|0;
  $65 = ($$1|0)<($3|0);
  if ($65) {
   $$0109 = $64;
  } else {
   break;
  }
 }
 do {
  if ((label|0) == 13) {
   $35 = HEAP32[1138]|0;
   HEAP32[$vararg_buffer4>>2] = $33;
   $vararg_ptr7 = ((($vararg_buffer4)) + 4|0);
   HEAP32[$vararg_ptr7>>2] = $$0109;
   (_fprintf($35,6037,$vararg_buffer4)|0);
   $36 = ((($7)) + 148|0);
   HEAP32[$36>>2] = 22;
   $$3 = 0;
   STACKTOP = sp;return ($$3|0);
  }
  else if ((label|0) == 16) {
   $42 = HEAP32[1138]|0;
   HEAP32[$vararg_buffer8>>2] = $40;
   $vararg_ptr11 = ((($vararg_buffer8)) + 4|0);
   HEAP32[$vararg_ptr11>>2] = $$189;
   $vararg_ptr12 = ((($vararg_buffer8)) + 8|0);
   HEAP32[$vararg_ptr12>>2] = $3;
   (_fprintf($42,6123,$vararg_buffer8)|0);
   $43 = ((($7)) + 148|0);
   HEAP32[$43>>2] = 39;
   $$3 = 0;
   STACKTOP = sp;return ($$3|0);
  }
  else if ((label|0) == 18) {
   $46 = HEAP32[1138]|0;
   HEAP32[$vararg_buffer13>>2] = $38;
   $vararg_ptr16 = ((($vararg_buffer13)) + 4|0);
   HEAP32[$vararg_ptr16>>2] = $4;
   $vararg_ptr17 = ((($vararg_buffer13)) + 8|0);
   HEAP32[$vararg_ptr17>>2] = $40;
   (_fprintf($46,6277,$vararg_buffer13)|0);
   $47 = ((($7)) + 148|0);
   HEAP32[$47>>2] = 24;
   $$3 = 0;
   STACKTOP = sp;return ($$3|0);
  }
  else if ((label|0) == 22) {
   $57 = 1 << $37;
   HEAP32[$5>>2] = $57;
   $58 = ($37|0)>(0);
   if ($58) {
    if ($10) {
     $61 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState8ReadBitsEi($6,$37)|0);
     $62 = HEAP32[$5>>2]|0;
     $63 = (($62) + ($61))|0;
     HEAP32[$5>>2] = $63;
     break;
    }
    $59 = HEAP32[1138]|0;
    (_fwrite(6086,36,1,$59)|0);
    $60 = ((($7)) + 148|0);
    HEAP32[$60>>2] = 40;
    $$3 = 0;
    STACKTOP = sp;return ($$3|0);
   }
  }
 } while(0);
 $66 = HEAP32[$5>>2]|0;
 $67 = (($66) + -1)|0;
 HEAP32[$5>>2] = $67;
 $$3 = 1;
 STACKTOP = sp;return ($$3|0);
}
function __ZN9knusperli12_GLOBAL__N_114RefineDCTBlockEPKNS_17HuffmanTableEntryEiiiPiPNS0_14BitReaderStateEPNS_8JPEGDataEPs($0,$1,$2,$3,$4,$5,$6,$7) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 var $$0 = 0, $$0111 = 0, $$0113$ph = 0, $$0114 = 0, $$0114$ph = 0, $$0117157 = 0, $$0117159 = 0, $$0122 = 0, $$1$ph = 0, $$1115 = 0, $$1118 = 0, $$1121 = 0, $$2119132 = 0, $$3134 = 0, $$3134$ph = 0, $$4158 = 0, $$pr = 0, $10 = 0, $11 = 0, $12 = 0;
 var $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0;
 var $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0;
 var $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0;
 var $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0;
 var $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $extract$t125 = 0, $extract$t125152 = 0, $extract$t125160 = 0, $or$cond = 0, $or$cond129 = 0, $or$cond163 = 0, $trunc = 0, $trunc$clear = 0, $vararg_buffer = 0, $vararg_buffer2 = 0, $vararg_buffer6 = 0, $vararg_ptr1 = 0, $vararg_ptr10 = 0;
 var $vararg_ptr5 = 0, $vararg_ptr9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $vararg_buffer6 = sp + 16|0;
 $vararg_buffer2 = sp + 8|0;
 $vararg_buffer = sp;
 $8 = ($1|0)>(0);
 $9 = ($1|0)==(0);
 if ($9) {
  $10 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState8ReadBitsEi($5,1)|0);
  $11 = HEAP16[$7>>1]|0;
  $12 = $10 << $3;
  $13 = $11&65535;
  $14 = $13 | $12;
  $15 = $14&65535;
  HEAP16[$7>>1] = $15;
  $$0122 = 1;
 } else {
  $$0122 = $1;
 }
 $16 = ($$0122|0)>($2|0);
 if ($16) {
  $$1121 = 1;
  STACKTOP = sp;return ($$1121|0);
 }
 $17 = 1 << $3;
 $18 = -1 << $3;
 $19 = HEAP32[$4>>2]|0;
 $20 = ($19|0)<(1);
 L7: do {
  if ($20) {
   $$0117159 = $$0122;$extract$t125160 = 0;
   L8: while(1) {
    $21 = (__ZN9knusperli12_GLOBAL__N_110ReadSymbolEPKNS_17HuffmanTableEntryEPNS0_14BitReaderStateE($0,$5)|0);
    $22 = ($21|0)>(255);
    if ($22) {
     label = 6;
     break;
    }
    $25 = $21 >> 4;
    $trunc = $21&255;
    $trunc$clear = $trunc & 15;
    switch ($trunc$clear<<24>>24) {
    case 0:  {
     $32 = ($25|0)==(15);
     if ($32) {
      $$0113$ph = 0;$$0114$ph = 15;$$1$ph = 1;
     } else {
      label = 12;
      break L8;
     }
     break;
    }
    case 1:  {
     $29 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState8ReadBitsEi($5,1)|0);
     $30 = ($29|0)!=(0);
     $31 = $30 ? $17 : $18;
     $$0113$ph = $31;$$0114$ph = $25;$$1$ph = 0;
     break;
    }
    default: {
     label = 8;
     break L8;
    }
    }
    $$0114 = $$0114$ph;$$1118 = $$0117159;
    while(1) {
     $40 = (136 + ($$1118<<2)|0);
     $41 = HEAP32[$40>>2]|0;
     $42 = (($7) + ($41<<1)|0);
     $43 = HEAP16[$42>>1]|0;
     $44 = $43 << 16 >> 16;
     $45 = ($43<<16>>16)==(0);
     if ($45) {
      $57 = (($$0114) + -1)|0;
      $58 = ($$0114|0)<(1);
      if ($58) {
       label = 23;
       break;
      } else {
       $$1115 = $57;
      }
     } else {
      $46 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState8ReadBitsEi($5,1)|0);
      $47 = ($46|0)!=(0);
      $48 = $44 & $17;
      $49 = ($48|0)==(0);
      $or$cond = $49 & $47;
      do {
       if ($or$cond) {
        $50 = ($43<<16>>16)>(-1);
        if ($50) {
         $51 = (($44) + ($17))|0;
         $52 = $51&65535;
         $$0111 = $52;
         break;
        } else {
         $53 = (($44) + ($18))|0;
         $54 = $53&65535;
         $$0111 = $54;
         break;
        }
       } else {
        $$0111 = $43;
       }
      } while(0);
      $55 = HEAP32[$40>>2]|0;
      $56 = (($7) + ($55<<1)|0);
      HEAP16[$56>>1] = $$0111;
      $$1115 = $$0114;
     }
     $60 = (($$1118) + 1)|0;
     $61 = ($$1118|0)<($2|0);
     if ($61) {
      $$0114 = $$1115;$$1118 = $60;
     } else {
      $$2119132 = $60;$97 = 1;
      break;
     }
    }
    if ((label|0) == 23) {
     label = 0;
     $59 = ($$1118|0)>($2|0);
     $$2119132 = $$1118;$97 = $59;
    }
    $62 = ($$0113$ph|0)==(0);
    if (!($62)) {
     if ($97) {
      label = 27;
      break;
     }
     $65 = $$0113$ph&65535;
     $66 = (136 + ($$2119132<<2)|0);
     $67 = HEAP32[$66>>2]|0;
     $68 = (($7) + ($67<<1)|0);
     HEAP16[$68>>1] = $65;
    }
    $69 = (($$2119132) + 1)|0;
    $70 = ($$2119132|0)<($2|0);
    $extract$t125 = ($$1$ph<<24>>24)!=(0);
    if ($70) {
     $$0117159 = $69;$extract$t125160 = $extract$t125;
    } else {
     $$0117157 = $69;$extract$t125152 = $extract$t125;
     label = 30;
     break;
    }
   }
   do {
    if ((label|0) == 6) {
     $23 = HEAP32[1138]|0;
     HEAP32[$vararg_buffer>>2] = $21;
     $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
     HEAP32[$vararg_ptr1>>2] = $$0117159;
     (_fprintf($23,6037,$vararg_buffer)|0);
     $24 = ((($6)) + 148|0);
     HEAP32[$24>>2] = 22;
     $$1121 = 0;
     STACKTOP = sp;return ($$1121|0);
    }
    else if ((label|0) == 8) {
     $26 = $21 & 15;
     $27 = HEAP32[1138]|0;
     HEAP32[$vararg_buffer2>>2] = $26;
     $vararg_ptr5 = ((($vararg_buffer2)) + 4|0);
     HEAP32[$vararg_ptr5>>2] = $$0117159;
     (_fprintf($27,6037,$vararg_buffer2)|0);
     $28 = ((($6)) + 148|0);
     HEAP32[$28>>2] = 22;
     $$1121 = 0;
     STACKTOP = sp;return ($$1121|0);
    }
    else if ((label|0) == 12) {
     $33 = 1 << $25;
     HEAP32[$4>>2] = $33;
     $34 = ($25|0)>(0);
     if ($34) {
      if ($8) {
       $37 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState8ReadBitsEi($5,$25)|0);
       $38 = HEAP32[$4>>2]|0;
       $39 = (($38) + ($37))|0;
       HEAP32[$4>>2] = $39;
       if ($extract$t125160) {
        break;
       } else {
        $$3134 = $$0117159;$74 = $39;
        break L7;
       }
      }
      $35 = HEAP32[1138]|0;
      (_fwrite(6086,36,1,$35)|0);
      $36 = ((($6)) + 148|0);
      HEAP32[$36>>2] = 40;
      $$1121 = 0;
      STACKTOP = sp;return ($$1121|0);
     } else {
      $$0117157 = $$0117159;$extract$t125152 = $extract$t125160;
      label = 30;
     }
    }
    else if ((label|0) == 27) {
     $63 = HEAP32[1138]|0;
     HEAP32[$vararg_buffer6>>2] = $$2119132;
     $vararg_ptr9 = ((($vararg_buffer6)) + 4|0);
     HEAP32[$vararg_ptr9>>2] = $$0122;
     $vararg_ptr10 = ((($vararg_buffer6)) + 8|0);
     HEAP32[$vararg_ptr10>>2] = $2;
     (_fprintf($63,6123,$vararg_buffer6)|0);
     $64 = ((($6)) + 148|0);
     HEAP32[$64>>2] = 39;
     $$1121 = 0;
     STACKTOP = sp;return ($$1121|0);
    }
   } while(0);
   if ((label|0) == 30) {
    if (!($extract$t125152)) {
     $$3134$ph = $$0117157;
     label = 32;
     break;
    }
   }
   $71 = HEAP32[1138]|0;
   (_fwrite(6166,36,1,$71)|0);
   $72 = ((($6)) + 148|0);
   HEAP32[$72>>2] = 28;
   $$1121 = 0;
   STACKTOP = sp;return ($$1121|0);
  } else {
   $$3134$ph = $$0122;
   label = 32;
  }
 } while(0);
 if ((label|0) == 32) {
  $$pr = HEAP32[$4>>2]|0;
  $$3134 = $$3134$ph;$74 = $$pr;
 }
 $73 = ($74|0)<(1);
 $75 = ($$3134|0)>($2|0);
 $or$cond163 = $73 | $75;
 if (!($or$cond163)) {
  $$4158 = $$3134;
  while(1) {
   $76 = (136 + ($$4158<<2)|0);
   $77 = HEAP32[$76>>2]|0;
   $78 = (($7) + ($77<<1)|0);
   $79 = HEAP16[$78>>1]|0;
   $80 = $79 << 16 >> 16;
   $81 = ($79<<16>>16)==(0);
   if (!($81)) {
    $82 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState8ReadBitsEi($5,1)|0);
    $83 = ($82|0)!=(0);
    $84 = $80 & $17;
    $85 = ($84|0)==(0);
    $or$cond129 = $85 & $83;
    do {
     if ($or$cond129) {
      $86 = ($79<<16>>16)>(-1);
      if ($86) {
       $87 = (($80) + ($17))|0;
       $88 = $87&65535;
       $$0 = $88;
       break;
      } else {
       $89 = (($80) + ($18))|0;
       $90 = $89&65535;
       $$0 = $90;
       break;
      }
     } else {
      $$0 = $79;
     }
    } while(0);
    $91 = HEAP32[$76>>2]|0;
    $92 = (($7) + ($91<<1)|0);
    HEAP16[$92>>1] = $$0;
   }
   $93 = (($$4158) + 1)|0;
   $94 = ($$4158|0)<($2|0);
   if ($94) {
    $$4158 = $93;
   } else {
    break;
   }
  }
 }
 $95 = HEAP32[$4>>2]|0;
 $96 = (($95) + -1)|0;
 HEAP32[$4>>2] = $96;
 $$1121 = 1;
 STACKTOP = sp;return ($$1121|0);
}
function __ZN9knusperli12_GLOBAL__N_114BitReaderState12FinishStreamEPj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$04 = 0, $$in = 0, $$lcssa = 0, $$lcssa5 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 24|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = $3 >> 3;
 $5 = ($4|0)>(0);
 $6 = ((($0)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ((($0)) + 28|0);
 $9 = HEAP32[$8>>2]|0;
 if ($5) {
  $$in = $4;$12 = $7;$14 = $9;
  while(1) {
   $10 = (($$in) + -1)|0;
   $11 = (($12) + -1)|0;
   HEAP32[$6>>2] = $11;
   $13 = ($11>>>0)<($14>>>0);
   if ($13) {
    $15 = HEAP32[$0>>2]|0;
    $16 = (($15) + ($11)|0);
    $17 = HEAP8[$16>>0]|0;
    $18 = ($17<<24>>24)==(0);
    if ($18) {
     $19 = (($12) + -2)|0;
     $20 = (($15) + ($19)|0);
     $21 = HEAP8[$20>>0]|0;
     $22 = ($21<<24>>24)==(-1);
     if ($22) {
      HEAP32[$6>>2] = $19;
     }
    }
   }
   $23 = ($$in|0)>(1);
   $24 = HEAP32[$6>>2]|0;
   $25 = HEAP32[$8>>2]|0;
   if ($23) {
    $$in = $10;$12 = $24;$14 = $25;
   } else {
    $$lcssa = $25;$$lcssa5 = $24;
    break;
   }
  }
 } else {
  $$lcssa = $9;$$lcssa5 = $7;
 }
 $26 = ($$lcssa5>>>0)>($$lcssa>>>0);
 if ($26) {
  $27 = HEAP32[1138]|0;
  (_fwrite(6012,24,1,$27)|0);
  $$04 = 0;
  return ($$04|0);
 } else {
  HEAP32[$1>>2] = $$lcssa5;
  $$04 = 1;
  return ($$04|0);
 }
 return (0)|0;
}
function __ZN9knusperli12_GLOBAL__N_114BitReaderState8ReadBitsEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZN9knusperli12_GLOBAL__N_114BitReaderState13FillBitWindowEv($0);
 $2 = ((($0)) + 16|0);
 $3 = $2;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 24|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = (($10) - ($1))|0;
 $12 = (_bitshift64Lshr(($5|0),($8|0),($11|0))|0);
 $13 = tempRet0;
 $14 = (_bitshift64Shl(1,0,($1|0))|0);
 $15 = tempRet0;
 $16 = (_i64Add(($14|0),($15|0),-1,0)|0);
 $17 = tempRet0;
 $18 = $12 & $16;
 $13 & $17;
 HEAP32[$9>>2] = $11;
 return ($18|0);
}
function __ZN9knusperli12_GLOBAL__N_110ReadSymbolEPKNS_17HuffmanTableEntryEPNS0_14BitReaderStateE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZN9knusperli12_GLOBAL__N_114BitReaderState13FillBitWindowEv($1);
 $2 = ((($1)) + 16|0);
 $3 = $2;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($1)) + 24|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = (($10) + -8)|0;
 $12 = (_bitshift64Lshr(($5|0),($8|0),($11|0))|0);
 $13 = tempRet0;
 $14 = $12 & 255;
 $15 = (($0) + ($14<<2)|0);
 $16 = HEAP8[$15>>0]|0;
 $17 = $16&255;
 $18 = (($17) + -8)|0;
 $19 = ($16&255)>(8);
 if (!($19)) {
  $$0 = $15;
  $37 = HEAP8[$$0>>0]|0;
  $38 = $37&255;
  $39 = HEAP32[$9>>2]|0;
  $40 = (($39) - ($38))|0;
  HEAP32[$9>>2] = $40;
  $41 = ((($$0)) + 2|0);
  $42 = HEAP16[$41>>1]|0;
  $43 = $42&65535;
  return ($43|0);
 }
 HEAP32[$9>>2] = $11;
 $20 = (((($0) + ($14<<2)|0)) + 2|0);
 $21 = HEAP16[$20>>1]|0;
 $22 = $21&65535;
 $23 = (($15) + ($22<<2)|0);
 $24 = $2;
 $25 = $24;
 $26 = HEAP32[$25>>2]|0;
 $27 = (($24) + 4)|0;
 $28 = $27;
 $29 = HEAP32[$28>>2]|0;
 $30 = (($11) - ($18))|0;
 $31 = (_bitshift64Lshr(($26|0),($29|0),($30|0))|0);
 $32 = tempRet0;
 $33 = 1 << $18;
 $34 = (($33) + -1)|0;
 $35 = $31 & $34;
 $36 = (($23) + ($35<<2)|0);
 $$0 = $36;
 $37 = HEAP8[$$0>>0]|0;
 $38 = $37&255;
 $39 = HEAP32[$9>>2]|0;
 $40 = (($39) - ($38))|0;
 HEAP32[$9>>2] = $40;
 $41 = ((($$0)) + 2|0);
 $42 = HEAP16[$41>>1]|0;
 $43 = $42&65535;
 return ($43|0);
}
function __ZN9knusperli12_GLOBAL__N_114BitReaderState13FillBitWindowEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 24|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)<(17);
 if (!($3)) {
  return;
 }
 $4 = ((($0)) + 16|0);
 while(1) {
  $5 = $4;
  $6 = $5;
  $7 = HEAP32[$6>>2]|0;
  $8 = (($5) + 4)|0;
  $9 = $8;
  $10 = HEAP32[$9>>2]|0;
  $11 = (_bitshift64Shl(($7|0),($10|0),8)|0);
  $12 = tempRet0;
  $13 = $4;
  $14 = $13;
  HEAP32[$14>>2] = $11;
  $15 = (($13) + 4)|0;
  $16 = $15;
  HEAP32[$16>>2] = $12;
  $17 = (__ZN9knusperli12_GLOBAL__N_114BitReaderState11GetNextByteEv($0)|0);
  $18 = $17&255;
  $19 = $4;
  $20 = $19;
  $21 = HEAP32[$20>>2]|0;
  $22 = (($19) + 4)|0;
  $23 = $22;
  $24 = HEAP32[$23>>2]|0;
  $25 = $21 | $18;
  $26 = $4;
  $27 = $26;
  HEAP32[$27>>2] = $25;
  $28 = (($26) + 4)|0;
  $29 = $28;
  HEAP32[$29>>2] = $24;
  $30 = HEAP32[$1>>2]|0;
  $31 = (($30) + 8)|0;
  HEAP32[$1>>2] = $31;
  $32 = ($31|0)<(57);
  if (!($32)) {
   break;
  }
 }
 return;
}
function __ZN9knusperli12_GLOBAL__N_114BitReaderState11GetNextByteEv($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 8|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)<($4>>>0);
 $6 = (($2) + 1)|0;
 HEAP32[$1>>2] = $6;
 if (!($5)) {
  $$0 = 0;
  return ($$0|0);
 }
 $7 = HEAP32[$0>>2]|0;
 $8 = (($7) + ($2)|0);
 $9 = HEAP8[$8>>0]|0;
 $10 = ($9<<24>>24)==(-1);
 if (!($10)) {
  $$0 = $9;
  return ($$0|0);
 }
 $11 = (($7) + ($6)|0);
 $12 = HEAP8[$11>>0]|0;
 $13 = ($12<<24>>24)==(0);
 if ($13) {
  $14 = (($2) + 2)|0;
  HEAP32[$1>>2] = $14;
  $$0 = -1;
  return ($$0|0);
 } else {
  HEAP32[$3>>2] = $2;
  $$0 = -1;
  return ($$0|0);
 }
 return (0)|0;
}
function __ZN9knusperli12_GLOBAL__N_110HuffExtendEii($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (($1) + -1)|0;
 $3 = 1 << $2;
 $4 = ($3|0)>($0|0);
 $5 = -1 << $1;
 $6 = (($0) + 1)|0;
 $7 = (($6) + ($5))|0;
 $$ = $4 ? $7 : $0;
 return ($$|0);
}
function __ZN9knusperli12_GLOBAL__N_114BitReaderState5ResetEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 8|0);
 HEAP32[$2>>2] = $1;
 $3 = ((($0)) + 16|0);
 $4 = $3;
 $5 = $4;
 HEAP32[$5>>2] = 0;
 $6 = (($4) + 4)|0;
 $7 = $6;
 HEAP32[$7>>2] = 0;
 $8 = ((($0)) + 24|0);
 HEAP32[$8>>2] = 0;
 $9 = ((($0)) + 4|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = (($10) + -2)|0;
 $12 = ((($0)) + 28|0);
 HEAP32[$12>>2] = $11;
 __ZN9knusperli12_GLOBAL__N_114BitReaderState13FillBitWindowEv($0);
 return;
}
function __ZN9knusperli12JPEGScanInfoC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 16|0);
 HEAP32[$1>>2] = 0;
 $2 = ((($0)) + 20|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 24|0);
 HEAP32[$3>>2] = 0;
 return;
}
function __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE6resizeEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i = 0, $scevgep4$i$i = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = HEAP32[$0>>2]|0;
 $5 = (($3) - ($4))|0;
 $6 = (($5|0) / 12)&-1;
 $7 = ($6>>>0)<($1>>>0);
 if ($7) {
  $8 = (($1) - ($6))|0;
  __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE8__appendEj($0,$8);
  return;
 }
 $9 = ($6>>>0)>($1>>>0);
 if (!($9)) {
  return;
 }
 $10 = HEAP32[$0>>2]|0;
 $11 = (($10) + (($1*12)|0)|0);
 $12 = HEAP32[$2>>2]|0;
 $13 = ($12|0)==($11|0);
 if ($13) {
  return;
 }
 $scevgep$i$i = ((($12)) + -12|0);
 $14 = $scevgep$i$i;
 $15 = $11;
 $16 = (($14) - ($15))|0;
 $17 = (($16>>>0) / 12)&-1;
 $18 = $17 ^ -1;
 $scevgep4$i$i = (($12) + (($18*12)|0)|0);
 HEAP32[$2>>2] = $scevgep4$i$i;
 return;
}
function __ZNSt3__26vectorIbNS_9allocatorIbEEEC2EjRKb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $3 = sp + 8|0;
 $4 = sp;
 HEAP32[$0>>2] = 0;
 $5 = ((($0)) + 4|0);
 HEAP32[$5>>2] = 0;
 $6 = ((($0)) + 8|0);
 HEAP32[$6>>2] = 0;
 $7 = ($1|0)==(0);
 if ($7) {
  STACKTOP = sp;return;
 }
 __ZNSt3__26vectorIbNS_9allocatorIbEEE8allocateEj($0,$1);
 $8 = HEAP8[$2>>0]|0;
 $9 = ($8<<24>>24)==(0);
 $10 = HEAP32[$5>>2]|0;
 $11 = (($10) + ($1))|0;
 HEAP32[$5>>2] = $11;
 $12 = HEAP32[$0>>2]|0;
 $13 = $10 >>> 5;
 $14 = (($12) + ($13<<2)|0);
 $15 = $10 & 31;
 $16 = $14;
 if ($9) {
  HEAP32[$4>>2] = $16;
  $18 = ((($4)) + 4|0);
  HEAP32[$18>>2] = $15;
  __ZNSt3__214__fill_n_falseINS_6vectorIbNS_9allocatorIbEEEEEEvNS_14__bit_iteratorIT_Lb0EXLi0EEEENS6_9size_typeE($4,$1);
 } else {
  HEAP32[$3>>2] = $16;
  $17 = ((($3)) + 4|0);
  HEAP32[$17>>2] = $15;
  __ZNSt3__213__fill_n_trueINS_6vectorIbNS_9allocatorIbEEEEEEvNS_14__bit_iteratorIT_Lb0EXLi0EEEENS6_9size_typeE($3,$1);
 }
 STACKTOP = sp;return;
}
function __ZN9knusperli12JPEGScanInfoC2ERKS0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 ;HEAP32[$0>>2]=HEAP32[$1>>2]|0;HEAP32[$0+4>>2]=HEAP32[$1+4>>2]|0;HEAP32[$0+8>>2]=HEAP32[$1+8>>2]|0;HEAP32[$0+12>>2]=HEAP32[$1+12>>2]|0;
 $2 = ((($0)) + 16|0);
 $3 = ((($1)) + 16|0);
 __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEEC2ERKS5_($2,$3);
 return;
}
function __ZNSt3__26vectorIN9knusperli12JPEGScanInfoENS_9allocatorIS2_EEE21__push_back_slow_pathIRKS2_EEvOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $2 = sp;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = HEAP32[$0>>2]|0;
 $6 = (($4) - ($5))|0;
 $7 = (($6|0) / 28)&-1;
 $8 = (($7) + 1)|0;
 $9 = (__ZNKSt3__26vectorIN9knusperli12JPEGScanInfoENS_9allocatorIS2_EEE8max_sizeEv($0)|0);
 $10 = ($9>>>0)<($8>>>0);
 if ($10) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 } else {
  $11 = ((($0)) + 8|0);
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = HEAP32[$0>>2]|0;
  $15 = (($13) - ($14))|0;
  $16 = (($15|0) / 28)&-1;
  $17 = $9 >>> 1;
  $18 = ($16>>>0)<($17>>>0);
  $19 = $16 << 1;
  $20 = ($19>>>0)<($8>>>0);
  $$sroa$speculated$i = $20 ? $8 : $19;
  $$sroa$speculated$$i = $18 ? $$sroa$speculated$i : $9;
  $21 = HEAP32[$3>>2]|0;
  $22 = (($21) - ($14))|0;
  $23 = (($22|0) / 28)&-1;
  __ZNSt3__214__split_bufferIN9knusperli12JPEGScanInfoERNS_9allocatorIS2_EEEC2EjjS5_($2,$$sroa$speculated$$i,$23,$11);
  $24 = ((($2)) + 8|0);
  $25 = HEAP32[$24>>2]|0;
  __ZN9knusperli12JPEGScanInfoC2ERKS0_($25,$1);
  $26 = HEAP32[$24>>2]|0;
  $27 = ((($26)) + 28|0);
  HEAP32[$24>>2] = $27;
  __ZNSt3__26vectorIN9knusperli12JPEGScanInfoENS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$2);
  __ZNSt3__214__split_bufferIN9knusperli12JPEGScanInfoERNS_9allocatorIS2_EEED2Ev($2);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorIbNS_9allocatorIbEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 __ZdlPv($1);
 return;
}
function __ZNKSt3__26vectorIN9knusperli12JPEGScanInfoENS_9allocatorIS2_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 153391689;
}
function __ZNSt3__214__split_bufferIN9knusperli12JPEGScanInfoERNS_9allocatorIS2_EEEC2EjjS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 12|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 16|0);
 HEAP32[$5>>2] = $3;
 $6 = ($1|0)==(0);
 do {
  if ($6) {
   $11 = 0;
  } else {
   $7 = ($1>>>0)>(153391689);
   if ($7) {
    $8 = (___cxa_allocate_exception(8)|0);
    __ZNSt11logic_errorC2EPKc($8,7028);
    HEAP32[$8>>2] = (5164);
    ___cxa_throw(($8|0),(88|0),(6|0));
    // unreachable;
   } else {
    $9 = ($1*28)|0;
    $10 = (__Znwj($9)|0);
    $11 = $10;
    break;
   }
  }
 } while(0);
 HEAP32[$0>>2] = $11;
 $12 = (($11) + (($2*28)|0)|0);
 $13 = ((($0)) + 8|0);
 HEAP32[$13>>2] = $12;
 $14 = ((($0)) + 4|0);
 HEAP32[$14>>2] = $12;
 $15 = (($11) + (($1*28)|0)|0);
 $16 = ((($0)) + 12|0);
 HEAP32[$16>>2] = $15;
 return;
}
function __ZNSt3__26vectorIN9knusperli12JPEGScanInfoENS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$06$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($1)) + 4|0);
 $6 = ($4|0)==($2|0);
 if (!($6)) {
  $$06$i = $4;
  while(1) {
   $7 = HEAP32[$5>>2]|0;
   $8 = ((($7)) + -28|0);
   $9 = ((($$06$i)) + -28|0);
   __ZN9knusperli12JPEGScanInfoC2EOS0_($8,$9);
   $10 = HEAP32[$5>>2]|0;
   $11 = ((($10)) + -28|0);
   HEAP32[$5>>2] = $11;
   $12 = ($9|0)==($2|0);
   if ($12) {
    break;
   } else {
    $$06$i = $9;
   }
  }
 }
 $13 = HEAP32[$0>>2]|0;
 $14 = HEAP32[$5>>2]|0;
 HEAP32[$0>>2] = $14;
 HEAP32[$5>>2] = $13;
 $15 = ((($1)) + 8|0);
 $16 = HEAP32[$3>>2]|0;
 $17 = HEAP32[$15>>2]|0;
 HEAP32[$3>>2] = $17;
 HEAP32[$15>>2] = $16;
 $18 = ((($0)) + 8|0);
 $19 = ((($1)) + 12|0);
 $20 = HEAP32[$18>>2]|0;
 $21 = HEAP32[$19>>2]|0;
 HEAP32[$18>>2] = $21;
 HEAP32[$19>>2] = $20;
 $22 = HEAP32[$5>>2]|0;
 HEAP32[$1>>2] = $22;
 return;
}
function __ZNSt3__214__split_bufferIN9knusperli12JPEGScanInfoERNS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($2|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -28|0);
   HEAP32[$3>>2] = $6;
   __ZN9knusperli12JPEGScanInfoD2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($2|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 $11 = ($10|0)==(0|0);
 if ($11) {
  return;
 }
 __ZdlPv($10);
 return;
}
function __ZN9knusperli12JPEGScanInfoC2EOS0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 ;HEAP32[$0>>2]=HEAP32[$1>>2]|0;HEAP32[$0+4>>2]=HEAP32[$1+4>>2]|0;HEAP32[$0+8>>2]=HEAP32[$1+8>>2]|0;HEAP32[$0+12>>2]=HEAP32[$1+12>>2]|0;
 $2 = ((($0)) + 16|0);
 $3 = ((($1)) + 16|0);
 HEAP32[$2>>2] = 0;
 $4 = ((($0)) + 20|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 24|0);
 HEAP32[$5>>2] = 0;
 $6 = HEAP32[$3>>2]|0;
 HEAP32[$2>>2] = $6;
 $7 = ((($1)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 HEAP32[$4>>2] = $8;
 $9 = ((($1)) + 24|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($0)) + 24|0);
 HEAP32[$11>>2] = $10;
 HEAP32[$9>>2] = 0;
 HEAP32[$7>>2] = 0;
 HEAP32[$3>>2] = 0;
 return;
}
function __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEEC2ERKS5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = 0;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = HEAP32[$1>>2]|0;
 $7 = (($5) - ($6))|0;
 $8 = (($7|0) / 12)&-1;
 $9 = ($7|0)==(0);
 if ($9) {
  return;
 }
 __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE8allocateEj($0,$8);
 $10 = HEAP32[$1>>2]|0;
 $11 = HEAP32[$4>>2]|0;
 __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE18__construct_at_endIPS2_EENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES9_S9_j($0,$10,$11,$8);
 return;
}
function __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (__ZNKSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE8max_sizeEv($0)|0);
 $3 = ($2>>>0)<($1>>>0);
 if ($3) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $4 = ($1>>>0)>(357913941);
 if ($4) {
  $5 = (___cxa_allocate_exception(8)|0);
  __ZNSt11logic_errorC2EPKc($5,7028);
  HEAP32[$5>>2] = (5164);
  ___cxa_throw(($5|0),(88|0),(6|0));
  // unreachable;
 } else {
  $6 = ($1*12)|0;
  $7 = (__Znwj($6)|0);
  $8 = ((($0)) + 4|0);
  HEAP32[$8>>2] = $7;
  HEAP32[$0>>2] = $7;
  $9 = (($7) + (($1*12)|0)|0);
  $10 = ((($0)) + 8|0);
  HEAP32[$10>>2] = $9;
  return;
 }
}
function __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE18__construct_at_endIPS2_EENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES9_S9_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 4|0);
 $5 = $2;
 $6 = $1;
 $7 = (($5) - ($6))|0;
 $8 = ($7|0)>(0);
 if (!($8)) {
  return;
 }
 $9 = (($7>>>0) / 12)&-1;
 $10 = HEAP32[$4>>2]|0;
 _memcpy(($10|0),($1|0),($7|0))|0;
 $11 = HEAP32[$4>>2]|0;
 $12 = (($11) + (($9*12)|0)|0);
 HEAP32[$4>>2] = $12;
 return;
}
function __ZNKSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 357913941;
}
function __ZNSt3__26vectorIbNS_9allocatorIbEEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (__ZNKSt3__26vectorIbNS_9allocatorIbEEE8max_sizeEv($0)|0);
 $3 = ($2>>>0)<($1>>>0);
 if ($3) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 } else {
  $4 = (($1) + -1)|0;
  $5 = $4 >>> 5;
  $6 = (($5) + 1)|0;
  $7 = $6 << 2;
  $8 = (__Znwj($7)|0);
  HEAP32[$0>>2] = $8;
  $9 = ((($0)) + 4|0);
  HEAP32[$9>>2] = 0;
  $10 = ((($0)) + 8|0);
  HEAP32[$10>>2] = $6;
  return;
 }
}
function __ZNSt3__213__fill_n_trueINS_6vectorIbNS_9allocatorIbEEEEEEvNS_14__bit_iteratorIT_Lb0EXLi0EEEENS6_9size_typeE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$sroa$speculated = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)==(0);
 if ($4) {
  $$0 = $1;
 } else {
  $5 = (32 - ($3))|0;
  $6 = ($5>>>0)>($1>>>0);
  $$sroa$speculated = $6 ? $1 : $5;
  $7 = -1 << $3;
  $8 = (($5) - ($$sroa$speculated))|0;
  $9 = -1 >>> $8;
  $10 = $9 & $7;
  $11 = HEAP32[$0>>2]|0;
  $12 = HEAP32[$11>>2]|0;
  $13 = $12 | $10;
  HEAP32[$11>>2] = $13;
  $14 = (($1) - ($$sroa$speculated))|0;
  $15 = HEAP32[$0>>2]|0;
  $16 = ((($15)) + 4|0);
  HEAP32[$0>>2] = $16;
  $$0 = $14;
 }
 $17 = $$0 >>> 5;
 $18 = HEAP32[$0>>2]|0;
 $19 = $17 << 2;
 _memset(($18|0),-1,($19|0))|0;
 $20 = $17 << 5;
 $21 = (($$0) - ($20))|0;
 $22 = ($21|0)==(0);
 if ($22) {
  return;
 }
 $23 = HEAP32[$0>>2]|0;
 $24 = (($23) + ($17<<2)|0);
 HEAP32[$0>>2] = $24;
 $25 = (32 - ($21))|0;
 $26 = -1 >>> $25;
 $27 = HEAP32[$24>>2]|0;
 $28 = $27 | $26;
 HEAP32[$24>>2] = $28;
 return;
}
function __ZNSt3__214__fill_n_falseINS_6vectorIbNS_9allocatorIbEEEEEEvNS_14__bit_iteratorIT_Lb0EXLi0EEEENS6_9size_typeE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$sroa$speculated = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)==(0);
 if ($4) {
  $$0 = $1;
 } else {
  $5 = (32 - ($3))|0;
  $6 = ($5>>>0)>($1>>>0);
  $$sroa$speculated = $6 ? $1 : $5;
  $7 = -1 << $3;
  $8 = (($5) - ($$sroa$speculated))|0;
  $9 = -1 >>> $8;
  $10 = $9 & $7;
  $11 = $10 ^ -1;
  $12 = HEAP32[$0>>2]|0;
  $13 = HEAP32[$12>>2]|0;
  $14 = $13 & $11;
  HEAP32[$12>>2] = $14;
  $15 = (($1) - ($$sroa$speculated))|0;
  $16 = HEAP32[$0>>2]|0;
  $17 = ((($16)) + 4|0);
  HEAP32[$0>>2] = $17;
  $$0 = $15;
 }
 $18 = $$0 >>> 5;
 $19 = HEAP32[$0>>2]|0;
 $20 = $18 << 2;
 _memset(($19|0),0,($20|0))|0;
 $21 = $18 << 5;
 $22 = (($$0) - ($21))|0;
 $23 = ($22|0)==(0);
 if ($23) {
  return;
 }
 $24 = HEAP32[$0>>2]|0;
 $25 = (($24) + ($18<<2)|0);
 HEAP32[$0>>2] = $25;
 $26 = (32 - ($22))|0;
 $27 = -1 >>> $26;
 $28 = $27 ^ -1;
 $29 = HEAP32[$25>>2]|0;
 $30 = $29 & $28;
 HEAP32[$25>>2] = $30;
 return;
}
function __ZNKSt3__26vectorIbNS_9allocatorIbEEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2147483647;
}
function __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE8__appendEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $2 = sp;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (($4) - ($6))|0;
 $8 = (($7|0) / 12)&-1;
 $9 = ($8>>>0)<($1>>>0);
 if (!($9)) {
  __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE18__construct_at_endEj($0,$1);
  STACKTOP = sp;return;
 }
 $10 = HEAP32[$5>>2]|0;
 $11 = HEAP32[$0>>2]|0;
 $12 = (($10) - ($11))|0;
 $13 = (($12|0) / 12)&-1;
 $14 = (($13) + ($1))|0;
 $15 = (__ZNKSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE8max_sizeEv($0)|0);
 $16 = ($15>>>0)<($14>>>0);
 if ($16) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $17 = ((($0)) + 8|0);
 $18 = ((($0)) + 8|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = HEAP32[$0>>2]|0;
 $21 = (($19) - ($20))|0;
 $22 = (($21|0) / 12)&-1;
 $23 = $15 >>> 1;
 $24 = ($22>>>0)<($23>>>0);
 $25 = $22 << 1;
 $26 = ($25>>>0)<($14>>>0);
 $$sroa$speculated$i = $26 ? $14 : $25;
 $$sroa$speculated$$i = $24 ? $$sroa$speculated$i : $15;
 $27 = HEAP32[$5>>2]|0;
 $28 = (($27) - ($20))|0;
 $29 = (($28|0) / 12)&-1;
 __ZNSt3__214__split_bufferIN9knusperli21JPEGComponentScanInfoERNS_9allocatorIS2_EEEC2EjjS5_($2,$$sroa$speculated$$i,$29,$17);
 __ZNSt3__214__split_bufferIN9knusperli21JPEGComponentScanInfoERNS_9allocatorIS2_EEE18__construct_at_endEj($2,$1);
 __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$2);
 __ZNSt3__214__split_bufferIN9knusperli21JPEGComponentScanInfoERNS_9allocatorIS2_EEED2Ev($2);
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE18__construct_at_endEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $$0 = $1;
 while(1) {
  $3 = HEAP32[$2>>2]|0;
  ;HEAP32[$3>>2]=0|0;HEAP32[$3+4>>2]=0|0;HEAP32[$3+8>>2]=0|0;
  $4 = HEAP32[$2>>2]|0;
  $5 = ((($4)) + 12|0);
  HEAP32[$2>>2] = $5;
  $6 = (($$0) + -1)|0;
  $7 = ($6|0)==(0);
  if ($7) {
   break;
  } else {
   $$0 = $6;
  }
 }
 return;
}
function __ZNSt3__214__split_bufferIN9knusperli21JPEGComponentScanInfoERNS_9allocatorIS2_EEEC2EjjS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 12|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 16|0);
 HEAP32[$5>>2] = $3;
 $6 = ($1|0)==(0);
 do {
  if ($6) {
   $11 = 0;
  } else {
   $7 = ($1>>>0)>(357913941);
   if ($7) {
    $8 = (___cxa_allocate_exception(8)|0);
    __ZNSt11logic_errorC2EPKc($8,7028);
    HEAP32[$8>>2] = (5164);
    ___cxa_throw(($8|0),(88|0),(6|0));
    // unreachable;
   } else {
    $9 = ($1*12)|0;
    $10 = (__Znwj($9)|0);
    $11 = $10;
    break;
   }
  }
 } while(0);
 HEAP32[$0>>2] = $11;
 $12 = (($11) + (($2*12)|0)|0);
 $13 = ((($0)) + 8|0);
 HEAP32[$13>>2] = $12;
 $14 = ((($0)) + 4|0);
 HEAP32[$14>>2] = $12;
 $15 = (($11) + (($1*12)|0)|0);
 $16 = ((($0)) + 12|0);
 HEAP32[$16>>2] = $15;
 return;
}
function __ZNSt3__214__split_bufferIN9knusperli21JPEGComponentScanInfoERNS_9allocatorIS2_EEE18__construct_at_endEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 8|0);
 $$0 = $1;
 while(1) {
  $3 = HEAP32[$2>>2]|0;
  ;HEAP32[$3>>2]=0|0;HEAP32[$3+4>>2]=0|0;HEAP32[$3+8>>2]=0|0;
  $4 = HEAP32[$2>>2]|0;
  $5 = ((($4)) + 12|0);
  HEAP32[$2>>2] = $5;
  $6 = (($$0) + -1)|0;
  $7 = ($6|0)==(0);
  if ($7) {
   break;
  } else {
   $$0 = $6;
  }
 }
 return;
}
function __ZNSt3__26vectorIN9knusperli21JPEGComponentScanInfoENS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($1)) + 4|0);
 $6 = $2;
 $7 = (($4) - ($6))|0;
 $8 = HEAP32[$5>>2]|0;
 $9 = (($7|0) / -12)&-1;
 $10 = (($8) + (($9*12)|0)|0);
 HEAP32[$5>>2] = $10;
 $11 = ($7|0)>(0);
 if ($11) {
  _memcpy(($10|0),($2|0),($7|0))|0;
 }
 $12 = HEAP32[$0>>2]|0;
 $13 = HEAP32[$5>>2]|0;
 HEAP32[$0>>2] = $13;
 HEAP32[$5>>2] = $12;
 $14 = ((($1)) + 8|0);
 $15 = HEAP32[$3>>2]|0;
 $16 = HEAP32[$14>>2]|0;
 HEAP32[$3>>2] = $16;
 HEAP32[$14>>2] = $15;
 $17 = ((($0)) + 8|0);
 $18 = ((($1)) + 12|0);
 $19 = HEAP32[$17>>2]|0;
 $20 = HEAP32[$18>>2]|0;
 HEAP32[$17>>2] = $20;
 HEAP32[$18>>2] = $19;
 $21 = HEAP32[$5>>2]|0;
 HEAP32[$1>>2] = $21;
 return;
}
function __ZNSt3__214__split_bufferIN9knusperli21JPEGComponentScanInfoERNS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i$i = 0, $scevgep4$i$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($2|0);
 if (!($5)) {
  $scevgep$i$i$i = ((($4)) + -12|0);
  $6 = $scevgep$i$i$i;
  $7 = $2;
  $8 = (($6) - ($7))|0;
  $9 = (($8>>>0) / 12)&-1;
  $10 = $9 ^ -1;
  $scevgep4$i$i$i = (($4) + (($10*12)|0)|0);
  HEAP32[$3>>2] = $scevgep4$i$i$i;
 }
 $11 = HEAP32[$0>>2]|0;
 $12 = ($11|0)==(0|0);
 if ($12) {
  return;
 }
 __ZdlPv($11);
 return;
}
function __ZN9knusperli15JPEGHuffmanCodeC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt3__26vectorIiNS_9allocatorIiEEEC2Ej($0,17);
 $1 = ((($0)) + 12|0);
 __ZNSt3__26vectorIiNS_9allocatorIiEEEC2Ej($1,257);
 $2 = ((($0)) + 24|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 28|0);
 HEAP8[$3>>0] = 1;
 return;
}
function __ZN9knusperli15JPEGHuffmanCodeC2ERKS0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt3__26vectorIiNS_9allocatorIiEEEC2ERKS3_($0,$1);
 $2 = ((($0)) + 12|0);
 $3 = ((($1)) + 12|0);
 __ZNSt3__26vectorIiNS_9allocatorIiEEEC2ERKS3_($2,$3);
 $4 = ((($0)) + 24|0);
 $5 = ((($1)) + 24|0);
 ;HEAP32[$4>>2]=HEAP32[$5>>2]|0;HEAP8[$4+4>>0]=HEAP8[$5+4>>0]|0;
 return;
}
function __ZNSt3__26vectorIN9knusperli15JPEGHuffmanCodeENS_9allocatorIS2_EEE21__push_back_slow_pathIRKS2_EEvOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$sroa$speculated$$i = 0, $$sroa$speculated$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $2 = sp;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = HEAP32[$0>>2]|0;
 $6 = (($4) - ($5))|0;
 $7 = $6 >> 5;
 $8 = (($7) + 1)|0;
 $9 = (__ZNKSt3__26vectorIN9knusperli15JPEGHuffmanCodeENS_9allocatorIS2_EEE8max_sizeEv($0)|0);
 $10 = ($9>>>0)<($8>>>0);
 if ($10) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 } else {
  $11 = ((($0)) + 8|0);
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = HEAP32[$0>>2]|0;
  $15 = (($13) - ($14))|0;
  $16 = $15 >> 5;
  $17 = $9 >>> 1;
  $18 = ($16>>>0)<($17>>>0);
  $19 = $15 >> 4;
  $20 = ($19>>>0)<($8>>>0);
  $$sroa$speculated$i = $20 ? $8 : $19;
  $$sroa$speculated$$i = $18 ? $$sroa$speculated$i : $9;
  $21 = HEAP32[$3>>2]|0;
  $22 = (($21) - ($14))|0;
  $23 = $22 >> 5;
  __ZNSt3__214__split_bufferIN9knusperli15JPEGHuffmanCodeERNS_9allocatorIS2_EEEC2EjjS5_($2,$$sroa$speculated$$i,$23,$11);
  $24 = ((($2)) + 8|0);
  $25 = HEAP32[$24>>2]|0;
  __ZN9knusperli15JPEGHuffmanCodeC2ERKS0_($25,$1);
  $26 = HEAP32[$24>>2]|0;
  $27 = ((($26)) + 32|0);
  HEAP32[$24>>2] = $27;
  __ZNSt3__26vectorIN9knusperli15JPEGHuffmanCodeENS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$2);
  __ZNSt3__214__split_bufferIN9knusperli15JPEGHuffmanCodeERNS_9allocatorIS2_EEED2Ev($2);
  STACKTOP = sp;return;
 }
}
function __ZNKSt3__26vectorIN9knusperli15JPEGHuffmanCodeENS_9allocatorIS2_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 134217727;
}
function __ZNSt3__214__split_bufferIN9knusperli15JPEGHuffmanCodeERNS_9allocatorIS2_EEEC2EjjS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 12|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 16|0);
 HEAP32[$5>>2] = $3;
 $6 = ($1|0)==(0);
 do {
  if ($6) {
   $11 = 0;
  } else {
   $7 = ($1>>>0)>(134217727);
   if ($7) {
    $8 = (___cxa_allocate_exception(8)|0);
    __ZNSt11logic_errorC2EPKc($8,7028);
    HEAP32[$8>>2] = (5164);
    ___cxa_throw(($8|0),(88|0),(6|0));
    // unreachable;
   } else {
    $9 = $1 << 5;
    $10 = (__Znwj($9)|0);
    $11 = $10;
    break;
   }
  }
 } while(0);
 HEAP32[$0>>2] = $11;
 $12 = (($11) + ($2<<5)|0);
 $13 = ((($0)) + 8|0);
 HEAP32[$13>>2] = $12;
 $14 = ((($0)) + 4|0);
 HEAP32[$14>>2] = $12;
 $15 = (($11) + ($1<<5)|0);
 $16 = ((($0)) + 12|0);
 HEAP32[$16>>2] = $15;
 return;
}
function __ZNSt3__26vectorIN9knusperli15JPEGHuffmanCodeENS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$06$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($1)) + 4|0);
 $6 = ($4|0)==($2|0);
 if (!($6)) {
  $$06$i = $4;
  while(1) {
   $7 = HEAP32[$5>>2]|0;
   $8 = ((($7)) + -32|0);
   $9 = ((($$06$i)) + -32|0);
   __ZN9knusperli15JPEGHuffmanCodeC2EOS0_($8,$9);
   $10 = HEAP32[$5>>2]|0;
   $11 = ((($10)) + -32|0);
   HEAP32[$5>>2] = $11;
   $12 = ($9|0)==($2|0);
   if ($12) {
    break;
   } else {
    $$06$i = $9;
   }
  }
 }
 $13 = HEAP32[$0>>2]|0;
 $14 = HEAP32[$5>>2]|0;
 HEAP32[$0>>2] = $14;
 HEAP32[$5>>2] = $13;
 $15 = ((($1)) + 8|0);
 $16 = HEAP32[$3>>2]|0;
 $17 = HEAP32[$15>>2]|0;
 HEAP32[$3>>2] = $17;
 HEAP32[$15>>2] = $16;
 $18 = ((($0)) + 8|0);
 $19 = ((($1)) + 12|0);
 $20 = HEAP32[$18>>2]|0;
 $21 = HEAP32[$19>>2]|0;
 HEAP32[$18>>2] = $21;
 HEAP32[$19>>2] = $20;
 $22 = HEAP32[$5>>2]|0;
 HEAP32[$1>>2] = $22;
 return;
}
function __ZNSt3__214__split_bufferIN9knusperli15JPEGHuffmanCodeERNS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($2|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -32|0);
   HEAP32[$3>>2] = $6;
   __ZN9knusperli15JPEGHuffmanCodeD2Ev($6);
   $8 = HEAP32[$3>>2]|0;
   $9 = ($8|0)==($2|0);
   if ($9) {
    break;
   } else {
    $7 = $8;
   }
  }
 }
 $10 = HEAP32[$0>>2]|0;
 $11 = ($10|0)==(0|0);
 if ($11) {
  return;
 }
 __ZdlPv($10);
 return;
}
function __ZN9knusperli15JPEGHuffmanCodeC2EOS0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = 0;
 $4 = HEAP32[$1>>2]|0;
 HEAP32[$0>>2] = $4;
 $5 = ((($1)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 HEAP32[$2>>2] = $6;
 $7 = ((($1)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 8|0);
 HEAP32[$9>>2] = $8;
 HEAP32[$7>>2] = 0;
 HEAP32[$5>>2] = 0;
 HEAP32[$1>>2] = 0;
 $10 = ((($0)) + 12|0);
 $11 = ((($1)) + 12|0);
 HEAP32[$10>>2] = 0;
 $12 = ((($0)) + 16|0);
 HEAP32[$12>>2] = 0;
 $13 = ((($0)) + 20|0);
 HEAP32[$13>>2] = 0;
 $14 = HEAP32[$11>>2]|0;
 HEAP32[$10>>2] = $14;
 $15 = ((($1)) + 16|0);
 $16 = HEAP32[$15>>2]|0;
 HEAP32[$12>>2] = $16;
 $17 = ((($1)) + 20|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($0)) + 20|0);
 HEAP32[$19>>2] = $18;
 HEAP32[$17>>2] = 0;
 HEAP32[$15>>2] = 0;
 HEAP32[$11>>2] = 0;
 $20 = ((($0)) + 24|0);
 $21 = ((($1)) + 24|0);
 ;HEAP32[$20>>2]=HEAP32[$21>>2]|0;HEAP8[$20+4>>0]=HEAP8[$21+4>>0]|0;
 return;
}
function __ZNKSt3__26vectorIhNS_9allocatorIhEEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2147483647;
}
function __ZNSt3__214__split_bufferIhRNS_9allocatorIhEEEC2EjjS3_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 12|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($0)) + 16|0);
 HEAP32[$5>>2] = $3;
 $6 = ($1|0)==(0);
 if ($6) {
  $8 = 0;
 } else {
  $7 = (__Znwj($1)|0);
  $8 = $7;
 }
 HEAP32[$0>>2] = $8;
 $9 = (($8) + ($2)|0);
 $10 = ((($0)) + 8|0);
 HEAP32[$10>>2] = $9;
 $11 = ((($0)) + 4|0);
 HEAP32[$11>>2] = $9;
 $12 = (($8) + ($1)|0);
 $13 = ((($0)) + 12|0);
 HEAP32[$13>>2] = $12;
 return;
}
function __ZNSt3__26vectorIhNS_9allocatorIhEEE26__swap_out_circular_bufferERNS_14__split_bufferIhRS2_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($1)) + 4|0);
 $6 = $2;
 $7 = (($4) - ($6))|0;
 $8 = HEAP32[$5>>2]|0;
 $9 = (0 - ($7))|0;
 $10 = (($8) + ($9)|0);
 HEAP32[$5>>2] = $10;
 $11 = ($7|0)>(0);
 if ($11) {
  _memcpy(($10|0),($2|0),($7|0))|0;
 }
 $12 = HEAP32[$0>>2]|0;
 $13 = HEAP32[$5>>2]|0;
 HEAP32[$0>>2] = $13;
 HEAP32[$5>>2] = $12;
 $14 = ((($1)) + 8|0);
 $15 = HEAP32[$3>>2]|0;
 $16 = HEAP32[$14>>2]|0;
 HEAP32[$3>>2] = $16;
 HEAP32[$14>>2] = $15;
 $17 = ((($0)) + 8|0);
 $18 = ((($1)) + 12|0);
 $19 = HEAP32[$17>>2]|0;
 $20 = HEAP32[$18>>2]|0;
 HEAP32[$17>>2] = $20;
 HEAP32[$18>>2] = $19;
 $21 = HEAP32[$5>>2]|0;
 HEAP32[$1>>2] = $21;
 return;
}
function __ZNSt3__214__split_bufferIhRNS_9allocatorIhEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($2|0);
 if (!($5)) {
  $7 = $4;
  while(1) {
   $6 = ((($7)) + -1|0);
   $8 = ($6|0)==($2|0);
   if ($8) {
    break;
   } else {
    $7 = $6;
   }
  }
  HEAP32[$3>>2] = $6;
 }
 $9 = HEAP32[$0>>2]|0;
 $10 = ($9|0)==(0|0);
 if ($10) {
  return;
 }
 __ZdlPv($9);
 return;
}
function __ZNSt3__26vectorIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (__ZNKSt3__26vectorIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEE8max_sizeEv($0)|0);
 $3 = ($2>>>0)<($1>>>0);
 if ($3) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $4 = ($1>>>0)>(1073741823);
 if ($4) {
  $5 = (___cxa_allocate_exception(8)|0);
  __ZNSt11logic_errorC2EPKc($5,7028);
  HEAP32[$5>>2] = (5164);
  ___cxa_throw(($5|0),(88|0),(6|0));
  // unreachable;
 } else {
  $6 = $1 << 2;
  $7 = (__Znwj($6)|0);
  $8 = ((($0)) + 4|0);
  HEAP32[$8>>2] = $7;
  HEAP32[$0>>2] = $7;
  $9 = (($7) + ($1<<2)|0);
  $10 = ((($0)) + 8|0);
  HEAP32[$10>>2] = $9;
  return;
 }
}
function __ZNSt3__26vectorIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEE18__construct_at_endEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $$0 = $1;
 while(1) {
  $3 = HEAP32[$2>>2]|0;
  __ZN9knusperli17HuffmanTableEntryC2Ev($3);
  $4 = HEAP32[$2>>2]|0;
  $5 = ((($4)) + 4|0);
  HEAP32[$2>>2] = $5;
  $6 = (($$0) + -1)|0;
  $7 = ($6|0)==(0);
  if ($7) {
   break;
  } else {
   $$0 = $6;
  }
 }
 return;
}
function __ZN9knusperli17HuffmanTableEntryC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP8[$0>>0] = 0;
 $1 = ((($0)) + 2|0);
 HEAP16[$1>>1] = -1;
 return;
}
function __ZNKSt3__26vectorIN9knusperli17HuffmanTableEntryENS_9allocatorIS2_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1073741823;
}
function __ZN9knusperli21BuildJpegHuffmanTableEPKiS1_PNS_17HuffmanTableEntryE($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0101124 = 0, $$0104 = 0, $$078131 = 0, $$079130 = 0, $$082129 = 0, $$085128 = 0, $$088133 = 0, $$090108 = 0, $$094141 = 0, $$1$lcssa = 0, $$1102$lcssa = 0, $$1102111 = 0, $$1117 = 0, $$180$lcssa = 0, $$180116 = 0, $$183$lcssa = 0, $$183115 = 0, $$186$lcssa = 0, $$186114 = 0, $$189109 = 0;
 var $$191142 = 0, $$195$lcssa = 0, $$195134 = 0, $$199140 = 0, $$2 = 0, $$2100125 = 0, $$2103 = 0, $$281 = 0, $$284 = 0, $$287 = 0, $$292$lcssa = 0, $$292135 = 0, $$296126 = 0, $$3110 = 0, $$393132 = 0, $$397$lcssa = 0, $$397112 = 0, $$4127 = 0, $$5$lcssa = 0, $$5113 = 0;
 var $$6 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0, $exitcond151 = 0;
 var $exitcond152 = 0, $scevgep = 0, $scevgep155 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0;
 $3 = sp + 68|0;
 $4 = sp;
 __ZN9knusperli17HuffmanTableEntryC2Ev($3);
 HEAP32[$4>>2] = 0;
 $scevgep = ((($4)) + 4|0);
 $scevgep155 = ((($0)) + 4|0);
 dest=$scevgep; src=$scevgep155; stop=dest+64|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
 $5 = ((($0)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($0)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) + ($6))|0;
 $10 = ((($0)) + 12|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = (($11) + ($9))|0;
 $13 = ((($0)) + 16|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = (($14) + ($12))|0;
 $16 = ((($0)) + 20|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = (($17) + ($15))|0;
 $19 = ((($0)) + 24|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = (($20) + ($18))|0;
 $22 = ((($0)) + 28|0);
 $23 = HEAP32[$22>>2]|0;
 $24 = (($23) + ($21))|0;
 $25 = ((($0)) + 32|0);
 $26 = HEAP32[$25>>2]|0;
 $27 = (($26) + ($24))|0;
 $28 = ((($0)) + 36|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = (($29) + ($27))|0;
 $31 = ((($0)) + 40|0);
 $32 = HEAP32[$31>>2]|0;
 $33 = (($32) + ($30))|0;
 $34 = ((($0)) + 44|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = (($35) + ($33))|0;
 $37 = ((($0)) + 48|0);
 $38 = HEAP32[$37>>2]|0;
 $39 = (($38) + ($36))|0;
 $40 = ((($0)) + 52|0);
 $41 = HEAP32[$40>>2]|0;
 $42 = (($41) + ($39))|0;
 $43 = ((($0)) + 56|0);
 $44 = HEAP32[$43>>2]|0;
 $45 = (($44) + ($42))|0;
 $46 = ((($0)) + 60|0);
 $47 = HEAP32[$46>>2]|0;
 $48 = (($47) + ($45))|0;
 $49 = ((($0)) + 64|0);
 $50 = HEAP32[$49>>2]|0;
 $51 = (($50) + ($48))|0;
 $52 = ($51|0)==(1);
 if ($52) {
  HEAP8[$3>>0] = 0;
  $54 = HEAP32[$1>>2]|0;
  $55 = $54&65535;
  $56 = ((($3)) + 2|0);
  HEAP16[$56>>1] = $55;
  $57 = HEAP32[$3>>2]|0;
  $$090108 = 0;
  while(1) {
   $58 = (($2) + ($$090108<<2)|0);
   HEAP16[$58>>1]=$57&65535;HEAP16[$58+2>>1]=$57>>>16;
   $59 = (($$090108) + 1)|0;
   $exitcond = ($59|0)==(256);
   if ($exitcond) {
    $$0104 = 256;
    break;
   } else {
    $$090108 = $59;
   }
  }
  STACKTOP = sp;return ($$0104|0);
 }
 $53 = ((($3)) + 2|0);
 $$094141 = 0;$$191142 = 0;$$199140 = 1;
 while(1) {
  $60 = (($4) + ($$199140<<2)|0);
  $61 = HEAP32[$60>>2]|0;
  $62 = ($61|0)>(0);
  if ($62) {
   $63 = $$199140&255;
   $64 = (8 - ($$199140))|0;
   $65 = 1 << $64;
   $$195134 = $$094141;$$292135 = $$191142;$77 = $61;
   while(1) {
    HEAP8[$3>>0] = $63;
    $66 = (($1) + ($$195134<<2)|0);
    $67 = HEAP32[$66>>2]|0;
    $68 = $67&65535;
    HEAP16[$53>>1] = $68;
    $69 = HEAP32[$3>>2]|0;
    $$088133 = $65;$$393132 = $$292135;
    while(1) {
     $70 = (($$088133) + -1)|0;
     $71 = (($$393132) + 1)|0;
     $72 = (($2) + ($$393132<<2)|0);
     HEAP16[$72>>1]=$69&65535;HEAP16[$72+2>>1]=$69>>>16;
     $73 = ($70|0)==(0);
     if ($73) {
      break;
     } else {
      $$088133 = $70;$$393132 = $71;
     }
    }
    $74 = (($$195134) + 1)|0;
    $75 = (($65) + ($$292135))|0;
    $76 = (($77) + -1)|0;
    $78 = ($77|0)>(1);
    if ($78) {
     $$195134 = $74;$$292135 = $75;$77 = $76;
    } else {
     break;
    }
   }
   HEAP32[$60>>2] = $76;
   $$195$lcssa = $74;$$292$lcssa = $75;
  } else {
   $$195$lcssa = $$094141;$$292$lcssa = $$191142;
  }
  $79 = (($$199140) + 1)|0;
  $exitcond152 = ($79|0)==(9);
  if ($exitcond152) {
   break;
  } else {
   $$094141 = $$195$lcssa;$$191142 = $$292$lcssa;$$199140 = $79;
  }
 }
 $80 = ((($2)) + 1024|0);
 $81 = ((($3)) + 2|0);
 $82 = $2;
 $$0101124 = $80;$$078131 = 256;$$079130 = 0;$$082129 = 8;$$085128 = 0;$$2100125 = 9;$$296126 = $$195$lcssa;$$4127 = $$292$lcssa;
 while(1) {
  $83 = (($4) + ($$2100125<<2)|0);
  $84 = HEAP32[$83>>2]|0;
  $85 = ($84|0)>(0);
  if ($85) {
   $86 = (($$2100125) + 248)|0;
   $87 = $86&255;
   $88 = $86 & 255;
   $$1102111 = $$0101124;$$1117 = $$078131;$$180116 = $$079130;$$183115 = $$082129;$$186114 = $$085128;$$397112 = $$296126;$$5113 = $$4127;
   while(1) {
    $89 = ($$186114|0)<($$180116|0);
    if ($89) {
     $$2 = $$1117;$$2103 = $$1102111;$$281 = $$180116;$$284 = $$183115;$$287 = $$186114;$$6 = $$5113;
    } else {
     $90 = (($$1102111) + ($$180116<<2)|0);
     $91 = (__ZN9knusperliL16NextTableBitSizeEPKii($4,$$2100125)|0);
     $92 = 1 << $91;
     $93 = (($92) + ($$1117))|0;
     $94 = (($91) + 8)|0;
     $95 = $94&255;
     $96 = (($2) + ($$5113<<2)|0);
     HEAP8[$96>>0] = $95;
     $97 = $90;
     $98 = (($97) - ($82))|0;
     $99 = $98 >>> 2;
     $100 = (($99) - ($$5113))|0;
     $101 = $100&65535;
     $102 = (((($2) + ($$5113<<2)|0)) + 2|0);
     HEAP16[$102>>1] = $101;
     $103 = (($$5113) + 1)|0;
     $$2 = $93;$$2103 = $90;$$281 = $92;$$284 = $91;$$287 = 0;$$6 = $103;
    }
    HEAP8[$3>>0] = $87;
    $104 = (($1) + ($$397112<<2)|0);
    $105 = HEAP32[$104>>2]|0;
    $106 = $105&65535;
    HEAP16[$81>>1] = $106;
    $107 = (($$284) - ($88))|0;
    $108 = 1 << $107;
    $$189109 = $108;$$3110 = $$287;
    while(1) {
     $109 = (($$189109) + -1)|0;
     $110 = (($$3110) + 1)|0;
     $111 = (($$2103) + ($$3110<<2)|0);
     $112 = HEAP32[$3>>2]|0;
     HEAP16[$111>>1]=$112&65535;HEAP16[$111+2>>1]=$112>>>16;
     $113 = ($109|0)==(0);
     if ($113) {
      break;
     } else {
      $$189109 = $109;$$3110 = $110;
     }
    }
    $114 = (($$397112) + 1)|0;
    $115 = (($$287) + ($108))|0;
    $116 = HEAP32[$83>>2]|0;
    $117 = (($116) + -1)|0;
    HEAP32[$83>>2] = $117;
    $118 = ($116|0)>(1);
    if ($118) {
     $$1102111 = $$2103;$$1117 = $$2;$$180116 = $$281;$$183115 = $$284;$$186114 = $115;$$397112 = $114;$$5113 = $$6;
    } else {
     $$1$lcssa = $$2;$$1102$lcssa = $$2103;$$180$lcssa = $$281;$$183$lcssa = $$284;$$186$lcssa = $115;$$397$lcssa = $114;$$5$lcssa = $$6;
     break;
    }
   }
  } else {
   $$1$lcssa = $$078131;$$1102$lcssa = $$0101124;$$180$lcssa = $$079130;$$183$lcssa = $$082129;$$186$lcssa = $$085128;$$397$lcssa = $$296126;$$5$lcssa = $$4127;
  }
  $119 = (($$2100125) + 1)|0;
  $exitcond151 = ($119|0)==(17);
  if ($exitcond151) {
   $$0104 = $$1$lcssa;
   break;
  } else {
   $$0101124 = $$1102$lcssa;$$078131 = $$1$lcssa;$$079130 = $$180$lcssa;$$082129 = $$183$lcssa;$$085128 = $$186$lcssa;$$2100125 = $119;$$296126 = $$397$lcssa;$$4127 = $$5$lcssa;
  }
 }
 STACKTOP = sp;return ($$0104|0);
}
function __ZN9knusperliL16NextTableBitSizeEPKii($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $$09$lcssa = 0, $$0910 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)<(16);
 L1: do {
  if ($2) {
   $3 = (($1) + -8)|0;
   $4 = 1 << $3;
   $$011 = $4;$$0910 = $1;
   while(1) {
    $5 = (($0) + ($$0910<<2)|0);
    $6 = HEAP32[$5>>2]|0;
    $7 = (($$011) - ($6))|0;
    $8 = ($7|0)<(1);
    if ($8) {
     $$09$lcssa = $$0910;
     break L1;
    }
    $9 = (($$0910) + 1)|0;
    $10 = $7 << 1;
    $11 = ($9|0)<(16);
    if ($11) {
     $$011 = $10;$$0910 = $9;
    } else {
     $$09$lcssa = $9;
     break;
    }
   }
  } else {
   $$09$lcssa = $1;
  }
 } while(0);
 $12 = (($$09$lcssa) + -8)|0;
 return ($12|0);
}
function __ZN9knusperli20OutputImageComponentC2Eii($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = $1;
 $3 = ((($0)) + 4|0);
 HEAP32[$3>>2] = $2;
 $4 = ((($0)) + 28|0);
 ;HEAP32[$4>>2]=0|0;HEAP32[$4+4>>2]=0|0;HEAP32[$4+8>>2]=0|0;HEAP32[$4+12>>2]=0|0;HEAP32[$4+16>>2]=0|0;HEAP32[$4+20>>2]=0|0;
 __ZN9knusperli20OutputImageComponent5ResetEii($0,1,1);
 return;
}
function __ZN9knusperli20OutputImageComponent5ResetEii($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$06 = 0, $$byval_copy1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $$byval_copy1 = sp + 15|0;
 $3 = sp + 14|0;
 $4 = sp;
 $5 = sp + 12|0;
 $6 = ((($0)) + 8|0);
 HEAP32[$6>>2] = $1;
 $7 = ((($0)) + 12|0);
 HEAP32[$7>>2] = $2;
 $8 = HEAP32[$0>>2]|0;
 $9 = $1 << 3;
 $10 = (($9) + -1)|0;
 $11 = (($10) + ($8))|0;
 $12 = (($11|0) / ($9|0))&-1;
 $13 = ((($0)) + 16|0);
 HEAP32[$13>>2] = $12;
 $14 = ((($0)) + 4|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = HEAP32[$7>>2]|0;
 $17 = $16 << 3;
 $18 = (($15) + -1)|0;
 $19 = (($18) + ($17))|0;
 $20 = (($19|0) / ($17|0))&-1;
 $21 = ((($0)) + 20|0);
 HEAP32[$21>>2] = $20;
 $22 = HEAP32[$13>>2]|0;
 $23 = Math_imul($22, $20)|0;
 $24 = ((($0)) + 24|0);
 HEAP32[$24>>2] = $23;
 $25 = $23 << 6;
 __ZNSt3__26vectorIsNS_9allocatorIsEEEC2Ej($4,$25);
 $26 = ((($0)) + 28|0);
 ;HEAP8[$$byval_copy1>>0]=HEAP8[$3>>0]|0;
 __ZNSt3__26vectorIsNS_9allocatorIsEEE13__move_assignERS3_NS_17integral_constantIbLb1EEE($26,$4,$$byval_copy1);
 __ZNSt3__213__vector_baseIsNS_9allocatorIsEEED2Ev($4);
 $27 = HEAP32[$0>>2]|0;
 $28 = HEAP32[$14>>2]|0;
 $29 = Math_imul($28, $27)|0;
 HEAP16[$5>>1] = 2048;
 __ZNSt3__26vectorItNS_9allocatorItEEEC2EjRKt($4,$29,$5);
 $30 = ((($0)) + 40|0);
 ;HEAP8[$$byval_copy1>>0]=HEAP8[$3>>0]|0;
 __ZNSt3__26vectorItNS_9allocatorItEEE13__move_assignERS3_NS_17integral_constantIbLb1EEE($30,$4,$$byval_copy1);
 __ZNSt3__213__vector_baseItNS_9allocatorItEEED2Ev($4);
 $$06 = 0;
 while(1) {
  $31 = (((($0)) + 52|0) + ($$06<<2)|0);
  HEAP32[$31>>2] = 1;
  $32 = (($$06) + 1)|0;
  $exitcond = ($32|0)==(64);
  if ($exitcond) {
   break;
  } else {
   $$06 = $32;
  }
 }
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIsNS_9allocatorIsEEEC2Ej($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = 0;
 $4 = ($1|0)==(0);
 if ($4) {
  return;
 }
 __ZNSt3__26vectorIsNS_9allocatorIsEEE8allocateEj($0,$1);
 __ZNSt3__26vectorIsNS_9allocatorIsEEE18__construct_at_endEj($0,$1);
 return;
}
function __ZNSt3__26vectorIsNS_9allocatorIsEEE13__move_assignERS3_NS_17integral_constantIbLb1EEE($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt3__26vectorIsNS_9allocatorIsEEE10deallocateEv($0);
 $3 = HEAP32[$1>>2]|0;
 HEAP32[$0>>2] = $3;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ((($0)) + 4|0);
 HEAP32[$6>>2] = $5;
 $7 = ((($1)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 8|0);
 HEAP32[$9>>2] = $8;
 HEAP32[$7>>2] = 0;
 HEAP32[$4>>2] = 0;
 HEAP32[$1>>2] = 0;
 return;
}
function __ZNSt3__26vectorItNS_9allocatorItEEEC2EjRKt($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$i = 0, $$promoted$i = 0, $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $3 = ((($0)) + 4|0);
 HEAP32[$3>>2] = 0;
 $4 = ((($0)) + 8|0);
 HEAP32[$4>>2] = 0;
 $5 = ($1|0)==(0);
 if ($5) {
  return;
 }
 __ZNSt3__26vectorItNS_9allocatorItEEE8allocateEj($0,$1);
 $6 = ((($0)) + 4|0);
 $$promoted$i = HEAP32[$6>>2]|0;
 $$0$i = $1;$8 = $$promoted$i;
 while(1) {
  $7 = HEAP16[$2>>1]|0;
  HEAP16[$8>>1] = $7;
  $9 = ((($8)) + 2|0);
  $10 = (($$0$i) + -1)|0;
  $11 = ($10|0)==(0);
  if ($11) {
   break;
  } else {
   $$0$i = $10;$8 = $9;
  }
 }
 $scevgep$i = (($$promoted$i) + ($1<<1)|0);
 HEAP32[$6>>2] = $scevgep$i;
 return;
}
function __ZNSt3__26vectorItNS_9allocatorItEEE13__move_assignERS3_NS_17integral_constantIbLb1EEE($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt3__26vectorItNS_9allocatorItEEE10deallocateEv($0);
 $3 = HEAP32[$1>>2]|0;
 HEAP32[$0>>2] = $3;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ((($0)) + 4|0);
 HEAP32[$6>>2] = $5;
 $7 = ((($1)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 8|0);
 HEAP32[$9>>2] = $8;
 HEAP32[$7>>2] = 0;
 HEAP32[$4>>2] = 0;
 HEAP32[$1>>2] = 0;
 return;
}
function __ZNSt3__26vectorItNS_9allocatorItEEE10deallocateEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i$i = 0, $scevgep4$i$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $scevgep$i$i$i = ((($4)) + -2|0);
  $6 = $scevgep$i$i$i;
  $7 = $1;
  $8 = (($6) - ($7))|0;
  $9 = $8 >>> 1;
  $10 = $9 ^ -1;
  $scevgep4$i$i$i = (($4) + ($10<<1)|0);
  HEAP32[$3>>2] = $scevgep4$i$i$i;
 }
 $11 = HEAP32[$0>>2]|0;
 __ZdlPv($11);
 $12 = ((($0)) + 8|0);
 HEAP32[$12>>2] = 0;
 HEAP32[$3>>2] = 0;
 HEAP32[$0>>2] = 0;
 return;
}
function __ZNSt3__26vectorItNS_9allocatorItEEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (__ZNKSt3__26vectorItNS_9allocatorItEEE8max_sizeEv($0)|0);
 $3 = ($2>>>0)<($1>>>0);
 if ($3) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $4 = ($1|0)<(0);
 if ($4) {
  $5 = (___cxa_allocate_exception(8)|0);
  __ZNSt11logic_errorC2EPKc($5,7028);
  HEAP32[$5>>2] = (5164);
  ___cxa_throw(($5|0),(88|0),(6|0));
  // unreachable;
 } else {
  $6 = $1 << 1;
  $7 = (__Znwj($6)|0);
  $8 = ((($0)) + 4|0);
  HEAP32[$8>>2] = $7;
  HEAP32[$0>>2] = $7;
  $9 = (($7) + ($1<<1)|0);
  $10 = ((($0)) + 8|0);
  HEAP32[$10>>2] = $9;
  return;
 }
}
function __ZNKSt3__26vectorItNS_9allocatorItEEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2147483647;
}
function __ZNSt3__26vectorIsNS_9allocatorIsEEE10deallocateEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $scevgep$i$i$i = 0, $scevgep4$i$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($1|0);
 if (!($5)) {
  $scevgep$i$i$i = ((($4)) + -2|0);
  $6 = $scevgep$i$i$i;
  $7 = $1;
  $8 = (($6) - ($7))|0;
  $9 = $8 >>> 1;
  $10 = $9 ^ -1;
  $scevgep4$i$i$i = (($4) + ($10<<1)|0);
  HEAP32[$3>>2] = $scevgep4$i$i$i;
 }
 $11 = HEAP32[$0>>2]|0;
 __ZdlPv($11);
 $12 = ((($0)) + 8|0);
 HEAP32[$12>>2] = 0;
 HEAP32[$3>>2] = 0;
 HEAP32[$0>>2] = 0;
 return;
}
function __ZNSt3__26vectorIsNS_9allocatorIsEEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (__ZNKSt3__26vectorIsNS_9allocatorIsEEE8max_sizeEv($0)|0);
 $3 = ($2>>>0)<($1>>>0);
 if ($3) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $4 = ($1|0)<(0);
 if ($4) {
  $5 = (___cxa_allocate_exception(8)|0);
  __ZNSt11logic_errorC2EPKc($5,7028);
  HEAP32[$5>>2] = (5164);
  ___cxa_throw(($5|0),(88|0),(6|0));
  // unreachable;
 } else {
  $6 = $1 << 1;
  $7 = (__Znwj($6)|0);
  $8 = ((($0)) + 4|0);
  HEAP32[$8>>2] = $7;
  HEAP32[$0>>2] = $7;
  $9 = (($7) + ($1<<1)|0);
  $10 = ((($0)) + 8|0);
  HEAP32[$10>>2] = $9;
  return;
 }
}
function __ZNK9knusperli20OutputImageComponent8ToPixelsEiiiiPhi($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 var $$059$lcssa = 0, $$059101 = 0, $$060$lcssa = 0, $$060100 = 0, $$06287 = 0, $$063$lcssa = 0, $$06386 = 0, $$081 = 0, $$1$lcssa = 0, $$16182 = 0, $$16494 = 0, $$16494$lver$orig = 0, $$188 = 0, $$2$lcssa = 0, $$295 = 0, $$295$lver$orig = 0, $$383 = 0, $$4$lcssa = 0, $$480 = 0, $$sroa$speculated = 0;
 var $$sroa$speculated74 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $exitcond = 0, $exitcond110 = 0, $ident$check = 0, $load_initial = 0, $scevgep = 0, $scevgep111 = 0, $scevgep112 = 0, $scevgep113 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $7 = ($1|0)>(-1);
 if (!($7)) {
  ___assert_fail((7167|0),(7123|0),68,(7177|0));
  // unreachable;
 }
 $8 = ($2|0)>(-1);
 if (!($8)) {
  ___assert_fail((7186|0),(7123|0),69,(7177|0));
  // unreachable;
 }
 $9 = HEAP32[$0>>2]|0;
 $10 = ($9|0)>($1|0);
 if (!($10)) {
  ___assert_fail((7196|0),(7123|0),70,(7177|0));
  // unreachable;
 }
 $11 = ((($0)) + 4|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ($12|0)>($2|0);
 if (!($13)) {
  ___assert_fail((7210|0),(7123|0),71,(7177|0));
  // unreachable;
 }
 $14 = (($4) + ($2))|0;
 $15 = ($12|0)<($14|0);
 $$sroa$speculated74 = $15 ? $12 : $14;
 $16 = ($$sroa$speculated74|0)>($2|0);
 if ($16) {
  $17 = (($3) + ($1))|0;
  $18 = (0 - ($6))|0;
  $19 = ((($0)) + 40|0);
  $20 = $1 ^ -1;
  $21 = (($3) + ($1))|0;
  $ident$check = ($6|0)==(1);
  $$059101 = $5;$$060100 = $2;
  while(1) {
   $27 = HEAP32[$0>>2]|0;
   $28 = ($27|0)<($17|0);
   $$sroa$speculated = $28 ? $27 : $17;
   $29 = ($$sroa$speculated|0)>($1|0);
   if ($29) {
    $30 = Math_imul($27, $$060100)|0;
    $31 = (($30) + ($1))|0;
    $32 = ($17|0)>($27|0);
    $33 = $32 ? $27 : $17;
    $34 = $33 ^ -1;
    $35 = (($20) - ($34))|0;
    $36 = Math_imul($35, $6)|0;
    $$06287 = $31;$$06386 = $1;$$188 = $$059101;
    while(1) {
     $37 = HEAP32[$19>>2]|0;
     $38 = (($37) + ($$06287<<1)|0);
     $39 = HEAP16[$38>>1]|0;
     $40 = $39&65535;
     $41 = $$06386 & 1;
     $42 = (8 - ($41))|0;
     $43 = (($42) + ($40))|0;
     $44 = $43 >>> 4;
     $45 = $44&255;
     HEAP8[$$188>>0] = $45;
     $46 = (($$06386) + 1)|0;
     $47 = (($$06287) + 1)|0;
     $48 = (($$188) + ($6)|0);
     $49 = ($46|0)<($$sroa$speculated|0);
     if ($49) {
      $$06287 = $47;$$06386 = $46;$$188 = $48;
     } else {
      break;
     }
    }
    $scevgep111 = (($$059101) + ($36)|0);
    $$063$lcssa = $$sroa$speculated;$$1$lcssa = $scevgep111;
   } else {
    $$063$lcssa = $1;$$1$lcssa = $$059101;
   }
   $50 = ($$063$lcssa|0)<($17|0);
   if ($50) {
    $51 = (($21) - ($$063$lcssa))|0;
    $52 = Math_imul($51, $6)|0;
    if ($ident$check) {
     $scevgep113 = ((($$1$lcssa)) + -1|0);
     $load_initial = HEAP8[$scevgep113>>0]|0;
     $$16494 = $$063$lcssa;$$295 = $$1$lcssa;
     while(1) {
      HEAP8[$$295>>0] = $load_initial;
      $58 = (($$295) + ($6)|0);
      $59 = (($$16494) + 1)|0;
      $60 = ($59|0)<($17|0);
      if ($60) {
       $$16494 = $59;$$295 = $58;
      } else {
       break;
      }
     }
    } else {
     $$16494$lver$orig = $$063$lcssa;$$295$lver$orig = $$1$lcssa;
     while(1) {
      $53 = (($$295$lver$orig) + ($18)|0);
      $54 = HEAP8[$53>>0]|0;
      HEAP8[$$295$lver$orig>>0] = $54;
      $55 = (($$295$lver$orig) + ($6)|0);
      $56 = (($$16494$lver$orig) + 1)|0;
      $57 = ($56|0)<($17|0);
      if ($57) {
       $$16494$lver$orig = $56;$$295$lver$orig = $55;
      } else {
       break;
      }
     }
    }
    $scevgep112 = (($$1$lcssa) + ($52)|0);
    $$2$lcssa = $scevgep112;
   } else {
    $$2$lcssa = $$1$lcssa;
   }
   $61 = (($$060100) + 1)|0;
   $62 = ($61|0)<($$sroa$speculated74|0);
   if ($62) {
    $$059101 = $$2$lcssa;$$060100 = $61;
   } else {
    $$059$lcssa = $$2$lcssa;$$060$lcssa = $$sroa$speculated74;
    break;
   }
  }
 } else {
  $$059$lcssa = $5;$$060$lcssa = $2;
 }
 $22 = ($$060$lcssa|0)<($14|0);
 if (!($22)) {
  return;
 }
 $23 = (0 - ($3))|0;
 $24 = Math_imul($23, $6)|0;
 $25 = ($3|0)>(0);
 $26 = Math_imul($6, $3)|0;
 $$16182 = $$060$lcssa;$$383 = $$059$lcssa;
 while(1) {
  if ($25) {
   $$081 = 0;$$480 = $$383;
   while(1) {
    $64 = (($$480) + ($24)|0);
    $65 = HEAP8[$64>>0]|0;
    HEAP8[$$480>>0] = $65;
    $66 = (($$480) + ($6)|0);
    $67 = (($$081) + 1)|0;
    $exitcond = ($67|0)==($3|0);
    if ($exitcond) {
     break;
    } else {
     $$081 = $67;$$480 = $66;
    }
   }
   $scevgep = (($$383) + ($26)|0);
   $$4$lcssa = $scevgep;
  } else {
   $$4$lcssa = $$383;
  }
  $63 = (($$16182) + 1)|0;
  $exitcond110 = ($63|0)==($14|0);
  if ($exitcond110) {
   break;
  } else {
   $$16182 = $63;$$383 = $$4$lcssa;
  }
 }
 return;
}
function __ZN9knusperli20OutputImageComponent13SetCoeffBlockEiiPKs($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $4 = sp;
 $5 = ((($0)) + 16|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)>($1|0);
 if (!($7)) {
  ___assert_fail((7096|0),(7123|0),124,(7225|0));
  // unreachable;
 }
 $8 = ((($0)) + 20|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ($9|0)>($2|0);
 if ($10) {
  $11 = Math_imul($6, $2)|0;
  $12 = (($11) + ($1))|0;
  $13 = $12 << 6;
  $14 = ((($0)) + 28|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = (($15) + ($13<<1)|0);
  dest=$16; src=$3; stop=dest+128|0; do { HEAP16[dest>>1]=HEAP16[src>>1]|0; dest=dest+2|0; src=src+2|0; } while ((dest|0) < (stop|0));
  $17 = HEAP32[$14>>2]|0;
  $18 = (($17) + ($13<<1)|0);
  __ZN9knusperli16ComputeBlockIDCTEPKsPh($18,$4);
  __ZN9knusperli20OutputImageComponent20UpdatePixelsForBlockEiiPKh($0,$1,$2,$4);
  STACKTOP = sp;return;
 } else {
  ___assert_fail((7139|0),(7123|0),125,(7225|0));
  // unreachable;
 }
}
function __ZN9knusperli20OutputImageComponent20UpdatePixelsForBlockEiiPKh($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0141216 = 0, $$0142222 = 0, $$0144217 = 0, $$0215 = 0, $$sink = 0, $$sink$1 = 0, $$sink$2 = 0, $$sink$3 = 0, $$sink$4 = 0, $$sink$5 = 0, $$sink$6 = 0, $$sink$7 = 0, $$sink$8 = 0, $$sink$9 = 0, $$sroa$speculated = 0, $$sroa$speculated157 = 0, $$sroa$speculated168 = 0, $$sroa$speculated179 = 0, $$sroa$speculated190 = 0, $$sroa$speculated190$1 = 0;
 var $$sroa$speculated190$2 = 0, $$sroa$speculated190$3 = 0, $$sroa$speculated190$4 = 0, $$sroa$speculated190$5 = 0, $$sroa$speculated190$6 = 0, $$sroa$speculated190$7 = 0, $$sroa$speculated190$8 = 0, $$sroa$speculated190$9 = 0, $$sroa$speculated201 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0;
 var $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0;
 var $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0;
 var $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0;
 var $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0;
 var $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0;
 var $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0;
 var $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0;
 var $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0;
 var $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0;
 var $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0;
 var $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0;
 var $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0;
 var $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0;
 var $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0;
 var $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0;
 var $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0;
 var $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0;
 var $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0;
 var $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0;
 var $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0;
 var $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0;
 var $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0;
 var $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0;
 var $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0;
 var $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0;
 var $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0;
 var $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0;
 var $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0;
 var $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0;
 var $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0;
 var $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0;
 var $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0;
 var $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0;
 var $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0;
 var $724 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0, $exitcond224 = 0, $or$cond145 = 0, $or$cond146 = 0, $tmp = 0, $tmp210 = 0, $tmp211 = 0, $tmp211$1 = 0, $tmp211$2 = 0, $tmp211$3 = 0;
 var $tmp211$4 = 0, $tmp211$5 = 0, $tmp211$6 = 0, $tmp211$7 = 0, $tmp211$8 = 0, $tmp211$9 = 0, $tmp212 = 0, $tmp212$1 = 0, $tmp212$2 = 0, $tmp212$3 = 0, $tmp212$4 = 0, $tmp212$5 = 0, $tmp212$6 = 0, $tmp212$7 = 0, $tmp212$8 = 0, $tmp212$9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0;
 $vararg_buffer = sp;
 $4 = sp + 8|0;
 $5 = ((($0)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)==(1);
 $8 = ((($0)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ($9|0)==(1);
 $or$cond145 = $7 & $10;
 if ($or$cond145) {
  $11 = $1 << 3;
  $12 = $2 << 3;
  $13 = ((($0)) + 4|0);
  $14 = ((($0)) + 40|0);
  $15 = $11 | 1;
  $16 = $11 | 2;
  $17 = $11 | 3;
  $18 = $11 | 4;
  $19 = $11 | 5;
  $20 = $11 | 6;
  $21 = $11 | 7;
  $$0215 = 0;
  while(1) {
   $22 = (($$0215) + ($12))|0;
   $23 = $$0215 << 3;
   $24 = HEAP32[$0>>2]|0;
   $25 = ($11|0)<($24|0);
   if ($25) {
    $26 = HEAP32[$13>>2]|0;
    $27 = ($22|0)<($26|0);
    if ($27) {
     $28 = Math_imul($24, $22)|0;
     $29 = (($28) + ($11))|0;
     $30 = (($3) + ($23)|0);
     $31 = HEAP8[$30>>0]|0;
     $32 = $31&255;
     $33 = $32 << 4;
     $34 = $33&65535;
     $35 = HEAP32[$14>>2]|0;
     $36 = (($35) + ($29<<1)|0);
     HEAP16[$36>>1] = $34;
    }
   }
   $37 = HEAP32[$0>>2]|0;
   $38 = ($15|0)<($37|0);
   if ($38) {
    $208 = HEAP32[$13>>2]|0;
    $209 = ($22|0)<($208|0);
    if ($209) {
     $210 = Math_imul($37, $22)|0;
     $211 = (($210) + ($15))|0;
     $212 = $23 | 1;
     $213 = (($3) + ($212)|0);
     $214 = HEAP8[$213>>0]|0;
     $215 = $214&255;
     $216 = $215 << 4;
     $217 = $216&65535;
     $218 = HEAP32[$14>>2]|0;
     $219 = (($218) + ($211<<1)|0);
     HEAP16[$219>>1] = $217;
    }
   }
   $220 = HEAP32[$0>>2]|0;
   $221 = ($16|0)<($220|0);
   if ($221) {
    $222 = HEAP32[$13>>2]|0;
    $223 = ($22|0)<($222|0);
    if ($223) {
     $224 = Math_imul($220, $22)|0;
     $225 = (($224) + ($16))|0;
     $226 = $23 | 2;
     $227 = (($3) + ($226)|0);
     $228 = HEAP8[$227>>0]|0;
     $229 = $228&255;
     $230 = $229 << 4;
     $231 = $230&65535;
     $232 = HEAP32[$14>>2]|0;
     $233 = (($232) + ($225<<1)|0);
     HEAP16[$233>>1] = $231;
    }
   }
   $234 = HEAP32[$0>>2]|0;
   $235 = ($17|0)<($234|0);
   if ($235) {
    $236 = HEAP32[$13>>2]|0;
    $237 = ($22|0)<($236|0);
    if ($237) {
     $238 = Math_imul($234, $22)|0;
     $239 = (($238) + ($17))|0;
     $240 = $23 | 3;
     $241 = (($3) + ($240)|0);
     $242 = HEAP8[$241>>0]|0;
     $243 = $242&255;
     $244 = $243 << 4;
     $245 = $244&65535;
     $246 = HEAP32[$14>>2]|0;
     $247 = (($246) + ($239<<1)|0);
     HEAP16[$247>>1] = $245;
    }
   }
   $248 = HEAP32[$0>>2]|0;
   $249 = ($18|0)<($248|0);
   if ($249) {
    $250 = HEAP32[$13>>2]|0;
    $251 = ($22|0)<($250|0);
    if ($251) {
     $252 = Math_imul($248, $22)|0;
     $253 = (($252) + ($18))|0;
     $254 = $23 | 4;
     $255 = (($3) + ($254)|0);
     $256 = HEAP8[$255>>0]|0;
     $257 = $256&255;
     $258 = $257 << 4;
     $259 = $258&65535;
     $260 = HEAP32[$14>>2]|0;
     $261 = (($260) + ($253<<1)|0);
     HEAP16[$261>>1] = $259;
    }
   }
   $262 = HEAP32[$0>>2]|0;
   $263 = ($19|0)<($262|0);
   if ($263) {
    $264 = HEAP32[$13>>2]|0;
    $265 = ($22|0)<($264|0);
    if ($265) {
     $266 = Math_imul($262, $22)|0;
     $267 = (($266) + ($19))|0;
     $268 = $23 | 5;
     $269 = (($3) + ($268)|0);
     $270 = HEAP8[$269>>0]|0;
     $271 = $270&255;
     $272 = $271 << 4;
     $273 = $272&65535;
     $274 = HEAP32[$14>>2]|0;
     $275 = (($274) + ($267<<1)|0);
     HEAP16[$275>>1] = $273;
    }
   }
   $276 = HEAP32[$0>>2]|0;
   $277 = ($20|0)<($276|0);
   if ($277) {
    $278 = HEAP32[$13>>2]|0;
    $279 = ($22|0)<($278|0);
    if ($279) {
     $280 = Math_imul($276, $22)|0;
     $281 = (($280) + ($20))|0;
     $282 = $23 | 6;
     $283 = (($3) + ($282)|0);
     $284 = HEAP8[$283>>0]|0;
     $285 = $284&255;
     $286 = $285 << 4;
     $287 = $286&65535;
     $288 = HEAP32[$14>>2]|0;
     $289 = (($288) + ($281<<1)|0);
     HEAP16[$289>>1] = $287;
    }
   }
   $290 = HEAP32[$0>>2]|0;
   $291 = ($21|0)<($290|0);
   if ($291) {
    $292 = HEAP32[$13>>2]|0;
    $293 = ($22|0)<($292|0);
    if ($293) {
     $294 = Math_imul($290, $22)|0;
     $295 = (($294) + ($21))|0;
     $296 = $23 | 7;
     $297 = (($3) + ($296)|0);
     $298 = HEAP8[$297>>0]|0;
     $299 = $298&255;
     $300 = $299 << 4;
     $301 = $300&65535;
     $302 = HEAP32[$14>>2]|0;
     $303 = (($302) + ($295<<1)|0);
     HEAP16[$303>>1] = $301;
    }
   }
   $304 = (($$0215) + 1)|0;
   $exitcond = ($304|0)==(8);
   if ($exitcond) {
    break;
   } else {
    $$0215 = $304;
   }
  }
  STACKTOP = sp;return;
 }
 $39 = ($6|0)==(2);
 $40 = ($9|0)==(2);
 $or$cond146 = $39 & $40;
 if (!($or$cond146)) {
  HEAP32[$vararg_buffer>>2] = $6;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = $9;
  (_printf(7239,$vararg_buffer)|0);
  _exit(1);
  // unreachable;
 }
 $41 = $2 << 4;
 $42 = $1 << 4;
 $43 = ((($0)) + 4|0);
 $44 = ((($0)) + 40|0);
 $45 = ($1|0)<(0);
 $46 = $42 | 2;
 $47 = ($46|0)<(0);
 $48 = $42 | 4;
 $49 = ($48|0)<(0);
 $50 = $42 | 6;
 $51 = ($50|0)<(0);
 $52 = $42 | 8;
 $53 = ($52|0)<(0);
 $54 = $42 | 10;
 $55 = ($54|0)<(0);
 $56 = $42 | 12;
 $57 = ($56|0)<(0);
 $58 = $42 | 14;
 $59 = ($58|0)<(0);
 $60 = (($42) + 16)|0;
 $61 = ($42|0)<(-16);
 $62 = (($42) + -2)|0;
 $63 = ($42|0)<(2);
 $64 = (($42) + -3)|0;
 $65 = ($64|0)>(0);
 $$sroa$speculated190$9 = $65 ? $64 : 0;
 $66 = $42 | 15;
 $67 = ($66|0)>(0);
 $$sroa$speculated190$8 = $67 ? $66 : 0;
 $68 = (($58) + -1)|0;
 $69 = ($68|0)>(0);
 $$sroa$speculated190$7 = $69 ? $68 : 0;
 $70 = (($56) + -1)|0;
 $71 = ($70|0)>(0);
 $$sroa$speculated190$6 = $71 ? $70 : 0;
 $72 = (($54) + -1)|0;
 $73 = ($72|0)>(0);
 $$sroa$speculated190$5 = $73 ? $72 : 0;
 $74 = (($52) + -1)|0;
 $75 = ($74|0)>(0);
 $$sroa$speculated190$4 = $75 ? $74 : 0;
 $76 = (($50) + -1)|0;
 $77 = ($76|0)>(0);
 $$sroa$speculated190$3 = $77 ? $76 : 0;
 $78 = (($48) + -1)|0;
 $79 = ($78|0)>(0);
 $$sroa$speculated190$2 = $79 ? $78 : 0;
 $80 = (($46) + -1)|0;
 $81 = ($80|0)>(0);
 $$sroa$speculated190$1 = $81 ? $80 : 0;
 $82 = (($42) + -1)|0;
 $83 = ($82|0)>(0);
 $$sroa$speculated190 = $83 ? $82 : 0;
 $$0142222 = 0;
 while(1) {
  $107 = ($$0142222|0)!=(9);
  $108 = $$0142222 << 1;
  $109 = $107 ? $108 : -2;
  $110 = (($109) + ($41))|0;
  $111 = ($$0142222*10)|0;
  $112 = (($111) + 10)|0;
  $113 = $107 ? $112 : 0;
  $114 = ($110|0)<(0);
  $115 = ($$0142222|0)<(8);
  $116 = $$0142222 << 3;
  $117 = (($110) + -1)|0;
  $118 = ($117|0)>(0);
  $$sroa$speculated201 = $118 ? $117 : 0;
  $119 = $113 | 1;
  do {
   if ($45) {
    $120 = (($119) + 1)|0;
    $121 = (($4) + ($120<<1)|0);
    $122 = HEAP16[$121>>1]|0;
    $$sink = $122;
   } else {
    if ($114) {
     $123 = (($119) + 10)|0;
     $124 = (($4) + ($123<<1)|0);
     $125 = HEAP16[$124>>1]|0;
     $$sink = $125;
     break;
    }
    $126 = HEAP32[$0>>2]|0;
    $127 = ($42|0)<($126|0);
    if (!($127)) {
     $128 = (($4) + ($113<<1)|0);
     $129 = HEAP16[$128>>1]|0;
     $$sink = $129;
     break;
    }
    $130 = HEAP32[$43>>2]|0;
    $131 = ($110|0)<($130|0);
    if (!($131)) {
     $132 = (($119) + -10)|0;
     $133 = (($4) + ($132<<1)|0);
     $134 = HEAP16[$133>>1]|0;
     $$sink = $134;
     break;
    }
    if ($115) {
     $135 = (($3) + ($116)|0);
     $136 = HEAP8[$135>>0]|0;
     $137 = $136&255;
     $138 = $137 << 4;
     $139 = $138&65535;
     $$sink = $139;
     break;
    } else {
     $140 = Math_imul($126, $110)|0;
     $141 = (($140) + ($42))|0;
     $142 = HEAP32[$44>>2]|0;
     $143 = (($142) + ($141<<1)|0);
     $144 = HEAP16[$143>>1]|0;
     $145 = $144&65535;
     $146 = ($145*9)|0;
     $147 = Math_imul($126, $$sroa$speculated201)|0;
     $148 = (($147) + ($$sroa$speculated190))|0;
     $149 = (($142) + ($148<<1)|0);
     $150 = HEAP16[$149>>1]|0;
     $151 = $150&65535;
     $152 = (($140) + ($$sroa$speculated190))|0;
     $153 = (($142) + ($152<<1)|0);
     $154 = HEAP16[$153>>1]|0;
     $155 = $154&65535;
     $156 = (($147) + ($42))|0;
     $157 = (($142) + ($156<<1)|0);
     $158 = HEAP16[$157>>1]|0;
     $159 = $158&65535;
     $tmp211 = (($159) + ($155))|0;
     $tmp212 = Math_imul($tmp211, -3)|0;
     $160 = (($146) + ($151))|0;
     $161 = (($160) + ($tmp212))|0;
     $162 = $161 >>> 2;
     $163 = $162&65535;
     $$sink = $163;
     break;
    }
   }
  } while(0);
  $164 = (($4) + ($119<<1)|0);
  HEAP16[$164>>1] = $$sink;
  $165 = (($113) + 2)|0;
  do {
   if ($47) {
    $348 = (($113) + 3)|0;
    $349 = (($4) + ($348<<1)|0);
    $350 = HEAP16[$349>>1]|0;
    $$sink$1 = $350;
   } else {
    if ($114) {
     $345 = (($113) + 12)|0;
     $346 = (($4) + ($345<<1)|0);
     $347 = HEAP16[$346>>1]|0;
     $$sink$1 = $347;
     break;
    }
    $305 = HEAP32[$0>>2]|0;
    $306 = ($46|0)<($305|0);
    if (!($306)) {
     $307 = $113 | 1;
     $308 = (($4) + ($307<<1)|0);
     $309 = HEAP16[$308>>1]|0;
     $$sink$1 = $309;
     break;
    }
    $310 = HEAP32[$43>>2]|0;
    $311 = ($110|0)<($310|0);
    if (!($311)) {
     $312 = (($113) + -8)|0;
     $313 = (($4) + ($312<<1)|0);
     $314 = HEAP16[$313>>1]|0;
     $$sink$1 = $314;
     break;
    }
    if ($115) {
     $339 = $116 | 1;
     $340 = (($3) + ($339)|0);
     $341 = HEAP8[$340>>0]|0;
     $342 = $341&255;
     $343 = $342 << 4;
     $344 = $343&65535;
     $$sink$1 = $344;
     break;
    } else {
     $315 = Math_imul($305, $110)|0;
     $316 = (($315) + ($46))|0;
     $317 = HEAP32[$44>>2]|0;
     $318 = (($317) + ($316<<1)|0);
     $319 = HEAP16[$318>>1]|0;
     $320 = $319&65535;
     $321 = ($320*9)|0;
     $322 = Math_imul($305, $$sroa$speculated201)|0;
     $323 = (($322) + ($$sroa$speculated190$1))|0;
     $324 = (($317) + ($323<<1)|0);
     $325 = HEAP16[$324>>1]|0;
     $326 = $325&65535;
     $327 = (($315) + ($$sroa$speculated190$1))|0;
     $328 = (($317) + ($327<<1)|0);
     $329 = HEAP16[$328>>1]|0;
     $330 = $329&65535;
     $331 = (($322) + ($46))|0;
     $332 = (($317) + ($331<<1)|0);
     $333 = HEAP16[$332>>1]|0;
     $334 = $333&65535;
     $tmp211$1 = (($334) + ($330))|0;
     $tmp212$1 = Math_imul($tmp211$1, -3)|0;
     $335 = (($321) + ($326))|0;
     $336 = (($335) + ($tmp212$1))|0;
     $337 = $336 >>> 2;
     $338 = $337&65535;
     $$sink$1 = $338;
     break;
    }
   }
  } while(0);
  $351 = (($4) + ($165<<1)|0);
  HEAP16[$351>>1] = $$sink$1;
  $352 = (($113) + 3)|0;
  do {
   if ($49) {
    $396 = (($113) + 4)|0;
    $397 = (($4) + ($396<<1)|0);
    $398 = HEAP16[$397>>1]|0;
    $$sink$2 = $398;
   } else {
    if ($114) {
     $393 = (($113) + 13)|0;
     $394 = (($4) + ($393<<1)|0);
     $395 = HEAP16[$394>>1]|0;
     $$sink$2 = $395;
     break;
    }
    $353 = HEAP32[$0>>2]|0;
    $354 = ($48|0)<($353|0);
    if (!($354)) {
     $355 = (($113) + 2)|0;
     $356 = (($4) + ($355<<1)|0);
     $357 = HEAP16[$356>>1]|0;
     $$sink$2 = $357;
     break;
    }
    $358 = HEAP32[$43>>2]|0;
    $359 = ($110|0)<($358|0);
    if (!($359)) {
     $360 = (($113) + -7)|0;
     $361 = (($4) + ($360<<1)|0);
     $362 = HEAP16[$361>>1]|0;
     $$sink$2 = $362;
     break;
    }
    if ($115) {
     $387 = $116 | 2;
     $388 = (($3) + ($387)|0);
     $389 = HEAP8[$388>>0]|0;
     $390 = $389&255;
     $391 = $390 << 4;
     $392 = $391&65535;
     $$sink$2 = $392;
     break;
    } else {
     $363 = Math_imul($353, $110)|0;
     $364 = (($363) + ($48))|0;
     $365 = HEAP32[$44>>2]|0;
     $366 = (($365) + ($364<<1)|0);
     $367 = HEAP16[$366>>1]|0;
     $368 = $367&65535;
     $369 = ($368*9)|0;
     $370 = Math_imul($353, $$sroa$speculated201)|0;
     $371 = (($370) + ($$sroa$speculated190$2))|0;
     $372 = (($365) + ($371<<1)|0);
     $373 = HEAP16[$372>>1]|0;
     $374 = $373&65535;
     $375 = (($363) + ($$sroa$speculated190$2))|0;
     $376 = (($365) + ($375<<1)|0);
     $377 = HEAP16[$376>>1]|0;
     $378 = $377&65535;
     $379 = (($370) + ($48))|0;
     $380 = (($365) + ($379<<1)|0);
     $381 = HEAP16[$380>>1]|0;
     $382 = $381&65535;
     $tmp211$2 = (($382) + ($378))|0;
     $tmp212$2 = Math_imul($tmp211$2, -3)|0;
     $383 = (($369) + ($374))|0;
     $384 = (($383) + ($tmp212$2))|0;
     $385 = $384 >>> 2;
     $386 = $385&65535;
     $$sink$2 = $386;
     break;
    }
   }
  } while(0);
  $399 = (($4) + ($352<<1)|0);
  HEAP16[$399>>1] = $$sink$2;
  $400 = (($113) + 4)|0;
  do {
   if ($51) {
    $444 = (($113) + 5)|0;
    $445 = (($4) + ($444<<1)|0);
    $446 = HEAP16[$445>>1]|0;
    $$sink$3 = $446;
   } else {
    if ($114) {
     $441 = (($113) + 14)|0;
     $442 = (($4) + ($441<<1)|0);
     $443 = HEAP16[$442>>1]|0;
     $$sink$3 = $443;
     break;
    }
    $401 = HEAP32[$0>>2]|0;
    $402 = ($50|0)<($401|0);
    if (!($402)) {
     $403 = (($113) + 3)|0;
     $404 = (($4) + ($403<<1)|0);
     $405 = HEAP16[$404>>1]|0;
     $$sink$3 = $405;
     break;
    }
    $406 = HEAP32[$43>>2]|0;
    $407 = ($110|0)<($406|0);
    if (!($407)) {
     $408 = (($113) + -6)|0;
     $409 = (($4) + ($408<<1)|0);
     $410 = HEAP16[$409>>1]|0;
     $$sink$3 = $410;
     break;
    }
    if ($115) {
     $435 = $116 | 3;
     $436 = (($3) + ($435)|0);
     $437 = HEAP8[$436>>0]|0;
     $438 = $437&255;
     $439 = $438 << 4;
     $440 = $439&65535;
     $$sink$3 = $440;
     break;
    } else {
     $411 = Math_imul($401, $110)|0;
     $412 = (($411) + ($50))|0;
     $413 = HEAP32[$44>>2]|0;
     $414 = (($413) + ($412<<1)|0);
     $415 = HEAP16[$414>>1]|0;
     $416 = $415&65535;
     $417 = ($416*9)|0;
     $418 = Math_imul($401, $$sroa$speculated201)|0;
     $419 = (($418) + ($$sroa$speculated190$3))|0;
     $420 = (($413) + ($419<<1)|0);
     $421 = HEAP16[$420>>1]|0;
     $422 = $421&65535;
     $423 = (($411) + ($$sroa$speculated190$3))|0;
     $424 = (($413) + ($423<<1)|0);
     $425 = HEAP16[$424>>1]|0;
     $426 = $425&65535;
     $427 = (($418) + ($50))|0;
     $428 = (($413) + ($427<<1)|0);
     $429 = HEAP16[$428>>1]|0;
     $430 = $429&65535;
     $tmp211$3 = (($430) + ($426))|0;
     $tmp212$3 = Math_imul($tmp211$3, -3)|0;
     $431 = (($417) + ($422))|0;
     $432 = (($431) + ($tmp212$3))|0;
     $433 = $432 >>> 2;
     $434 = $433&65535;
     $$sink$3 = $434;
     break;
    }
   }
  } while(0);
  $447 = (($4) + ($400<<1)|0);
  HEAP16[$447>>1] = $$sink$3;
  $448 = (($113) + 5)|0;
  do {
   if ($53) {
    $492 = (($113) + 6)|0;
    $493 = (($4) + ($492<<1)|0);
    $494 = HEAP16[$493>>1]|0;
    $$sink$4 = $494;
   } else {
    if ($114) {
     $489 = (($113) + 15)|0;
     $490 = (($4) + ($489<<1)|0);
     $491 = HEAP16[$490>>1]|0;
     $$sink$4 = $491;
     break;
    }
    $449 = HEAP32[$0>>2]|0;
    $450 = ($52|0)<($449|0);
    if (!($450)) {
     $451 = (($113) + 4)|0;
     $452 = (($4) + ($451<<1)|0);
     $453 = HEAP16[$452>>1]|0;
     $$sink$4 = $453;
     break;
    }
    $454 = HEAP32[$43>>2]|0;
    $455 = ($110|0)<($454|0);
    if (!($455)) {
     $456 = (($113) + -5)|0;
     $457 = (($4) + ($456<<1)|0);
     $458 = HEAP16[$457>>1]|0;
     $$sink$4 = $458;
     break;
    }
    if ($115) {
     $483 = $116 | 4;
     $484 = (($3) + ($483)|0);
     $485 = HEAP8[$484>>0]|0;
     $486 = $485&255;
     $487 = $486 << 4;
     $488 = $487&65535;
     $$sink$4 = $488;
     break;
    } else {
     $459 = Math_imul($449, $110)|0;
     $460 = (($459) + ($52))|0;
     $461 = HEAP32[$44>>2]|0;
     $462 = (($461) + ($460<<1)|0);
     $463 = HEAP16[$462>>1]|0;
     $464 = $463&65535;
     $465 = ($464*9)|0;
     $466 = Math_imul($449, $$sroa$speculated201)|0;
     $467 = (($466) + ($$sroa$speculated190$4))|0;
     $468 = (($461) + ($467<<1)|0);
     $469 = HEAP16[$468>>1]|0;
     $470 = $469&65535;
     $471 = (($459) + ($$sroa$speculated190$4))|0;
     $472 = (($461) + ($471<<1)|0);
     $473 = HEAP16[$472>>1]|0;
     $474 = $473&65535;
     $475 = (($466) + ($52))|0;
     $476 = (($461) + ($475<<1)|0);
     $477 = HEAP16[$476>>1]|0;
     $478 = $477&65535;
     $tmp211$4 = (($478) + ($474))|0;
     $tmp212$4 = Math_imul($tmp211$4, -3)|0;
     $479 = (($465) + ($470))|0;
     $480 = (($479) + ($tmp212$4))|0;
     $481 = $480 >>> 2;
     $482 = $481&65535;
     $$sink$4 = $482;
     break;
    }
   }
  } while(0);
  $495 = (($4) + ($448<<1)|0);
  HEAP16[$495>>1] = $$sink$4;
  $496 = (($113) + 6)|0;
  do {
   if ($55) {
    $540 = (($113) + 7)|0;
    $541 = (($4) + ($540<<1)|0);
    $542 = HEAP16[$541>>1]|0;
    $$sink$5 = $542;
   } else {
    if ($114) {
     $537 = (($113) + 16)|0;
     $538 = (($4) + ($537<<1)|0);
     $539 = HEAP16[$538>>1]|0;
     $$sink$5 = $539;
     break;
    }
    $497 = HEAP32[$0>>2]|0;
    $498 = ($54|0)<($497|0);
    if (!($498)) {
     $499 = (($113) + 5)|0;
     $500 = (($4) + ($499<<1)|0);
     $501 = HEAP16[$500>>1]|0;
     $$sink$5 = $501;
     break;
    }
    $502 = HEAP32[$43>>2]|0;
    $503 = ($110|0)<($502|0);
    if (!($503)) {
     $504 = (($113) + -4)|0;
     $505 = (($4) + ($504<<1)|0);
     $506 = HEAP16[$505>>1]|0;
     $$sink$5 = $506;
     break;
    }
    if ($115) {
     $531 = $116 | 5;
     $532 = (($3) + ($531)|0);
     $533 = HEAP8[$532>>0]|0;
     $534 = $533&255;
     $535 = $534 << 4;
     $536 = $535&65535;
     $$sink$5 = $536;
     break;
    } else {
     $507 = Math_imul($497, $110)|0;
     $508 = (($507) + ($54))|0;
     $509 = HEAP32[$44>>2]|0;
     $510 = (($509) + ($508<<1)|0);
     $511 = HEAP16[$510>>1]|0;
     $512 = $511&65535;
     $513 = ($512*9)|0;
     $514 = Math_imul($497, $$sroa$speculated201)|0;
     $515 = (($514) + ($$sroa$speculated190$5))|0;
     $516 = (($509) + ($515<<1)|0);
     $517 = HEAP16[$516>>1]|0;
     $518 = $517&65535;
     $519 = (($507) + ($$sroa$speculated190$5))|0;
     $520 = (($509) + ($519<<1)|0);
     $521 = HEAP16[$520>>1]|0;
     $522 = $521&65535;
     $523 = (($514) + ($54))|0;
     $524 = (($509) + ($523<<1)|0);
     $525 = HEAP16[$524>>1]|0;
     $526 = $525&65535;
     $tmp211$5 = (($526) + ($522))|0;
     $tmp212$5 = Math_imul($tmp211$5, -3)|0;
     $527 = (($513) + ($518))|0;
     $528 = (($527) + ($tmp212$5))|0;
     $529 = $528 >>> 2;
     $530 = $529&65535;
     $$sink$5 = $530;
     break;
    }
   }
  } while(0);
  $543 = (($4) + ($496<<1)|0);
  HEAP16[$543>>1] = $$sink$5;
  $544 = (($113) + 7)|0;
  do {
   if ($57) {
    $588 = (($113) + 8)|0;
    $589 = (($4) + ($588<<1)|0);
    $590 = HEAP16[$589>>1]|0;
    $$sink$6 = $590;
   } else {
    if ($114) {
     $585 = (($113) + 17)|0;
     $586 = (($4) + ($585<<1)|0);
     $587 = HEAP16[$586>>1]|0;
     $$sink$6 = $587;
     break;
    }
    $545 = HEAP32[$0>>2]|0;
    $546 = ($56|0)<($545|0);
    if (!($546)) {
     $547 = (($113) + 6)|0;
     $548 = (($4) + ($547<<1)|0);
     $549 = HEAP16[$548>>1]|0;
     $$sink$6 = $549;
     break;
    }
    $550 = HEAP32[$43>>2]|0;
    $551 = ($110|0)<($550|0);
    if (!($551)) {
     $552 = (($113) + -3)|0;
     $553 = (($4) + ($552<<1)|0);
     $554 = HEAP16[$553>>1]|0;
     $$sink$6 = $554;
     break;
    }
    if ($115) {
     $579 = $116 | 6;
     $580 = (($3) + ($579)|0);
     $581 = HEAP8[$580>>0]|0;
     $582 = $581&255;
     $583 = $582 << 4;
     $584 = $583&65535;
     $$sink$6 = $584;
     break;
    } else {
     $555 = Math_imul($545, $110)|0;
     $556 = (($555) + ($56))|0;
     $557 = HEAP32[$44>>2]|0;
     $558 = (($557) + ($556<<1)|0);
     $559 = HEAP16[$558>>1]|0;
     $560 = $559&65535;
     $561 = ($560*9)|0;
     $562 = Math_imul($545, $$sroa$speculated201)|0;
     $563 = (($562) + ($$sroa$speculated190$6))|0;
     $564 = (($557) + ($563<<1)|0);
     $565 = HEAP16[$564>>1]|0;
     $566 = $565&65535;
     $567 = (($555) + ($$sroa$speculated190$6))|0;
     $568 = (($557) + ($567<<1)|0);
     $569 = HEAP16[$568>>1]|0;
     $570 = $569&65535;
     $571 = (($562) + ($56))|0;
     $572 = (($557) + ($571<<1)|0);
     $573 = HEAP16[$572>>1]|0;
     $574 = $573&65535;
     $tmp211$6 = (($574) + ($570))|0;
     $tmp212$6 = Math_imul($tmp211$6, -3)|0;
     $575 = (($561) + ($566))|0;
     $576 = (($575) + ($tmp212$6))|0;
     $577 = $576 >>> 2;
     $578 = $577&65535;
     $$sink$6 = $578;
     break;
    }
   }
  } while(0);
  $591 = (($4) + ($544<<1)|0);
  HEAP16[$591>>1] = $$sink$6;
  $592 = (($113) + 8)|0;
  do {
   if ($59) {
    $636 = (($113) + 9)|0;
    $637 = (($4) + ($636<<1)|0);
    $638 = HEAP16[$637>>1]|0;
    $$sink$7 = $638;
   } else {
    if ($114) {
     $633 = (($113) + 18)|0;
     $634 = (($4) + ($633<<1)|0);
     $635 = HEAP16[$634>>1]|0;
     $$sink$7 = $635;
     break;
    }
    $593 = HEAP32[$0>>2]|0;
    $594 = ($58|0)<($593|0);
    if (!($594)) {
     $595 = (($113) + 7)|0;
     $596 = (($4) + ($595<<1)|0);
     $597 = HEAP16[$596>>1]|0;
     $$sink$7 = $597;
     break;
    }
    $598 = HEAP32[$43>>2]|0;
    $599 = ($110|0)<($598|0);
    if (!($599)) {
     $600 = (($113) + -2)|0;
     $601 = (($4) + ($600<<1)|0);
     $602 = HEAP16[$601>>1]|0;
     $$sink$7 = $602;
     break;
    }
    if ($115) {
     $627 = $116 | 7;
     $628 = (($3) + ($627)|0);
     $629 = HEAP8[$628>>0]|0;
     $630 = $629&255;
     $631 = $630 << 4;
     $632 = $631&65535;
     $$sink$7 = $632;
     break;
    } else {
     $603 = Math_imul($593, $110)|0;
     $604 = (($603) + ($58))|0;
     $605 = HEAP32[$44>>2]|0;
     $606 = (($605) + ($604<<1)|0);
     $607 = HEAP16[$606>>1]|0;
     $608 = $607&65535;
     $609 = ($608*9)|0;
     $610 = Math_imul($593, $$sroa$speculated201)|0;
     $611 = (($610) + ($$sroa$speculated190$7))|0;
     $612 = (($605) + ($611<<1)|0);
     $613 = HEAP16[$612>>1]|0;
     $614 = $613&65535;
     $615 = (($603) + ($$sroa$speculated190$7))|0;
     $616 = (($605) + ($615<<1)|0);
     $617 = HEAP16[$616>>1]|0;
     $618 = $617&65535;
     $619 = (($610) + ($58))|0;
     $620 = (($605) + ($619<<1)|0);
     $621 = HEAP16[$620>>1]|0;
     $622 = $621&65535;
     $tmp211$7 = (($622) + ($618))|0;
     $tmp212$7 = Math_imul($tmp211$7, -3)|0;
     $623 = (($609) + ($614))|0;
     $624 = (($623) + ($tmp212$7))|0;
     $625 = $624 >>> 2;
     $626 = $625&65535;
     $$sink$7 = $626;
     break;
    }
   }
  } while(0);
  $639 = (($4) + ($592<<1)|0);
  HEAP16[$639>>1] = $$sink$7;
  $640 = (($113) + 9)|0;
  do {
   if ($61) {
    $678 = (($113) + 10)|0;
    $679 = (($4) + ($678<<1)|0);
    $680 = HEAP16[$679>>1]|0;
    $681 = (($4) + ($640<<1)|0);
    HEAP16[$681>>1] = $680;
    label = 144;
   } else {
    do {
     if ($114) {
      $675 = (($113) + 19)|0;
      $676 = (($4) + ($675<<1)|0);
      $677 = HEAP16[$676>>1]|0;
      $$sink$8 = $677;
     } else {
      $641 = HEAP32[$0>>2]|0;
      $642 = ($60|0)<($641|0);
      if (!($642)) {
       $643 = (($113) + 8)|0;
       $644 = (($4) + ($643<<1)|0);
       $645 = HEAP16[$644>>1]|0;
       $$sink$8 = $645;
       break;
      }
      $646 = HEAP32[$43>>2]|0;
      $647 = ($110|0)<($646|0);
      if ($647) {
       $651 = Math_imul($641, $110)|0;
       $652 = (($651) + ($60))|0;
       $653 = HEAP32[$44>>2]|0;
       $654 = (($653) + ($652<<1)|0);
       $655 = HEAP16[$654>>1]|0;
       $656 = $655&65535;
       $657 = ($656*9)|0;
       $658 = Math_imul($641, $$sroa$speculated201)|0;
       $659 = (($658) + ($$sroa$speculated190$8))|0;
       $660 = (($653) + ($659<<1)|0);
       $661 = HEAP16[$660>>1]|0;
       $662 = $661&65535;
       $663 = (($651) + ($$sroa$speculated190$8))|0;
       $664 = (($653) + ($663<<1)|0);
       $665 = HEAP16[$664>>1]|0;
       $666 = $665&65535;
       $667 = (($658) + ($60))|0;
       $668 = (($653) + ($667<<1)|0);
       $669 = HEAP16[$668>>1]|0;
       $670 = $669&65535;
       $tmp211$8 = (($670) + ($666))|0;
       $tmp212$8 = Math_imul($tmp211$8, -3)|0;
       $671 = (($657) + ($662))|0;
       $672 = (($671) + ($tmp212$8))|0;
       $673 = $672 >>> 2;
       $674 = $673&65535;
       $$sink$8 = $674;
       break;
      } else {
       $648 = (($113) + -1)|0;
       $649 = (($4) + ($648<<1)|0);
       $650 = HEAP16[$649>>1]|0;
       $$sink$8 = $650;
       break;
      }
     }
    } while(0);
    $682 = (($4) + ($640<<1)|0);
    HEAP16[$682>>1] = $$sink$8;
    if ($63) {
     label = 144;
    } else {
     if ($114) {
      $717 = (($113) + 10)|0;
      $718 = (($4) + ($717<<1)|0);
      $719 = HEAP16[$718>>1]|0;
      $$sink$9 = $719;
      break;
     }
     $683 = HEAP32[$0>>2]|0;
     $684 = ($62|0)<($683|0);
     if (!($684)) {
      $685 = (($113) + -1)|0;
      $686 = (($4) + ($685<<1)|0);
      $687 = HEAP16[$686>>1]|0;
      $$sink$9 = $687;
      break;
     }
     $688 = HEAP32[$43>>2]|0;
     $689 = ($110|0)<($688|0);
     if ($689) {
      $693 = Math_imul($683, $110)|0;
      $694 = (($693) + ($62))|0;
      $695 = HEAP32[$44>>2]|0;
      $696 = (($695) + ($694<<1)|0);
      $697 = HEAP16[$696>>1]|0;
      $698 = $697&65535;
      $699 = ($698*9)|0;
      $700 = Math_imul($683, $$sroa$speculated201)|0;
      $701 = (($700) + ($$sroa$speculated190$9))|0;
      $702 = (($695) + ($701<<1)|0);
      $703 = HEAP16[$702>>1]|0;
      $704 = $703&65535;
      $705 = (($693) + ($$sroa$speculated190$9))|0;
      $706 = (($695) + ($705<<1)|0);
      $707 = HEAP16[$706>>1]|0;
      $708 = $707&65535;
      $709 = (($700) + ($62))|0;
      $710 = (($695) + ($709<<1)|0);
      $711 = HEAP16[$710>>1]|0;
      $712 = $711&65535;
      $tmp211$9 = (($712) + ($708))|0;
      $tmp212$9 = Math_imul($tmp211$9, -3)|0;
      $713 = (($699) + ($704))|0;
      $714 = (($713) + ($tmp212$9))|0;
      $715 = $714 >>> 2;
      $716 = $715&65535;
      $$sink$9 = $716;
      break;
     } else {
      $690 = (($113) + -10)|0;
      $691 = (($4) + ($690<<1)|0);
      $692 = HEAP16[$691>>1]|0;
      $$sink$9 = $692;
      break;
     }
    }
   }
  } while(0);
  if ((label|0) == 144) {
   label = 0;
   $720 = $113 | 1;
   $721 = (($4) + ($720<<1)|0);
   $722 = HEAP16[$721>>1]|0;
   $$sink$9 = $722;
  }
  $723 = (($4) + ($113<<1)|0);
  HEAP16[$723>>1] = $$sink$9;
  $724 = (($$0142222) + 1)|0;
  $exitcond224 = ($724|0)==(10);
  if ($exitcond224) {
   break;
  } else {
   $$0142222 = $724;
  }
 }
 $84 = $1 << 4;
 $85 = (($84) + -1)|0;
 $86 = ($85|0)>(0);
 $$sroa$speculated179 = $86 ? $85 : 0;
 $87 = (($84) + 16)|0;
 $88 = HEAP32[$0>>2]|0;
 $89 = (($88) + -1)|0;
 $90 = ($89|0)<($87|0);
 $$sroa$speculated168 = $90 ? $89 : $87;
 $91 = $2 << 4;
 $92 = (($91) + -1)|0;
 $93 = ($92|0)>(0);
 $$sroa$speculated157 = $93 ? $92 : 0;
 $94 = (($91) + 16)|0;
 $95 = ((($0)) + 4|0);
 $96 = HEAP32[$95>>2]|0;
 $97 = (($96) + -1)|0;
 $98 = ($97|0)<($94|0);
 $$sroa$speculated = $98 ? $97 : $94;
 $99 = ($$sroa$speculated157|0)>($$sroa$speculated|0);
 if (!($99)) {
  $100 = $2 << 3;
  $101 = HEAP32[$0>>2]|0;
  $102 = ((($0)) + 40|0);
  $103 = HEAP32[$102>>2]|0;
  $104 = ($$sroa$speculated179|0)>($$sroa$speculated168|0);
  $105 = $1 << 3;
  $106 = (11 - ($105))|0;
  $$0144217 = $$sroa$speculated157;
  while(1) {
   $166 = $$0144217 << 1;
   $167 = $166 & 2;
   $168 = ($167*10)|0;
   $169 = (($168) + -10)|0;
   $170 = Math_imul($101, $$0144217)|0;
   $171 = (($103) + ($170<<1)|0);
   if (!($104)) {
    $172 = $$0144217 & -2;
    $173 = (($172|0) / 2)&-1;
    $174 = (($173) - ($100))|0;
    $175 = ($174*10)|0;
    $176 = (($106) + ($175))|0;
    $$0141216 = $$sroa$speculated179;
    while(1) {
     $179 = $$0141216 & -2;
     $180 = (($179|0) / 2)&-1;
     $181 = $$0141216 << 1;
     $182 = $181 & 2;
     $183 = (($182) + -1)|0;
     $184 = (($176) + ($180))|0;
     $185 = (($4) + ($184<<1)|0);
     $186 = HEAP16[$185>>1]|0;
     $187 = $186&65535;
     $188 = ($187*9)|0;
     $189 = (($184) + ($169))|0;
     $190 = (($4) + ($189<<1)|0);
     $191 = HEAP16[$190>>1]|0;
     $192 = $191&65535;
     $193 = (($183) + ($184))|0;
     $194 = (($4) + ($193<<1)|0);
     $195 = HEAP16[$194>>1]|0;
     $196 = $195&65535;
     $197 = (($193) + ($169))|0;
     $198 = (($4) + ($197<<1)|0);
     $199 = HEAP16[$198>>1]|0;
     $200 = $199&65535;
     $tmp = (($196) + ($192))|0;
     $tmp210 = ($tmp*3)|0;
     $201 = (($200) + ($188))|0;
     $202 = (($201) + ($tmp210))|0;
     $203 = $202 >>> 4;
     $204 = $203&65535;
     $205 = (($171) + ($$0141216<<1)|0);
     HEAP16[$205>>1] = $204;
     $206 = (($$0141216) + 1)|0;
     $207 = ($$0141216|0)<($$sroa$speculated168|0);
     if ($207) {
      $$0141216 = $206;
     } else {
      break;
     }
    }
   }
   $177 = (($$0144217) + 1)|0;
   $178 = ($$0144217|0)<($$sroa$speculated|0);
   if ($178) {
    $$0144217 = $177;
   } else {
    break;
   }
  }
 }
 STACKTOP = sp;return;
}
function __ZN9knusperli20OutputImageComponent21CopyFromJpegComponentERKNS_13JPEGComponentEiiPKi($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0271306 = 0, $$0272307 = 0, $$0273310 = 0, $$0274334 = 0, $$0276333 = 0, $$0277332 = 0, $$0278330 = 0, $$0279327 = 0, $$0283317 = 0, $$0284326 = 0, $$0288318 = 0, $$0289320 = 0, $$0336 = 0, $$arith = 0, $$arith2 = 0, $$overflow = 0, $$overflow3 = 0, $$pr = 0, $$pr361$pr = 0, $10 = 0;
 var $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0;
 var $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0;
 var $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0;
 var $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0;
 var $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0;
 var $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0;
 var $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0;
 var $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0;
 var $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0;
 var $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0;
 var $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0;
 var $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0;
 var $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0;
 var $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0;
 var $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0;
 var $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0;
 var $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0;
 var $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0;
 var $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0;
 var $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0;
 var $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0;
 var $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0;
 var $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0;
 var $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0;
 var $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0;
 var $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0;
 var $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0;
 var $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0;
 var $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0;
 var $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0;
 var $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0;
 var $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0;
 var $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0;
 var $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0;
 var $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0;
 var $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0;
 var $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $addconv = 0, $addconv360 = 0, $exitcond = 0, $exitcond346 = 0, $exitcond358 = 0, $exitcond359 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZN9knusperli20OutputImageComponent5ResetEii($0,$2,$3);
 $5 = ((($0)) + 16|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ((($1)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($6|0)>($8|0);
 if ($9) {
  ___assert_fail((7298|0),(7123|0),216,(7339|0));
  // unreachable;
 }
 $10 = ((($0)) + 20|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ((($1)) + 20|0);
 $13 = HEAP32[$12>>2]|0;
 $14 = ($11|0)>($13|0);
 if ($14) {
  ___assert_fail((7361|0),(7123|0),217,(7339|0));
  // unreachable;
 }
 $15 = $8 << 6;
 $16 = $6 << 6;
 $17 = Math_imul($16, $11)|0;
 $$arith2 = $17<<1;
 $$overflow3 = ($17>>>0)>(2147483647);
 $18 = $$overflow3 ? -1 : $$arith2;
 $19 = (__Znaj($18)|0);
 $20 = (__Znaj($18)|0);
 $21 = (__Znaj($18)|0);
 $$arith = $17<<3;
 $$overflow = ($17>>>0)>(536870911);
 $22 = $$overflow ? -1 : $$arith;
 $23 = (__Znaj($22)|0);
 $24 = HEAP32[$10>>2]|0;
 $25 = ($24|0)>(0);
 if ($25) {
  $26 = ((($1)) + 28|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = HEAP32[$5>>2]|0;
  $29 = ($28|0)>(0);
  $30 = HEAP32[$10>>2]|0;
  $$0336 = 0;
  while(1) {
   if ($29) {
    $35 = Math_imul($15, $$0336)|0;
    $36 = (($27) + ($35<<1)|0);
    $37 = HEAP32[$5>>2]|0;
    $$0274334 = $36;$$0276333 = 0;$39 = $28;
    while(1) {
     $38 = Math_imul($39, $$0336)|0;
     $40 = (($38) + ($$0276333))|0;
     $41 = $40 << 6;
     $$0277332 = 0;
     while(1) {
      $47 = (($$0277332) + ($41))|0;
      $48 = (($$0274334) + ($$0277332<<1)|0);
      $49 = HEAP16[$48>>1]|0;
      $50 = $49 << 16 >> 16;
      $51 = (($4) + ($$0277332<<2)|0);
      $52 = HEAP32[$51>>2]|0;
      $53 = Math_imul($50, $52)|0;
      $54 = $53&65535;
      $55 = (($21) + ($47<<1)|0);
      HEAP16[$55>>1] = $54;
      $56 = HEAP16[$48>>1]|0;
      $57 = $56 << 16 >> 16;
      $58 = Math_imul($57, $52)|0;
      $59 = (($52|0) / 2)&-1;
      $60 = (($58) - ($59))|0;
      $61 = $60&65535;
      $62 = (($19) + ($47<<1)|0);
      HEAP16[$62>>1] = $61;
      $63 = HEAP16[$48>>1]|0;
      $64 = $63 << 16 >> 16;
      $65 = Math_imul($64, $52)|0;
      $66 = (($65) + ($59))|0;
      $67 = $66&65535;
      $68 = (($20) + ($47<<1)|0);
      HEAP16[$68>>1] = $67;
      $69 = (($23) + ($47<<3)|0);
      $70 = $69;
      $71 = $70;
      HEAP32[$71>>2] = 0;
      $72 = (($70) + 4)|0;
      $73 = $72;
      HEAP32[$73>>2] = 0;
      $74 = (($$0277332) + 1)|0;
      $exitcond359 = ($74|0)==(64);
      if ($exitcond359) {
       break;
      } else {
       $$0277332 = $74;
      }
     }
     $44 = ((($$0274334)) + 128|0);
     $45 = (($$0276333) + 1)|0;
     $46 = ($45|0)<($37|0);
     if ($46) {
      $$0274334 = $44;$$0276333 = $45;$39 = $37;
     } else {
      break;
     }
    }
   }
   $42 = (($$0336) + 1)|0;
   $43 = ($42|0)<($30|0);
   if ($43) {
    $$0336 = $42;
   } else {
    break;
   }
  }
  $$pr = HEAP32[$10>>2]|0;
  $31 = ($$pr|0)>(0);
  if ($31) {
   $32 = HEAP32[$5>>2]|0;
   $33 = ($32|0)>(1);
   $34 = HEAP32[$10>>2]|0;
   $$0278330 = 0;
   while(1) {
    if ($33) {
     $75 = HEAP32[$5>>2]|0;
     $76 = (($75) + -1)|0;
     $$0279327 = 0;$85 = $32;
     while(1) {
      $84 = Math_imul($85, $$0278330)|0;
      $86 = (($84) + ($$0279327))|0;
      $87 = $86 << 6;
      $88 = (($87) + 64)|0;
      $$0284326 = 0;
      while(1) {
       $91 = $$0284326 << 3;
       $92 = (($91) + ($87))|0;
       $93 = (($91) + ($88))|0;
       $94 = (($21) + ($92<<1)|0);
       $95 = HEAP16[$94>>1]|0;
       $96 = $95 << 16 >> 16;
       $97 = (($21) + ($93<<1)|0);
       $98 = HEAP16[$97>>1]|0;
       $99 = $98 << 16 >> 16;
       $100 = (($99) - ($96))|0;
       $101 = $100 << 10;
       $102 = ($101|0)<(0);
       $103 = $102 << 31 >> 31;
       $104 = $92 | 1;
       $105 = (($21) + ($104<<1)|0);
       $106 = HEAP16[$105>>1]|0;
       $107 = $106 << 16 >> 16;
       $108 = $93 | 1;
       $109 = (($21) + ($108<<1)|0);
       $110 = HEAP16[$109>>1]|0;
       $111 = $110 << 16 >> 16;
       $112 = (($111) + ($107))|0;
       $113 = ($112*1448)|0;
       $114 = ($113|0)<(0);
       $115 = $114 << 31 >> 31;
       $116 = (_i64Add(($113|0),($115|0),($101|0),($103|0))|0);
       $117 = tempRet0;
       $118 = Math_imul($107, $107)|0;
       $119 = Math_imul($111, $111)|0;
       $120 = (($119) + ($118))|0;
       $121 = $92 | 2;
       $122 = (($21) + ($121<<1)|0);
       $123 = HEAP16[$122>>1]|0;
       $124 = $123 << 16 >> 16;
       $125 = $93 | 2;
       $126 = (($21) + ($125<<1)|0);
       $127 = HEAP16[$126>>1]|0;
       $128 = $127 << 16 >> 16;
       $129 = (($128) - ($124))|0;
       $130 = ($129*1448)|0;
       $131 = ($130|0)<(0);
       $132 = $131 << 31 >> 31;
       $133 = (_i64Add(($130|0),($132|0),($116|0),($117|0))|0);
       $134 = tempRet0;
       $135 = Math_imul($124, $124)|0;
       $136 = Math_imul($128, $128)|0;
       $137 = (($136) + ($135))|0;
       $138 = $137 << 2;
       $addconv360 = (($138) + ($120))|0;
       $139 = $92 | 3;
       $140 = (($21) + ($139<<1)|0);
       $141 = HEAP16[$140>>1]|0;
       $142 = $141 << 16 >> 16;
       $143 = $93 | 3;
       $144 = (($21) + ($143<<1)|0);
       $145 = HEAP16[$144>>1]|0;
       $146 = $145 << 16 >> 16;
       $147 = (($146) + ($142))|0;
       $148 = ($147*1448)|0;
       $149 = ($148|0)<(0);
       $150 = $149 << 31 >> 31;
       $151 = (_i64Add(($148|0),($150|0),($133|0),($134|0))|0);
       $152 = tempRet0;
       $153 = Math_imul($142, $142)|0;
       $154 = Math_imul($146, $146)|0;
       $155 = (($154) + ($153))|0;
       $156 = ($155*9)|0;
       $157 = (_i64Add(($156|0),0,($addconv360|0),0)|0);
       $158 = tempRet0;
       $159 = $92 | 4;
       $160 = (($21) + ($159<<1)|0);
       $161 = HEAP16[$160>>1]|0;
       $162 = $161 << 16 >> 16;
       $163 = $93 | 4;
       $164 = (($21) + ($163<<1)|0);
       $165 = HEAP16[$164>>1]|0;
       $166 = $165 << 16 >> 16;
       $167 = (($166) - ($162))|0;
       $168 = ($167*1448)|0;
       $169 = ($168|0)<(0);
       $170 = $169 << 31 >> 31;
       $171 = (_i64Add(($168|0),($170|0),($151|0),($152|0))|0);
       $172 = tempRet0;
       $173 = Math_imul($162, $162)|0;
       $174 = Math_imul($166, $166)|0;
       $175 = (($174) + ($173))|0;
       $176 = $175 << 4;
       $177 = (_i64Add(($176|0),0,($157|0),($158|0))|0);
       $178 = tempRet0;
       $179 = $92 | 5;
       $180 = (($21) + ($179<<1)|0);
       $181 = HEAP16[$180>>1]|0;
       $182 = $181 << 16 >> 16;
       $183 = $93 | 5;
       $184 = (($21) + ($183<<1)|0);
       $185 = HEAP16[$184>>1]|0;
       $186 = $185 << 16 >> 16;
       $187 = (($186) + ($182))|0;
       $188 = ($187*1448)|0;
       $189 = ($188|0)<(0);
       $190 = $189 << 31 >> 31;
       $191 = (_i64Add(($188|0),($190|0),($171|0),($172|0))|0);
       $192 = tempRet0;
       $193 = Math_imul($182, $182)|0;
       $194 = Math_imul($186, $186)|0;
       $195 = (($194) + ($193))|0;
       $196 = ($195*25)|0;
       $197 = (_i64Add(($196|0),0,($177|0),($178|0))|0);
       $198 = tempRet0;
       $199 = $92 | 6;
       $200 = (($21) + ($199<<1)|0);
       $201 = HEAP16[$200>>1]|0;
       $202 = $201 << 16 >> 16;
       $203 = $93 | 6;
       $204 = (($21) + ($203<<1)|0);
       $205 = HEAP16[$204>>1]|0;
       $206 = $205 << 16 >> 16;
       $207 = (($206) - ($202))|0;
       $208 = ($207*1448)|0;
       $209 = ($208|0)<(0);
       $210 = $209 << 31 >> 31;
       $211 = (_i64Add(($208|0),($210|0),($191|0),($192|0))|0);
       $212 = tempRet0;
       $213 = Math_imul($202, $202)|0;
       $214 = Math_imul($206, $206)|0;
       $215 = (($214) + ($213))|0;
       $216 = ($215*36)|0;
       $217 = (_i64Add(($216|0),0,($197|0),($198|0))|0);
       $218 = tempRet0;
       $219 = $92 | 7;
       $220 = (($21) + ($219<<1)|0);
       $221 = HEAP16[$220>>1]|0;
       $222 = $221 << 16 >> 16;
       $223 = $93 | 7;
       $224 = (($21) + ($223<<1)|0);
       $225 = HEAP16[$224>>1]|0;
       $226 = $225 << 16 >> 16;
       $227 = (($226) + ($222))|0;
       $228 = ($227*1448)|0;
       $229 = ($228|0)<(0);
       $230 = $229 << 31 >> 31;
       $231 = (_i64Add(($228|0),($230|0),($211|0),($212|0))|0);
       $232 = tempRet0;
       $233 = Math_imul($222, $222)|0;
       $234 = Math_imul($226, $226)|0;
       $235 = (($234) + ($233))|0;
       $236 = ($235*49)|0;
       $237 = (_i64Add(($236|0),0,($217|0),($218|0))|0);
       $238 = tempRet0;
       $239 = ($238>>>0)>(0);
       $240 = ($237>>>0)>(400);
       $241 = ($238|0)==(0);
       $242 = $241 & $240;
       $243 = $239 | $242;
       $244 = $$0284326 << 3;
       $245 = (($244) + ($87))|0;
       $246 = (($244) + ($88))|0;
       $247 = (___divdi3(($231|0),($232|0),2,0)|0);
       $248 = tempRet0;
       $249 = $243 ? $247 : $231;
       $250 = $243 ? $248 : $232;
       $251 = (___muldi3(($249|0),($250|0),318,0)|0);
       $252 = tempRet0;
       $253 = (($23) + ($245<<3)|0);
       $254 = $253;
       $255 = $254;
       $256 = HEAP32[$255>>2]|0;
       $257 = (($254) + 4)|0;
       $258 = $257;
       $259 = HEAP32[$258>>2]|0;
       $260 = (_i64Add(($251|0),($252|0),($256|0),($259|0))|0);
       $261 = tempRet0;
       $262 = $253;
       $263 = $262;
       HEAP32[$263>>2] = $260;
       $264 = (($262) + 4)|0;
       $265 = $264;
       HEAP32[$265>>2] = $261;
       $266 = (___muldi3(($249|0),($250|0),-318,-1)|0);
       $267 = tempRet0;
       $268 = (($23) + ($246<<3)|0);
       $269 = $268;
       $270 = $269;
       $271 = HEAP32[$270>>2]|0;
       $272 = (($269) + 4)|0;
       $273 = $272;
       $274 = HEAP32[$273>>2]|0;
       $275 = (_i64Add(($271|0),($274|0),($266|0),($267|0))|0);
       $276 = tempRet0;
       $277 = $268;
       $278 = $277;
       HEAP32[$278>>2] = $275;
       $279 = (($277) + 4)|0;
       $280 = $279;
       HEAP32[$280>>2] = $276;
       $281 = (___divdi3(($249|0),($250|0),2,0)|0);
       $282 = tempRet0;
       $283 = $243 ? $281 : $231;
       $284 = $243 ? $282 : $232;
       $285 = (___muldi3(($283|0),($284|0),-285,-1)|0);
       $286 = tempRet0;
       $287 = $245 | 1;
       $288 = (($23) + ($287<<3)|0);
       $289 = $288;
       $290 = $289;
       $291 = HEAP32[$290>>2]|0;
       $292 = (($289) + 4)|0;
       $293 = $292;
       $294 = HEAP32[$293>>2]|0;
       $295 = (_i64Add(($285|0),($286|0),($291|0),($294|0))|0);
       $296 = tempRet0;
       $297 = $288;
       $298 = $297;
       HEAP32[$298>>2] = $295;
       $299 = (($297) + 4)|0;
       $300 = $299;
       HEAP32[$300>>2] = $296;
       $301 = $246 | 1;
       $302 = (($23) + ($301<<3)|0);
       $303 = $302;
       $304 = $303;
       $305 = HEAP32[$304>>2]|0;
       $306 = (($303) + 4)|0;
       $307 = $306;
       $308 = HEAP32[$307>>2]|0;
       $309 = (_i64Add(($305|0),($308|0),($285|0),($286|0))|0);
       $310 = tempRet0;
       $311 = $302;
       $312 = $311;
       HEAP32[$312>>2] = $309;
       $313 = (($311) + 4)|0;
       $314 = $313;
       HEAP32[$314>>2] = $310;
       $315 = (___divdi3(($283|0),($284|0),2,0)|0);
       $316 = tempRet0;
       $317 = $243 ? $315 : $231;
       $318 = $243 ? $316 : $232;
       $319 = (___muldi3(($317|0),($318|0),81,0)|0);
       $320 = tempRet0;
       $321 = $245 | 2;
       $322 = (($23) + ($321<<3)|0);
       $323 = $322;
       $324 = $323;
       $325 = HEAP32[$324>>2]|0;
       $326 = (($323) + 4)|0;
       $327 = $326;
       $328 = HEAP32[$327>>2]|0;
       $329 = (_i64Add(($319|0),($320|0),($325|0),($328|0))|0);
       $330 = tempRet0;
       $331 = $322;
       $332 = $331;
       HEAP32[$332>>2] = $329;
       $333 = (($331) + 4)|0;
       $334 = $333;
       HEAP32[$334>>2] = $330;
       $335 = (___muldi3(($317|0),($318|0),-81,-1)|0);
       $336 = tempRet0;
       $337 = $246 | 2;
       $338 = (($23) + ($337<<3)|0);
       $339 = $338;
       $340 = $339;
       $341 = HEAP32[$340>>2]|0;
       $342 = (($339) + 4)|0;
       $343 = $342;
       $344 = HEAP32[$343>>2]|0;
       $345 = (_i64Add(($341|0),($344|0),($335|0),($336|0))|0);
       $346 = tempRet0;
       $347 = $338;
       $348 = $347;
       HEAP32[$348>>2] = $345;
       $349 = (($347) + 4)|0;
       $350 = $349;
       HEAP32[$350>>2] = $346;
       $351 = (___divdi3(($317|0),($318|0),2,0)|0);
       $352 = tempRet0;
       $353 = $243 ? $351 : $231;
       $354 = $243 ? $352 : $232;
       $355 = (___muldi3(($353|0),($354|0),-32,-1)|0);
       $356 = tempRet0;
       $357 = $245 | 3;
       $358 = (($23) + ($357<<3)|0);
       $359 = $358;
       $360 = $359;
       $361 = HEAP32[$360>>2]|0;
       $362 = (($359) + 4)|0;
       $363 = $362;
       $364 = HEAP32[$363>>2]|0;
       $365 = (_i64Add(($355|0),($356|0),($361|0),($364|0))|0);
       $366 = tempRet0;
       $367 = $358;
       $368 = $367;
       HEAP32[$368>>2] = $365;
       $369 = (($367) + 4)|0;
       $370 = $369;
       HEAP32[$370>>2] = $366;
       $371 = $246 | 3;
       $372 = (($23) + ($371<<3)|0);
       $373 = $372;
       $374 = $373;
       $375 = HEAP32[$374>>2]|0;
       $376 = (($373) + 4)|0;
       $377 = $376;
       $378 = HEAP32[$377>>2]|0;
       $379 = (_i64Add(($375|0),($378|0),($355|0),($356|0))|0);
       $380 = tempRet0;
       $381 = $372;
       $382 = $381;
       HEAP32[$382>>2] = $379;
       $383 = (($381) + 4)|0;
       $384 = $383;
       HEAP32[$384>>2] = $380;
       $385 = (($$0284326) + 1)|0;
       $exitcond358 = ($385|0)==(4);
       if ($exitcond358) {
        break;
       } else {
        $$0284326 = $385;
       }
      }
      $89 = (($$0279327) + 1)|0;
      $90 = ($89|0)<($76|0);
      if ($90) {
       $$0279327 = $89;$85 = $75;
      } else {
       break;
      }
     }
    }
    $82 = (($$0278330) + 1)|0;
    $83 = ($82|0)<($34|0);
    if ($83) {
     $$0278330 = $82;
    } else {
     break;
    }
   }
   $$pr361$pr = HEAP32[$10>>2]|0;
   $77 = ($$pr361$pr|0)>(1);
   if ($77) {
    $78 = HEAP32[$5>>2]|0;
    $79 = ($78|0)>(0);
    $80 = HEAP32[$10>>2]|0;
    $81 = (($80) + -1)|0;
    $$0289320 = 0;
    while(1) {
     $387 = (($$0289320) + 1)|0;
     if ($79) {
      $388 = HEAP32[$5>>2]|0;
      $$0288318 = 0;$391 = $78;
      while(1) {
       $390 = Math_imul($391, $$0289320)|0;
       $392 = (($390) + ($$0288318))|0;
       $393 = $392 << 6;
       $394 = Math_imul($391, $387)|0;
       $395 = (($394) + ($$0288318))|0;
       $396 = $395 << 6;
       $$0283317 = 0;
       while(1) {
        $399 = (($$0283317) + ($393))|0;
        $400 = (($$0283317) + ($396))|0;
        $401 = (($21) + ($399<<1)|0);
        $402 = HEAP16[$401>>1]|0;
        $403 = $402 << 16 >> 16;
        $404 = (($21) + ($400<<1)|0);
        $405 = HEAP16[$404>>1]|0;
        $406 = $405 << 16 >> 16;
        $407 = (($406) - ($403))|0;
        $408 = $407 << 10;
        $409 = ($408|0)<(0);
        $410 = $409 << 31 >> 31;
        $411 = (($399) + 8)|0;
        $412 = (($21) + ($411<<1)|0);
        $413 = HEAP16[$412>>1]|0;
        $414 = $413 << 16 >> 16;
        $415 = (($400) + 8)|0;
        $416 = (($21) + ($415<<1)|0);
        $417 = HEAP16[$416>>1]|0;
        $418 = $417 << 16 >> 16;
        $419 = (($418) + ($414))|0;
        $420 = ($419*1448)|0;
        $421 = ($420|0)<(0);
        $422 = $421 << 31 >> 31;
        $423 = (_i64Add(($420|0),($422|0),($408|0),($410|0))|0);
        $424 = tempRet0;
        $425 = Math_imul($414, $414)|0;
        $426 = Math_imul($418, $418)|0;
        $427 = (($426) + ($425))|0;
        $428 = (($399) + 16)|0;
        $429 = (($21) + ($428<<1)|0);
        $430 = HEAP16[$429>>1]|0;
        $431 = $430 << 16 >> 16;
        $432 = (($400) + 16)|0;
        $433 = (($21) + ($432<<1)|0);
        $434 = HEAP16[$433>>1]|0;
        $435 = $434 << 16 >> 16;
        $436 = (($435) - ($431))|0;
        $437 = ($436*1448)|0;
        $438 = ($437|0)<(0);
        $439 = $438 << 31 >> 31;
        $440 = (_i64Add(($437|0),($439|0),($423|0),($424|0))|0);
        $441 = tempRet0;
        $442 = Math_imul($431, $431)|0;
        $443 = Math_imul($435, $435)|0;
        $444 = (($443) + ($442))|0;
        $445 = $444 << 2;
        $addconv = (($445) + ($427))|0;
        $446 = (($399) + 24)|0;
        $447 = (($21) + ($446<<1)|0);
        $448 = HEAP16[$447>>1]|0;
        $449 = $448 << 16 >> 16;
        $450 = (($400) + 24)|0;
        $451 = (($21) + ($450<<1)|0);
        $452 = HEAP16[$451>>1]|0;
        $453 = $452 << 16 >> 16;
        $454 = (($453) + ($449))|0;
        $455 = ($454*1448)|0;
        $456 = ($455|0)<(0);
        $457 = $456 << 31 >> 31;
        $458 = (_i64Add(($455|0),($457|0),($440|0),($441|0))|0);
        $459 = tempRet0;
        $460 = Math_imul($449, $449)|0;
        $461 = Math_imul($453, $453)|0;
        $462 = (($461) + ($460))|0;
        $463 = ($462*9)|0;
        $464 = (_i64Add(($463|0),0,($addconv|0),0)|0);
        $465 = tempRet0;
        $466 = (($399) + 32)|0;
        $467 = (($21) + ($466<<1)|0);
        $468 = HEAP16[$467>>1]|0;
        $469 = $468 << 16 >> 16;
        $470 = (($400) + 32)|0;
        $471 = (($21) + ($470<<1)|0);
        $472 = HEAP16[$471>>1]|0;
        $473 = $472 << 16 >> 16;
        $474 = (($473) - ($469))|0;
        $475 = ($474*1448)|0;
        $476 = ($475|0)<(0);
        $477 = $476 << 31 >> 31;
        $478 = (_i64Add(($475|0),($477|0),($458|0),($459|0))|0);
        $479 = tempRet0;
        $480 = Math_imul($469, $469)|0;
        $481 = Math_imul($473, $473)|0;
        $482 = (($481) + ($480))|0;
        $483 = $482 << 4;
        $484 = (_i64Add(($483|0),0,($464|0),($465|0))|0);
        $485 = tempRet0;
        $486 = (($399) + 40)|0;
        $487 = (($21) + ($486<<1)|0);
        $488 = HEAP16[$487>>1]|0;
        $489 = $488 << 16 >> 16;
        $490 = (($400) + 40)|0;
        $491 = (($21) + ($490<<1)|0);
        $492 = HEAP16[$491>>1]|0;
        $493 = $492 << 16 >> 16;
        $494 = (($493) + ($489))|0;
        $495 = ($494*1448)|0;
        $496 = ($495|0)<(0);
        $497 = $496 << 31 >> 31;
        $498 = (_i64Add(($495|0),($497|0),($478|0),($479|0))|0);
        $499 = tempRet0;
        $500 = Math_imul($489, $489)|0;
        $501 = Math_imul($493, $493)|0;
        $502 = (($501) + ($500))|0;
        $503 = ($502*25)|0;
        $504 = (_i64Add(($503|0),0,($484|0),($485|0))|0);
        $505 = tempRet0;
        $506 = (($399) + 48)|0;
        $507 = (($21) + ($506<<1)|0);
        $508 = HEAP16[$507>>1]|0;
        $509 = $508 << 16 >> 16;
        $510 = (($400) + 48)|0;
        $511 = (($21) + ($510<<1)|0);
        $512 = HEAP16[$511>>1]|0;
        $513 = $512 << 16 >> 16;
        $514 = (($513) - ($509))|0;
        $515 = ($514*1448)|0;
        $516 = ($515|0)<(0);
        $517 = $516 << 31 >> 31;
        $518 = (_i64Add(($515|0),($517|0),($498|0),($499|0))|0);
        $519 = tempRet0;
        $520 = Math_imul($509, $509)|0;
        $521 = Math_imul($513, $513)|0;
        $522 = (($521) + ($520))|0;
        $523 = ($522*36)|0;
        $524 = (_i64Add(($523|0),0,($504|0),($505|0))|0);
        $525 = tempRet0;
        $526 = (($399) + 56)|0;
        $527 = (($21) + ($526<<1)|0);
        $528 = HEAP16[$527>>1]|0;
        $529 = $528 << 16 >> 16;
        $530 = (($400) + 56)|0;
        $531 = (($21) + ($530<<1)|0);
        $532 = HEAP16[$531>>1]|0;
        $533 = $532 << 16 >> 16;
        $534 = (($533) + ($529))|0;
        $535 = ($534*1448)|0;
        $536 = ($535|0)<(0);
        $537 = $536 << 31 >> 31;
        $538 = (_i64Add(($535|0),($537|0),($518|0),($519|0))|0);
        $539 = tempRet0;
        $540 = Math_imul($529, $529)|0;
        $541 = Math_imul($533, $533)|0;
        $542 = (($541) + ($540))|0;
        $543 = ($542*49)|0;
        $544 = (_i64Add(($543|0),0,($524|0),($525|0))|0);
        $545 = tempRet0;
        $546 = ($545>>>0)>(0);
        $547 = ($544>>>0)>(400);
        $548 = ($545|0)==(0);
        $549 = $548 & $547;
        $550 = $546 | $549;
        $551 = (($$0283317) + ($393))|0;
        $552 = (($$0283317) + ($396))|0;
        $553 = (___divdi3(($538|0),($539|0),2,0)|0);
        $554 = tempRet0;
        $555 = $550 ? $553 : $538;
        $556 = $550 ? $554 : $539;
        $557 = (___muldi3(($555|0),($556|0),318,0)|0);
        $558 = tempRet0;
        $559 = (($23) + ($551<<3)|0);
        $560 = $559;
        $561 = $560;
        $562 = HEAP32[$561>>2]|0;
        $563 = (($560) + 4)|0;
        $564 = $563;
        $565 = HEAP32[$564>>2]|0;
        $566 = (_i64Add(($557|0),($558|0),($562|0),($565|0))|0);
        $567 = tempRet0;
        $568 = $559;
        $569 = $568;
        HEAP32[$569>>2] = $566;
        $570 = (($568) + 4)|0;
        $571 = $570;
        HEAP32[$571>>2] = $567;
        $572 = (___muldi3(($555|0),($556|0),-318,-1)|0);
        $573 = tempRet0;
        $574 = (($23) + ($552<<3)|0);
        $575 = $574;
        $576 = $575;
        $577 = HEAP32[$576>>2]|0;
        $578 = (($575) + 4)|0;
        $579 = $578;
        $580 = HEAP32[$579>>2]|0;
        $581 = (_i64Add(($577|0),($580|0),($572|0),($573|0))|0);
        $582 = tempRet0;
        $583 = $574;
        $584 = $583;
        HEAP32[$584>>2] = $581;
        $585 = (($583) + 4)|0;
        $586 = $585;
        HEAP32[$586>>2] = $582;
        $587 = (___divdi3(($555|0),($556|0),2,0)|0);
        $588 = tempRet0;
        $589 = $550 ? $587 : $538;
        $590 = $550 ? $588 : $539;
        $591 = (___muldi3(($589|0),($590|0),-285,-1)|0);
        $592 = tempRet0;
        $593 = (($551) + 8)|0;
        $594 = (($23) + ($593<<3)|0);
        $595 = $594;
        $596 = $595;
        $597 = HEAP32[$596>>2]|0;
        $598 = (($595) + 4)|0;
        $599 = $598;
        $600 = HEAP32[$599>>2]|0;
        $601 = (_i64Add(($591|0),($592|0),($597|0),($600|0))|0);
        $602 = tempRet0;
        $603 = $594;
        $604 = $603;
        HEAP32[$604>>2] = $601;
        $605 = (($603) + 4)|0;
        $606 = $605;
        HEAP32[$606>>2] = $602;
        $607 = (($552) + 8)|0;
        $608 = (($23) + ($607<<3)|0);
        $609 = $608;
        $610 = $609;
        $611 = HEAP32[$610>>2]|0;
        $612 = (($609) + 4)|0;
        $613 = $612;
        $614 = HEAP32[$613>>2]|0;
        $615 = (_i64Add(($611|0),($614|0),($591|0),($592|0))|0);
        $616 = tempRet0;
        $617 = $608;
        $618 = $617;
        HEAP32[$618>>2] = $615;
        $619 = (($617) + 4)|0;
        $620 = $619;
        HEAP32[$620>>2] = $616;
        $621 = (___divdi3(($589|0),($590|0),2,0)|0);
        $622 = tempRet0;
        $623 = $550 ? $621 : $538;
        $624 = $550 ? $622 : $539;
        $625 = (___muldi3(($623|0),($624|0),81,0)|0);
        $626 = tempRet0;
        $627 = (($551) + 16)|0;
        $628 = (($23) + ($627<<3)|0);
        $629 = $628;
        $630 = $629;
        $631 = HEAP32[$630>>2]|0;
        $632 = (($629) + 4)|0;
        $633 = $632;
        $634 = HEAP32[$633>>2]|0;
        $635 = (_i64Add(($625|0),($626|0),($631|0),($634|0))|0);
        $636 = tempRet0;
        $637 = $628;
        $638 = $637;
        HEAP32[$638>>2] = $635;
        $639 = (($637) + 4)|0;
        $640 = $639;
        HEAP32[$640>>2] = $636;
        $641 = (___muldi3(($623|0),($624|0),-81,-1)|0);
        $642 = tempRet0;
        $643 = (($552) + 16)|0;
        $644 = (($23) + ($643<<3)|0);
        $645 = $644;
        $646 = $645;
        $647 = HEAP32[$646>>2]|0;
        $648 = (($645) + 4)|0;
        $649 = $648;
        $650 = HEAP32[$649>>2]|0;
        $651 = (_i64Add(($647|0),($650|0),($641|0),($642|0))|0);
        $652 = tempRet0;
        $653 = $644;
        $654 = $653;
        HEAP32[$654>>2] = $651;
        $655 = (($653) + 4)|0;
        $656 = $655;
        HEAP32[$656>>2] = $652;
        $657 = (___divdi3(($623|0),($624|0),2,0)|0);
        $658 = tempRet0;
        $659 = $550 ? $657 : $538;
        $660 = $550 ? $658 : $539;
        $661 = (___muldi3(($659|0),($660|0),-32,-1)|0);
        $662 = tempRet0;
        $663 = (($551) + 24)|0;
        $664 = (($23) + ($663<<3)|0);
        $665 = $664;
        $666 = $665;
        $667 = HEAP32[$666>>2]|0;
        $668 = (($665) + 4)|0;
        $669 = $668;
        $670 = HEAP32[$669>>2]|0;
        $671 = (_i64Add(($661|0),($662|0),($667|0),($670|0))|0);
        $672 = tempRet0;
        $673 = $664;
        $674 = $673;
        HEAP32[$674>>2] = $671;
        $675 = (($673) + 4)|0;
        $676 = $675;
        HEAP32[$676>>2] = $672;
        $677 = (($552) + 24)|0;
        $678 = (($23) + ($677<<3)|0);
        $679 = $678;
        $680 = $679;
        $681 = HEAP32[$680>>2]|0;
        $682 = (($679) + 4)|0;
        $683 = $682;
        $684 = HEAP32[$683>>2]|0;
        $685 = (_i64Add(($681|0),($684|0),($661|0),($662|0))|0);
        $686 = tempRet0;
        $687 = $678;
        $688 = $687;
        HEAP32[$688>>2] = $685;
        $689 = (($687) + 4)|0;
        $690 = $689;
        HEAP32[$690>>2] = $686;
        $691 = (($$0283317) + 1)|0;
        $exitcond346 = ($691|0)==(4);
        if ($exitcond346) {
         break;
        } else {
         $$0283317 = $691;
        }
       }
       $397 = (($$0288318) + 1)|0;
       $398 = ($397|0)<($388|0);
       if ($398) {
        $$0288318 = $397;$391 = $388;
       } else {
        break;
       }
      }
     }
     $386 = ($387|0)<($81|0);
     if ($386) {
      $$0289320 = $387;
     } else {
      break;
     }
    }
   }
  }
 }
 $389 = ($17|0)==(0);
 if (!($389)) {
  $$0273310 = 0;
  while(1) {
   $694 = (($23) + ($$0273310<<3)|0);
   $695 = $694;
   $696 = $695;
   $697 = HEAP32[$696>>2]|0;
   $698 = (($695) + 4)|0;
   $699 = $698;
   $700 = HEAP32[$699>>2]|0;
   $701 = (___muldi3(($697|0),($700|0),724,0)|0);
   $702 = tempRet0;
   $703 = (_bitshift64Lshr(($701|0),($702|0),31)|0);
   $704 = tempRet0;
   $705 = (($21) + ($$0273310<<1)|0);
   $706 = HEAP16[$705>>1]|0;
   $707 = $706&65535;
   $708 = (_i64Add(($707|0),0,($703|0),($704|0))|0);
   $709 = tempRet0;
   $710 = $708&65535;
   $711 = (($20) + ($$0273310<<1)|0);
   $712 = HEAP16[$711>>1]|0;
   $713 = ($712<<16>>16)<($710<<16>>16);
   $714 = $713 ? $712 : $710;
   $715 = (($19) + ($$0273310<<1)|0);
   $716 = HEAP16[$715>>1]|0;
   $717 = ($714<<16>>16)<($716<<16>>16);
   $718 = $717 ? $716 : $714;
   HEAP16[$705>>1] = $718;
   $719 = (($$0273310) + 1)|0;
   $exitcond = ($719|0)==($17|0);
   if ($exitcond) {
    break;
   } else {
    $$0273310 = $719;
   }
  }
 }
 $692 = HEAP32[$10>>2]|0;
 $693 = ($692|0)>(0);
 if ($693) {
  $$0272307 = 0;
 } else {
  __ZdaPv($19);
  __ZdaPv($20);
  __ZdaPv($21);
  __ZdaPv($23);
  $733 = ((($0)) + 52|0);
  _memcpy(($733|0),($4|0),256)|0;
  return;
 }
 while(1) {
  $720 = HEAP32[$5>>2]|0;
  $721 = ($720|0)>(0);
  if ($721) {
   $$0271306 = 0;$726 = $720;
   while(1) {
    $725 = Math_imul($726, $$0272307)|0;
    $727 = (($725) + ($$0271306))|0;
    $728 = $727 << 6;
    $729 = (($21) + ($728<<1)|0);
    __ZN9knusperli20OutputImageComponent13SetCoeffBlockEiiPKs($0,$$0271306,$$0272307,$729);
    $730 = (($$0271306) + 1)|0;
    $731 = HEAP32[$5>>2]|0;
    $732 = ($730|0)<($731|0);
    if ($732) {
     $$0271306 = $730;$726 = $731;
    } else {
     break;
    }
   }
  }
  $722 = (($$0272307) + 1)|0;
  $723 = HEAP32[$10>>2]|0;
  $724 = ($722|0)<($723|0);
  if ($724) {
   $$0272307 = $722;
  } else {
   break;
  }
 }
 __ZdaPv($19);
 __ZdaPv($20);
 __ZdaPv($21);
 __ZdaPv($23);
 $733 = ((($0)) + 52|0);
 _memcpy(($733|0),($4|0),256)|0;
 return;
}
function __ZN9knusperli11OutputImageC2Eii($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 320|0;
 $3 = sp;
 HEAP32[$0>>2] = $1;
 $4 = ((($0)) + 4|0);
 HEAP32[$4>>2] = $2;
 $5 = ((($0)) + 8|0);
 __ZN9knusperli20OutputImageComponentC2Eii($3,$1,$2);
 __ZNSt3__26vectorIN9knusperli20OutputImageComponentENS_9allocatorIS2_EEEC2EjRKS2_($5,3,$3);
 __ZN9knusperli20OutputImageComponentD2Ev($3);
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIN9knusperli20OutputImageComponentENS_9allocatorIS2_EEEC2EjRKS2_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$i = 0, $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $3 = ((($0)) + 4|0);
 HEAP32[$3>>2] = 0;
 $4 = ((($0)) + 8|0);
 HEAP32[$4>>2] = 0;
 $5 = ($1|0)==(0);
 if ($5) {
  return;
 }
 __ZNSt3__26vectorIN9knusperli20OutputImageComponentENS_9allocatorIS2_EEE8allocateEj($0,$1);
 $6 = ((($0)) + 4|0);
 $$0$i = $1;
 while(1) {
  $7 = HEAP32[$6>>2]|0;
  __ZN9knusperli20OutputImageComponentC2ERKS0_($7,$2);
  $8 = HEAP32[$6>>2]|0;
  $9 = ((($8)) + 308|0);
  HEAP32[$6>>2] = $9;
  $10 = (($$0$i) + -1)|0;
  $11 = ($10|0)==(0);
  if ($11) {
   break;
  } else {
   $$0$i = $10;
  }
 }
 return;
}
function __ZNSt3__26vectorIN9knusperli20OutputImageComponentENS_9allocatorIS2_EEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (__ZNKSt3__26vectorIN9knusperli20OutputImageComponentENS_9allocatorIS2_EEE8max_sizeEv($0)|0);
 $3 = ($2>>>0)<($1>>>0);
 if ($3) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $4 = ($1>>>0)>(13944699);
 if ($4) {
  $5 = (___cxa_allocate_exception(8)|0);
  __ZNSt11logic_errorC2EPKc($5,7028);
  HEAP32[$5>>2] = (5164);
  ___cxa_throw(($5|0),(88|0),(6|0));
  // unreachable;
 } else {
  $6 = ($1*308)|0;
  $7 = (__Znwj($6)|0);
  $8 = ((($0)) + 4|0);
  HEAP32[$8>>2] = $7;
  HEAP32[$0>>2] = $7;
  $9 = (($7) + (($1*308)|0)|0);
  $10 = ((($0)) + 8|0);
  HEAP32[$10>>2] = $9;
  return;
 }
}
function __ZN9knusperli20OutputImageComponentC2ERKS0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 ;HEAP32[$0>>2]=HEAP32[$1>>2]|0;HEAP32[$0+4>>2]=HEAP32[$1+4>>2]|0;HEAP32[$0+8>>2]=HEAP32[$1+8>>2]|0;HEAP32[$0+12>>2]=HEAP32[$1+12>>2]|0;HEAP32[$0+16>>2]=HEAP32[$1+16>>2]|0;HEAP32[$0+20>>2]=HEAP32[$1+20>>2]|0;HEAP32[$0+24>>2]=HEAP32[$1+24>>2]|0;
 $2 = ((($0)) + 28|0);
 $3 = ((($1)) + 28|0);
 __ZNSt3__26vectorIsNS_9allocatorIsEEEC2ERKS3_($2,$3);
 $4 = ((($0)) + 40|0);
 $5 = ((($1)) + 40|0);
 __ZNSt3__26vectorItNS_9allocatorItEEEC2ERKS3_($4,$5);
 $6 = ((($0)) + 52|0);
 $7 = ((($1)) + 52|0);
 _memcpy(($6|0),($7|0),256)|0;
 return;
}
function __ZNSt3__26vectorIsNS_9allocatorIsEEEC2ERKS3_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = 0;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = HEAP32[$1>>2]|0;
 $7 = (($5) - ($6))|0;
 $8 = $7 >> 1;
 $9 = ($8|0)==(0);
 if ($9) {
  return;
 }
 __ZNSt3__26vectorIsNS_9allocatorIsEEE8allocateEj($0,$8);
 $10 = HEAP32[$1>>2]|0;
 $11 = HEAP32[$4>>2]|0;
 __ZNSt3__26vectorIsNS_9allocatorIsEEE18__construct_at_endIPsEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES7_S7_j($0,$10,$11,$8);
 return;
}
function __ZNSt3__26vectorItNS_9allocatorItEEEC2ERKS3_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = 0;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = HEAP32[$1>>2]|0;
 $7 = (($5) - ($6))|0;
 $8 = $7 >> 1;
 $9 = ($8|0)==(0);
 if ($9) {
  return;
 }
 __ZNSt3__26vectorItNS_9allocatorItEEE8allocateEj($0,$8);
 $10 = HEAP32[$1>>2]|0;
 $11 = HEAP32[$4>>2]|0;
 __ZNSt3__26vectorItNS_9allocatorItEEE18__construct_at_endIPtEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES7_S7_j($0,$10,$11,$8);
 return;
}
function __ZNSt3__26vectorItNS_9allocatorItEEE18__construct_at_endIPtEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES7_S7_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 4|0);
 $5 = $2;
 $6 = $1;
 $7 = (($5) - ($6))|0;
 $8 = ($7|0)>(0);
 if (!($8)) {
  return;
 }
 $9 = $7 >>> 1;
 $10 = HEAP32[$4>>2]|0;
 _memcpy(($10|0),($1|0),($7|0))|0;
 $11 = HEAP32[$4>>2]|0;
 $12 = (($11) + ($9<<1)|0);
 HEAP32[$4>>2] = $12;
 return;
}
function __ZNSt3__26vectorIsNS_9allocatorIsEEE18__construct_at_endIPsEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES7_S7_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 4|0);
 $5 = $2;
 $6 = $1;
 $7 = (($5) - ($6))|0;
 $8 = ($7|0)>(0);
 if (!($8)) {
  return;
 }
 $9 = $7 >>> 1;
 $10 = HEAP32[$4>>2]|0;
 _memcpy(($10|0),($1|0),($7|0))|0;
 $11 = HEAP32[$4>>2]|0;
 $12 = (($11) + ($9<<1)|0);
 HEAP32[$4>>2] = $12;
 return;
}
function __ZNKSt3__26vectorIN9knusperli20OutputImageComponentENS_9allocatorIS2_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 13944699;
}
function __ZN9knusperli11OutputImage16CopyFromJpegDataERKNS_8JPEGDataE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$028 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 80|0);
 $3 = ((($1)) + 84|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = HEAP32[$2>>2]|0;
 $6 = ($4|0)==($5|0);
 if ($6) {
  return;
 }
 $7 = ((($1)) + 12|0);
 $8 = ((($1)) + 16|0);
 $9 = ((($1)) + 56|0);
 $10 = ((($1)) + 60|0);
 $11 = ((($0)) + 8|0);
 $$028 = 0;
 while(1) {
  $12 = HEAP32[$2>>2]|0;
  $13 = (($12) + (($$028*40)|0)|0);
  $14 = HEAP32[$7>>2]|0;
  $15 = (((($12) + (($$028*40)|0)|0)) + 4|0);
  $16 = HEAP32[$15>>2]|0;
  $17 = (($14|0) % ($16|0))&-1;
  $18 = ($17|0)==(0);
  if (!($18)) {
   label = 5;
   break;
  }
  $19 = HEAP32[$8>>2]|0;
  $20 = (((($12) + (($$028*40)|0)|0)) + 8|0);
  $21 = HEAP32[$20>>2]|0;
  $22 = (($19|0) % ($21|0))&-1;
  $23 = ($22|0)==(0);
  if (!($23)) {
   label = 7;
   break;
  }
  $24 = (((($12) + (($$028*40)|0)|0)) + 12|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = HEAP32[$10>>2]|0;
  $27 = HEAP32[$9>>2]|0;
  $28 = (($26) - ($27))|0;
  $29 = (($28|0) / 24)&-1;
  $30 = ($25>>>0)<($29>>>0);
  if (!($30)) {
   label = 9;
   break;
  }
  $31 = (($19|0) / ($21|0))&-1;
  $32 = (($14|0) / ($16|0))&-1;
  $33 = HEAP32[$11>>2]|0;
  $34 = (($33) + (($$028*308)|0)|0);
  $35 = HEAP32[$9>>2]|0;
  $36 = (($35) + (($25*24)|0)|0);
  $37 = HEAP32[$36>>2]|0;
  __ZN9knusperli20OutputImageComponent21CopyFromJpegComponentERKNS_13JPEGComponentEiiPKi($34,$13,$32,$31,$37);
  $38 = (($$028) + 1)|0;
  $39 = HEAP32[$3>>2]|0;
  $40 = HEAP32[$2>>2]|0;
  $41 = (($39) - ($40))|0;
  $42 = (($41|0) / 40)&-1;
  $43 = ($38>>>0)<($42>>>0);
  if ($43) {
   $$028 = $38;
  } else {
   label = 3;
   break;
  }
 }
 if ((label|0) == 3) {
  return;
 }
 else if ((label|0) == 5) {
  ___assert_fail((7404|0),(7123|0),380,(7452|0));
  // unreachable;
 }
 else if ((label|0) == 7) {
  ___assert_fail((7469|0),(7123|0),381,(7452|0));
  // unreachable;
 }
 else if ((label|0) == 9) {
  ___assert_fail((7517|0),(7123|0),384,(7452|0));
  // unreachable;
 }
}
function __ZNK9knusperli11OutputImage6ToSRGBEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($1)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 __ZNK9knusperli11OutputImage6ToSRGBEiiii($0,$1,0,0,$2,$4);
 return;
}
function __ZNK9knusperli11OutputImage6ToSRGBEiiii($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$025 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ($4*3)|0;
 $7 = Math_imul($6, $5)|0;
 __ZNSt3__26vectorIhNS_9allocatorIhEEEC2Ej($0,$7);
 $8 = ((($1)) + 8|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = HEAP32[$0>>2]|0;
 __ZNK9knusperli20OutputImageComponent8ToPixelsEiiiiPhi($9,$2,$3,$4,$5,$10,3);
 $11 = HEAP32[$8>>2]|0;
 $12 = ((($11)) + 308|0);
 $13 = HEAP32[$0>>2]|0;
 $14 = ((($13)) + 1|0);
 __ZNK9knusperli20OutputImageComponent8ToPixelsEiiiiPhi($12,$2,$3,$4,$5,$14,3);
 $15 = HEAP32[$8>>2]|0;
 $16 = ((($15)) + 616|0);
 $17 = HEAP32[$0>>2]|0;
 $18 = ((($17)) + 2|0);
 __ZNK9knusperli20OutputImageComponent8ToPixelsEiiiiPhi($16,$2,$3,$4,$5,$18,3);
 $19 = ((($0)) + 4|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = HEAP32[$0>>2]|0;
 $22 = ($20|0)==($21|0);
 if ($22) {
  return;
 }
 $$025 = 0;
 while(1) {
  $23 = HEAP32[$0>>2]|0;
  $24 = (($23) + ($$025)|0);
  __ZN9knusperli24ColorTransformYCbCrToRGBEPh($24);
  $25 = (($$025) + 3)|0;
  $26 = HEAP32[$19>>2]|0;
  $27 = HEAP32[$0>>2]|0;
  $28 = (($26) - ($27))|0;
  $29 = ($25>>>0)<($28>>>0);
  if ($29) {
   $$025 = $25;
  } else {
   break;
  }
 }
 return;
}
function __ZNSt3__26vectorIhNS_9allocatorIhEEEC2Ej($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = 0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = 0;
 $4 = ($1|0)==(0);
 if ($4) {
  return;
 }
 __ZNSt3__26vectorIhNS_9allocatorIhEEE8allocateEj($0,$1);
 __ZNSt3__26vectorIhNS_9allocatorIhEEE18__construct_at_endEj($0,$1);
 return;
}
function __ZN9knusperli24ColorTransformYCbCrToRGBEPh($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP8[$0>>0]|0;
 $2 = $1&255;
 $3 = ((($0)) + 1|0);
 $4 = HEAP8[$3>>0]|0;
 $5 = $4&255;
 $6 = ((($0)) + 2|0);
 $7 = HEAP8[$6>>0]|0;
 $8 = $7&255;
 $9 = (456 + ($8<<2)|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = (($10) + ($2))|0;
 $12 = ((7935) + ($11)|0);
 $13 = HEAP8[$12>>0]|0;
 HEAP8[$0>>0] = $13;
 $14 = (1480 + ($8<<2)|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (2504 + ($5<<2)|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = (($17) + ($15))|0;
 $19 = $18 >> 16;
 $20 = (($19) + ($2))|0;
 $21 = ((7935) + ($20)|0);
 $22 = HEAP8[$21>>0]|0;
 HEAP8[$3>>0] = $22;
 $23 = (3528 + ($5<<2)|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = (($24) + ($2))|0;
 $26 = ((7935) + ($25)|0);
 $27 = HEAP8[$26>>0]|0;
 HEAP8[$6>>0] = $27;
 return;
}
function __ZNSt3__26vectorIhNS_9allocatorIhEEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (__ZNKSt3__26vectorIhNS_9allocatorIhEEE8max_sizeEv($0)|0);
 $3 = ($2>>>0)<($1>>>0);
 if ($3) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 } else {
  $4 = (__Znwj($1)|0);
  $5 = ((($0)) + 4|0);
  HEAP32[$5>>2] = $4;
  HEAP32[$0>>2] = $4;
  $6 = (($4) + ($1)|0);
  $7 = ((($0)) + 8|0);
  HEAP32[$7>>2] = $6;
  return;
 }
}
function __ZNSt3__26vectorIhNS_9allocatorIhEEE18__construct_at_endEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $$0 = $1;
 while(1) {
  $3 = HEAP32[$2>>2]|0;
  HEAP8[$3>>0] = 0;
  $4 = HEAP32[$2>>2]|0;
  $5 = ((($4)) + 1|0);
  HEAP32[$2>>2] = $5;
  $6 = (($$0) + -1)|0;
  $7 = ($6|0)==(0);
  if ($7) {
   break;
  } else {
   $$0 = $6;
  }
 }
 return;
}
function _malloc($0) {
 $0 = $0|0;
 var $$$0172$i = 0, $$$0173$i = 0, $$$4236$i = 0, $$$4329$i = 0, $$$i = 0, $$0 = 0, $$0$i = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i20$i = 0, $$01$i$i = 0, $$0172$lcssa$i = 0, $$01726$i = 0, $$0173$lcssa$i = 0, $$01735$i = 0, $$0192 = 0, $$0194 = 0, $$0201$i$i = 0, $$0202$i$i = 0, $$0206$i$i = 0;
 var $$0207$i$i = 0, $$024370$i = 0, $$0260$i$i = 0, $$0261$i$i = 0, $$0262$i$i = 0, $$0268$i$i = 0, $$0269$i$i = 0, $$0320$i = 0, $$0322$i = 0, $$0323$i = 0, $$0325$i = 0, $$0331$i = 0, $$0336$i = 0, $$0337$$i = 0, $$0337$i = 0, $$0339$i = 0, $$0340$i = 0, $$0345$i = 0, $$1176$i = 0, $$1178$i = 0;
 var $$124469$i = 0, $$1264$i$i = 0, $$1266$i$i = 0, $$1321$i = 0, $$1326$i = 0, $$1341$i = 0, $$1347$i = 0, $$1351$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2333$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i200 = 0, $$3328$i = 0, $$3349$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$411$i = 0;
 var $$4236$i = 0, $$4329$lcssa$i = 0, $$432910$i = 0, $$4335$$4$i = 0, $$4335$ph$i = 0, $$43359$i = 0, $$723947$i = 0, $$748$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i17$i = 0, $$pre$i195 = 0, $$pre$i210 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i18$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phiZ2D = 0, $$sink1$i = 0;
 var $$sink1$i$i = 0, $$sink14$i = 0, $$sink2$i = 0, $$sink2$i204 = 0, $$sink3$i = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0;
 var $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0;
 var $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0;
 var $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0;
 var $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0;
 var $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0;
 var $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0;
 var $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0;
 var $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0;
 var $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0;
 var $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0;
 var $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0;
 var $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0;
 var $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0;
 var $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0;
 var $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0;
 var $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0;
 var $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0;
 var $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0;
 var $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0;
 var $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0;
 var $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0;
 var $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0;
 var $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0;
 var $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0;
 var $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0;
 var $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0;
 var $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0;
 var $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0;
 var $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0;
 var $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0;
 var $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0;
 var $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0;
 var $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0;
 var $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0;
 var $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0;
 var $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0;
 var $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0;
 var $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0;
 var $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0;
 var $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0;
 var $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0;
 var $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0;
 var $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0;
 var $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0;
 var $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0;
 var $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0;
 var $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0;
 var $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $98 = 0, $99 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i208 = 0, $exitcond$i$i = 0, $not$$i = 0;
 var $not$$i$i = 0, $not$$i197 = 0, $not$$i209 = 0, $not$1$i = 0, $not$1$i203 = 0, $not$3$i = 0, $not$5$i = 0, $or$cond$i = 0, $or$cond$i201 = 0, $or$cond1$i = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond11$not$i = 0, $or$cond12$i = 0, $or$cond2$i = 0, $or$cond2$i199 = 0, $or$cond49$i = 0, $or$cond5$i = 0, $or$cond50$i = 0, $or$cond7$i = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $1 = sp;
 $2 = ($0>>>0)<(245);
 do {
  if ($2) {
   $3 = ($0>>>0)<(11);
   $4 = (($0) + 11)|0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = HEAP32[2810]|0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10|0)==(0);
   if (!($11)) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = (($13) + ($7))|0;
    $15 = $14 << 1;
    $16 = (11280 + ($15<<2)|0);
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($18)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($16|0)==($20|0);
    if ($21) {
     $22 = 1 << $14;
     $23 = $22 ^ -1;
     $24 = $8 & $23;
     HEAP32[2810] = $24;
    } else {
     $25 = ((($20)) + 12|0);
     HEAP32[$25>>2] = $16;
     HEAP32[$17>>2] = $20;
    }
    $26 = $14 << 3;
    $27 = $26 | 3;
    $28 = ((($18)) + 4|0);
    HEAP32[$28>>2] = $27;
    $29 = (($18) + ($26)|0);
    $30 = ((($29)) + 4|0);
    $31 = HEAP32[$30>>2]|0;
    $32 = $31 | 1;
    HEAP32[$30>>2] = $32;
    $$0 = $19;
    STACKTOP = sp;return ($$0|0);
   }
   $33 = HEAP32[(11248)>>2]|0;
   $34 = ($6>>>0)>($33>>>0);
   if ($34) {
    $35 = ($9|0)==(0);
    if (!($35)) {
     $36 = $9 << $7;
     $37 = 2 << $7;
     $38 = (0 - ($37))|0;
     $39 = $37 | $38;
     $40 = $36 & $39;
     $41 = (0 - ($40))|0;
     $42 = $40 & $41;
     $43 = (($42) + -1)|0;
     $44 = $43 >>> 12;
     $45 = $44 & 16;
     $46 = $43 >>> $45;
     $47 = $46 >>> 5;
     $48 = $47 & 8;
     $49 = $48 | $45;
     $50 = $46 >>> $48;
     $51 = $50 >>> 2;
     $52 = $51 & 4;
     $53 = $49 | $52;
     $54 = $50 >>> $52;
     $55 = $54 >>> 1;
     $56 = $55 & 2;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 1;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = (($61) + ($62))|0;
     $64 = $63 << 1;
     $65 = (11280 + ($64<<2)|0);
     $66 = ((($65)) + 8|0);
     $67 = HEAP32[$66>>2]|0;
     $68 = ((($67)) + 8|0);
     $69 = HEAP32[$68>>2]|0;
     $70 = ($65|0)==($69|0);
     if ($70) {
      $71 = 1 << $63;
      $72 = $71 ^ -1;
      $73 = $8 & $72;
      HEAP32[2810] = $73;
      $90 = $73;
     } else {
      $74 = ((($69)) + 12|0);
      HEAP32[$74>>2] = $65;
      HEAP32[$66>>2] = $69;
      $90 = $8;
     }
     $75 = $63 << 3;
     $76 = (($75) - ($6))|0;
     $77 = $6 | 3;
     $78 = ((($67)) + 4|0);
     HEAP32[$78>>2] = $77;
     $79 = (($67) + ($6)|0);
     $80 = $76 | 1;
     $81 = ((($79)) + 4|0);
     HEAP32[$81>>2] = $80;
     $82 = (($79) + ($76)|0);
     HEAP32[$82>>2] = $76;
     $83 = ($33|0)==(0);
     if (!($83)) {
      $84 = HEAP32[(11260)>>2]|0;
      $85 = $33 >>> 3;
      $86 = $85 << 1;
      $87 = (11280 + ($86<<2)|0);
      $88 = 1 << $85;
      $89 = $90 & $88;
      $91 = ($89|0)==(0);
      if ($91) {
       $92 = $90 | $88;
       HEAP32[2810] = $92;
       $$pre = ((($87)) + 8|0);
       $$0194 = $87;$$pre$phiZ2D = $$pre;
      } else {
       $93 = ((($87)) + 8|0);
       $94 = HEAP32[$93>>2]|0;
       $$0194 = $94;$$pre$phiZ2D = $93;
      }
      HEAP32[$$pre$phiZ2D>>2] = $84;
      $95 = ((($$0194)) + 12|0);
      HEAP32[$95>>2] = $84;
      $96 = ((($84)) + 8|0);
      HEAP32[$96>>2] = $$0194;
      $97 = ((($84)) + 12|0);
      HEAP32[$97>>2] = $87;
     }
     HEAP32[(11248)>>2] = $76;
     HEAP32[(11260)>>2] = $79;
     $$0 = $68;
     STACKTOP = sp;return ($$0|0);
    }
    $98 = HEAP32[(11244)>>2]|0;
    $99 = ($98|0)==(0);
    if ($99) {
     $$0192 = $6;
    } else {
     $100 = (0 - ($98))|0;
     $101 = $98 & $100;
     $102 = (($101) + -1)|0;
     $103 = $102 >>> 12;
     $104 = $103 & 16;
     $105 = $102 >>> $104;
     $106 = $105 >>> 5;
     $107 = $106 & 8;
     $108 = $107 | $104;
     $109 = $105 >>> $107;
     $110 = $109 >>> 2;
     $111 = $110 & 4;
     $112 = $108 | $111;
     $113 = $109 >>> $111;
     $114 = $113 >>> 1;
     $115 = $114 & 2;
     $116 = $112 | $115;
     $117 = $113 >>> $115;
     $118 = $117 >>> 1;
     $119 = $118 & 1;
     $120 = $116 | $119;
     $121 = $117 >>> $119;
     $122 = (($120) + ($121))|0;
     $123 = (11544 + ($122<<2)|0);
     $124 = HEAP32[$123>>2]|0;
     $125 = ((($124)) + 4|0);
     $126 = HEAP32[$125>>2]|0;
     $127 = $126 & -8;
     $128 = (($127) - ($6))|0;
     $129 = ((($124)) + 16|0);
     $130 = HEAP32[$129>>2]|0;
     $not$3$i = ($130|0)==(0|0);
     $$sink14$i = $not$3$i&1;
     $131 = (((($124)) + 16|0) + ($$sink14$i<<2)|0);
     $132 = HEAP32[$131>>2]|0;
     $133 = ($132|0)==(0|0);
     if ($133) {
      $$0172$lcssa$i = $124;$$0173$lcssa$i = $128;
     } else {
      $$01726$i = $124;$$01735$i = $128;$135 = $132;
      while(1) {
       $134 = ((($135)) + 4|0);
       $136 = HEAP32[$134>>2]|0;
       $137 = $136 & -8;
       $138 = (($137) - ($6))|0;
       $139 = ($138>>>0)<($$01735$i>>>0);
       $$$0173$i = $139 ? $138 : $$01735$i;
       $$$0172$i = $139 ? $135 : $$01726$i;
       $140 = ((($135)) + 16|0);
       $141 = HEAP32[$140>>2]|0;
       $not$$i = ($141|0)==(0|0);
       $$sink1$i = $not$$i&1;
       $142 = (((($135)) + 16|0) + ($$sink1$i<<2)|0);
       $143 = HEAP32[$142>>2]|0;
       $144 = ($143|0)==(0|0);
       if ($144) {
        $$0172$lcssa$i = $$$0172$i;$$0173$lcssa$i = $$$0173$i;
        break;
       } else {
        $$01726$i = $$$0172$i;$$01735$i = $$$0173$i;$135 = $143;
       }
      }
     }
     $145 = (($$0172$lcssa$i) + ($6)|0);
     $146 = ($$0172$lcssa$i>>>0)<($145>>>0);
     if ($146) {
      $147 = ((($$0172$lcssa$i)) + 24|0);
      $148 = HEAP32[$147>>2]|0;
      $149 = ((($$0172$lcssa$i)) + 12|0);
      $150 = HEAP32[$149>>2]|0;
      $151 = ($150|0)==($$0172$lcssa$i|0);
      do {
       if ($151) {
        $156 = ((($$0172$lcssa$i)) + 20|0);
        $157 = HEAP32[$156>>2]|0;
        $158 = ($157|0)==(0|0);
        if ($158) {
         $159 = ((($$0172$lcssa$i)) + 16|0);
         $160 = HEAP32[$159>>2]|0;
         $161 = ($160|0)==(0|0);
         if ($161) {
          $$3$i = 0;
          break;
         } else {
          $$1176$i = $160;$$1178$i = $159;
         }
        } else {
         $$1176$i = $157;$$1178$i = $156;
        }
        while(1) {
         $162 = ((($$1176$i)) + 20|0);
         $163 = HEAP32[$162>>2]|0;
         $164 = ($163|0)==(0|0);
         if (!($164)) {
          $$1176$i = $163;$$1178$i = $162;
          continue;
         }
         $165 = ((($$1176$i)) + 16|0);
         $166 = HEAP32[$165>>2]|0;
         $167 = ($166|0)==(0|0);
         if ($167) {
          break;
         } else {
          $$1176$i = $166;$$1178$i = $165;
         }
        }
        HEAP32[$$1178$i>>2] = 0;
        $$3$i = $$1176$i;
       } else {
        $152 = ((($$0172$lcssa$i)) + 8|0);
        $153 = HEAP32[$152>>2]|0;
        $154 = ((($153)) + 12|0);
        HEAP32[$154>>2] = $150;
        $155 = ((($150)) + 8|0);
        HEAP32[$155>>2] = $153;
        $$3$i = $150;
       }
      } while(0);
      $168 = ($148|0)==(0|0);
      do {
       if (!($168)) {
        $169 = ((($$0172$lcssa$i)) + 28|0);
        $170 = HEAP32[$169>>2]|0;
        $171 = (11544 + ($170<<2)|0);
        $172 = HEAP32[$171>>2]|0;
        $173 = ($$0172$lcssa$i|0)==($172|0);
        if ($173) {
         HEAP32[$171>>2] = $$3$i;
         $cond$i = ($$3$i|0)==(0|0);
         if ($cond$i) {
          $174 = 1 << $170;
          $175 = $174 ^ -1;
          $176 = $98 & $175;
          HEAP32[(11244)>>2] = $176;
          break;
         }
        } else {
         $177 = ((($148)) + 16|0);
         $178 = HEAP32[$177>>2]|0;
         $not$1$i = ($178|0)!=($$0172$lcssa$i|0);
         $$sink2$i = $not$1$i&1;
         $179 = (((($148)) + 16|0) + ($$sink2$i<<2)|0);
         HEAP32[$179>>2] = $$3$i;
         $180 = ($$3$i|0)==(0|0);
         if ($180) {
          break;
         }
        }
        $181 = ((($$3$i)) + 24|0);
        HEAP32[$181>>2] = $148;
        $182 = ((($$0172$lcssa$i)) + 16|0);
        $183 = HEAP32[$182>>2]|0;
        $184 = ($183|0)==(0|0);
        if (!($184)) {
         $185 = ((($$3$i)) + 16|0);
         HEAP32[$185>>2] = $183;
         $186 = ((($183)) + 24|0);
         HEAP32[$186>>2] = $$3$i;
        }
        $187 = ((($$0172$lcssa$i)) + 20|0);
        $188 = HEAP32[$187>>2]|0;
        $189 = ($188|0)==(0|0);
        if (!($189)) {
         $190 = ((($$3$i)) + 20|0);
         HEAP32[$190>>2] = $188;
         $191 = ((($188)) + 24|0);
         HEAP32[$191>>2] = $$3$i;
        }
       }
      } while(0);
      $192 = ($$0173$lcssa$i>>>0)<(16);
      if ($192) {
       $193 = (($$0173$lcssa$i) + ($6))|0;
       $194 = $193 | 3;
       $195 = ((($$0172$lcssa$i)) + 4|0);
       HEAP32[$195>>2] = $194;
       $196 = (($$0172$lcssa$i) + ($193)|0);
       $197 = ((($196)) + 4|0);
       $198 = HEAP32[$197>>2]|0;
       $199 = $198 | 1;
       HEAP32[$197>>2] = $199;
      } else {
       $200 = $6 | 3;
       $201 = ((($$0172$lcssa$i)) + 4|0);
       HEAP32[$201>>2] = $200;
       $202 = $$0173$lcssa$i | 1;
       $203 = ((($145)) + 4|0);
       HEAP32[$203>>2] = $202;
       $204 = (($145) + ($$0173$lcssa$i)|0);
       HEAP32[$204>>2] = $$0173$lcssa$i;
       $205 = ($33|0)==(0);
       if (!($205)) {
        $206 = HEAP32[(11260)>>2]|0;
        $207 = $33 >>> 3;
        $208 = $207 << 1;
        $209 = (11280 + ($208<<2)|0);
        $210 = 1 << $207;
        $211 = $8 & $210;
        $212 = ($211|0)==(0);
        if ($212) {
         $213 = $8 | $210;
         HEAP32[2810] = $213;
         $$pre$i = ((($209)) + 8|0);
         $$0$i = $209;$$pre$phi$iZ2D = $$pre$i;
        } else {
         $214 = ((($209)) + 8|0);
         $215 = HEAP32[$214>>2]|0;
         $$0$i = $215;$$pre$phi$iZ2D = $214;
        }
        HEAP32[$$pre$phi$iZ2D>>2] = $206;
        $216 = ((($$0$i)) + 12|0);
        HEAP32[$216>>2] = $206;
        $217 = ((($206)) + 8|0);
        HEAP32[$217>>2] = $$0$i;
        $218 = ((($206)) + 12|0);
        HEAP32[$218>>2] = $209;
       }
       HEAP32[(11248)>>2] = $$0173$lcssa$i;
       HEAP32[(11260)>>2] = $145;
      }
      $219 = ((($$0172$lcssa$i)) + 8|0);
      $$0 = $219;
      STACKTOP = sp;return ($$0|0);
     } else {
      $$0192 = $6;
     }
    }
   } else {
    $$0192 = $6;
   }
  } else {
   $220 = ($0>>>0)>(4294967231);
   if ($220) {
    $$0192 = -1;
   } else {
    $221 = (($0) + 11)|0;
    $222 = $221 & -8;
    $223 = HEAP32[(11244)>>2]|0;
    $224 = ($223|0)==(0);
    if ($224) {
     $$0192 = $222;
    } else {
     $225 = (0 - ($222))|0;
     $226 = $221 >>> 8;
     $227 = ($226|0)==(0);
     if ($227) {
      $$0336$i = 0;
     } else {
      $228 = ($222>>>0)>(16777215);
      if ($228) {
       $$0336$i = 31;
      } else {
       $229 = (($226) + 1048320)|0;
       $230 = $229 >>> 16;
       $231 = $230 & 8;
       $232 = $226 << $231;
       $233 = (($232) + 520192)|0;
       $234 = $233 >>> 16;
       $235 = $234 & 4;
       $236 = $235 | $231;
       $237 = $232 << $235;
       $238 = (($237) + 245760)|0;
       $239 = $238 >>> 16;
       $240 = $239 & 2;
       $241 = $236 | $240;
       $242 = (14 - ($241))|0;
       $243 = $237 << $240;
       $244 = $243 >>> 15;
       $245 = (($242) + ($244))|0;
       $246 = $245 << 1;
       $247 = (($245) + 7)|0;
       $248 = $222 >>> $247;
       $249 = $248 & 1;
       $250 = $249 | $246;
       $$0336$i = $250;
      }
     }
     $251 = (11544 + ($$0336$i<<2)|0);
     $252 = HEAP32[$251>>2]|0;
     $253 = ($252|0)==(0|0);
     L74: do {
      if ($253) {
       $$2333$i = 0;$$3$i200 = 0;$$3328$i = $225;
       label = 57;
      } else {
       $254 = ($$0336$i|0)==(31);
       $255 = $$0336$i >>> 1;
       $256 = (25 - ($255))|0;
       $257 = $254 ? 0 : $256;
       $258 = $222 << $257;
       $$0320$i = 0;$$0325$i = $225;$$0331$i = $252;$$0337$i = $258;$$0340$i = 0;
       while(1) {
        $259 = ((($$0331$i)) + 4|0);
        $260 = HEAP32[$259>>2]|0;
        $261 = $260 & -8;
        $262 = (($261) - ($222))|0;
        $263 = ($262>>>0)<($$0325$i>>>0);
        if ($263) {
         $264 = ($262|0)==(0);
         if ($264) {
          $$411$i = $$0331$i;$$432910$i = 0;$$43359$i = $$0331$i;
          label = 61;
          break L74;
         } else {
          $$1321$i = $$0331$i;$$1326$i = $262;
         }
        } else {
         $$1321$i = $$0320$i;$$1326$i = $$0325$i;
        }
        $265 = ((($$0331$i)) + 20|0);
        $266 = HEAP32[$265>>2]|0;
        $267 = $$0337$i >>> 31;
        $268 = (((($$0331$i)) + 16|0) + ($267<<2)|0);
        $269 = HEAP32[$268>>2]|0;
        $270 = ($266|0)==(0|0);
        $271 = ($266|0)==($269|0);
        $or$cond2$i199 = $270 | $271;
        $$1341$i = $or$cond2$i199 ? $$0340$i : $266;
        $272 = ($269|0)==(0|0);
        $not$5$i = $272 ^ 1;
        $273 = $not$5$i&1;
        $$0337$$i = $$0337$i << $273;
        if ($272) {
         $$2333$i = $$1341$i;$$3$i200 = $$1321$i;$$3328$i = $$1326$i;
         label = 57;
         break;
        } else {
         $$0320$i = $$1321$i;$$0325$i = $$1326$i;$$0331$i = $269;$$0337$i = $$0337$$i;$$0340$i = $$1341$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 57) {
      $274 = ($$2333$i|0)==(0|0);
      $275 = ($$3$i200|0)==(0|0);
      $or$cond$i201 = $274 & $275;
      if ($or$cond$i201) {
       $276 = 2 << $$0336$i;
       $277 = (0 - ($276))|0;
       $278 = $276 | $277;
       $279 = $223 & $278;
       $280 = ($279|0)==(0);
       if ($280) {
        $$0192 = $222;
        break;
       }
       $281 = (0 - ($279))|0;
       $282 = $279 & $281;
       $283 = (($282) + -1)|0;
       $284 = $283 >>> 12;
       $285 = $284 & 16;
       $286 = $283 >>> $285;
       $287 = $286 >>> 5;
       $288 = $287 & 8;
       $289 = $288 | $285;
       $290 = $286 >>> $288;
       $291 = $290 >>> 2;
       $292 = $291 & 4;
       $293 = $289 | $292;
       $294 = $290 >>> $292;
       $295 = $294 >>> 1;
       $296 = $295 & 2;
       $297 = $293 | $296;
       $298 = $294 >>> $296;
       $299 = $298 >>> 1;
       $300 = $299 & 1;
       $301 = $297 | $300;
       $302 = $298 >>> $300;
       $303 = (($301) + ($302))|0;
       $304 = (11544 + ($303<<2)|0);
       $305 = HEAP32[$304>>2]|0;
       $$4$ph$i = 0;$$4335$ph$i = $305;
      } else {
       $$4$ph$i = $$3$i200;$$4335$ph$i = $$2333$i;
      }
      $306 = ($$4335$ph$i|0)==(0|0);
      if ($306) {
       $$4$lcssa$i = $$4$ph$i;$$4329$lcssa$i = $$3328$i;
      } else {
       $$411$i = $$4$ph$i;$$432910$i = $$3328$i;$$43359$i = $$4335$ph$i;
       label = 61;
      }
     }
     if ((label|0) == 61) {
      while(1) {
       label = 0;
       $307 = ((($$43359$i)) + 4|0);
       $308 = HEAP32[$307>>2]|0;
       $309 = $308 & -8;
       $310 = (($309) - ($222))|0;
       $311 = ($310>>>0)<($$432910$i>>>0);
       $$$4329$i = $311 ? $310 : $$432910$i;
       $$4335$$4$i = $311 ? $$43359$i : $$411$i;
       $312 = ((($$43359$i)) + 16|0);
       $313 = HEAP32[$312>>2]|0;
       $not$1$i203 = ($313|0)==(0|0);
       $$sink2$i204 = $not$1$i203&1;
       $314 = (((($$43359$i)) + 16|0) + ($$sink2$i204<<2)|0);
       $315 = HEAP32[$314>>2]|0;
       $316 = ($315|0)==(0|0);
       if ($316) {
        $$4$lcssa$i = $$4335$$4$i;$$4329$lcssa$i = $$$4329$i;
        break;
       } else {
        $$411$i = $$4335$$4$i;$$432910$i = $$$4329$i;$$43359$i = $315;
        label = 61;
       }
      }
     }
     $317 = ($$4$lcssa$i|0)==(0|0);
     if ($317) {
      $$0192 = $222;
     } else {
      $318 = HEAP32[(11248)>>2]|0;
      $319 = (($318) - ($222))|0;
      $320 = ($$4329$lcssa$i>>>0)<($319>>>0);
      if ($320) {
       $321 = (($$4$lcssa$i) + ($222)|0);
       $322 = ($$4$lcssa$i>>>0)<($321>>>0);
       if (!($322)) {
        $$0 = 0;
        STACKTOP = sp;return ($$0|0);
       }
       $323 = ((($$4$lcssa$i)) + 24|0);
       $324 = HEAP32[$323>>2]|0;
       $325 = ((($$4$lcssa$i)) + 12|0);
       $326 = HEAP32[$325>>2]|0;
       $327 = ($326|0)==($$4$lcssa$i|0);
       do {
        if ($327) {
         $332 = ((($$4$lcssa$i)) + 20|0);
         $333 = HEAP32[$332>>2]|0;
         $334 = ($333|0)==(0|0);
         if ($334) {
          $335 = ((($$4$lcssa$i)) + 16|0);
          $336 = HEAP32[$335>>2]|0;
          $337 = ($336|0)==(0|0);
          if ($337) {
           $$3349$i = 0;
           break;
          } else {
           $$1347$i = $336;$$1351$i = $335;
          }
         } else {
          $$1347$i = $333;$$1351$i = $332;
         }
         while(1) {
          $338 = ((($$1347$i)) + 20|0);
          $339 = HEAP32[$338>>2]|0;
          $340 = ($339|0)==(0|0);
          if (!($340)) {
           $$1347$i = $339;$$1351$i = $338;
           continue;
          }
          $341 = ((($$1347$i)) + 16|0);
          $342 = HEAP32[$341>>2]|0;
          $343 = ($342|0)==(0|0);
          if ($343) {
           break;
          } else {
           $$1347$i = $342;$$1351$i = $341;
          }
         }
         HEAP32[$$1351$i>>2] = 0;
         $$3349$i = $$1347$i;
        } else {
         $328 = ((($$4$lcssa$i)) + 8|0);
         $329 = HEAP32[$328>>2]|0;
         $330 = ((($329)) + 12|0);
         HEAP32[$330>>2] = $326;
         $331 = ((($326)) + 8|0);
         HEAP32[$331>>2] = $329;
         $$3349$i = $326;
        }
       } while(0);
       $344 = ($324|0)==(0|0);
       do {
        if ($344) {
         $426 = $223;
        } else {
         $345 = ((($$4$lcssa$i)) + 28|0);
         $346 = HEAP32[$345>>2]|0;
         $347 = (11544 + ($346<<2)|0);
         $348 = HEAP32[$347>>2]|0;
         $349 = ($$4$lcssa$i|0)==($348|0);
         if ($349) {
          HEAP32[$347>>2] = $$3349$i;
          $cond$i208 = ($$3349$i|0)==(0|0);
          if ($cond$i208) {
           $350 = 1 << $346;
           $351 = $350 ^ -1;
           $352 = $223 & $351;
           HEAP32[(11244)>>2] = $352;
           $426 = $352;
           break;
          }
         } else {
          $353 = ((($324)) + 16|0);
          $354 = HEAP32[$353>>2]|0;
          $not$$i209 = ($354|0)!=($$4$lcssa$i|0);
          $$sink3$i = $not$$i209&1;
          $355 = (((($324)) + 16|0) + ($$sink3$i<<2)|0);
          HEAP32[$355>>2] = $$3349$i;
          $356 = ($$3349$i|0)==(0|0);
          if ($356) {
           $426 = $223;
           break;
          }
         }
         $357 = ((($$3349$i)) + 24|0);
         HEAP32[$357>>2] = $324;
         $358 = ((($$4$lcssa$i)) + 16|0);
         $359 = HEAP32[$358>>2]|0;
         $360 = ($359|0)==(0|0);
         if (!($360)) {
          $361 = ((($$3349$i)) + 16|0);
          HEAP32[$361>>2] = $359;
          $362 = ((($359)) + 24|0);
          HEAP32[$362>>2] = $$3349$i;
         }
         $363 = ((($$4$lcssa$i)) + 20|0);
         $364 = HEAP32[$363>>2]|0;
         $365 = ($364|0)==(0|0);
         if ($365) {
          $426 = $223;
         } else {
          $366 = ((($$3349$i)) + 20|0);
          HEAP32[$366>>2] = $364;
          $367 = ((($364)) + 24|0);
          HEAP32[$367>>2] = $$3349$i;
          $426 = $223;
         }
        }
       } while(0);
       $368 = ($$4329$lcssa$i>>>0)<(16);
       do {
        if ($368) {
         $369 = (($$4329$lcssa$i) + ($222))|0;
         $370 = $369 | 3;
         $371 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$371>>2] = $370;
         $372 = (($$4$lcssa$i) + ($369)|0);
         $373 = ((($372)) + 4|0);
         $374 = HEAP32[$373>>2]|0;
         $375 = $374 | 1;
         HEAP32[$373>>2] = $375;
        } else {
         $376 = $222 | 3;
         $377 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$377>>2] = $376;
         $378 = $$4329$lcssa$i | 1;
         $379 = ((($321)) + 4|0);
         HEAP32[$379>>2] = $378;
         $380 = (($321) + ($$4329$lcssa$i)|0);
         HEAP32[$380>>2] = $$4329$lcssa$i;
         $381 = $$4329$lcssa$i >>> 3;
         $382 = ($$4329$lcssa$i>>>0)<(256);
         if ($382) {
          $383 = $381 << 1;
          $384 = (11280 + ($383<<2)|0);
          $385 = HEAP32[2810]|0;
          $386 = 1 << $381;
          $387 = $385 & $386;
          $388 = ($387|0)==(0);
          if ($388) {
           $389 = $385 | $386;
           HEAP32[2810] = $389;
           $$pre$i210 = ((($384)) + 8|0);
           $$0345$i = $384;$$pre$phi$i211Z2D = $$pre$i210;
          } else {
           $390 = ((($384)) + 8|0);
           $391 = HEAP32[$390>>2]|0;
           $$0345$i = $391;$$pre$phi$i211Z2D = $390;
          }
          HEAP32[$$pre$phi$i211Z2D>>2] = $321;
          $392 = ((($$0345$i)) + 12|0);
          HEAP32[$392>>2] = $321;
          $393 = ((($321)) + 8|0);
          HEAP32[$393>>2] = $$0345$i;
          $394 = ((($321)) + 12|0);
          HEAP32[$394>>2] = $384;
          break;
         }
         $395 = $$4329$lcssa$i >>> 8;
         $396 = ($395|0)==(0);
         if ($396) {
          $$0339$i = 0;
         } else {
          $397 = ($$4329$lcssa$i>>>0)>(16777215);
          if ($397) {
           $$0339$i = 31;
          } else {
           $398 = (($395) + 1048320)|0;
           $399 = $398 >>> 16;
           $400 = $399 & 8;
           $401 = $395 << $400;
           $402 = (($401) + 520192)|0;
           $403 = $402 >>> 16;
           $404 = $403 & 4;
           $405 = $404 | $400;
           $406 = $401 << $404;
           $407 = (($406) + 245760)|0;
           $408 = $407 >>> 16;
           $409 = $408 & 2;
           $410 = $405 | $409;
           $411 = (14 - ($410))|0;
           $412 = $406 << $409;
           $413 = $412 >>> 15;
           $414 = (($411) + ($413))|0;
           $415 = $414 << 1;
           $416 = (($414) + 7)|0;
           $417 = $$4329$lcssa$i >>> $416;
           $418 = $417 & 1;
           $419 = $418 | $415;
           $$0339$i = $419;
          }
         }
         $420 = (11544 + ($$0339$i<<2)|0);
         $421 = ((($321)) + 28|0);
         HEAP32[$421>>2] = $$0339$i;
         $422 = ((($321)) + 16|0);
         $423 = ((($422)) + 4|0);
         HEAP32[$423>>2] = 0;
         HEAP32[$422>>2] = 0;
         $424 = 1 << $$0339$i;
         $425 = $426 & $424;
         $427 = ($425|0)==(0);
         if ($427) {
          $428 = $426 | $424;
          HEAP32[(11244)>>2] = $428;
          HEAP32[$420>>2] = $321;
          $429 = ((($321)) + 24|0);
          HEAP32[$429>>2] = $420;
          $430 = ((($321)) + 12|0);
          HEAP32[$430>>2] = $321;
          $431 = ((($321)) + 8|0);
          HEAP32[$431>>2] = $321;
          break;
         }
         $432 = HEAP32[$420>>2]|0;
         $433 = ($$0339$i|0)==(31);
         $434 = $$0339$i >>> 1;
         $435 = (25 - ($434))|0;
         $436 = $433 ? 0 : $435;
         $437 = $$4329$lcssa$i << $436;
         $$0322$i = $437;$$0323$i = $432;
         while(1) {
          $438 = ((($$0323$i)) + 4|0);
          $439 = HEAP32[$438>>2]|0;
          $440 = $439 & -8;
          $441 = ($440|0)==($$4329$lcssa$i|0);
          if ($441) {
           label = 97;
           break;
          }
          $442 = $$0322$i >>> 31;
          $443 = (((($$0323$i)) + 16|0) + ($442<<2)|0);
          $444 = $$0322$i << 1;
          $445 = HEAP32[$443>>2]|0;
          $446 = ($445|0)==(0|0);
          if ($446) {
           label = 96;
           break;
          } else {
           $$0322$i = $444;$$0323$i = $445;
          }
         }
         if ((label|0) == 96) {
          HEAP32[$443>>2] = $321;
          $447 = ((($321)) + 24|0);
          HEAP32[$447>>2] = $$0323$i;
          $448 = ((($321)) + 12|0);
          HEAP32[$448>>2] = $321;
          $449 = ((($321)) + 8|0);
          HEAP32[$449>>2] = $321;
          break;
         }
         else if ((label|0) == 97) {
          $450 = ((($$0323$i)) + 8|0);
          $451 = HEAP32[$450>>2]|0;
          $452 = ((($451)) + 12|0);
          HEAP32[$452>>2] = $321;
          HEAP32[$450>>2] = $321;
          $453 = ((($321)) + 8|0);
          HEAP32[$453>>2] = $451;
          $454 = ((($321)) + 12|0);
          HEAP32[$454>>2] = $$0323$i;
          $455 = ((($321)) + 24|0);
          HEAP32[$455>>2] = 0;
          break;
         }
        }
       } while(0);
       $456 = ((($$4$lcssa$i)) + 8|0);
       $$0 = $456;
       STACKTOP = sp;return ($$0|0);
      } else {
       $$0192 = $222;
      }
     }
    }
   }
  }
 } while(0);
 $457 = HEAP32[(11248)>>2]|0;
 $458 = ($457>>>0)<($$0192>>>0);
 if (!($458)) {
  $459 = (($457) - ($$0192))|0;
  $460 = HEAP32[(11260)>>2]|0;
  $461 = ($459>>>0)>(15);
  if ($461) {
   $462 = (($460) + ($$0192)|0);
   HEAP32[(11260)>>2] = $462;
   HEAP32[(11248)>>2] = $459;
   $463 = $459 | 1;
   $464 = ((($462)) + 4|0);
   HEAP32[$464>>2] = $463;
   $465 = (($462) + ($459)|0);
   HEAP32[$465>>2] = $459;
   $466 = $$0192 | 3;
   $467 = ((($460)) + 4|0);
   HEAP32[$467>>2] = $466;
  } else {
   HEAP32[(11248)>>2] = 0;
   HEAP32[(11260)>>2] = 0;
   $468 = $457 | 3;
   $469 = ((($460)) + 4|0);
   HEAP32[$469>>2] = $468;
   $470 = (($460) + ($457)|0);
   $471 = ((($470)) + 4|0);
   $472 = HEAP32[$471>>2]|0;
   $473 = $472 | 1;
   HEAP32[$471>>2] = $473;
  }
  $474 = ((($460)) + 8|0);
  $$0 = $474;
  STACKTOP = sp;return ($$0|0);
 }
 $475 = HEAP32[(11252)>>2]|0;
 $476 = ($475>>>0)>($$0192>>>0);
 if ($476) {
  $477 = (($475) - ($$0192))|0;
  HEAP32[(11252)>>2] = $477;
  $478 = HEAP32[(11264)>>2]|0;
  $479 = (($478) + ($$0192)|0);
  HEAP32[(11264)>>2] = $479;
  $480 = $477 | 1;
  $481 = ((($479)) + 4|0);
  HEAP32[$481>>2] = $480;
  $482 = $$0192 | 3;
  $483 = ((($478)) + 4|0);
  HEAP32[$483>>2] = $482;
  $484 = ((($478)) + 8|0);
  $$0 = $484;
  STACKTOP = sp;return ($$0|0);
 }
 $485 = HEAP32[2928]|0;
 $486 = ($485|0)==(0);
 if ($486) {
  HEAP32[(11720)>>2] = 4096;
  HEAP32[(11716)>>2] = 4096;
  HEAP32[(11724)>>2] = -1;
  HEAP32[(11728)>>2] = -1;
  HEAP32[(11732)>>2] = 0;
  HEAP32[(11684)>>2] = 0;
  $487 = $1;
  $488 = $487 & -16;
  $489 = $488 ^ 1431655768;
  HEAP32[$1>>2] = $489;
  HEAP32[2928] = $489;
  $493 = 4096;
 } else {
  $$pre$i195 = HEAP32[(11720)>>2]|0;
  $493 = $$pre$i195;
 }
 $490 = (($$0192) + 48)|0;
 $491 = (($$0192) + 47)|0;
 $492 = (($493) + ($491))|0;
 $494 = (0 - ($493))|0;
 $495 = $492 & $494;
 $496 = ($495>>>0)>($$0192>>>0);
 if (!($496)) {
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $497 = HEAP32[(11680)>>2]|0;
 $498 = ($497|0)==(0);
 if (!($498)) {
  $499 = HEAP32[(11672)>>2]|0;
  $500 = (($499) + ($495))|0;
  $501 = ($500>>>0)<=($499>>>0);
  $502 = ($500>>>0)>($497>>>0);
  $or$cond1$i = $501 | $502;
  if ($or$cond1$i) {
   $$0 = 0;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $503 = HEAP32[(11684)>>2]|0;
 $504 = $503 & 4;
 $505 = ($504|0)==(0);
 L167: do {
  if ($505) {
   $506 = HEAP32[(11264)>>2]|0;
   $507 = ($506|0)==(0|0);
   L169: do {
    if ($507) {
     label = 118;
    } else {
     $$0$i20$i = (11688);
     while(1) {
      $508 = HEAP32[$$0$i20$i>>2]|0;
      $509 = ($508>>>0)>($506>>>0);
      if (!($509)) {
       $510 = ((($$0$i20$i)) + 4|0);
       $511 = HEAP32[$510>>2]|0;
       $512 = (($508) + ($511)|0);
       $513 = ($512>>>0)>($506>>>0);
       if ($513) {
        break;
       }
      }
      $514 = ((($$0$i20$i)) + 8|0);
      $515 = HEAP32[$514>>2]|0;
      $516 = ($515|0)==(0|0);
      if ($516) {
       label = 118;
       break L169;
      } else {
       $$0$i20$i = $515;
      }
     }
     $539 = (($492) - ($475))|0;
     $540 = $539 & $494;
     $541 = ($540>>>0)<(2147483647);
     if ($541) {
      $542 = (_sbrk(($540|0))|0);
      $543 = HEAP32[$$0$i20$i>>2]|0;
      $544 = HEAP32[$510>>2]|0;
      $545 = (($543) + ($544)|0);
      $546 = ($542|0)==($545|0);
      if ($546) {
       $547 = ($542|0)==((-1)|0);
       if ($547) {
        $$2234243136$i = $540;
       } else {
        $$723947$i = $540;$$748$i = $542;
        label = 135;
        break L167;
       }
      } else {
       $$2247$ph$i = $542;$$2253$ph$i = $540;
       label = 126;
      }
     } else {
      $$2234243136$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 118) {
     $517 = (_sbrk(0)|0);
     $518 = ($517|0)==((-1)|0);
     if ($518) {
      $$2234243136$i = 0;
     } else {
      $519 = $517;
      $520 = HEAP32[(11716)>>2]|0;
      $521 = (($520) + -1)|0;
      $522 = $521 & $519;
      $523 = ($522|0)==(0);
      $524 = (($521) + ($519))|0;
      $525 = (0 - ($520))|0;
      $526 = $524 & $525;
      $527 = (($526) - ($519))|0;
      $528 = $523 ? 0 : $527;
      $$$i = (($528) + ($495))|0;
      $529 = HEAP32[(11672)>>2]|0;
      $530 = (($$$i) + ($529))|0;
      $531 = ($$$i>>>0)>($$0192>>>0);
      $532 = ($$$i>>>0)<(2147483647);
      $or$cond$i = $531 & $532;
      if ($or$cond$i) {
       $533 = HEAP32[(11680)>>2]|0;
       $534 = ($533|0)==(0);
       if (!($534)) {
        $535 = ($530>>>0)<=($529>>>0);
        $536 = ($530>>>0)>($533>>>0);
        $or$cond2$i = $535 | $536;
        if ($or$cond2$i) {
         $$2234243136$i = 0;
         break;
        }
       }
       $537 = (_sbrk(($$$i|0))|0);
       $538 = ($537|0)==($517|0);
       if ($538) {
        $$723947$i = $$$i;$$748$i = $517;
        label = 135;
        break L167;
       } else {
        $$2247$ph$i = $537;$$2253$ph$i = $$$i;
        label = 126;
       }
      } else {
       $$2234243136$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 126) {
     $548 = (0 - ($$2253$ph$i))|0;
     $549 = ($$2247$ph$i|0)!=((-1)|0);
     $550 = ($$2253$ph$i>>>0)<(2147483647);
     $or$cond7$i = $550 & $549;
     $551 = ($490>>>0)>($$2253$ph$i>>>0);
     $or$cond10$i = $551 & $or$cond7$i;
     if (!($or$cond10$i)) {
      $561 = ($$2247$ph$i|0)==((-1)|0);
      if ($561) {
       $$2234243136$i = 0;
       break;
      } else {
       $$723947$i = $$2253$ph$i;$$748$i = $$2247$ph$i;
       label = 135;
       break L167;
      }
     }
     $552 = HEAP32[(11720)>>2]|0;
     $553 = (($491) - ($$2253$ph$i))|0;
     $554 = (($553) + ($552))|0;
     $555 = (0 - ($552))|0;
     $556 = $554 & $555;
     $557 = ($556>>>0)<(2147483647);
     if (!($557)) {
      $$723947$i = $$2253$ph$i;$$748$i = $$2247$ph$i;
      label = 135;
      break L167;
     }
     $558 = (_sbrk(($556|0))|0);
     $559 = ($558|0)==((-1)|0);
     if ($559) {
      (_sbrk(($548|0))|0);
      $$2234243136$i = 0;
      break;
     } else {
      $560 = (($556) + ($$2253$ph$i))|0;
      $$723947$i = $560;$$748$i = $$2247$ph$i;
      label = 135;
      break L167;
     }
    }
   } while(0);
   $562 = HEAP32[(11684)>>2]|0;
   $563 = $562 | 4;
   HEAP32[(11684)>>2] = $563;
   $$4236$i = $$2234243136$i;
   label = 133;
  } else {
   $$4236$i = 0;
   label = 133;
  }
 } while(0);
 if ((label|0) == 133) {
  $564 = ($495>>>0)<(2147483647);
  if ($564) {
   $565 = (_sbrk(($495|0))|0);
   $566 = (_sbrk(0)|0);
   $567 = ($565|0)!=((-1)|0);
   $568 = ($566|0)!=((-1)|0);
   $or$cond5$i = $567 & $568;
   $569 = ($565>>>0)<($566>>>0);
   $or$cond11$i = $569 & $or$cond5$i;
   $570 = $566;
   $571 = $565;
   $572 = (($570) - ($571))|0;
   $573 = (($$0192) + 40)|0;
   $574 = ($572>>>0)>($573>>>0);
   $$$4236$i = $574 ? $572 : $$4236$i;
   $or$cond11$not$i = $or$cond11$i ^ 1;
   $575 = ($565|0)==((-1)|0);
   $not$$i197 = $574 ^ 1;
   $576 = $575 | $not$$i197;
   $or$cond49$i = $576 | $or$cond11$not$i;
   if (!($or$cond49$i)) {
    $$723947$i = $$$4236$i;$$748$i = $565;
    label = 135;
   }
  }
 }
 if ((label|0) == 135) {
  $577 = HEAP32[(11672)>>2]|0;
  $578 = (($577) + ($$723947$i))|0;
  HEAP32[(11672)>>2] = $578;
  $579 = HEAP32[(11676)>>2]|0;
  $580 = ($578>>>0)>($579>>>0);
  if ($580) {
   HEAP32[(11676)>>2] = $578;
  }
  $581 = HEAP32[(11264)>>2]|0;
  $582 = ($581|0)==(0|0);
  do {
   if ($582) {
    $583 = HEAP32[(11256)>>2]|0;
    $584 = ($583|0)==(0|0);
    $585 = ($$748$i>>>0)<($583>>>0);
    $or$cond12$i = $584 | $585;
    if ($or$cond12$i) {
     HEAP32[(11256)>>2] = $$748$i;
    }
    HEAP32[(11688)>>2] = $$748$i;
    HEAP32[(11692)>>2] = $$723947$i;
    HEAP32[(11700)>>2] = 0;
    $586 = HEAP32[2928]|0;
    HEAP32[(11276)>>2] = $586;
    HEAP32[(11272)>>2] = -1;
    $$01$i$i = 0;
    while(1) {
     $587 = $$01$i$i << 1;
     $588 = (11280 + ($587<<2)|0);
     $589 = ((($588)) + 12|0);
     HEAP32[$589>>2] = $588;
     $590 = ((($588)) + 8|0);
     HEAP32[$590>>2] = $588;
     $591 = (($$01$i$i) + 1)|0;
     $exitcond$i$i = ($591|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $$01$i$i = $591;
     }
    }
    $592 = (($$723947$i) + -40)|0;
    $593 = ((($$748$i)) + 8|0);
    $594 = $593;
    $595 = $594 & 7;
    $596 = ($595|0)==(0);
    $597 = (0 - ($594))|0;
    $598 = $597 & 7;
    $599 = $596 ? 0 : $598;
    $600 = (($$748$i) + ($599)|0);
    $601 = (($592) - ($599))|0;
    HEAP32[(11264)>>2] = $600;
    HEAP32[(11252)>>2] = $601;
    $602 = $601 | 1;
    $603 = ((($600)) + 4|0);
    HEAP32[$603>>2] = $602;
    $604 = (($600) + ($601)|0);
    $605 = ((($604)) + 4|0);
    HEAP32[$605>>2] = 40;
    $606 = HEAP32[(11728)>>2]|0;
    HEAP32[(11268)>>2] = $606;
   } else {
    $$024370$i = (11688);
    while(1) {
     $607 = HEAP32[$$024370$i>>2]|0;
     $608 = ((($$024370$i)) + 4|0);
     $609 = HEAP32[$608>>2]|0;
     $610 = (($607) + ($609)|0);
     $611 = ($$748$i|0)==($610|0);
     if ($611) {
      label = 145;
      break;
     }
     $612 = ((($$024370$i)) + 8|0);
     $613 = HEAP32[$612>>2]|0;
     $614 = ($613|0)==(0|0);
     if ($614) {
      break;
     } else {
      $$024370$i = $613;
     }
    }
    if ((label|0) == 145) {
     $615 = ((($$024370$i)) + 12|0);
     $616 = HEAP32[$615>>2]|0;
     $617 = $616 & 8;
     $618 = ($617|0)==(0);
     if ($618) {
      $619 = ($581>>>0)>=($607>>>0);
      $620 = ($581>>>0)<($$748$i>>>0);
      $or$cond50$i = $620 & $619;
      if ($or$cond50$i) {
       $621 = (($609) + ($$723947$i))|0;
       HEAP32[$608>>2] = $621;
       $622 = HEAP32[(11252)>>2]|0;
       $623 = ((($581)) + 8|0);
       $624 = $623;
       $625 = $624 & 7;
       $626 = ($625|0)==(0);
       $627 = (0 - ($624))|0;
       $628 = $627 & 7;
       $629 = $626 ? 0 : $628;
       $630 = (($581) + ($629)|0);
       $631 = (($$723947$i) - ($629))|0;
       $632 = (($622) + ($631))|0;
       HEAP32[(11264)>>2] = $630;
       HEAP32[(11252)>>2] = $632;
       $633 = $632 | 1;
       $634 = ((($630)) + 4|0);
       HEAP32[$634>>2] = $633;
       $635 = (($630) + ($632)|0);
       $636 = ((($635)) + 4|0);
       HEAP32[$636>>2] = 40;
       $637 = HEAP32[(11728)>>2]|0;
       HEAP32[(11268)>>2] = $637;
       break;
      }
     }
    }
    $638 = HEAP32[(11256)>>2]|0;
    $639 = ($$748$i>>>0)<($638>>>0);
    if ($639) {
     HEAP32[(11256)>>2] = $$748$i;
    }
    $640 = (($$748$i) + ($$723947$i)|0);
    $$124469$i = (11688);
    while(1) {
     $641 = HEAP32[$$124469$i>>2]|0;
     $642 = ($641|0)==($640|0);
     if ($642) {
      label = 153;
      break;
     }
     $643 = ((($$124469$i)) + 8|0);
     $644 = HEAP32[$643>>2]|0;
     $645 = ($644|0)==(0|0);
     if ($645) {
      break;
     } else {
      $$124469$i = $644;
     }
    }
    if ((label|0) == 153) {
     $646 = ((($$124469$i)) + 12|0);
     $647 = HEAP32[$646>>2]|0;
     $648 = $647 & 8;
     $649 = ($648|0)==(0);
     if ($649) {
      HEAP32[$$124469$i>>2] = $$748$i;
      $650 = ((($$124469$i)) + 4|0);
      $651 = HEAP32[$650>>2]|0;
      $652 = (($651) + ($$723947$i))|0;
      HEAP32[$650>>2] = $652;
      $653 = ((($$748$i)) + 8|0);
      $654 = $653;
      $655 = $654 & 7;
      $656 = ($655|0)==(0);
      $657 = (0 - ($654))|0;
      $658 = $657 & 7;
      $659 = $656 ? 0 : $658;
      $660 = (($$748$i) + ($659)|0);
      $661 = ((($640)) + 8|0);
      $662 = $661;
      $663 = $662 & 7;
      $664 = ($663|0)==(0);
      $665 = (0 - ($662))|0;
      $666 = $665 & 7;
      $667 = $664 ? 0 : $666;
      $668 = (($640) + ($667)|0);
      $669 = $668;
      $670 = $660;
      $671 = (($669) - ($670))|0;
      $672 = (($660) + ($$0192)|0);
      $673 = (($671) - ($$0192))|0;
      $674 = $$0192 | 3;
      $675 = ((($660)) + 4|0);
      HEAP32[$675>>2] = $674;
      $676 = ($668|0)==($581|0);
      do {
       if ($676) {
        $677 = HEAP32[(11252)>>2]|0;
        $678 = (($677) + ($673))|0;
        HEAP32[(11252)>>2] = $678;
        HEAP32[(11264)>>2] = $672;
        $679 = $678 | 1;
        $680 = ((($672)) + 4|0);
        HEAP32[$680>>2] = $679;
       } else {
        $681 = HEAP32[(11260)>>2]|0;
        $682 = ($668|0)==($681|0);
        if ($682) {
         $683 = HEAP32[(11248)>>2]|0;
         $684 = (($683) + ($673))|0;
         HEAP32[(11248)>>2] = $684;
         HEAP32[(11260)>>2] = $672;
         $685 = $684 | 1;
         $686 = ((($672)) + 4|0);
         HEAP32[$686>>2] = $685;
         $687 = (($672) + ($684)|0);
         HEAP32[$687>>2] = $684;
         break;
        }
        $688 = ((($668)) + 4|0);
        $689 = HEAP32[$688>>2]|0;
        $690 = $689 & 3;
        $691 = ($690|0)==(1);
        if ($691) {
         $692 = $689 & -8;
         $693 = $689 >>> 3;
         $694 = ($689>>>0)<(256);
         L237: do {
          if ($694) {
           $695 = ((($668)) + 8|0);
           $696 = HEAP32[$695>>2]|0;
           $697 = ((($668)) + 12|0);
           $698 = HEAP32[$697>>2]|0;
           $699 = ($698|0)==($696|0);
           if ($699) {
            $700 = 1 << $693;
            $701 = $700 ^ -1;
            $702 = HEAP32[2810]|0;
            $703 = $702 & $701;
            HEAP32[2810] = $703;
            break;
           } else {
            $704 = ((($696)) + 12|0);
            HEAP32[$704>>2] = $698;
            $705 = ((($698)) + 8|0);
            HEAP32[$705>>2] = $696;
            break;
           }
          } else {
           $706 = ((($668)) + 24|0);
           $707 = HEAP32[$706>>2]|0;
           $708 = ((($668)) + 12|0);
           $709 = HEAP32[$708>>2]|0;
           $710 = ($709|0)==($668|0);
           do {
            if ($710) {
             $715 = ((($668)) + 16|0);
             $716 = ((($715)) + 4|0);
             $717 = HEAP32[$716>>2]|0;
             $718 = ($717|0)==(0|0);
             if ($718) {
              $719 = HEAP32[$715>>2]|0;
              $720 = ($719|0)==(0|0);
              if ($720) {
               $$3$i$i = 0;
               break;
              } else {
               $$1264$i$i = $719;$$1266$i$i = $715;
              }
             } else {
              $$1264$i$i = $717;$$1266$i$i = $716;
             }
             while(1) {
              $721 = ((($$1264$i$i)) + 20|0);
              $722 = HEAP32[$721>>2]|0;
              $723 = ($722|0)==(0|0);
              if (!($723)) {
               $$1264$i$i = $722;$$1266$i$i = $721;
               continue;
              }
              $724 = ((($$1264$i$i)) + 16|0);
              $725 = HEAP32[$724>>2]|0;
              $726 = ($725|0)==(0|0);
              if ($726) {
               break;
              } else {
               $$1264$i$i = $725;$$1266$i$i = $724;
              }
             }
             HEAP32[$$1266$i$i>>2] = 0;
             $$3$i$i = $$1264$i$i;
            } else {
             $711 = ((($668)) + 8|0);
             $712 = HEAP32[$711>>2]|0;
             $713 = ((($712)) + 12|0);
             HEAP32[$713>>2] = $709;
             $714 = ((($709)) + 8|0);
             HEAP32[$714>>2] = $712;
             $$3$i$i = $709;
            }
           } while(0);
           $727 = ($707|0)==(0|0);
           if ($727) {
            break;
           }
           $728 = ((($668)) + 28|0);
           $729 = HEAP32[$728>>2]|0;
           $730 = (11544 + ($729<<2)|0);
           $731 = HEAP32[$730>>2]|0;
           $732 = ($668|0)==($731|0);
           do {
            if ($732) {
             HEAP32[$730>>2] = $$3$i$i;
             $cond$i$i = ($$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $733 = 1 << $729;
             $734 = $733 ^ -1;
             $735 = HEAP32[(11244)>>2]|0;
             $736 = $735 & $734;
             HEAP32[(11244)>>2] = $736;
             break L237;
            } else {
             $737 = ((($707)) + 16|0);
             $738 = HEAP32[$737>>2]|0;
             $not$$i$i = ($738|0)!=($668|0);
             $$sink1$i$i = $not$$i$i&1;
             $739 = (((($707)) + 16|0) + ($$sink1$i$i<<2)|0);
             HEAP32[$739>>2] = $$3$i$i;
             $740 = ($$3$i$i|0)==(0|0);
             if ($740) {
              break L237;
             }
            }
           } while(0);
           $741 = ((($$3$i$i)) + 24|0);
           HEAP32[$741>>2] = $707;
           $742 = ((($668)) + 16|0);
           $743 = HEAP32[$742>>2]|0;
           $744 = ($743|0)==(0|0);
           if (!($744)) {
            $745 = ((($$3$i$i)) + 16|0);
            HEAP32[$745>>2] = $743;
            $746 = ((($743)) + 24|0);
            HEAP32[$746>>2] = $$3$i$i;
           }
           $747 = ((($742)) + 4|0);
           $748 = HEAP32[$747>>2]|0;
           $749 = ($748|0)==(0|0);
           if ($749) {
            break;
           }
           $750 = ((($$3$i$i)) + 20|0);
           HEAP32[$750>>2] = $748;
           $751 = ((($748)) + 24|0);
           HEAP32[$751>>2] = $$3$i$i;
          }
         } while(0);
         $752 = (($668) + ($692)|0);
         $753 = (($692) + ($673))|0;
         $$0$i$i = $752;$$0260$i$i = $753;
        } else {
         $$0$i$i = $668;$$0260$i$i = $673;
        }
        $754 = ((($$0$i$i)) + 4|0);
        $755 = HEAP32[$754>>2]|0;
        $756 = $755 & -2;
        HEAP32[$754>>2] = $756;
        $757 = $$0260$i$i | 1;
        $758 = ((($672)) + 4|0);
        HEAP32[$758>>2] = $757;
        $759 = (($672) + ($$0260$i$i)|0);
        HEAP32[$759>>2] = $$0260$i$i;
        $760 = $$0260$i$i >>> 3;
        $761 = ($$0260$i$i>>>0)<(256);
        if ($761) {
         $762 = $760 << 1;
         $763 = (11280 + ($762<<2)|0);
         $764 = HEAP32[2810]|0;
         $765 = 1 << $760;
         $766 = $764 & $765;
         $767 = ($766|0)==(0);
         if ($767) {
          $768 = $764 | $765;
          HEAP32[2810] = $768;
          $$pre$i17$i = ((($763)) + 8|0);
          $$0268$i$i = $763;$$pre$phi$i18$iZ2D = $$pre$i17$i;
         } else {
          $769 = ((($763)) + 8|0);
          $770 = HEAP32[$769>>2]|0;
          $$0268$i$i = $770;$$pre$phi$i18$iZ2D = $769;
         }
         HEAP32[$$pre$phi$i18$iZ2D>>2] = $672;
         $771 = ((($$0268$i$i)) + 12|0);
         HEAP32[$771>>2] = $672;
         $772 = ((($672)) + 8|0);
         HEAP32[$772>>2] = $$0268$i$i;
         $773 = ((($672)) + 12|0);
         HEAP32[$773>>2] = $763;
         break;
        }
        $774 = $$0260$i$i >>> 8;
        $775 = ($774|0)==(0);
        do {
         if ($775) {
          $$0269$i$i = 0;
         } else {
          $776 = ($$0260$i$i>>>0)>(16777215);
          if ($776) {
           $$0269$i$i = 31;
           break;
          }
          $777 = (($774) + 1048320)|0;
          $778 = $777 >>> 16;
          $779 = $778 & 8;
          $780 = $774 << $779;
          $781 = (($780) + 520192)|0;
          $782 = $781 >>> 16;
          $783 = $782 & 4;
          $784 = $783 | $779;
          $785 = $780 << $783;
          $786 = (($785) + 245760)|0;
          $787 = $786 >>> 16;
          $788 = $787 & 2;
          $789 = $784 | $788;
          $790 = (14 - ($789))|0;
          $791 = $785 << $788;
          $792 = $791 >>> 15;
          $793 = (($790) + ($792))|0;
          $794 = $793 << 1;
          $795 = (($793) + 7)|0;
          $796 = $$0260$i$i >>> $795;
          $797 = $796 & 1;
          $798 = $797 | $794;
          $$0269$i$i = $798;
         }
        } while(0);
        $799 = (11544 + ($$0269$i$i<<2)|0);
        $800 = ((($672)) + 28|0);
        HEAP32[$800>>2] = $$0269$i$i;
        $801 = ((($672)) + 16|0);
        $802 = ((($801)) + 4|0);
        HEAP32[$802>>2] = 0;
        HEAP32[$801>>2] = 0;
        $803 = HEAP32[(11244)>>2]|0;
        $804 = 1 << $$0269$i$i;
        $805 = $803 & $804;
        $806 = ($805|0)==(0);
        if ($806) {
         $807 = $803 | $804;
         HEAP32[(11244)>>2] = $807;
         HEAP32[$799>>2] = $672;
         $808 = ((($672)) + 24|0);
         HEAP32[$808>>2] = $799;
         $809 = ((($672)) + 12|0);
         HEAP32[$809>>2] = $672;
         $810 = ((($672)) + 8|0);
         HEAP32[$810>>2] = $672;
         break;
        }
        $811 = HEAP32[$799>>2]|0;
        $812 = ($$0269$i$i|0)==(31);
        $813 = $$0269$i$i >>> 1;
        $814 = (25 - ($813))|0;
        $815 = $812 ? 0 : $814;
        $816 = $$0260$i$i << $815;
        $$0261$i$i = $816;$$0262$i$i = $811;
        while(1) {
         $817 = ((($$0262$i$i)) + 4|0);
         $818 = HEAP32[$817>>2]|0;
         $819 = $818 & -8;
         $820 = ($819|0)==($$0260$i$i|0);
         if ($820) {
          label = 194;
          break;
         }
         $821 = $$0261$i$i >>> 31;
         $822 = (((($$0262$i$i)) + 16|0) + ($821<<2)|0);
         $823 = $$0261$i$i << 1;
         $824 = HEAP32[$822>>2]|0;
         $825 = ($824|0)==(0|0);
         if ($825) {
          label = 193;
          break;
         } else {
          $$0261$i$i = $823;$$0262$i$i = $824;
         }
        }
        if ((label|0) == 193) {
         HEAP32[$822>>2] = $672;
         $826 = ((($672)) + 24|0);
         HEAP32[$826>>2] = $$0262$i$i;
         $827 = ((($672)) + 12|0);
         HEAP32[$827>>2] = $672;
         $828 = ((($672)) + 8|0);
         HEAP32[$828>>2] = $672;
         break;
        }
        else if ((label|0) == 194) {
         $829 = ((($$0262$i$i)) + 8|0);
         $830 = HEAP32[$829>>2]|0;
         $831 = ((($830)) + 12|0);
         HEAP32[$831>>2] = $672;
         HEAP32[$829>>2] = $672;
         $832 = ((($672)) + 8|0);
         HEAP32[$832>>2] = $830;
         $833 = ((($672)) + 12|0);
         HEAP32[$833>>2] = $$0262$i$i;
         $834 = ((($672)) + 24|0);
         HEAP32[$834>>2] = 0;
         break;
        }
       }
      } while(0);
      $959 = ((($660)) + 8|0);
      $$0 = $959;
      STACKTOP = sp;return ($$0|0);
     }
    }
    $$0$i$i$i = (11688);
    while(1) {
     $835 = HEAP32[$$0$i$i$i>>2]|0;
     $836 = ($835>>>0)>($581>>>0);
     if (!($836)) {
      $837 = ((($$0$i$i$i)) + 4|0);
      $838 = HEAP32[$837>>2]|0;
      $839 = (($835) + ($838)|0);
      $840 = ($839>>>0)>($581>>>0);
      if ($840) {
       break;
      }
     }
     $841 = ((($$0$i$i$i)) + 8|0);
     $842 = HEAP32[$841>>2]|0;
     $$0$i$i$i = $842;
    }
    $843 = ((($839)) + -47|0);
    $844 = ((($843)) + 8|0);
    $845 = $844;
    $846 = $845 & 7;
    $847 = ($846|0)==(0);
    $848 = (0 - ($845))|0;
    $849 = $848 & 7;
    $850 = $847 ? 0 : $849;
    $851 = (($843) + ($850)|0);
    $852 = ((($581)) + 16|0);
    $853 = ($851>>>0)<($852>>>0);
    $854 = $853 ? $581 : $851;
    $855 = ((($854)) + 8|0);
    $856 = ((($854)) + 24|0);
    $857 = (($$723947$i) + -40)|0;
    $858 = ((($$748$i)) + 8|0);
    $859 = $858;
    $860 = $859 & 7;
    $861 = ($860|0)==(0);
    $862 = (0 - ($859))|0;
    $863 = $862 & 7;
    $864 = $861 ? 0 : $863;
    $865 = (($$748$i) + ($864)|0);
    $866 = (($857) - ($864))|0;
    HEAP32[(11264)>>2] = $865;
    HEAP32[(11252)>>2] = $866;
    $867 = $866 | 1;
    $868 = ((($865)) + 4|0);
    HEAP32[$868>>2] = $867;
    $869 = (($865) + ($866)|0);
    $870 = ((($869)) + 4|0);
    HEAP32[$870>>2] = 40;
    $871 = HEAP32[(11728)>>2]|0;
    HEAP32[(11268)>>2] = $871;
    $872 = ((($854)) + 4|0);
    HEAP32[$872>>2] = 27;
    ;HEAP32[$855>>2]=HEAP32[(11688)>>2]|0;HEAP32[$855+4>>2]=HEAP32[(11688)+4>>2]|0;HEAP32[$855+8>>2]=HEAP32[(11688)+8>>2]|0;HEAP32[$855+12>>2]=HEAP32[(11688)+12>>2]|0;
    HEAP32[(11688)>>2] = $$748$i;
    HEAP32[(11692)>>2] = $$723947$i;
    HEAP32[(11700)>>2] = 0;
    HEAP32[(11696)>>2] = $855;
    $874 = $856;
    while(1) {
     $873 = ((($874)) + 4|0);
     HEAP32[$873>>2] = 7;
     $875 = ((($874)) + 8|0);
     $876 = ($875>>>0)<($839>>>0);
     if ($876) {
      $874 = $873;
     } else {
      break;
     }
    }
    $877 = ($854|0)==($581|0);
    if (!($877)) {
     $878 = $854;
     $879 = $581;
     $880 = (($878) - ($879))|0;
     $881 = HEAP32[$872>>2]|0;
     $882 = $881 & -2;
     HEAP32[$872>>2] = $882;
     $883 = $880 | 1;
     $884 = ((($581)) + 4|0);
     HEAP32[$884>>2] = $883;
     HEAP32[$854>>2] = $880;
     $885 = $880 >>> 3;
     $886 = ($880>>>0)<(256);
     if ($886) {
      $887 = $885 << 1;
      $888 = (11280 + ($887<<2)|0);
      $889 = HEAP32[2810]|0;
      $890 = 1 << $885;
      $891 = $889 & $890;
      $892 = ($891|0)==(0);
      if ($892) {
       $893 = $889 | $890;
       HEAP32[2810] = $893;
       $$pre$i$i = ((($888)) + 8|0);
       $$0206$i$i = $888;$$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $894 = ((($888)) + 8|0);
       $895 = HEAP32[$894>>2]|0;
       $$0206$i$i = $895;$$pre$phi$i$iZ2D = $894;
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $581;
      $896 = ((($$0206$i$i)) + 12|0);
      HEAP32[$896>>2] = $581;
      $897 = ((($581)) + 8|0);
      HEAP32[$897>>2] = $$0206$i$i;
      $898 = ((($581)) + 12|0);
      HEAP32[$898>>2] = $888;
      break;
     }
     $899 = $880 >>> 8;
     $900 = ($899|0)==(0);
     if ($900) {
      $$0207$i$i = 0;
     } else {
      $901 = ($880>>>0)>(16777215);
      if ($901) {
       $$0207$i$i = 31;
      } else {
       $902 = (($899) + 1048320)|0;
       $903 = $902 >>> 16;
       $904 = $903 & 8;
       $905 = $899 << $904;
       $906 = (($905) + 520192)|0;
       $907 = $906 >>> 16;
       $908 = $907 & 4;
       $909 = $908 | $904;
       $910 = $905 << $908;
       $911 = (($910) + 245760)|0;
       $912 = $911 >>> 16;
       $913 = $912 & 2;
       $914 = $909 | $913;
       $915 = (14 - ($914))|0;
       $916 = $910 << $913;
       $917 = $916 >>> 15;
       $918 = (($915) + ($917))|0;
       $919 = $918 << 1;
       $920 = (($918) + 7)|0;
       $921 = $880 >>> $920;
       $922 = $921 & 1;
       $923 = $922 | $919;
       $$0207$i$i = $923;
      }
     }
     $924 = (11544 + ($$0207$i$i<<2)|0);
     $925 = ((($581)) + 28|0);
     HEAP32[$925>>2] = $$0207$i$i;
     $926 = ((($581)) + 20|0);
     HEAP32[$926>>2] = 0;
     HEAP32[$852>>2] = 0;
     $927 = HEAP32[(11244)>>2]|0;
     $928 = 1 << $$0207$i$i;
     $929 = $927 & $928;
     $930 = ($929|0)==(0);
     if ($930) {
      $931 = $927 | $928;
      HEAP32[(11244)>>2] = $931;
      HEAP32[$924>>2] = $581;
      $932 = ((($581)) + 24|0);
      HEAP32[$932>>2] = $924;
      $933 = ((($581)) + 12|0);
      HEAP32[$933>>2] = $581;
      $934 = ((($581)) + 8|0);
      HEAP32[$934>>2] = $581;
      break;
     }
     $935 = HEAP32[$924>>2]|0;
     $936 = ($$0207$i$i|0)==(31);
     $937 = $$0207$i$i >>> 1;
     $938 = (25 - ($937))|0;
     $939 = $936 ? 0 : $938;
     $940 = $880 << $939;
     $$0201$i$i = $940;$$0202$i$i = $935;
     while(1) {
      $941 = ((($$0202$i$i)) + 4|0);
      $942 = HEAP32[$941>>2]|0;
      $943 = $942 & -8;
      $944 = ($943|0)==($880|0);
      if ($944) {
       label = 216;
       break;
      }
      $945 = $$0201$i$i >>> 31;
      $946 = (((($$0202$i$i)) + 16|0) + ($945<<2)|0);
      $947 = $$0201$i$i << 1;
      $948 = HEAP32[$946>>2]|0;
      $949 = ($948|0)==(0|0);
      if ($949) {
       label = 215;
       break;
      } else {
       $$0201$i$i = $947;$$0202$i$i = $948;
      }
     }
     if ((label|0) == 215) {
      HEAP32[$946>>2] = $581;
      $950 = ((($581)) + 24|0);
      HEAP32[$950>>2] = $$0202$i$i;
      $951 = ((($581)) + 12|0);
      HEAP32[$951>>2] = $581;
      $952 = ((($581)) + 8|0);
      HEAP32[$952>>2] = $581;
      break;
     }
     else if ((label|0) == 216) {
      $953 = ((($$0202$i$i)) + 8|0);
      $954 = HEAP32[$953>>2]|0;
      $955 = ((($954)) + 12|0);
      HEAP32[$955>>2] = $581;
      HEAP32[$953>>2] = $581;
      $956 = ((($581)) + 8|0);
      HEAP32[$956>>2] = $954;
      $957 = ((($581)) + 12|0);
      HEAP32[$957>>2] = $$0202$i$i;
      $958 = ((($581)) + 24|0);
      HEAP32[$958>>2] = 0;
      break;
     }
    }
   }
  } while(0);
  $960 = HEAP32[(11252)>>2]|0;
  $961 = ($960>>>0)>($$0192>>>0);
  if ($961) {
   $962 = (($960) - ($$0192))|0;
   HEAP32[(11252)>>2] = $962;
   $963 = HEAP32[(11264)>>2]|0;
   $964 = (($963) + ($$0192)|0);
   HEAP32[(11264)>>2] = $964;
   $965 = $962 | 1;
   $966 = ((($964)) + 4|0);
   HEAP32[$966>>2] = $965;
   $967 = $$0192 | 3;
   $968 = ((($963)) + 4|0);
   HEAP32[$968>>2] = $967;
   $969 = ((($963)) + 8|0);
   $$0 = $969;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $970 = (___errno_location()|0);
 HEAP32[$970>>2] = 12;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _free($0) {
 $0 = $0|0;
 var $$0195$i = 0, $$0195$in$i = 0, $$0348 = 0, $$0349 = 0, $$0361 = 0, $$0368 = 0, $$1 = 0, $$1347 = 0, $$1352 = 0, $$1355 = 0, $$1363 = 0, $$1367 = 0, $$2 = 0, $$3 = 0, $$3365 = 0, $$pre = 0, $$pre$phiZ2D = 0, $$sink3 = 0, $$sink5 = 0, $1 = 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0;
 var $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0;
 var $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $cond374 = 0, $cond375 = 0, $not$ = 0, $not$370 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = ((($0)) + -8|0);
 $3 = HEAP32[(11256)>>2]|0;
 $4 = ((($0)) + -4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 & -8;
 $7 = (($2) + ($6)|0);
 $8 = $5 & 1;
 $9 = ($8|0)==(0);
 do {
  if ($9) {
   $10 = HEAP32[$2>>2]|0;
   $11 = $5 & 3;
   $12 = ($11|0)==(0);
   if ($12) {
    return;
   }
   $13 = (0 - ($10))|0;
   $14 = (($2) + ($13)|0);
   $15 = (($10) + ($6))|0;
   $16 = ($14>>>0)<($3>>>0);
   if ($16) {
    return;
   }
   $17 = HEAP32[(11260)>>2]|0;
   $18 = ($14|0)==($17|0);
   if ($18) {
    $78 = ((($7)) + 4|0);
    $79 = HEAP32[$78>>2]|0;
    $80 = $79 & 3;
    $81 = ($80|0)==(3);
    if (!($81)) {
     $$1 = $14;$$1347 = $15;$87 = $14;
     break;
    }
    $82 = (($14) + ($15)|0);
    $83 = ((($14)) + 4|0);
    $84 = $15 | 1;
    $85 = $79 & -2;
    HEAP32[(11248)>>2] = $15;
    HEAP32[$78>>2] = $85;
    HEAP32[$83>>2] = $84;
    HEAP32[$82>>2] = $15;
    return;
   }
   $19 = $10 >>> 3;
   $20 = ($10>>>0)<(256);
   if ($20) {
    $21 = ((($14)) + 8|0);
    $22 = HEAP32[$21>>2]|0;
    $23 = ((($14)) + 12|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = ($24|0)==($22|0);
    if ($25) {
     $26 = 1 << $19;
     $27 = $26 ^ -1;
     $28 = HEAP32[2810]|0;
     $29 = $28 & $27;
     HEAP32[2810] = $29;
     $$1 = $14;$$1347 = $15;$87 = $14;
     break;
    } else {
     $30 = ((($22)) + 12|0);
     HEAP32[$30>>2] = $24;
     $31 = ((($24)) + 8|0);
     HEAP32[$31>>2] = $22;
     $$1 = $14;$$1347 = $15;$87 = $14;
     break;
    }
   }
   $32 = ((($14)) + 24|0);
   $33 = HEAP32[$32>>2]|0;
   $34 = ((($14)) + 12|0);
   $35 = HEAP32[$34>>2]|0;
   $36 = ($35|0)==($14|0);
   do {
    if ($36) {
     $41 = ((($14)) + 16|0);
     $42 = ((($41)) + 4|0);
     $43 = HEAP32[$42>>2]|0;
     $44 = ($43|0)==(0|0);
     if ($44) {
      $45 = HEAP32[$41>>2]|0;
      $46 = ($45|0)==(0|0);
      if ($46) {
       $$3 = 0;
       break;
      } else {
       $$1352 = $45;$$1355 = $41;
      }
     } else {
      $$1352 = $43;$$1355 = $42;
     }
     while(1) {
      $47 = ((($$1352)) + 20|0);
      $48 = HEAP32[$47>>2]|0;
      $49 = ($48|0)==(0|0);
      if (!($49)) {
       $$1352 = $48;$$1355 = $47;
       continue;
      }
      $50 = ((($$1352)) + 16|0);
      $51 = HEAP32[$50>>2]|0;
      $52 = ($51|0)==(0|0);
      if ($52) {
       break;
      } else {
       $$1352 = $51;$$1355 = $50;
      }
     }
     HEAP32[$$1355>>2] = 0;
     $$3 = $$1352;
    } else {
     $37 = ((($14)) + 8|0);
     $38 = HEAP32[$37>>2]|0;
     $39 = ((($38)) + 12|0);
     HEAP32[$39>>2] = $35;
     $40 = ((($35)) + 8|0);
     HEAP32[$40>>2] = $38;
     $$3 = $35;
    }
   } while(0);
   $53 = ($33|0)==(0|0);
   if ($53) {
    $$1 = $14;$$1347 = $15;$87 = $14;
   } else {
    $54 = ((($14)) + 28|0);
    $55 = HEAP32[$54>>2]|0;
    $56 = (11544 + ($55<<2)|0);
    $57 = HEAP32[$56>>2]|0;
    $58 = ($14|0)==($57|0);
    if ($58) {
     HEAP32[$56>>2] = $$3;
     $cond374 = ($$3|0)==(0|0);
     if ($cond374) {
      $59 = 1 << $55;
      $60 = $59 ^ -1;
      $61 = HEAP32[(11244)>>2]|0;
      $62 = $61 & $60;
      HEAP32[(11244)>>2] = $62;
      $$1 = $14;$$1347 = $15;$87 = $14;
      break;
     }
    } else {
     $63 = ((($33)) + 16|0);
     $64 = HEAP32[$63>>2]|0;
     $not$370 = ($64|0)!=($14|0);
     $$sink3 = $not$370&1;
     $65 = (((($33)) + 16|0) + ($$sink3<<2)|0);
     HEAP32[$65>>2] = $$3;
     $66 = ($$3|0)==(0|0);
     if ($66) {
      $$1 = $14;$$1347 = $15;$87 = $14;
      break;
     }
    }
    $67 = ((($$3)) + 24|0);
    HEAP32[$67>>2] = $33;
    $68 = ((($14)) + 16|0);
    $69 = HEAP32[$68>>2]|0;
    $70 = ($69|0)==(0|0);
    if (!($70)) {
     $71 = ((($$3)) + 16|0);
     HEAP32[$71>>2] = $69;
     $72 = ((($69)) + 24|0);
     HEAP32[$72>>2] = $$3;
    }
    $73 = ((($68)) + 4|0);
    $74 = HEAP32[$73>>2]|0;
    $75 = ($74|0)==(0|0);
    if ($75) {
     $$1 = $14;$$1347 = $15;$87 = $14;
    } else {
     $76 = ((($$3)) + 20|0);
     HEAP32[$76>>2] = $74;
     $77 = ((($74)) + 24|0);
     HEAP32[$77>>2] = $$3;
     $$1 = $14;$$1347 = $15;$87 = $14;
    }
   }
  } else {
   $$1 = $2;$$1347 = $6;$87 = $2;
  }
 } while(0);
 $86 = ($87>>>0)<($7>>>0);
 if (!($86)) {
  return;
 }
 $88 = ((($7)) + 4|0);
 $89 = HEAP32[$88>>2]|0;
 $90 = $89 & 1;
 $91 = ($90|0)==(0);
 if ($91) {
  return;
 }
 $92 = $89 & 2;
 $93 = ($92|0)==(0);
 if ($93) {
  $94 = HEAP32[(11264)>>2]|0;
  $95 = ($7|0)==($94|0);
  $96 = HEAP32[(11260)>>2]|0;
  if ($95) {
   $97 = HEAP32[(11252)>>2]|0;
   $98 = (($97) + ($$1347))|0;
   HEAP32[(11252)>>2] = $98;
   HEAP32[(11264)>>2] = $$1;
   $99 = $98 | 1;
   $100 = ((($$1)) + 4|0);
   HEAP32[$100>>2] = $99;
   $101 = ($$1|0)==($96|0);
   if (!($101)) {
    return;
   }
   HEAP32[(11260)>>2] = 0;
   HEAP32[(11248)>>2] = 0;
   return;
  }
  $102 = ($7|0)==($96|0);
  if ($102) {
   $103 = HEAP32[(11248)>>2]|0;
   $104 = (($103) + ($$1347))|0;
   HEAP32[(11248)>>2] = $104;
   HEAP32[(11260)>>2] = $87;
   $105 = $104 | 1;
   $106 = ((($$1)) + 4|0);
   HEAP32[$106>>2] = $105;
   $107 = (($87) + ($104)|0);
   HEAP32[$107>>2] = $104;
   return;
  }
  $108 = $89 & -8;
  $109 = (($108) + ($$1347))|0;
  $110 = $89 >>> 3;
  $111 = ($89>>>0)<(256);
  do {
   if ($111) {
    $112 = ((($7)) + 8|0);
    $113 = HEAP32[$112>>2]|0;
    $114 = ((($7)) + 12|0);
    $115 = HEAP32[$114>>2]|0;
    $116 = ($115|0)==($113|0);
    if ($116) {
     $117 = 1 << $110;
     $118 = $117 ^ -1;
     $119 = HEAP32[2810]|0;
     $120 = $119 & $118;
     HEAP32[2810] = $120;
     break;
    } else {
     $121 = ((($113)) + 12|0);
     HEAP32[$121>>2] = $115;
     $122 = ((($115)) + 8|0);
     HEAP32[$122>>2] = $113;
     break;
    }
   } else {
    $123 = ((($7)) + 24|0);
    $124 = HEAP32[$123>>2]|0;
    $125 = ((($7)) + 12|0);
    $126 = HEAP32[$125>>2]|0;
    $127 = ($126|0)==($7|0);
    do {
     if ($127) {
      $132 = ((($7)) + 16|0);
      $133 = ((($132)) + 4|0);
      $134 = HEAP32[$133>>2]|0;
      $135 = ($134|0)==(0|0);
      if ($135) {
       $136 = HEAP32[$132>>2]|0;
       $137 = ($136|0)==(0|0);
       if ($137) {
        $$3365 = 0;
        break;
       } else {
        $$1363 = $136;$$1367 = $132;
       }
      } else {
       $$1363 = $134;$$1367 = $133;
      }
      while(1) {
       $138 = ((($$1363)) + 20|0);
       $139 = HEAP32[$138>>2]|0;
       $140 = ($139|0)==(0|0);
       if (!($140)) {
        $$1363 = $139;$$1367 = $138;
        continue;
       }
       $141 = ((($$1363)) + 16|0);
       $142 = HEAP32[$141>>2]|0;
       $143 = ($142|0)==(0|0);
       if ($143) {
        break;
       } else {
        $$1363 = $142;$$1367 = $141;
       }
      }
      HEAP32[$$1367>>2] = 0;
      $$3365 = $$1363;
     } else {
      $128 = ((($7)) + 8|0);
      $129 = HEAP32[$128>>2]|0;
      $130 = ((($129)) + 12|0);
      HEAP32[$130>>2] = $126;
      $131 = ((($126)) + 8|0);
      HEAP32[$131>>2] = $129;
      $$3365 = $126;
     }
    } while(0);
    $144 = ($124|0)==(0|0);
    if (!($144)) {
     $145 = ((($7)) + 28|0);
     $146 = HEAP32[$145>>2]|0;
     $147 = (11544 + ($146<<2)|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = ($7|0)==($148|0);
     if ($149) {
      HEAP32[$147>>2] = $$3365;
      $cond375 = ($$3365|0)==(0|0);
      if ($cond375) {
       $150 = 1 << $146;
       $151 = $150 ^ -1;
       $152 = HEAP32[(11244)>>2]|0;
       $153 = $152 & $151;
       HEAP32[(11244)>>2] = $153;
       break;
      }
     } else {
      $154 = ((($124)) + 16|0);
      $155 = HEAP32[$154>>2]|0;
      $not$ = ($155|0)!=($7|0);
      $$sink5 = $not$&1;
      $156 = (((($124)) + 16|0) + ($$sink5<<2)|0);
      HEAP32[$156>>2] = $$3365;
      $157 = ($$3365|0)==(0|0);
      if ($157) {
       break;
      }
     }
     $158 = ((($$3365)) + 24|0);
     HEAP32[$158>>2] = $124;
     $159 = ((($7)) + 16|0);
     $160 = HEAP32[$159>>2]|0;
     $161 = ($160|0)==(0|0);
     if (!($161)) {
      $162 = ((($$3365)) + 16|0);
      HEAP32[$162>>2] = $160;
      $163 = ((($160)) + 24|0);
      HEAP32[$163>>2] = $$3365;
     }
     $164 = ((($159)) + 4|0);
     $165 = HEAP32[$164>>2]|0;
     $166 = ($165|0)==(0|0);
     if (!($166)) {
      $167 = ((($$3365)) + 20|0);
      HEAP32[$167>>2] = $165;
      $168 = ((($165)) + 24|0);
      HEAP32[$168>>2] = $$3365;
     }
    }
   }
  } while(0);
  $169 = $109 | 1;
  $170 = ((($$1)) + 4|0);
  HEAP32[$170>>2] = $169;
  $171 = (($87) + ($109)|0);
  HEAP32[$171>>2] = $109;
  $172 = HEAP32[(11260)>>2]|0;
  $173 = ($$1|0)==($172|0);
  if ($173) {
   HEAP32[(11248)>>2] = $109;
   return;
  } else {
   $$2 = $109;
  }
 } else {
  $174 = $89 & -2;
  HEAP32[$88>>2] = $174;
  $175 = $$1347 | 1;
  $176 = ((($$1)) + 4|0);
  HEAP32[$176>>2] = $175;
  $177 = (($87) + ($$1347)|0);
  HEAP32[$177>>2] = $$1347;
  $$2 = $$1347;
 }
 $178 = $$2 >>> 3;
 $179 = ($$2>>>0)<(256);
 if ($179) {
  $180 = $178 << 1;
  $181 = (11280 + ($180<<2)|0);
  $182 = HEAP32[2810]|0;
  $183 = 1 << $178;
  $184 = $182 & $183;
  $185 = ($184|0)==(0);
  if ($185) {
   $186 = $182 | $183;
   HEAP32[2810] = $186;
   $$pre = ((($181)) + 8|0);
   $$0368 = $181;$$pre$phiZ2D = $$pre;
  } else {
   $187 = ((($181)) + 8|0);
   $188 = HEAP32[$187>>2]|0;
   $$0368 = $188;$$pre$phiZ2D = $187;
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $189 = ((($$0368)) + 12|0);
  HEAP32[$189>>2] = $$1;
  $190 = ((($$1)) + 8|0);
  HEAP32[$190>>2] = $$0368;
  $191 = ((($$1)) + 12|0);
  HEAP32[$191>>2] = $181;
  return;
 }
 $192 = $$2 >>> 8;
 $193 = ($192|0)==(0);
 if ($193) {
  $$0361 = 0;
 } else {
  $194 = ($$2>>>0)>(16777215);
  if ($194) {
   $$0361 = 31;
  } else {
   $195 = (($192) + 1048320)|0;
   $196 = $195 >>> 16;
   $197 = $196 & 8;
   $198 = $192 << $197;
   $199 = (($198) + 520192)|0;
   $200 = $199 >>> 16;
   $201 = $200 & 4;
   $202 = $201 | $197;
   $203 = $198 << $201;
   $204 = (($203) + 245760)|0;
   $205 = $204 >>> 16;
   $206 = $205 & 2;
   $207 = $202 | $206;
   $208 = (14 - ($207))|0;
   $209 = $203 << $206;
   $210 = $209 >>> 15;
   $211 = (($208) + ($210))|0;
   $212 = $211 << 1;
   $213 = (($211) + 7)|0;
   $214 = $$2 >>> $213;
   $215 = $214 & 1;
   $216 = $215 | $212;
   $$0361 = $216;
  }
 }
 $217 = (11544 + ($$0361<<2)|0);
 $218 = ((($$1)) + 28|0);
 HEAP32[$218>>2] = $$0361;
 $219 = ((($$1)) + 16|0);
 $220 = ((($$1)) + 20|0);
 HEAP32[$220>>2] = 0;
 HEAP32[$219>>2] = 0;
 $221 = HEAP32[(11244)>>2]|0;
 $222 = 1 << $$0361;
 $223 = $221 & $222;
 $224 = ($223|0)==(0);
 do {
  if ($224) {
   $225 = $221 | $222;
   HEAP32[(11244)>>2] = $225;
   HEAP32[$217>>2] = $$1;
   $226 = ((($$1)) + 24|0);
   HEAP32[$226>>2] = $217;
   $227 = ((($$1)) + 12|0);
   HEAP32[$227>>2] = $$1;
   $228 = ((($$1)) + 8|0);
   HEAP32[$228>>2] = $$1;
  } else {
   $229 = HEAP32[$217>>2]|0;
   $230 = ($$0361|0)==(31);
   $231 = $$0361 >>> 1;
   $232 = (25 - ($231))|0;
   $233 = $230 ? 0 : $232;
   $234 = $$2 << $233;
   $$0348 = $234;$$0349 = $229;
   while(1) {
    $235 = ((($$0349)) + 4|0);
    $236 = HEAP32[$235>>2]|0;
    $237 = $236 & -8;
    $238 = ($237|0)==($$2|0);
    if ($238) {
     label = 73;
     break;
    }
    $239 = $$0348 >>> 31;
    $240 = (((($$0349)) + 16|0) + ($239<<2)|0);
    $241 = $$0348 << 1;
    $242 = HEAP32[$240>>2]|0;
    $243 = ($242|0)==(0|0);
    if ($243) {
     label = 72;
     break;
    } else {
     $$0348 = $241;$$0349 = $242;
    }
   }
   if ((label|0) == 72) {
    HEAP32[$240>>2] = $$1;
    $244 = ((($$1)) + 24|0);
    HEAP32[$244>>2] = $$0349;
    $245 = ((($$1)) + 12|0);
    HEAP32[$245>>2] = $$1;
    $246 = ((($$1)) + 8|0);
    HEAP32[$246>>2] = $$1;
    break;
   }
   else if ((label|0) == 73) {
    $247 = ((($$0349)) + 8|0);
    $248 = HEAP32[$247>>2]|0;
    $249 = ((($248)) + 12|0);
    HEAP32[$249>>2] = $$1;
    HEAP32[$247>>2] = $$1;
    $250 = ((($$1)) + 8|0);
    HEAP32[$250>>2] = $248;
    $251 = ((($$1)) + 12|0);
    HEAP32[$251>>2] = $$0349;
    $252 = ((($$1)) + 24|0);
    HEAP32[$252>>2] = 0;
    break;
   }
  }
 } while(0);
 $253 = HEAP32[(11272)>>2]|0;
 $254 = (($253) + -1)|0;
 HEAP32[(11272)>>2] = $254;
 $255 = ($254|0)==(0);
 if ($255) {
  $$0195$in$i = (11696);
 } else {
  return;
 }
 while(1) {
  $$0195$i = HEAP32[$$0195$in$i>>2]|0;
  $256 = ($$0195$i|0)==(0|0);
  $257 = ((($$0195$i)) + 8|0);
  if ($256) {
   break;
  } else {
   $$0195$in$i = $257;
  }
 }
 HEAP32[(11272)>>2] = -1;
 return;
}
function _emscripten_get_global_libc() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (11736|0);
}
function ___stdio_close($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $vararg_buffer = sp;
 $1 = ((($0)) + 60|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = (_dummy_738($2)|0);
 HEAP32[$vararg_buffer>>2] = $3;
 $4 = (___syscall6(6,($vararg_buffer|0))|0);
 $5 = (___syscall_ret($4)|0);
 STACKTOP = sp;return ($5|0);
}
function ___stdio_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0;
 var $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = sp + 32|0;
 $4 = ((($0)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$3>>2] = $5;
 $6 = ((($3)) + 4|0);
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) - ($5))|0;
 HEAP32[$6>>2] = $9;
 $10 = ((($3)) + 8|0);
 HEAP32[$10>>2] = $1;
 $11 = ((($3)) + 12|0);
 HEAP32[$11>>2] = $2;
 $12 = (($9) + ($2))|0;
 $13 = ((($0)) + 60|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $3;
 HEAP32[$vararg_buffer>>2] = $14;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $15;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $16 = (___syscall146(146,($vararg_buffer|0))|0);
 $17 = (___syscall_ret($16)|0);
 $18 = ($12|0)==($17|0);
 L1: do {
  if ($18) {
   label = 3;
  } else {
   $$04756 = 2;$$04855 = $12;$$04954 = $3;$26 = $17;
   while(1) {
    $25 = ($26|0)<(0);
    if ($25) {
     break;
    }
    $34 = (($$04855) - ($26))|0;
    $35 = ((($$04954)) + 4|0);
    $36 = HEAP32[$35>>2]|0;
    $37 = ($26>>>0)>($36>>>0);
    $38 = ((($$04954)) + 8|0);
    $$150 = $37 ? $38 : $$04954;
    $39 = $37 << 31 >> 31;
    $$1 = (($39) + ($$04756))|0;
    $40 = $37 ? $36 : 0;
    $$0 = (($26) - ($40))|0;
    $41 = HEAP32[$$150>>2]|0;
    $42 = (($41) + ($$0)|0);
    HEAP32[$$150>>2] = $42;
    $43 = ((($$150)) + 4|0);
    $44 = HEAP32[$43>>2]|0;
    $45 = (($44) - ($$0))|0;
    HEAP32[$43>>2] = $45;
    $46 = HEAP32[$13>>2]|0;
    $47 = $$150;
    HEAP32[$vararg_buffer3>>2] = $46;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $47;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $$1;
    $48 = (___syscall146(146,($vararg_buffer3|0))|0);
    $49 = (___syscall_ret($48)|0);
    $50 = ($34|0)==($49|0);
    if ($50) {
     label = 3;
     break L1;
    } else {
     $$04756 = $$1;$$04855 = $34;$$04954 = $$150;$26 = $49;
    }
   }
   $27 = ((($0)) + 16|0);
   HEAP32[$27>>2] = 0;
   HEAP32[$4>>2] = 0;
   HEAP32[$7>>2] = 0;
   $28 = HEAP32[$0>>2]|0;
   $29 = $28 | 32;
   HEAP32[$0>>2] = $29;
   $30 = ($$04756|0)==(2);
   if ($30) {
    $$051 = 0;
   } else {
    $31 = ((($$04954)) + 4|0);
    $32 = HEAP32[$31>>2]|0;
    $33 = (($2) - ($32))|0;
    $$051 = $33;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $19 = ((($0)) + 44|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ((($0)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($0)) + 16|0);
  HEAP32[$24>>2] = $23;
  HEAP32[$4>>2] = $20;
  HEAP32[$7>>2] = $20;
  $$051 = $2;
 }
 STACKTOP = sp;return ($$051|0);
}
function ___stdio_seek($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $4 = ((($0)) + 60|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $6;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $2;
 $7 = (___syscall140(140,($vararg_buffer|0))|0);
 $8 = (___syscall_ret($7)|0);
 $9 = ($8|0)<(0);
 if ($9) {
  HEAP32[$3>>2] = -1;
  $10 = -1;
 } else {
  $$pre = HEAP32[$3>>2]|0;
  $10 = $$pre;
 }
 STACKTOP = sp;return ($10|0);
}
function ___syscall_ret($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0>>>0)>(4294963200);
 if ($1) {
  $2 = (0 - ($0))|0;
  $3 = (___errno_location()|0);
  HEAP32[$3>>2] = $2;
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (___pthread_self_108()|0);
 $1 = ((($0)) + 64|0);
 return ($1|0);
}
function ___pthread_self_108() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (4680|0);
}
function _dummy_738($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($0|0);
}
function ___stdout_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0;
 $vararg_buffer = sp;
 $3 = sp + 16|0;
 $4 = ((($0)) + 36|0);
 HEAP32[$4>>2] = 1;
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 64;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($0)) + 60|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $3;
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21523;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $10;
  $11 = (___syscall54(54,($vararg_buffer|0))|0);
  $12 = ($11|0)==(0);
  if (!($12)) {
   $13 = ((($0)) + 75|0);
   HEAP8[$13>>0] = -1;
  }
 }
 $14 = (___stdio_write($0,$1,$2)|0);
 STACKTOP = sp;return ($14|0);
}
function _strcmp($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$0>>0]|0;
 $3 = HEAP8[$1>>0]|0;
 $4 = ($2<<24>>24)!=($3<<24>>24);
 $5 = ($2<<24>>24)==(0);
 $or$cond9 = $5 | $4;
 if ($or$cond9) {
  $$lcssa = $3;$$lcssa8 = $2;
 } else {
  $$011 = $1;$$0710 = $0;
  while(1) {
   $6 = ((($$0710)) + 1|0);
   $7 = ((($$011)) + 1|0);
   $8 = HEAP8[$6>>0]|0;
   $9 = HEAP8[$7>>0]|0;
   $10 = ($8<<24>>24)!=($9<<24>>24);
   $11 = ($8<<24>>24)==(0);
   $or$cond = $11 | $10;
   if ($or$cond) {
    $$lcssa = $9;$$lcssa8 = $8;
    break;
   } else {
    $$011 = $7;$$0710 = $6;
   }
  }
 }
 $12 = $$lcssa8&255;
 $13 = $$lcssa&255;
 $14 = (($12) - ($13))|0;
 return ($14|0);
}
function _vfprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$0 = 0, $$1 = 0, $$1$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0;
 $3 = sp + 120|0;
 $4 = sp + 80|0;
 $5 = sp;
 $6 = sp + 136|0;
 dest=$4; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $vacopy_currentptr;
 $7 = (_printf_core(0,$1,$3,$5,$4)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  $$0 = -1;
 } else {
  $9 = ((($0)) + 76|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)>(-1);
  if ($11) {
   $12 = (___lockfile($0)|0);
   $40 = $12;
  } else {
   $40 = 0;
  }
  $13 = HEAP32[$0>>2]|0;
  $14 = $13 & 32;
  $15 = ((($0)) + 74|0);
  $16 = HEAP8[$15>>0]|0;
  $17 = ($16<<24>>24)<(1);
  if ($17) {
   $18 = $13 & -33;
   HEAP32[$0>>2] = $18;
  }
  $19 = ((($0)) + 48|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(0);
  if ($21) {
   $23 = ((($0)) + 44|0);
   $24 = HEAP32[$23>>2]|0;
   HEAP32[$23>>2] = $6;
   $25 = ((($0)) + 28|0);
   HEAP32[$25>>2] = $6;
   $26 = ((($0)) + 20|0);
   HEAP32[$26>>2] = $6;
   HEAP32[$19>>2] = 80;
   $27 = ((($6)) + 80|0);
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = $27;
   $29 = (_printf_core($0,$1,$3,$5,$4)|0);
   $30 = ($24|0)==(0|0);
   if ($30) {
    $$1 = $29;
   } else {
    $31 = ((($0)) + 36|0);
    $32 = HEAP32[$31>>2]|0;
    (FUNCTION_TABLE_iiii[$32 & 7]($0,0,0)|0);
    $33 = HEAP32[$26>>2]|0;
    $34 = ($33|0)==(0|0);
    $$ = $34 ? -1 : $29;
    HEAP32[$23>>2] = $24;
    HEAP32[$19>>2] = 0;
    HEAP32[$28>>2] = 0;
    HEAP32[$25>>2] = 0;
    HEAP32[$26>>2] = 0;
    $$1 = $$;
   }
  } else {
   $22 = (_printf_core($0,$1,$3,$5,$4)|0);
   $$1 = $22;
  }
  $35 = HEAP32[$0>>2]|0;
  $36 = $35 & 32;
  $37 = ($36|0)==(0);
  $$1$ = $37 ? $$1 : -1;
  $38 = $35 | $14;
  HEAP32[$0>>2] = $38;
  $39 = ($40|0)==(0);
  if (!($39)) {
   ___unlockfile($0);
  }
  $$0 = $$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$$ = 0, $$$0259 = 0, $$$0262 = 0, $$$0269 = 0, $$$4266 = 0, $$$5 = 0, $$0 = 0, $$0228 = 0, $$0228$ = 0, $$0229322 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa357 = 0, $$0240321 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0;
 var $$0249306 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0254$$0254$ = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262311 = 0, $$0269 = 0, $$0269$phi = 0, $$1 = 0, $$1230333 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241332 = 0, $$1244320 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0;
 var $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242305 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2256$ = 0, $$2256$$$2256 = 0, $$2261 = 0, $$2271 = 0, $$284$ = 0, $$289 = 0, $$290 = 0, $$3257 = 0, $$3265 = 0;
 var $$3272 = 0, $$3303 = 0, $$377 = 0, $$4258355 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa295 = 0, $$pre = 0, $$pre346 = 0, $$pre347 = 0, $$pre347$pre = 0, $$pre349 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0;
 var $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0;
 var $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0;
 var $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0;
 var $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0;
 var $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0;
 var $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0;
 var $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0;
 var $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0;
 var $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0;
 var $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0;
 var $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0;
 var $306 = 0.0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0;
 var $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $isdigit = 0, $isdigit275 = 0, $isdigit277 = 0, $isdigittmp = 0, $isdigittmp$ = 0, $isdigittmp274 = 0;
 var $isdigittmp276 = 0, $narrow = 0, $or$cond = 0, $or$cond281 = 0, $or$cond283 = 0, $or$cond286 = 0, $storemerge = 0, $storemerge273310 = 0, $storemerge278 = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $5 = sp + 16|0;
 $6 = sp;
 $7 = sp + 24|0;
 $8 = sp + 8|0;
 $9 = sp + 20|0;
 HEAP32[$5>>2] = $1;
 $10 = ($0|0)!=(0|0);
 $11 = ((($7)) + 40|0);
 $12 = $11;
 $13 = ((($7)) + 39|0);
 $14 = ((($8)) + 4|0);
 $$0243 = 0;$$0247 = 0;$$0269 = 0;$21 = $1;
 L1: while(1) {
  $15 = ($$0247|0)>(-1);
  do {
   if ($15) {
    $16 = (2147483647 - ($$0247))|0;
    $17 = ($$0243|0)>($16|0);
    if ($17) {
     $18 = (___errno_location()|0);
     HEAP32[$18>>2] = 75;
     $$1248 = -1;
     break;
    } else {
     $19 = (($$0243) + ($$0247))|0;
     $$1248 = $19;
     break;
    }
   } else {
    $$1248 = $$0247;
   }
  } while(0);
  $20 = HEAP8[$21>>0]|0;
  $22 = ($20<<24>>24)==(0);
  if ($22) {
   label = 87;
   break;
  } else {
   $23 = $20;$25 = $21;
  }
  L9: while(1) {
   switch ($23<<24>>24) {
   case 37:  {
    $$0249306 = $25;$27 = $25;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $$0249$lcssa = $25;$39 = $25;
    break L9;
    break;
   }
   default: {
   }
   }
   $24 = ((($25)) + 1|0);
   HEAP32[$5>>2] = $24;
   $$pre = HEAP8[$24>>0]|0;
   $23 = $$pre;$25 = $24;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $26 = ((($27)) + 1|0);
     $28 = HEAP8[$26>>0]|0;
     $29 = ($28<<24>>24)==(37);
     if (!($29)) {
      $$0249$lcssa = $$0249306;$39 = $27;
      break L12;
     }
     $30 = ((($$0249306)) + 1|0);
     $31 = ((($27)) + 2|0);
     HEAP32[$5>>2] = $31;
     $32 = HEAP8[$31>>0]|0;
     $33 = ($32<<24>>24)==(37);
     if ($33) {
      $$0249306 = $30;$27 = $31;
      label = 9;
     } else {
      $$0249$lcssa = $30;$39 = $31;
      break;
     }
    }
   }
  } while(0);
  $34 = $$0249$lcssa;
  $35 = $21;
  $36 = (($34) - ($35))|0;
  if ($10) {
   _out($0,$21,$36);
  }
  $37 = ($36|0)==(0);
  if (!($37)) {
   $$0269$phi = $$0269;$$0243 = $36;$$0247 = $$1248;$21 = $39;$$0269 = $$0269$phi;
   continue;
  }
  $38 = ((($39)) + 1|0);
  $40 = HEAP8[$38>>0]|0;
  $41 = $40 << 24 >> 24;
  $isdigittmp = (($41) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $42 = ((($39)) + 2|0);
   $43 = HEAP8[$42>>0]|0;
   $44 = ($43<<24>>24)==(36);
   $45 = ((($39)) + 3|0);
   $$377 = $44 ? $45 : $38;
   $$$0269 = $44 ? 1 : $$0269;
   $isdigittmp$ = $44 ? $isdigittmp : -1;
   $$0253 = $isdigittmp$;$$1270 = $$$0269;$storemerge = $$377;
  } else {
   $$0253 = -1;$$1270 = $$0269;$storemerge = $38;
  }
  HEAP32[$5>>2] = $storemerge;
  $46 = HEAP8[$storemerge>>0]|0;
  $47 = $46 << 24 >> 24;
  $48 = (($47) + -32)|0;
  $49 = ($48>>>0)<(32);
  L24: do {
   if ($49) {
    $$0262311 = 0;$329 = $46;$51 = $48;$storemerge273310 = $storemerge;
    while(1) {
     $50 = 1 << $51;
     $52 = $50 & 75913;
     $53 = ($52|0)==(0);
     if ($53) {
      $$0262$lcssa = $$0262311;$$lcssa295 = $329;$62 = $storemerge273310;
      break L24;
     }
     $54 = $50 | $$0262311;
     $55 = ((($storemerge273310)) + 1|0);
     HEAP32[$5>>2] = $55;
     $56 = HEAP8[$55>>0]|0;
     $57 = $56 << 24 >> 24;
     $58 = (($57) + -32)|0;
     $59 = ($58>>>0)<(32);
     if ($59) {
      $$0262311 = $54;$329 = $56;$51 = $58;$storemerge273310 = $55;
     } else {
      $$0262$lcssa = $54;$$lcssa295 = $56;$62 = $55;
      break;
     }
    }
   } else {
    $$0262$lcssa = 0;$$lcssa295 = $46;$62 = $storemerge;
   }
  } while(0);
  $60 = ($$lcssa295<<24>>24)==(42);
  if ($60) {
   $61 = ((($62)) + 1|0);
   $63 = HEAP8[$61>>0]|0;
   $64 = $63 << 24 >> 24;
   $isdigittmp276 = (($64) + -48)|0;
   $isdigit277 = ($isdigittmp276>>>0)<(10);
   if ($isdigit277) {
    $65 = ((($62)) + 2|0);
    $66 = HEAP8[$65>>0]|0;
    $67 = ($66<<24>>24)==(36);
    if ($67) {
     $68 = (($4) + ($isdigittmp276<<2)|0);
     HEAP32[$68>>2] = 10;
     $69 = HEAP8[$61>>0]|0;
     $70 = $69 << 24 >> 24;
     $71 = (($70) + -48)|0;
     $72 = (($3) + ($71<<3)|0);
     $73 = $72;
     $74 = $73;
     $75 = HEAP32[$74>>2]|0;
     $76 = (($73) + 4)|0;
     $77 = $76;
     $78 = HEAP32[$77>>2]|0;
     $79 = ((($62)) + 3|0);
     $$0259 = $75;$$2271 = 1;$storemerge278 = $79;
    } else {
     label = 23;
    }
   } else {
    label = 23;
   }
   if ((label|0) == 23) {
    label = 0;
    $80 = ($$1270|0)==(0);
    if (!($80)) {
     $$0 = -1;
     break;
    }
    if ($10) {
     $arglist_current = HEAP32[$2>>2]|0;
     $81 = $arglist_current;
     $82 = ((0) + 4|0);
     $expanded4 = $82;
     $expanded = (($expanded4) - 1)|0;
     $83 = (($81) + ($expanded))|0;
     $84 = ((0) + 4|0);
     $expanded8 = $84;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $85 = $83 & $expanded6;
     $86 = $85;
     $87 = HEAP32[$86>>2]|0;
     $arglist_next = ((($86)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     $$0259 = $87;$$2271 = 0;$storemerge278 = $61;
    } else {
     $$0259 = 0;$$2271 = 0;$storemerge278 = $61;
    }
   }
   HEAP32[$5>>2] = $storemerge278;
   $88 = ($$0259|0)<(0);
   $89 = $$0262$lcssa | 8192;
   $90 = (0 - ($$0259))|0;
   $$$0262 = $88 ? $89 : $$0262$lcssa;
   $$$0259 = $88 ? $90 : $$0259;
   $$1260 = $$$0259;$$1263 = $$$0262;$$3272 = $$2271;$94 = $storemerge278;
  } else {
   $91 = (_getint($5)|0);
   $92 = ($91|0)<(0);
   if ($92) {
    $$0 = -1;
    break;
   }
   $$pre346 = HEAP32[$5>>2]|0;
   $$1260 = $91;$$1263 = $$0262$lcssa;$$3272 = $$1270;$94 = $$pre346;
  }
  $93 = HEAP8[$94>>0]|0;
  $95 = ($93<<24>>24)==(46);
  do {
   if ($95) {
    $96 = ((($94)) + 1|0);
    $97 = HEAP8[$96>>0]|0;
    $98 = ($97<<24>>24)==(42);
    if (!($98)) {
     $125 = ((($94)) + 1|0);
     HEAP32[$5>>2] = $125;
     $126 = (_getint($5)|0);
     $$pre347$pre = HEAP32[$5>>2]|0;
     $$0254 = $126;$$pre347 = $$pre347$pre;
     break;
    }
    $99 = ((($94)) + 2|0);
    $100 = HEAP8[$99>>0]|0;
    $101 = $100 << 24 >> 24;
    $isdigittmp274 = (($101) + -48)|0;
    $isdigit275 = ($isdigittmp274>>>0)<(10);
    if ($isdigit275) {
     $102 = ((($94)) + 3|0);
     $103 = HEAP8[$102>>0]|0;
     $104 = ($103<<24>>24)==(36);
     if ($104) {
      $105 = (($4) + ($isdigittmp274<<2)|0);
      HEAP32[$105>>2] = 10;
      $106 = HEAP8[$99>>0]|0;
      $107 = $106 << 24 >> 24;
      $108 = (($107) + -48)|0;
      $109 = (($3) + ($108<<3)|0);
      $110 = $109;
      $111 = $110;
      $112 = HEAP32[$111>>2]|0;
      $113 = (($110) + 4)|0;
      $114 = $113;
      $115 = HEAP32[$114>>2]|0;
      $116 = ((($94)) + 4|0);
      HEAP32[$5>>2] = $116;
      $$0254 = $112;$$pre347 = $116;
      break;
     }
    }
    $117 = ($$3272|0)==(0);
    if (!($117)) {
     $$0 = -1;
     break L1;
    }
    if ($10) {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $118 = $arglist_current2;
     $119 = ((0) + 4|0);
     $expanded11 = $119;
     $expanded10 = (($expanded11) - 1)|0;
     $120 = (($118) + ($expanded10))|0;
     $121 = ((0) + 4|0);
     $expanded15 = $121;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $122 = $120 & $expanded13;
     $123 = $122;
     $124 = HEAP32[$123>>2]|0;
     $arglist_next3 = ((($123)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $330 = $124;
    } else {
     $330 = 0;
    }
    HEAP32[$5>>2] = $99;
    $$0254 = $330;$$pre347 = $99;
   } else {
    $$0254 = -1;$$pre347 = $94;
   }
  } while(0);
  $$0252 = 0;$128 = $$pre347;
  while(1) {
   $127 = HEAP8[$128>>0]|0;
   $129 = $127 << 24 >> 24;
   $130 = (($129) + -65)|0;
   $131 = ($130>>>0)>(57);
   if ($131) {
    $$0 = -1;
    break L1;
   }
   $132 = ((($128)) + 1|0);
   HEAP32[$5>>2] = $132;
   $133 = HEAP8[$128>>0]|0;
   $134 = $133 << 24 >> 24;
   $135 = (($134) + -65)|0;
   $136 = ((8575 + (($$0252*58)|0)|0) + ($135)|0);
   $137 = HEAP8[$136>>0]|0;
   $138 = $137&255;
   $139 = (($138) + -1)|0;
   $140 = ($139>>>0)<(8);
   if ($140) {
    $$0252 = $138;$128 = $132;
   } else {
    break;
   }
  }
  $141 = ($137<<24>>24)==(0);
  if ($141) {
   $$0 = -1;
   break;
  }
  $142 = ($137<<24>>24)==(19);
  $143 = ($$0253|0)>(-1);
  do {
   if ($142) {
    if ($143) {
     $$0 = -1;
     break L1;
    } else {
     label = 49;
    }
   } else {
    if ($143) {
     $144 = (($4) + ($$0253<<2)|0);
     HEAP32[$144>>2] = $138;
     $145 = (($3) + ($$0253<<3)|0);
     $146 = $145;
     $147 = $146;
     $148 = HEAP32[$147>>2]|0;
     $149 = (($146) + 4)|0;
     $150 = $149;
     $151 = HEAP32[$150>>2]|0;
     $152 = $6;
     $153 = $152;
     HEAP32[$153>>2] = $148;
     $154 = (($152) + 4)|0;
     $155 = $154;
     HEAP32[$155>>2] = $151;
     label = 49;
     break;
    }
    if (!($10)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg($6,$138,$2);
   }
  } while(0);
  if ((label|0) == 49) {
   label = 0;
   if (!($10)) {
    $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
    continue;
   }
  }
  $156 = HEAP8[$128>>0]|0;
  $157 = $156 << 24 >> 24;
  $158 = ($$0252|0)!=(0);
  $159 = $157 & 15;
  $160 = ($159|0)==(3);
  $or$cond281 = $158 & $160;
  $161 = $157 & -33;
  $$0235 = $or$cond281 ? $161 : $157;
  $162 = $$1263 & 8192;
  $163 = ($162|0)==(0);
  $164 = $$1263 & -65537;
  $$1263$ = $163 ? $$1263 : $164;
  L71: do {
   switch ($$0235|0) {
   case 110:  {
    $trunc = $$0252&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $171 = HEAP32[$6>>2]|0;
     HEAP32[$171>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 1:  {
     $172 = HEAP32[$6>>2]|0;
     HEAP32[$172>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 2:  {
     $173 = ($$1248|0)<(0);
     $174 = $173 << 31 >> 31;
     $175 = HEAP32[$6>>2]|0;
     $176 = $175;
     $177 = $176;
     HEAP32[$177>>2] = $$1248;
     $178 = (($176) + 4)|0;
     $179 = $178;
     HEAP32[$179>>2] = $174;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 3:  {
     $180 = $$1248&65535;
     $181 = HEAP32[$6>>2]|0;
     HEAP16[$181>>1] = $180;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 4:  {
     $182 = $$1248&255;
     $183 = HEAP32[$6>>2]|0;
     HEAP8[$183>>0] = $182;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 6:  {
     $184 = HEAP32[$6>>2]|0;
     HEAP32[$184>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 7:  {
     $185 = ($$1248|0)<(0);
     $186 = $185 << 31 >> 31;
     $187 = HEAP32[$6>>2]|0;
     $188 = $187;
     $189 = $188;
     HEAP32[$189>>2] = $$1248;
     $190 = (($188) + 4)|0;
     $191 = $190;
     HEAP32[$191>>2] = $186;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    default: {
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $192 = ($$0254>>>0)>(8);
    $193 = $192 ? $$0254 : 8;
    $194 = $$1263$ | 8;
    $$1236 = 120;$$1255 = $193;$$3265 = $194;
    label = 61;
    break;
   }
   case 88: case 120:  {
    $$1236 = $$0235;$$1255 = $$0254;$$3265 = $$1263$;
    label = 61;
    break;
   }
   case 111:  {
    $210 = $6;
    $211 = $210;
    $212 = HEAP32[$211>>2]|0;
    $213 = (($210) + 4)|0;
    $214 = $213;
    $215 = HEAP32[$214>>2]|0;
    $216 = (_fmt_o($212,$215,$11)|0);
    $217 = $$1263$ & 8;
    $218 = ($217|0)==(0);
    $219 = $216;
    $220 = (($12) - ($219))|0;
    $221 = ($$0254|0)>($220|0);
    $222 = (($220) + 1)|0;
    $223 = $218 | $221;
    $$0254$$0254$ = $223 ? $$0254 : $222;
    $$0228 = $216;$$1233 = 0;$$1238 = 9039;$$2256 = $$0254$$0254$;$$4266 = $$1263$;$248 = $212;$250 = $215;
    label = 67;
    break;
   }
   case 105: case 100:  {
    $224 = $6;
    $225 = $224;
    $226 = HEAP32[$225>>2]|0;
    $227 = (($224) + 4)|0;
    $228 = $227;
    $229 = HEAP32[$228>>2]|0;
    $230 = ($229|0)<(0);
    if ($230) {
     $231 = (_i64Subtract(0,0,($226|0),($229|0))|0);
     $232 = tempRet0;
     $233 = $6;
     $234 = $233;
     HEAP32[$234>>2] = $231;
     $235 = (($233) + 4)|0;
     $236 = $235;
     HEAP32[$236>>2] = $232;
     $$0232 = 1;$$0237 = 9039;$242 = $231;$243 = $232;
     label = 66;
     break L71;
    } else {
     $237 = $$1263$ & 2048;
     $238 = ($237|0)==(0);
     $239 = $$1263$ & 1;
     $240 = ($239|0)==(0);
     $$ = $240 ? 9039 : (9041);
     $$$ = $238 ? $$ : (9040);
     $241 = $$1263$ & 2049;
     $narrow = ($241|0)!=(0);
     $$284$ = $narrow&1;
     $$0232 = $$284$;$$0237 = $$$;$242 = $226;$243 = $229;
     label = 66;
     break L71;
    }
    break;
   }
   case 117:  {
    $165 = $6;
    $166 = $165;
    $167 = HEAP32[$166>>2]|0;
    $168 = (($165) + 4)|0;
    $169 = $168;
    $170 = HEAP32[$169>>2]|0;
    $$0232 = 0;$$0237 = 9039;$242 = $167;$243 = $170;
    label = 66;
    break;
   }
   case 99:  {
    $259 = $6;
    $260 = $259;
    $261 = HEAP32[$260>>2]|0;
    $262 = (($259) + 4)|0;
    $263 = $262;
    $264 = HEAP32[$263>>2]|0;
    $265 = $261&255;
    HEAP8[$13>>0] = $265;
    $$2 = $13;$$2234 = 0;$$2239 = 9039;$$2251 = $11;$$5 = 1;$$6268 = $164;
    break;
   }
   case 109:  {
    $266 = (___errno_location()|0);
    $267 = HEAP32[$266>>2]|0;
    $268 = (_strerror($267)|0);
    $$1 = $268;
    label = 71;
    break;
   }
   case 115:  {
    $269 = HEAP32[$6>>2]|0;
    $270 = ($269|0)!=(0|0);
    $271 = $270 ? $269 : 9049;
    $$1 = $271;
    label = 71;
    break;
   }
   case 67:  {
    $278 = $6;
    $279 = $278;
    $280 = HEAP32[$279>>2]|0;
    $281 = (($278) + 4)|0;
    $282 = $281;
    $283 = HEAP32[$282>>2]|0;
    HEAP32[$8>>2] = $280;
    HEAP32[$14>>2] = 0;
    HEAP32[$6>>2] = $8;
    $$4258355 = -1;$331 = $8;
    label = 75;
    break;
   }
   case 83:  {
    $$pre349 = HEAP32[$6>>2]|0;
    $284 = ($$0254|0)==(0);
    if ($284) {
     _pad_674($0,32,$$1260,0,$$1263$);
     $$0240$lcssa357 = 0;
     label = 84;
    } else {
     $$4258355 = $$0254;$331 = $$pre349;
     label = 75;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $306 = +HEAPF64[$6>>3];
    $307 = (_fmt_fp($0,$306,$$1260,$$0254,$$1263$,$$0235)|0);
    $$0243 = $307;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
    continue L1;
    break;
   }
   default: {
    $$2 = $21;$$2234 = 0;$$2239 = 9039;$$2251 = $11;$$5 = $$0254;$$6268 = $$1263$;
   }
   }
  } while(0);
  L95: do {
   if ((label|0) == 61) {
    label = 0;
    $195 = $6;
    $196 = $195;
    $197 = HEAP32[$196>>2]|0;
    $198 = (($195) + 4)|0;
    $199 = $198;
    $200 = HEAP32[$199>>2]|0;
    $201 = $$1236 & 32;
    $202 = (_fmt_x($197,$200,$11,$201)|0);
    $203 = ($197|0)==(0);
    $204 = ($200|0)==(0);
    $205 = $203 & $204;
    $206 = $$3265 & 8;
    $207 = ($206|0)==(0);
    $or$cond283 = $207 | $205;
    $208 = $$1236 >> 4;
    $209 = (9039 + ($208)|0);
    $$289 = $or$cond283 ? 9039 : $209;
    $$290 = $or$cond283 ? 0 : 2;
    $$0228 = $202;$$1233 = $$290;$$1238 = $$289;$$2256 = $$1255;$$4266 = $$3265;$248 = $197;$250 = $200;
    label = 67;
   }
   else if ((label|0) == 66) {
    label = 0;
    $244 = (_fmt_u($242,$243,$11)|0);
    $$0228 = $244;$$1233 = $$0232;$$1238 = $$0237;$$2256 = $$0254;$$4266 = $$1263$;$248 = $242;$250 = $243;
    label = 67;
   }
   else if ((label|0) == 71) {
    label = 0;
    $272 = (_memchr($$1,0,$$0254)|0);
    $273 = ($272|0)==(0|0);
    $274 = $272;
    $275 = $$1;
    $276 = (($274) - ($275))|0;
    $277 = (($$1) + ($$0254)|0);
    $$3257 = $273 ? $$0254 : $276;
    $$1250 = $273 ? $277 : $272;
    $$2 = $$1;$$2234 = 0;$$2239 = 9039;$$2251 = $$1250;$$5 = $$3257;$$6268 = $164;
   }
   else if ((label|0) == 75) {
    label = 0;
    $$0229322 = $331;$$0240321 = 0;$$1244320 = 0;
    while(1) {
     $285 = HEAP32[$$0229322>>2]|0;
     $286 = ($285|0)==(0);
     if ($286) {
      $$0240$lcssa = $$0240321;$$2245 = $$1244320;
      break;
     }
     $287 = (_wctomb($9,$285)|0);
     $288 = ($287|0)<(0);
     $289 = (($$4258355) - ($$0240321))|0;
     $290 = ($287>>>0)>($289>>>0);
     $or$cond286 = $288 | $290;
     if ($or$cond286) {
      $$0240$lcssa = $$0240321;$$2245 = $287;
      break;
     }
     $291 = ((($$0229322)) + 4|0);
     $292 = (($287) + ($$0240321))|0;
     $293 = ($$4258355>>>0)>($292>>>0);
     if ($293) {
      $$0229322 = $291;$$0240321 = $292;$$1244320 = $287;
     } else {
      $$0240$lcssa = $292;$$2245 = $287;
      break;
     }
    }
    $294 = ($$2245|0)<(0);
    if ($294) {
     $$0 = -1;
     break L1;
    }
    _pad_674($0,32,$$1260,$$0240$lcssa,$$1263$);
    $295 = ($$0240$lcssa|0)==(0);
    if ($295) {
     $$0240$lcssa357 = 0;
     label = 84;
    } else {
     $$1230333 = $331;$$1241332 = 0;
     while(1) {
      $296 = HEAP32[$$1230333>>2]|0;
      $297 = ($296|0)==(0);
      if ($297) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break L95;
      }
      $298 = (_wctomb($9,$296)|0);
      $299 = (($298) + ($$1241332))|0;
      $300 = ($299|0)>($$0240$lcssa|0);
      if ($300) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break L95;
      }
      $301 = ((($$1230333)) + 4|0);
      _out($0,$9,$298);
      $302 = ($299>>>0)<($$0240$lcssa>>>0);
      if ($302) {
       $$1230333 = $301;$$1241332 = $299;
      } else {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 67) {
   label = 0;
   $245 = ($$2256|0)>(-1);
   $246 = $$4266 & -65537;
   $$$4266 = $245 ? $246 : $$4266;
   $247 = ($248|0)!=(0);
   $249 = ($250|0)!=(0);
   $251 = $247 | $249;
   $252 = ($$2256|0)!=(0);
   $or$cond = $252 | $251;
   $253 = $$0228;
   $254 = (($12) - ($253))|0;
   $255 = $251 ^ 1;
   $256 = $255&1;
   $257 = (($256) + ($254))|0;
   $258 = ($$2256|0)>($257|0);
   $$2256$ = $258 ? $$2256 : $257;
   $$2256$$$2256 = $or$cond ? $$2256$ : $$2256;
   $$0228$ = $or$cond ? $$0228 : $11;
   $$2 = $$0228$;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $11;$$5 = $$2256$$$2256;$$6268 = $$$4266;
  }
  else if ((label|0) == 84) {
   label = 0;
   $303 = $$1263$ ^ 8192;
   _pad_674($0,32,$$1260,$$0240$lcssa357,$303);
   $304 = ($$1260|0)>($$0240$lcssa357|0);
   $305 = $304 ? $$1260 : $$0240$lcssa357;
   $$0243 = $305;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
   continue;
  }
  $308 = $$2251;
  $309 = $$2;
  $310 = (($308) - ($309))|0;
  $311 = ($$5|0)<($310|0);
  $$$5 = $311 ? $310 : $$5;
  $312 = (($$$5) + ($$2234))|0;
  $313 = ($$1260|0)<($312|0);
  $$2261 = $313 ? $312 : $$1260;
  _pad_674($0,32,$$2261,$312,$$6268);
  _out($0,$$2239,$$2234);
  $314 = $$6268 ^ 65536;
  _pad_674($0,48,$$2261,$312,$314);
  _pad_674($0,48,$$$5,$310,0);
  _out($0,$$2,$310);
  $315 = $$6268 ^ 8192;
  _pad_674($0,32,$$2261,$312,$315);
  $$0243 = $$2261;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
 }
 L114: do {
  if ((label|0) == 87) {
   $316 = ($0|0)==(0|0);
   if ($316) {
    $317 = ($$0269|0)==(0);
    if ($317) {
     $$0 = 0;
    } else {
     $$2242305 = 1;
     while(1) {
      $318 = (($4) + ($$2242305<<2)|0);
      $319 = HEAP32[$318>>2]|0;
      $320 = ($319|0)==(0);
      if ($320) {
       $$3303 = $$2242305;
       break;
      }
      $321 = (($3) + ($$2242305<<3)|0);
      _pop_arg($321,$319,$2);
      $322 = (($$2242305) + 1)|0;
      $323 = ($322|0)<(10);
      if ($323) {
       $$2242305 = $322;
      } else {
       $$0 = 1;
       break L114;
      }
     }
     while(1) {
      $326 = (($4) + ($$3303<<2)|0);
      $327 = HEAP32[$326>>2]|0;
      $328 = ($327|0)==(0);
      $325 = (($$3303) + 1)|0;
      if (!($328)) {
       $$0 = -1;
       break L114;
      }
      $324 = ($325|0)<(10);
      if ($324) {
       $$3303 = $325;
      } else {
       $$0 = 1;
       break;
      }
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___lockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___unlockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _out($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = $3 & 32;
 $5 = ($4|0)==(0);
 if ($5) {
  (___fwritex($1,$2,$0)|0);
 }
 return;
}
function _getint($0) {
 $0 = $0|0;
 var $$0$lcssa = 0, $$06 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $isdigit = 0, $isdigit5 = 0, $isdigittmp = 0, $isdigittmp4 = 0, $isdigittmp7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $isdigittmp4 = (($3) + -48)|0;
 $isdigit5 = ($isdigittmp4>>>0)<(10);
 if ($isdigit5) {
  $$06 = 0;$7 = $1;$isdigittmp7 = $isdigittmp4;
  while(1) {
   $4 = ($$06*10)|0;
   $5 = (($isdigittmp7) + ($4))|0;
   $6 = ((($7)) + 1|0);
   HEAP32[$0>>2] = $6;
   $8 = HEAP8[$6>>0]|0;
   $9 = $8 << 24 >> 24;
   $isdigittmp = (($9) + -48)|0;
   $isdigit = ($isdigittmp>>>0)<(10);
   if ($isdigit) {
    $$06 = $5;$7 = $6;$isdigittmp7 = $isdigittmp;
   } else {
    $$0$lcssa = $5;
    break;
   }
  }
 } else {
  $$0$lcssa = 0;
 }
 return ($$0$lcssa|0);
}
function _pop_arg($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(20);
 L1: do {
  if (!($3)) {
   do {
    switch ($1|0) {
    case 9:  {
     $arglist_current = HEAP32[$2>>2]|0;
     $4 = $arglist_current;
     $5 = ((0) + 4|0);
     $expanded28 = $5;
     $expanded = (($expanded28) - 1)|0;
     $6 = (($4) + ($expanded))|0;
     $7 = ((0) + 4|0);
     $expanded32 = $7;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $8 = $6 & $expanded30;
     $9 = $8;
     $10 = HEAP32[$9>>2]|0;
     $arglist_next = ((($9)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     HEAP32[$0>>2] = $10;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $11 = $arglist_current2;
     $12 = ((0) + 4|0);
     $expanded35 = $12;
     $expanded34 = (($expanded35) - 1)|0;
     $13 = (($11) + ($expanded34))|0;
     $14 = ((0) + 4|0);
     $expanded39 = $14;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $15 = $13 & $expanded37;
     $16 = $15;
     $17 = HEAP32[$16>>2]|0;
     $arglist_next3 = ((($16)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $18 = ($17|0)<(0);
     $19 = $18 << 31 >> 31;
     $20 = $0;
     $21 = $20;
     HEAP32[$21>>2] = $17;
     $22 = (($20) + 4)|0;
     $23 = $22;
     HEAP32[$23>>2] = $19;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$2>>2]|0;
     $24 = $arglist_current5;
     $25 = ((0) + 4|0);
     $expanded42 = $25;
     $expanded41 = (($expanded42) - 1)|0;
     $26 = (($24) + ($expanded41))|0;
     $27 = ((0) + 4|0);
     $expanded46 = $27;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $28 = $26 & $expanded44;
     $29 = $28;
     $30 = HEAP32[$29>>2]|0;
     $arglist_next6 = ((($29)) + 4|0);
     HEAP32[$2>>2] = $arglist_next6;
     $31 = $0;
     $32 = $31;
     HEAP32[$32>>2] = $30;
     $33 = (($31) + 4)|0;
     $34 = $33;
     HEAP32[$34>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$2>>2]|0;
     $35 = $arglist_current8;
     $36 = ((0) + 8|0);
     $expanded49 = $36;
     $expanded48 = (($expanded49) - 1)|0;
     $37 = (($35) + ($expanded48))|0;
     $38 = ((0) + 8|0);
     $expanded53 = $38;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $39 = $37 & $expanded51;
     $40 = $39;
     $41 = $40;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $44 = (($41) + 4)|0;
     $45 = $44;
     $46 = HEAP32[$45>>2]|0;
     $arglist_next9 = ((($40)) + 8|0);
     HEAP32[$2>>2] = $arglist_next9;
     $47 = $0;
     $48 = $47;
     HEAP32[$48>>2] = $43;
     $49 = (($47) + 4)|0;
     $50 = $49;
     HEAP32[$50>>2] = $46;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$2>>2]|0;
     $51 = $arglist_current11;
     $52 = ((0) + 4|0);
     $expanded56 = $52;
     $expanded55 = (($expanded56) - 1)|0;
     $53 = (($51) + ($expanded55))|0;
     $54 = ((0) + 4|0);
     $expanded60 = $54;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $55 = $53 & $expanded58;
     $56 = $55;
     $57 = HEAP32[$56>>2]|0;
     $arglist_next12 = ((($56)) + 4|0);
     HEAP32[$2>>2] = $arglist_next12;
     $58 = $57&65535;
     $59 = $58 << 16 >> 16;
     $60 = ($59|0)<(0);
     $61 = $60 << 31 >> 31;
     $62 = $0;
     $63 = $62;
     HEAP32[$63>>2] = $59;
     $64 = (($62) + 4)|0;
     $65 = $64;
     HEAP32[$65>>2] = $61;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$2>>2]|0;
     $66 = $arglist_current14;
     $67 = ((0) + 4|0);
     $expanded63 = $67;
     $expanded62 = (($expanded63) - 1)|0;
     $68 = (($66) + ($expanded62))|0;
     $69 = ((0) + 4|0);
     $expanded67 = $69;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $70 = $68 & $expanded65;
     $71 = $70;
     $72 = HEAP32[$71>>2]|0;
     $arglist_next15 = ((($71)) + 4|0);
     HEAP32[$2>>2] = $arglist_next15;
     $$mask31 = $72 & 65535;
     $73 = $0;
     $74 = $73;
     HEAP32[$74>>2] = $$mask31;
     $75 = (($73) + 4)|0;
     $76 = $75;
     HEAP32[$76>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$2>>2]|0;
     $77 = $arglist_current17;
     $78 = ((0) + 4|0);
     $expanded70 = $78;
     $expanded69 = (($expanded70) - 1)|0;
     $79 = (($77) + ($expanded69))|0;
     $80 = ((0) + 4|0);
     $expanded74 = $80;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $81 = $79 & $expanded72;
     $82 = $81;
     $83 = HEAP32[$82>>2]|0;
     $arglist_next18 = ((($82)) + 4|0);
     HEAP32[$2>>2] = $arglist_next18;
     $84 = $83&255;
     $85 = $84 << 24 >> 24;
     $86 = ($85|0)<(0);
     $87 = $86 << 31 >> 31;
     $88 = $0;
     $89 = $88;
     HEAP32[$89>>2] = $85;
     $90 = (($88) + 4)|0;
     $91 = $90;
     HEAP32[$91>>2] = $87;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$2>>2]|0;
     $92 = $arglist_current20;
     $93 = ((0) + 4|0);
     $expanded77 = $93;
     $expanded76 = (($expanded77) - 1)|0;
     $94 = (($92) + ($expanded76))|0;
     $95 = ((0) + 4|0);
     $expanded81 = $95;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $96 = $94 & $expanded79;
     $97 = $96;
     $98 = HEAP32[$97>>2]|0;
     $arglist_next21 = ((($97)) + 4|0);
     HEAP32[$2>>2] = $arglist_next21;
     $$mask = $98 & 255;
     $99 = $0;
     $100 = $99;
     HEAP32[$100>>2] = $$mask;
     $101 = (($99) + 4)|0;
     $102 = $101;
     HEAP32[$102>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$2>>2]|0;
     $103 = $arglist_current23;
     $104 = ((0) + 8|0);
     $expanded84 = $104;
     $expanded83 = (($expanded84) - 1)|0;
     $105 = (($103) + ($expanded83))|0;
     $106 = ((0) + 8|0);
     $expanded88 = $106;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $107 = $105 & $expanded86;
     $108 = $107;
     $109 = +HEAPF64[$108>>3];
     $arglist_next24 = ((($108)) + 8|0);
     HEAP32[$2>>2] = $arglist_next24;
     HEAPF64[$0>>3] = $109;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$2>>2]|0;
     $110 = $arglist_current26;
     $111 = ((0) + 8|0);
     $expanded91 = $111;
     $expanded90 = (($expanded91) - 1)|0;
     $112 = (($110) + ($expanded90))|0;
     $113 = ((0) + 8|0);
     $expanded95 = $113;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $114 = $112 & $expanded93;
     $115 = $114;
     $116 = +HEAPF64[$115>>3];
     $arglist_next27 = ((($115)) + 8|0);
     HEAP32[$2>>2] = $arglist_next27;
     HEAPF64[$0>>3] = $116;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_x($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$05$lcssa = 0, $$056 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $4 = ($0|0)==(0);
 $5 = ($1|0)==(0);
 $6 = $4 & $5;
 if ($6) {
  $$05$lcssa = $2;
 } else {
  $$056 = $2;$15 = $1;$8 = $0;
  while(1) {
   $7 = $8 & 15;
   $9 = (9091 + ($7)|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10&255;
   $12 = $11 | $3;
   $13 = $12&255;
   $14 = ((($$056)) + -1|0);
   HEAP8[$14>>0] = $13;
   $16 = (_bitshift64Lshr(($8|0),($15|0),4)|0);
   $17 = tempRet0;
   $18 = ($16|0)==(0);
   $19 = ($17|0)==(0);
   $20 = $18 & $19;
   if ($20) {
    $$05$lcssa = $14;
    break;
   } else {
    $$056 = $14;$15 = $17;$8 = $16;
   }
  }
 }
 return ($$05$lcssa|0);
}
function _fmt_o($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0);
 $4 = ($1|0)==(0);
 $5 = $3 & $4;
 if ($5) {
  $$0$lcssa = $2;
 } else {
  $$06 = $2;$11 = $1;$7 = $0;
  while(1) {
   $6 = $7&255;
   $8 = $6 & 7;
   $9 = $8 | 48;
   $10 = ((($$06)) + -1|0);
   HEAP8[$10>>0] = $9;
   $12 = (_bitshift64Lshr(($7|0),($11|0),3)|0);
   $13 = tempRet0;
   $14 = ($12|0)==(0);
   $15 = ($13|0)==(0);
   $16 = $14 & $15;
   if ($16) {
    $$0$lcssa = $10;
    break;
   } else {
    $$06 = $10;$11 = $13;$7 = $12;
   }
  }
 }
 return ($$0$lcssa|0);
}
function _fmt_u($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(0);
 $4 = ($0>>>0)>(4294967295);
 $5 = ($1|0)==(0);
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;$8 = $0;$9 = $1;
  while(1) {
   $10 = (___uremdi3(($8|0),($9|0),10,0)|0);
   $11 = tempRet0;
   $12 = $10&255;
   $13 = $12 | 48;
   $14 = ((($$0914)) + -1|0);
   HEAP8[$14>>0] = $13;
   $15 = (___udivdi3(($8|0),($9|0),10,0)|0);
   $16 = tempRet0;
   $17 = ($9>>>0)>(9);
   $18 = ($8>>>0)>(4294967295);
   $19 = ($9|0)==(9);
   $20 = $19 & $18;
   $21 = $17 | $20;
   if ($21) {
    $$0914 = $14;$8 = $15;$9 = $16;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $15;$$09$lcssa = $14;
 } else {
  $$010$lcssa$off0 = $0;$$09$lcssa = $2;
 }
 $22 = ($$010$lcssa$off0|0)==(0);
 if ($22) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;$$111 = $$09$lcssa;
  while(1) {
   $23 = (($$012>>>0) % 10)&-1;
   $24 = $23 | 48;
   $25 = $24&255;
   $26 = ((($$111)) + -1|0);
   HEAP8[$26>>0] = $25;
   $27 = (($$012>>>0) / 10)&-1;
   $28 = ($$012>>>0)<(10);
   if ($28) {
    $$1$lcssa = $26;
    break;
   } else {
    $$012 = $27;$$111 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___pthread_self_105()|0);
 $2 = ((($1)) + 188|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (___strerror_l($0,$3)|0);
 return ($4|0);
}
function _memchr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5|0)!=(0);
 $7 = ($2|0)!=(0);
 $or$cond53 = $7 & $6;
 L1: do {
  if ($or$cond53) {
   $8 = $1&255;
   $$03555 = $0;$$03654 = $2;
   while(1) {
    $9 = HEAP8[$$03555>>0]|0;
    $10 = ($9<<24>>24)==($8<<24>>24);
    if ($10) {
     $$035$lcssa65 = $$03555;$$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = ((($$03555)) + 1|0);
    $12 = (($$03654) + -1)|0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14|0)!=(0);
    $16 = ($12|0)!=(0);
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;$$03654 = $12;
    } else {
     $$035$lcssa = $11;$$036$lcssa = $12;$$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;$$036$lcssa = $2;$$lcssa = $7;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;$$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   $$2 = $$035$lcssa;$$3 = 0;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $17 = HEAP8[$$035$lcssa65>>0]|0;
   $18 = $1&255;
   $19 = ($17<<24>>24)==($18<<24>>24);
   if ($19) {
    $$2 = $$035$lcssa65;$$3 = $$036$lcssa64;
   } else {
    $20 = Math_imul($3, 16843009)|0;
    $21 = ($$036$lcssa64>>>0)>(3);
    L11: do {
     if ($21) {
      $$046 = $$035$lcssa65;$$13745 = $$036$lcssa64;
      while(1) {
       $22 = HEAP32[$$046>>2]|0;
       $23 = $22 ^ $20;
       $24 = (($23) + -16843009)|0;
       $25 = $23 & -2139062144;
       $26 = $25 ^ -2139062144;
       $27 = $26 & $24;
       $28 = ($27|0)==(0);
       if (!($28)) {
        break;
       }
       $29 = ((($$046)) + 4|0);
       $30 = (($$13745) + -4)|0;
       $31 = ($30>>>0)>(3);
       if ($31) {
        $$046 = $29;$$13745 = $30;
       } else {
        $$0$lcssa = $29;$$137$lcssa = $30;
        label = 11;
        break L11;
       }
      }
      $$140 = $$046;$$23839 = $$13745;
     } else {
      $$0$lcssa = $$035$lcssa65;$$137$lcssa = $$036$lcssa64;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $32 = ($$137$lcssa|0)==(0);
     if ($32) {
      $$2 = $$0$lcssa;$$3 = 0;
      break;
     } else {
      $$140 = $$0$lcssa;$$23839 = $$137$lcssa;
     }
    }
    while(1) {
     $33 = HEAP8[$$140>>0]|0;
     $34 = ($33<<24>>24)==($18<<24>>24);
     if ($34) {
      $$2 = $$140;$$3 = $$23839;
      break L8;
     }
     $35 = ((($$140)) + 1|0);
     $36 = (($$23839) + -1)|0;
     $37 = ($36|0)==(0);
     if ($37) {
      $$2 = $35;$$3 = 0;
      break;
     } else {
      $$140 = $35;$$23839 = $36;
     }
    }
   }
  }
 } while(0);
 $38 = ($$3|0)!=(0);
 $39 = $38 ? $$2 : 0;
 return ($39|0);
}
function _pad_674($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$lcssa = 0, $$011 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0;
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6|0)==(0);
 $8 = ($2|0)>($3|0);
 $or$cond = $8 & $7;
 if ($or$cond) {
  $9 = (($2) - ($3))|0;
  $10 = ($9>>>0)<(256);
  $11 = $10 ? $9 : 256;
  _memset(($5|0),($1|0),($11|0))|0;
  $12 = ($9>>>0)>(255);
  if ($12) {
   $13 = (($2) - ($3))|0;
   $$011 = $9;
   while(1) {
    _out($0,$5,256);
    $14 = (($$011) + -256)|0;
    $15 = ($14>>>0)>(255);
    if ($15) {
     $$011 = $14;
    } else {
     break;
    }
   }
   $16 = $13 & 255;
   $$0$lcssa = $16;
  } else {
   $$0$lcssa = $9;
  }
  _out($0,$5,$$0$lcssa);
 }
 STACKTOP = sp;return;
}
function _wctomb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = (_wcrtomb($0,$1,0)|0);
  $$0 = $3;
 }
 return ($$0|0);
}
function _fmt_fp($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = +$1;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$ = 0, $$$ = 0, $$$$559 = 0.0, $$$3484 = 0, $$$3484691 = 0, $$$3484692 = 0, $$$3501 = 0, $$$4502 = 0, $$$542 = 0.0, $$$559 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463584 = 0, $$0464594 = 0, $$0471 = 0.0, $$0479 = 0, $$0487642 = 0, $$0488 = 0, $$0488653 = 0, $$0488655 = 0;
 var $$0496$$9 = 0, $$0497654 = 0, $$0498 = 0, $$0509582 = 0.0, $$0510 = 0, $$0511 = 0, $$0514637 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0525 = 0, $$0527 = 0, $$0527629 = 0, $$0527631 = 0, $$0530636 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0;
 var $$1480 = 0, $$1482$lcssa = 0, $$1482661 = 0, $$1489641 = 0, $$1499$lcssa = 0, $$1499660 = 0, $$1508583 = 0, $$1512$lcssa = 0, $$1512607 = 0, $$1515 = 0, $$1524 = 0, $$1526 = 0, $$1528614 = 0, $$1531$lcssa = 0, $$1531630 = 0, $$1598 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2476$$547 = 0;
 var $$2476$$549 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516618 = 0, $$2529 = 0, $$2532617 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484648 = 0, $$3501$lcssa = 0, $$3501647 = 0, $$3533613 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478590 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0;
 var $$5$lcssa = 0, $$534$ = 0, $$539 = 0, $$539$ = 0, $$542 = 0.0, $$546 = 0, $$548 = 0, $$5486$lcssa = 0, $$5486623 = 0, $$5493597 = 0, $$5519$ph = 0, $$555 = 0, $$556 = 0, $$559 = 0.0, $$5602 = 0, $$6 = 0, $$6494589 = 0, $$7495601 = 0, $$7505 = 0, $$7505$ = 0;
 var $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa673 = 0, $$neg = 0, $$neg567 = 0, $$pn = 0, $$pn566 = 0, $$pr = 0, $$pr564 = 0, $$pre = 0, $$pre$phi690Z2D = 0, $$pre689 = 0, $$sink545$lcssa = 0, $$sink545622 = 0, $$sink562 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0.0, $117 = 0.0, $118 = 0.0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0.0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0;
 var $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0.0, $229 = 0.0, $23 = 0;
 var $230 = 0, $231 = 0.0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0;
 var $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0;
 var $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0;
 var $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0.0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0.0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0.0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0.0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0;
 var $narrow = 0, $not$ = 0, $notlhs = 0, $notrhs = 0, $or$cond = 0, $or$cond3$not = 0, $or$cond537 = 0, $or$cond541 = 0, $or$cond544 = 0, $or$cond554 = 0, $or$cond6 = 0, $scevgep684 = 0, $scevgep684685 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560|0;
 $6 = sp + 8|0;
 $7 = sp;
 $8 = sp + 524|0;
 $9 = $8;
 $10 = sp + 512|0;
 HEAP32[$7>>2] = 0;
 $11 = ((($10)) + 12|0);
 (___DOUBLE_BITS_675($1)|0);
 $12 = tempRet0;
 $13 = ($12|0)<(0);
 if ($13) {
  $14 = -$1;
  $$0471 = $14;$$0520 = 1;$$0521 = 9056;
 } else {
  $15 = $4 & 2048;
  $16 = ($15|0)==(0);
  $17 = $4 & 1;
  $18 = ($17|0)==(0);
  $$ = $18 ? (9057) : (9062);
  $$$ = $16 ? $$ : (9059);
  $19 = $4 & 2049;
  $narrow = ($19|0)!=(0);
  $$534$ = $narrow&1;
  $$0471 = $1;$$0520 = $$534$;$$0521 = $$$;
 }
 (___DOUBLE_BITS_675($$0471)|0);
 $20 = tempRet0;
 $21 = $20 & 2146435072;
 $22 = ($21>>>0)<(2146435072);
 $23 = (0)<(0);
 $24 = ($21|0)==(2146435072);
 $25 = $24 & $23;
 $26 = $22 | $25;
 do {
  if ($26) {
   $35 = (+_frexpl($$0471,$7));
   $36 = $35 * 2.0;
   $37 = $36 != 0.0;
   if ($37) {
    $38 = HEAP32[$7>>2]|0;
    $39 = (($38) + -1)|0;
    HEAP32[$7>>2] = $39;
   }
   $40 = $5 | 32;
   $41 = ($40|0)==(97);
   if ($41) {
    $42 = $5 & 32;
    $43 = ($42|0)==(0);
    $44 = ((($$0521)) + 9|0);
    $$0521$ = $43 ? $$0521 : $44;
    $45 = $$0520 | 2;
    $46 = ($3>>>0)>(11);
    $47 = (12 - ($3))|0;
    $48 = ($47|0)==(0);
    $49 = $46 | $48;
    do {
     if ($49) {
      $$1472 = $36;
     } else {
      $$0509582 = 8.0;$$1508583 = $47;
      while(1) {
       $50 = (($$1508583) + -1)|0;
       $51 = $$0509582 * 16.0;
       $52 = ($50|0)==(0);
       if ($52) {
        break;
       } else {
        $$0509582 = $51;$$1508583 = $50;
       }
      }
      $53 = HEAP8[$$0521$>>0]|0;
      $54 = ($53<<24>>24)==(45);
      if ($54) {
       $55 = -$36;
       $56 = $55 - $51;
       $57 = $51 + $56;
       $58 = -$57;
       $$1472 = $58;
       break;
      } else {
       $59 = $36 + $51;
       $60 = $59 - $51;
       $$1472 = $60;
       break;
      }
     }
    } while(0);
    $61 = HEAP32[$7>>2]|0;
    $62 = ($61|0)<(0);
    $63 = (0 - ($61))|0;
    $64 = $62 ? $63 : $61;
    $65 = ($64|0)<(0);
    $66 = $65 << 31 >> 31;
    $67 = (_fmt_u($64,$66,$11)|0);
    $68 = ($67|0)==($11|0);
    if ($68) {
     $69 = ((($10)) + 11|0);
     HEAP8[$69>>0] = 48;
     $$0511 = $69;
    } else {
     $$0511 = $67;
    }
    $70 = $61 >> 31;
    $71 = $70 & 2;
    $72 = (($71) + 43)|0;
    $73 = $72&255;
    $74 = ((($$0511)) + -1|0);
    HEAP8[$74>>0] = $73;
    $75 = (($5) + 15)|0;
    $76 = $75&255;
    $77 = ((($$0511)) + -2|0);
    HEAP8[$77>>0] = $76;
    $notrhs = ($3|0)<(1);
    $78 = $4 & 8;
    $79 = ($78|0)==(0);
    $$0523 = $8;$$2473 = $$1472;
    while(1) {
     $80 = (~~(($$2473)));
     $81 = (9091 + ($80)|0);
     $82 = HEAP8[$81>>0]|0;
     $83 = $82&255;
     $84 = $83 | $42;
     $85 = $84&255;
     $86 = ((($$0523)) + 1|0);
     HEAP8[$$0523>>0] = $85;
     $87 = (+($80|0));
     $88 = $$2473 - $87;
     $89 = $88 * 16.0;
     $90 = $86;
     $91 = (($90) - ($9))|0;
     $92 = ($91|0)==(1);
     if ($92) {
      $notlhs = $89 == 0.0;
      $or$cond3$not = $notrhs & $notlhs;
      $or$cond = $79 & $or$cond3$not;
      if ($or$cond) {
       $$1524 = $86;
      } else {
       $93 = ((($$0523)) + 2|0);
       HEAP8[$86>>0] = 46;
       $$1524 = $93;
      }
     } else {
      $$1524 = $86;
     }
     $94 = $89 != 0.0;
     if ($94) {
      $$0523 = $$1524;$$2473 = $89;
     } else {
      break;
     }
    }
    $95 = ($3|0)!=(0);
    $96 = $77;
    $97 = $11;
    $98 = $$1524;
    $99 = (($98) - ($9))|0;
    $100 = (($97) - ($96))|0;
    $101 = (($99) + -2)|0;
    $102 = ($101|0)<($3|0);
    $or$cond537 = $95 & $102;
    $103 = (($3) + 2)|0;
    $$pn = $or$cond537 ? $103 : $99;
    $$0525 = (($100) + ($45))|0;
    $104 = (($$0525) + ($$pn))|0;
    _pad_674($0,32,$2,$104,$4);
    _out($0,$$0521$,$45);
    $105 = $4 ^ 65536;
    _pad_674($0,48,$2,$104,$105);
    _out($0,$8,$99);
    $106 = (($$pn) - ($99))|0;
    _pad_674($0,48,$106,0,0);
    _out($0,$77,$100);
    $107 = $4 ^ 8192;
    _pad_674($0,32,$2,$104,$107);
    $$sink562 = $104;
    break;
   }
   $108 = ($3|0)<(0);
   $$539 = $108 ? 6 : $3;
   if ($37) {
    $109 = $36 * 268435456.0;
    $110 = HEAP32[$7>>2]|0;
    $111 = (($110) + -28)|0;
    HEAP32[$7>>2] = $111;
    $$3 = $109;$$pr = $111;
   } else {
    $$pre = HEAP32[$7>>2]|0;
    $$3 = $36;$$pr = $$pre;
   }
   $112 = ($$pr|0)<(0);
   $113 = ((($6)) + 288|0);
   $$556 = $112 ? $6 : $113;
   $$0498 = $$556;$$4 = $$3;
   while(1) {
    $114 = (~~(($$4))>>>0);
    HEAP32[$$0498>>2] = $114;
    $115 = ((($$0498)) + 4|0);
    $116 = (+($114>>>0));
    $117 = $$4 - $116;
    $118 = $117 * 1.0E+9;
    $119 = $118 != 0.0;
    if ($119) {
     $$0498 = $115;$$4 = $118;
    } else {
     break;
    }
   }
   $120 = ($$pr|0)>(0);
   if ($120) {
    $$1482661 = $$556;$$1499660 = $115;$122 = $$pr;
    while(1) {
     $121 = ($122|0)<(29);
     $123 = $121 ? $122 : 29;
     $$0488653 = ((($$1499660)) + -4|0);
     $124 = ($$0488653>>>0)<($$1482661>>>0);
     if ($124) {
      $$2483$ph = $$1482661;
     } else {
      $$0488655 = $$0488653;$$0497654 = 0;
      while(1) {
       $125 = HEAP32[$$0488655>>2]|0;
       $126 = (_bitshift64Shl(($125|0),0,($123|0))|0);
       $127 = tempRet0;
       $128 = (_i64Add(($126|0),($127|0),($$0497654|0),0)|0);
       $129 = tempRet0;
       $130 = (___uremdi3(($128|0),($129|0),1000000000,0)|0);
       $131 = tempRet0;
       HEAP32[$$0488655>>2] = $130;
       $132 = (___udivdi3(($128|0),($129|0),1000000000,0)|0);
       $133 = tempRet0;
       $$0488 = ((($$0488655)) + -4|0);
       $134 = ($$0488>>>0)<($$1482661>>>0);
       if ($134) {
        break;
       } else {
        $$0488655 = $$0488;$$0497654 = $132;
       }
      }
      $135 = ($132|0)==(0);
      if ($135) {
       $$2483$ph = $$1482661;
      } else {
       $136 = ((($$1482661)) + -4|0);
       HEAP32[$136>>2] = $132;
       $$2483$ph = $136;
      }
     }
     $$2500 = $$1499660;
     while(1) {
      $137 = ($$2500>>>0)>($$2483$ph>>>0);
      if (!($137)) {
       break;
      }
      $138 = ((($$2500)) + -4|0);
      $139 = HEAP32[$138>>2]|0;
      $140 = ($139|0)==(0);
      if ($140) {
       $$2500 = $138;
      } else {
       break;
      }
     }
     $141 = HEAP32[$7>>2]|0;
     $142 = (($141) - ($123))|0;
     HEAP32[$7>>2] = $142;
     $143 = ($142|0)>(0);
     if ($143) {
      $$1482661 = $$2483$ph;$$1499660 = $$2500;$122 = $142;
     } else {
      $$1482$lcssa = $$2483$ph;$$1499$lcssa = $$2500;$$pr564 = $142;
      break;
     }
    }
   } else {
    $$1482$lcssa = $$556;$$1499$lcssa = $115;$$pr564 = $$pr;
   }
   $144 = ($$pr564|0)<(0);
   if ($144) {
    $145 = (($$539) + 25)|0;
    $146 = (($145|0) / 9)&-1;
    $147 = (($146) + 1)|0;
    $148 = ($40|0)==(102);
    $$3484648 = $$1482$lcssa;$$3501647 = $$1499$lcssa;$150 = $$pr564;
    while(1) {
     $149 = (0 - ($150))|0;
     $151 = ($149|0)<(9);
     $152 = $151 ? $149 : 9;
     $153 = ($$3484648>>>0)<($$3501647>>>0);
     if ($153) {
      $157 = 1 << $152;
      $158 = (($157) + -1)|0;
      $159 = 1000000000 >>> $152;
      $$0487642 = 0;$$1489641 = $$3484648;
      while(1) {
       $160 = HEAP32[$$1489641>>2]|0;
       $161 = $160 & $158;
       $162 = $160 >>> $152;
       $163 = (($162) + ($$0487642))|0;
       HEAP32[$$1489641>>2] = $163;
       $164 = Math_imul($161, $159)|0;
       $165 = ((($$1489641)) + 4|0);
       $166 = ($165>>>0)<($$3501647>>>0);
       if ($166) {
        $$0487642 = $164;$$1489641 = $165;
       } else {
        break;
       }
      }
      $167 = HEAP32[$$3484648>>2]|0;
      $168 = ($167|0)==(0);
      $169 = ((($$3484648)) + 4|0);
      $$$3484 = $168 ? $169 : $$3484648;
      $170 = ($164|0)==(0);
      if ($170) {
       $$$3484692 = $$$3484;$$4502 = $$3501647;
      } else {
       $171 = ((($$3501647)) + 4|0);
       HEAP32[$$3501647>>2] = $164;
       $$$3484692 = $$$3484;$$4502 = $171;
      }
     } else {
      $154 = HEAP32[$$3484648>>2]|0;
      $155 = ($154|0)==(0);
      $156 = ((($$3484648)) + 4|0);
      $$$3484691 = $155 ? $156 : $$3484648;
      $$$3484692 = $$$3484691;$$4502 = $$3501647;
     }
     $172 = $148 ? $$556 : $$$3484692;
     $173 = $$4502;
     $174 = $172;
     $175 = (($173) - ($174))|0;
     $176 = $175 >> 2;
     $177 = ($176|0)>($147|0);
     $178 = (($172) + ($147<<2)|0);
     $$$4502 = $177 ? $178 : $$4502;
     $179 = HEAP32[$7>>2]|0;
     $180 = (($179) + ($152))|0;
     HEAP32[$7>>2] = $180;
     $181 = ($180|0)<(0);
     if ($181) {
      $$3484648 = $$$3484692;$$3501647 = $$$4502;$150 = $180;
     } else {
      $$3484$lcssa = $$$3484692;$$3501$lcssa = $$$4502;
      break;
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa;$$3501$lcssa = $$1499$lcssa;
   }
   $182 = ($$3484$lcssa>>>0)<($$3501$lcssa>>>0);
   $183 = $$556;
   if ($182) {
    $184 = $$3484$lcssa;
    $185 = (($183) - ($184))|0;
    $186 = $185 >> 2;
    $187 = ($186*9)|0;
    $188 = HEAP32[$$3484$lcssa>>2]|0;
    $189 = ($188>>>0)<(10);
    if ($189) {
     $$1515 = $187;
    } else {
     $$0514637 = $187;$$0530636 = 10;
     while(1) {
      $190 = ($$0530636*10)|0;
      $191 = (($$0514637) + 1)|0;
      $192 = ($188>>>0)<($190>>>0);
      if ($192) {
       $$1515 = $191;
       break;
      } else {
       $$0514637 = $191;$$0530636 = $190;
      }
     }
    }
   } else {
    $$1515 = 0;
   }
   $193 = ($40|0)!=(102);
   $194 = $193 ? $$1515 : 0;
   $195 = (($$539) - ($194))|0;
   $196 = ($40|0)==(103);
   $197 = ($$539|0)!=(0);
   $198 = $197 & $196;
   $$neg = $198 << 31 >> 31;
   $199 = (($195) + ($$neg))|0;
   $200 = $$3501$lcssa;
   $201 = (($200) - ($183))|0;
   $202 = $201 >> 2;
   $203 = ($202*9)|0;
   $204 = (($203) + -9)|0;
   $205 = ($199|0)<($204|0);
   if ($205) {
    $206 = ((($$556)) + 4|0);
    $207 = (($199) + 9216)|0;
    $208 = (($207|0) / 9)&-1;
    $209 = (($208) + -1024)|0;
    $210 = (($206) + ($209<<2)|0);
    $211 = (($207|0) % 9)&-1;
    $$0527629 = (($211) + 1)|0;
    $212 = ($$0527629|0)<(9);
    if ($212) {
     $$0527631 = $$0527629;$$1531630 = 10;
     while(1) {
      $213 = ($$1531630*10)|0;
      $$0527 = (($$0527631) + 1)|0;
      $exitcond = ($$0527|0)==(9);
      if ($exitcond) {
       $$1531$lcssa = $213;
       break;
      } else {
       $$0527631 = $$0527;$$1531630 = $213;
      }
     }
    } else {
     $$1531$lcssa = 10;
    }
    $214 = HEAP32[$210>>2]|0;
    $215 = (($214>>>0) % ($$1531$lcssa>>>0))&-1;
    $216 = ($215|0)==(0);
    $217 = ((($210)) + 4|0);
    $218 = ($217|0)==($$3501$lcssa|0);
    $or$cond541 = $218 & $216;
    if ($or$cond541) {
     $$4492 = $210;$$4518 = $$1515;$$8 = $$3484$lcssa;
    } else {
     $219 = (($214>>>0) / ($$1531$lcssa>>>0))&-1;
     $220 = $219 & 1;
     $221 = ($220|0)==(0);
     $$542 = $221 ? 9007199254740992.0 : 9007199254740994.0;
     $222 = (($$1531$lcssa|0) / 2)&-1;
     $223 = ($215>>>0)<($222>>>0);
     $224 = ($215|0)==($222|0);
     $or$cond544 = $218 & $224;
     $$559 = $or$cond544 ? 1.0 : 1.5;
     $$$559 = $223 ? 0.5 : $$559;
     $225 = ($$0520|0)==(0);
     if ($225) {
      $$1467 = $$$559;$$1469 = $$542;
     } else {
      $226 = HEAP8[$$0521>>0]|0;
      $227 = ($226<<24>>24)==(45);
      $228 = -$$542;
      $229 = -$$$559;
      $$$542 = $227 ? $228 : $$542;
      $$$$559 = $227 ? $229 : $$$559;
      $$1467 = $$$$559;$$1469 = $$$542;
     }
     $230 = (($214) - ($215))|0;
     HEAP32[$210>>2] = $230;
     $231 = $$1469 + $$1467;
     $232 = $231 != $$1469;
     if ($232) {
      $233 = (($230) + ($$1531$lcssa))|0;
      HEAP32[$210>>2] = $233;
      $234 = ($233>>>0)>(999999999);
      if ($234) {
       $$5486623 = $$3484$lcssa;$$sink545622 = $210;
       while(1) {
        $235 = ((($$sink545622)) + -4|0);
        HEAP32[$$sink545622>>2] = 0;
        $236 = ($235>>>0)<($$5486623>>>0);
        if ($236) {
         $237 = ((($$5486623)) + -4|0);
         HEAP32[$237>>2] = 0;
         $$6 = $237;
        } else {
         $$6 = $$5486623;
        }
        $238 = HEAP32[$235>>2]|0;
        $239 = (($238) + 1)|0;
        HEAP32[$235>>2] = $239;
        $240 = ($239>>>0)>(999999999);
        if ($240) {
         $$5486623 = $$6;$$sink545622 = $235;
        } else {
         $$5486$lcssa = $$6;$$sink545$lcssa = $235;
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa;$$sink545$lcssa = $210;
      }
      $241 = $$5486$lcssa;
      $242 = (($183) - ($241))|0;
      $243 = $242 >> 2;
      $244 = ($243*9)|0;
      $245 = HEAP32[$$5486$lcssa>>2]|0;
      $246 = ($245>>>0)<(10);
      if ($246) {
       $$4492 = $$sink545$lcssa;$$4518 = $244;$$8 = $$5486$lcssa;
      } else {
       $$2516618 = $244;$$2532617 = 10;
       while(1) {
        $247 = ($$2532617*10)|0;
        $248 = (($$2516618) + 1)|0;
        $249 = ($245>>>0)<($247>>>0);
        if ($249) {
         $$4492 = $$sink545$lcssa;$$4518 = $248;$$8 = $$5486$lcssa;
         break;
        } else {
         $$2516618 = $248;$$2532617 = $247;
        }
       }
      }
     } else {
      $$4492 = $210;$$4518 = $$1515;$$8 = $$3484$lcssa;
     }
    }
    $250 = ((($$4492)) + 4|0);
    $251 = ($$3501$lcssa>>>0)>($250>>>0);
    $$$3501 = $251 ? $250 : $$3501$lcssa;
    $$5519$ph = $$4518;$$7505$ph = $$$3501;$$9$ph = $$8;
   } else {
    $$5519$ph = $$1515;$$7505$ph = $$3501$lcssa;$$9$ph = $$3484$lcssa;
   }
   $$7505 = $$7505$ph;
   while(1) {
    $252 = ($$7505>>>0)>($$9$ph>>>0);
    if (!($252)) {
     $$lcssa673 = 0;
     break;
    }
    $253 = ((($$7505)) + -4|0);
    $254 = HEAP32[$253>>2]|0;
    $255 = ($254|0)==(0);
    if ($255) {
     $$7505 = $253;
    } else {
     $$lcssa673 = 1;
     break;
    }
   }
   $256 = (0 - ($$5519$ph))|0;
   do {
    if ($196) {
     $not$ = $197 ^ 1;
     $257 = $not$&1;
     $$539$ = (($257) + ($$539))|0;
     $258 = ($$539$|0)>($$5519$ph|0);
     $259 = ($$5519$ph|0)>(-5);
     $or$cond6 = $258 & $259;
     if ($or$cond6) {
      $260 = (($5) + -1)|0;
      $$neg567 = (($$539$) + -1)|0;
      $261 = (($$neg567) - ($$5519$ph))|0;
      $$0479 = $260;$$2476 = $261;
     } else {
      $262 = (($5) + -2)|0;
      $263 = (($$539$) + -1)|0;
      $$0479 = $262;$$2476 = $263;
     }
     $264 = $4 & 8;
     $265 = ($264|0)==(0);
     if ($265) {
      if ($$lcssa673) {
       $266 = ((($$7505)) + -4|0);
       $267 = HEAP32[$266>>2]|0;
       $268 = ($267|0)==(0);
       if ($268) {
        $$2529 = 9;
       } else {
        $269 = (($267>>>0) % 10)&-1;
        $270 = ($269|0)==(0);
        if ($270) {
         $$1528614 = 0;$$3533613 = 10;
         while(1) {
          $271 = ($$3533613*10)|0;
          $272 = (($$1528614) + 1)|0;
          $273 = (($267>>>0) % ($271>>>0))&-1;
          $274 = ($273|0)==(0);
          if ($274) {
           $$1528614 = $272;$$3533613 = $271;
          } else {
           $$2529 = $272;
           break;
          }
         }
        } else {
         $$2529 = 0;
        }
       }
      } else {
       $$2529 = 9;
      }
      $275 = $$0479 | 32;
      $276 = ($275|0)==(102);
      $277 = $$7505;
      $278 = (($277) - ($183))|0;
      $279 = $278 >> 2;
      $280 = ($279*9)|0;
      $281 = (($280) + -9)|0;
      if ($276) {
       $282 = (($281) - ($$2529))|0;
       $283 = ($282|0)>(0);
       $$546 = $283 ? $282 : 0;
       $284 = ($$2476|0)<($$546|0);
       $$2476$$547 = $284 ? $$2476 : $$546;
       $$1480 = $$0479;$$3477 = $$2476$$547;$$pre$phi690Z2D = 0;
       break;
      } else {
       $285 = (($281) + ($$5519$ph))|0;
       $286 = (($285) - ($$2529))|0;
       $287 = ($286|0)>(0);
       $$548 = $287 ? $286 : 0;
       $288 = ($$2476|0)<($$548|0);
       $$2476$$549 = $288 ? $$2476 : $$548;
       $$1480 = $$0479;$$3477 = $$2476$$549;$$pre$phi690Z2D = 0;
       break;
      }
     } else {
      $$1480 = $$0479;$$3477 = $$2476;$$pre$phi690Z2D = $264;
     }
    } else {
     $$pre689 = $4 & 8;
     $$1480 = $5;$$3477 = $$539;$$pre$phi690Z2D = $$pre689;
    }
   } while(0);
   $289 = $$3477 | $$pre$phi690Z2D;
   $290 = ($289|0)!=(0);
   $291 = $290&1;
   $292 = $$1480 | 32;
   $293 = ($292|0)==(102);
   if ($293) {
    $294 = ($$5519$ph|0)>(0);
    $295 = $294 ? $$5519$ph : 0;
    $$2513 = 0;$$pn566 = $295;
   } else {
    $296 = ($$5519$ph|0)<(0);
    $297 = $296 ? $256 : $$5519$ph;
    $298 = ($297|0)<(0);
    $299 = $298 << 31 >> 31;
    $300 = (_fmt_u($297,$299,$11)|0);
    $301 = $11;
    $302 = $300;
    $303 = (($301) - ($302))|0;
    $304 = ($303|0)<(2);
    if ($304) {
     $$1512607 = $300;
     while(1) {
      $305 = ((($$1512607)) + -1|0);
      HEAP8[$305>>0] = 48;
      $306 = $305;
      $307 = (($301) - ($306))|0;
      $308 = ($307|0)<(2);
      if ($308) {
       $$1512607 = $305;
      } else {
       $$1512$lcssa = $305;
       break;
      }
     }
    } else {
     $$1512$lcssa = $300;
    }
    $309 = $$5519$ph >> 31;
    $310 = $309 & 2;
    $311 = (($310) + 43)|0;
    $312 = $311&255;
    $313 = ((($$1512$lcssa)) + -1|0);
    HEAP8[$313>>0] = $312;
    $314 = $$1480&255;
    $315 = ((($$1512$lcssa)) + -2|0);
    HEAP8[$315>>0] = $314;
    $316 = $315;
    $317 = (($301) - ($316))|0;
    $$2513 = $315;$$pn566 = $317;
   }
   $318 = (($$0520) + 1)|0;
   $319 = (($318) + ($$3477))|0;
   $$1526 = (($319) + ($291))|0;
   $320 = (($$1526) + ($$pn566))|0;
   _pad_674($0,32,$2,$320,$4);
   _out($0,$$0521,$$0520);
   $321 = $4 ^ 65536;
   _pad_674($0,48,$2,$320,$321);
   if ($293) {
    $322 = ($$9$ph>>>0)>($$556>>>0);
    $$0496$$9 = $322 ? $$556 : $$9$ph;
    $323 = ((($8)) + 9|0);
    $324 = $323;
    $325 = ((($8)) + 8|0);
    $$5493597 = $$0496$$9;
    while(1) {
     $326 = HEAP32[$$5493597>>2]|0;
     $327 = (_fmt_u($326,0,$323)|0);
     $328 = ($$5493597|0)==($$0496$$9|0);
     if ($328) {
      $334 = ($327|0)==($323|0);
      if ($334) {
       HEAP8[$325>>0] = 48;
       $$1465 = $325;
      } else {
       $$1465 = $327;
      }
     } else {
      $329 = ($327>>>0)>($8>>>0);
      if ($329) {
       $330 = $327;
       $331 = (($330) - ($9))|0;
       _memset(($8|0),48,($331|0))|0;
       $$0464594 = $327;
       while(1) {
        $332 = ((($$0464594)) + -1|0);
        $333 = ($332>>>0)>($8>>>0);
        if ($333) {
         $$0464594 = $332;
        } else {
         $$1465 = $332;
         break;
        }
       }
      } else {
       $$1465 = $327;
      }
     }
     $335 = $$1465;
     $336 = (($324) - ($335))|0;
     _out($0,$$1465,$336);
     $337 = ((($$5493597)) + 4|0);
     $338 = ($337>>>0)>($$556>>>0);
     if ($338) {
      break;
     } else {
      $$5493597 = $337;
     }
    }
    $339 = ($289|0)==(0);
    if (!($339)) {
     _out($0,9107,1);
    }
    $340 = ($337>>>0)<($$7505>>>0);
    $341 = ($$3477|0)>(0);
    $342 = $340 & $341;
    if ($342) {
     $$4478590 = $$3477;$$6494589 = $337;
     while(1) {
      $343 = HEAP32[$$6494589>>2]|0;
      $344 = (_fmt_u($343,0,$323)|0);
      $345 = ($344>>>0)>($8>>>0);
      if ($345) {
       $346 = $344;
       $347 = (($346) - ($9))|0;
       _memset(($8|0),48,($347|0))|0;
       $$0463584 = $344;
       while(1) {
        $348 = ((($$0463584)) + -1|0);
        $349 = ($348>>>0)>($8>>>0);
        if ($349) {
         $$0463584 = $348;
        } else {
         $$0463$lcssa = $348;
         break;
        }
       }
      } else {
       $$0463$lcssa = $344;
      }
      $350 = ($$4478590|0)<(9);
      $351 = $350 ? $$4478590 : 9;
      _out($0,$$0463$lcssa,$351);
      $352 = ((($$6494589)) + 4|0);
      $353 = (($$4478590) + -9)|0;
      $354 = ($352>>>0)<($$7505>>>0);
      $355 = ($$4478590|0)>(9);
      $356 = $354 & $355;
      if ($356) {
       $$4478590 = $353;$$6494589 = $352;
      } else {
       $$4478$lcssa = $353;
       break;
      }
     }
    } else {
     $$4478$lcssa = $$3477;
    }
    $357 = (($$4478$lcssa) + 9)|0;
    _pad_674($0,48,$357,9,0);
   } else {
    $358 = ((($$9$ph)) + 4|0);
    $$7505$ = $$lcssa673 ? $$7505 : $358;
    $359 = ($$3477|0)>(-1);
    if ($359) {
     $360 = ((($8)) + 9|0);
     $361 = ($$pre$phi690Z2D|0)==(0);
     $362 = $360;
     $363 = (0 - ($9))|0;
     $364 = ((($8)) + 8|0);
     $$5602 = $$3477;$$7495601 = $$9$ph;
     while(1) {
      $365 = HEAP32[$$7495601>>2]|0;
      $366 = (_fmt_u($365,0,$360)|0);
      $367 = ($366|0)==($360|0);
      if ($367) {
       HEAP8[$364>>0] = 48;
       $$0 = $364;
      } else {
       $$0 = $366;
      }
      $368 = ($$7495601|0)==($$9$ph|0);
      do {
       if ($368) {
        $372 = ((($$0)) + 1|0);
        _out($0,$$0,1);
        $373 = ($$5602|0)<(1);
        $or$cond554 = $361 & $373;
        if ($or$cond554) {
         $$2 = $372;
         break;
        }
        _out($0,9107,1);
        $$2 = $372;
       } else {
        $369 = ($$0>>>0)>($8>>>0);
        if (!($369)) {
         $$2 = $$0;
         break;
        }
        $scevgep684 = (($$0) + ($363)|0);
        $scevgep684685 = $scevgep684;
        _memset(($8|0),48,($scevgep684685|0))|0;
        $$1598 = $$0;
        while(1) {
         $370 = ((($$1598)) + -1|0);
         $371 = ($370>>>0)>($8>>>0);
         if ($371) {
          $$1598 = $370;
         } else {
          $$2 = $370;
          break;
         }
        }
       }
      } while(0);
      $374 = $$2;
      $375 = (($362) - ($374))|0;
      $376 = ($$5602|0)>($375|0);
      $377 = $376 ? $375 : $$5602;
      _out($0,$$2,$377);
      $378 = (($$5602) - ($375))|0;
      $379 = ((($$7495601)) + 4|0);
      $380 = ($379>>>0)<($$7505$>>>0);
      $381 = ($378|0)>(-1);
      $382 = $380 & $381;
      if ($382) {
       $$5602 = $378;$$7495601 = $379;
      } else {
       $$5$lcssa = $378;
       break;
      }
     }
    } else {
     $$5$lcssa = $$3477;
    }
    $383 = (($$5$lcssa) + 18)|0;
    _pad_674($0,48,$383,18,0);
    $384 = $11;
    $385 = $$2513;
    $386 = (($384) - ($385))|0;
    _out($0,$$2513,$386);
   }
   $387 = $4 ^ 8192;
   _pad_674($0,32,$2,$320,$387);
   $$sink562 = $320;
  } else {
   $27 = $5 & 32;
   $28 = ($27|0)!=(0);
   $29 = $28 ? 9075 : 9079;
   $30 = ($$0471 != $$0471) | (0.0 != 0.0);
   $31 = $28 ? 9083 : 9087;
   $$0510 = $30 ? $31 : $29;
   $32 = (($$0520) + 3)|0;
   $33 = $4 & -65537;
   _pad_674($0,32,$2,$32,$33);
   _out($0,$$0521,$$0520);
   _out($0,$$0510,3);
   $34 = $4 ^ 8192;
   _pad_674($0,32,$2,$32,$34);
   $$sink562 = $32;
  }
 } while(0);
 $388 = ($$sink562|0)<($2|0);
 $$555 = $388 ? $2 : $$sink562;
 STACKTOP = sp;return ($$555|0);
}
function ___DOUBLE_BITS_675($0) {
 $0 = +$0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$1 = HEAP32[tempDoublePtr>>2]|0;
 $2 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($2);
 return ($1|0);
}
function _frexpl($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (+_frexp($0,$1));
 return (+$2);
}
function _frexp($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $5 = tempRet0;
 $6 = $4&65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $7 = $0 != 0.0;
  if ($7) {
   $8 = $0 * 1.8446744073709552E+19;
   $9 = (+_frexp($8,$1));
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -64)|0;
   $$016 = $9;$storemerge = $11;
  } else {
   $$016 = $0;$storemerge = 0;
  }
  HEAP32[$1>>2] = $storemerge;
  $$0 = $$016;
  break;
 }
 case 2047:  {
  $$0 = $0;
  break;
 }
 default: {
  $12 = $4 & 2047;
  $13 = (($12) + -1022)|0;
  HEAP32[$1>>2] = $13;
  $14 = $3 & -2146435073;
  $15 = $14 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $15;$16 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $16;
 }
 }
 return (+$$0);
}
function _wcrtomb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $not$ = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0|0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = ($1>>>0)<(128);
   if ($4) {
    $5 = $1&255;
    HEAP8[$0>>0] = $5;
    $$0 = 1;
    break;
   }
   $6 = (___pthread_self_448()|0);
   $7 = ((($6)) + 188|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = HEAP32[$8>>2]|0;
   $not$ = ($9|0)==(0|0);
   if ($not$) {
    $10 = $1 & -128;
    $11 = ($10|0)==(57216);
    if ($11) {
     $13 = $1&255;
     HEAP8[$0>>0] = $13;
     $$0 = 1;
     break;
    } else {
     $12 = (___errno_location()|0);
     HEAP32[$12>>2] = 84;
     $$0 = -1;
     break;
    }
   }
   $14 = ($1>>>0)<(2048);
   if ($14) {
    $15 = $1 >>> 6;
    $16 = $15 | 192;
    $17 = $16&255;
    $18 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $17;
    $19 = $1 & 63;
    $20 = $19 | 128;
    $21 = $20&255;
    HEAP8[$18>>0] = $21;
    $$0 = 2;
    break;
   }
   $22 = ($1>>>0)<(55296);
   $23 = $1 & -8192;
   $24 = ($23|0)==(57344);
   $or$cond = $22 | $24;
   if ($or$cond) {
    $25 = $1 >>> 12;
    $26 = $25 | 224;
    $27 = $26&255;
    $28 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $27;
    $29 = $1 >>> 6;
    $30 = $29 & 63;
    $31 = $30 | 128;
    $32 = $31&255;
    $33 = ((($0)) + 2|0);
    HEAP8[$28>>0] = $32;
    $34 = $1 & 63;
    $35 = $34 | 128;
    $36 = $35&255;
    HEAP8[$33>>0] = $36;
    $$0 = 3;
    break;
   }
   $37 = (($1) + -65536)|0;
   $38 = ($37>>>0)<(1048576);
   if ($38) {
    $39 = $1 >>> 18;
    $40 = $39 | 240;
    $41 = $40&255;
    $42 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $41;
    $43 = $1 >>> 12;
    $44 = $43 & 63;
    $45 = $44 | 128;
    $46 = $45&255;
    $47 = ((($0)) + 2|0);
    HEAP8[$42>>0] = $46;
    $48 = $1 >>> 6;
    $49 = $48 & 63;
    $50 = $49 | 128;
    $51 = $50&255;
    $52 = ((($0)) + 3|0);
    HEAP8[$47>>0] = $51;
    $53 = $1 & 63;
    $54 = $53 | 128;
    $55 = $54&255;
    HEAP8[$52>>0] = $55;
    $$0 = 4;
    break;
   } else {
    $56 = (___errno_location()|0);
    HEAP32[$56>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___pthread_self_448() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___pthread_self_105() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___strerror_l($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $$016 = 0;
 while(1) {
  $3 = (9109 + ($$016)|0);
  $4 = HEAP8[$3>>0]|0;
  $5 = $4&255;
  $6 = ($5|0)==($0|0);
  if ($6) {
   label = 2;
   break;
  }
  $7 = (($$016) + 1)|0;
  $8 = ($7|0)==(87);
  if ($8) {
   $$01214 = 9197;$$115 = 87;
   label = 5;
   break;
  } else {
   $$016 = $7;
  }
 }
 if ((label|0) == 2) {
  $2 = ($$016|0)==(0);
  if ($2) {
   $$012$lcssa = 9197;
  } else {
   $$01214 = 9197;$$115 = $$016;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $$113 = $$01214;
   while(1) {
    $9 = HEAP8[$$113>>0]|0;
    $10 = ($9<<24>>24)==(0);
    $11 = ((($$113)) + 1|0);
    if ($10) {
     break;
    } else {
     $$113 = $11;
    }
   }
   $12 = (($$115) + -1)|0;
   $13 = ($12|0)==(0);
   if ($13) {
    $$012$lcssa = $11;
    break;
   } else {
    $$01214 = $11;$$115 = $12;
    label = 5;
   }
  }
 }
 $14 = ((($1)) + 20|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (___lctrans($$012$lcssa,$15)|0);
 return ($16|0);
}
function ___lctrans($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (___lctrans_impl($0,$1)|0);
 return ($2|0);
}
function ___lctrans_impl($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = HEAP32[$1>>2]|0;
  $4 = ((($1)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = (___mo_lookup($3,$5,$0)|0);
  $$0 = $6;
 }
 $7 = ($$0|0)!=(0|0);
 $8 = $7 ? $$0 : $0;
 return ($8|0);
}
function ___mo_lookup($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$090 = 0, $$094 = 0, $$191 = 0, $$195 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond102 = 0, $or$cond104 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = (($3) + 1794895138)|0;
 $5 = ((($0)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (_swapc($6,$4)|0);
 $8 = ((($0)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = (_swapc($9,$4)|0);
 $11 = ((($0)) + 16|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (_swapc($12,$4)|0);
 $14 = $1 >>> 2;
 $15 = ($7>>>0)<($14>>>0);
 L1: do {
  if ($15) {
   $16 = $7 << 2;
   $17 = (($1) - ($16))|0;
   $18 = ($10>>>0)<($17>>>0);
   $19 = ($13>>>0)<($17>>>0);
   $or$cond = $18 & $19;
   if ($or$cond) {
    $20 = $13 | $10;
    $21 = $20 & 3;
    $22 = ($21|0)==(0);
    if ($22) {
     $23 = $10 >>> 2;
     $24 = $13 >>> 2;
     $$090 = 0;$$094 = $7;
     while(1) {
      $25 = $$094 >>> 1;
      $26 = (($$090) + ($25))|0;
      $27 = $26 << 1;
      $28 = (($27) + ($23))|0;
      $29 = (($0) + ($28<<2)|0);
      $30 = HEAP32[$29>>2]|0;
      $31 = (_swapc($30,$4)|0);
      $32 = (($28) + 1)|0;
      $33 = (($0) + ($32<<2)|0);
      $34 = HEAP32[$33>>2]|0;
      $35 = (_swapc($34,$4)|0);
      $36 = ($35>>>0)<($1>>>0);
      $37 = (($1) - ($35))|0;
      $38 = ($31>>>0)<($37>>>0);
      $or$cond102 = $36 & $38;
      if (!($or$cond102)) {
       $$4 = 0;
       break L1;
      }
      $39 = (($35) + ($31))|0;
      $40 = (($0) + ($39)|0);
      $41 = HEAP8[$40>>0]|0;
      $42 = ($41<<24>>24)==(0);
      if (!($42)) {
       $$4 = 0;
       break L1;
      }
      $43 = (($0) + ($35)|0);
      $44 = (_strcmp($2,$43)|0);
      $45 = ($44|0)==(0);
      if ($45) {
       break;
      }
      $62 = ($$094|0)==(1);
      $63 = ($44|0)<(0);
      $64 = (($$094) - ($25))|0;
      $$195 = $63 ? $25 : $64;
      $$191 = $63 ? $$090 : $26;
      if ($62) {
       $$4 = 0;
       break L1;
      } else {
       $$090 = $$191;$$094 = $$195;
      }
     }
     $46 = (($27) + ($24))|0;
     $47 = (($0) + ($46<<2)|0);
     $48 = HEAP32[$47>>2]|0;
     $49 = (_swapc($48,$4)|0);
     $50 = (($46) + 1)|0;
     $51 = (($0) + ($50<<2)|0);
     $52 = HEAP32[$51>>2]|0;
     $53 = (_swapc($52,$4)|0);
     $54 = ($53>>>0)<($1>>>0);
     $55 = (($1) - ($53))|0;
     $56 = ($49>>>0)<($55>>>0);
     $or$cond104 = $54 & $56;
     if ($or$cond104) {
      $57 = (($0) + ($53)|0);
      $58 = (($53) + ($49))|0;
      $59 = (($0) + ($58)|0);
      $60 = HEAP8[$59>>0]|0;
      $61 = ($60<<24>>24)==(0);
      $$ = $61 ? $57 : 0;
      $$4 = $$;
     } else {
      $$4 = 0;
     }
    } else {
     $$4 = 0;
    }
   } else {
    $$4 = 0;
   }
  } else {
   $$4 = 0;
  }
 } while(0);
 return ($$4|0);
}
function _swapc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0);
 $3 = (_llvm_bswap_i32(($0|0))|0);
 $$ = $2 ? $0 : $3;
 return ($$|0);
}
function ___fwritex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$038 = 0, $$042 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $$pre = 0, $$pre47 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $7 = (___towrite($2)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$3>>2]|0;
   $12 = $$pre;
   label = 5;
  } else {
   $$1 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $9 = ((($2)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = (($12) - ($10))|0;
   $13 = ($11>>>0)<($1>>>0);
   $14 = $10;
   if ($13) {
    $15 = ((($2)) + 36|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = (FUNCTION_TABLE_iiii[$16 & 7]($2,$0,$1)|0);
    $$1 = $17;
    break;
   }
   $18 = ((($2)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = ($19<<24>>24)>(-1);
   L10: do {
    if ($20) {
     $$038 = $1;
     while(1) {
      $21 = ($$038|0)==(0);
      if ($21) {
       $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
       break L10;
      }
      $22 = (($$038) + -1)|0;
      $23 = (($0) + ($22)|0);
      $24 = HEAP8[$23>>0]|0;
      $25 = ($24<<24>>24)==(10);
      if ($25) {
       break;
      } else {
       $$038 = $22;
      }
     }
     $26 = ((($2)) + 36|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = (FUNCTION_TABLE_iiii[$27 & 7]($2,$0,$$038)|0);
     $29 = ($28>>>0)<($$038>>>0);
     if ($29) {
      $$1 = $28;
      break L5;
     }
     $30 = (($0) + ($$038)|0);
     $$042 = (($1) - ($$038))|0;
     $$pre47 = HEAP32[$9>>2]|0;
     $$139 = $$038;$$141 = $30;$$143 = $$042;$31 = $$pre47;
    } else {
     $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
    }
   } while(0);
   _memcpy(($31|0),($$141|0),($$143|0))|0;
   $32 = HEAP32[$9>>2]|0;
   $33 = (($32) + ($$143)|0);
   HEAP32[$9>>2] = $33;
   $34 = (($$139) + ($$143))|0;
   $$1 = $34;
  }
 } while(0);
 return ($$1|0);
}
function ___towrite($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 74|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (($3) + 255)|0;
 $5 = $4 | $3;
 $6 = $5&255;
 HEAP8[$1>>0] = $6;
 $7 = HEAP32[$0>>2]|0;
 $8 = $7 & 8;
 $9 = ($8|0)==(0);
 if ($9) {
  $11 = ((($0)) + 8|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($0)) + 4|0);
  HEAP32[$12>>2] = 0;
  $13 = ((($0)) + 44|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 28|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($0)) + 20|0);
  HEAP32[$16>>2] = $14;
  $17 = ((($0)) + 48|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = (($14) + ($18)|0);
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = $19;
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  HEAP32[$0>>2] = $10;
  $$0 = -1;
 }
 return ($$0|0);
}
function _strlen($0) {
 $0 = $0|0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$pre = 0, $$sink = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $$015$lcssa = $0;
   label = 4;
  } else {
   $$01519 = $0;$23 = $1;
   while(1) {
    $4 = HEAP8[$$01519>>0]|0;
    $5 = ($4<<24>>24)==(0);
    if ($5) {
     $$sink = $23;
     break L1;
    }
    $6 = ((($$01519)) + 1|0);
    $7 = $6;
    $8 = $7 & 3;
    $9 = ($8|0)==(0);
    if ($9) {
     $$015$lcssa = $6;
     label = 4;
     break;
    } else {
     $$01519 = $6;$23 = $7;
    }
   }
  }
 } while(0);
 if ((label|0) == 4) {
  $$0 = $$015$lcssa;
  while(1) {
   $10 = HEAP32[$$0>>2]|0;
   $11 = (($10) + -16843009)|0;
   $12 = $10 & -2139062144;
   $13 = $12 ^ -2139062144;
   $14 = $13 & $11;
   $15 = ($14|0)==(0);
   $16 = ((($$0)) + 4|0);
   if ($15) {
    $$0 = $16;
   } else {
    break;
   }
  }
  $17 = $10&255;
  $18 = ($17<<24>>24)==(0);
  if ($18) {
   $$1$lcssa = $$0;
  } else {
   $$pn = $$0;
   while(1) {
    $19 = ((($$pn)) + 1|0);
    $$pre = HEAP8[$19>>0]|0;
    $20 = ($$pre<<24>>24)==(0);
    if ($20) {
     $$1$lcssa = $19;
     break;
    } else {
     $$pn = $19;
    }
   }
  }
  $21 = $$1$lcssa;
  $$sink = $21;
 }
 $22 = (($$sink) - ($1))|0;
 return ($22|0);
}
function _fputs($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_strlen($0)|0);
 $3 = (_fwrite($0,1,$2,$1)|0);
 $not$ = ($3|0)!=($2|0);
 $4 = $not$ << 31 >> 31;
 return ($4|0);
}
function _fwrite($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = Math_imul($2, $1)|0;
 $5 = ($1|0)==(0);
 $$ = $5 ? 0 : $2;
 $6 = ((($3)) + 76|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)>(-1);
 if ($8) {
  $10 = (___lockfile($3)|0);
  $phitmp = ($10|0)==(0);
  $11 = (___fwritex($0,$4,$3)|0);
  if ($phitmp) {
   $13 = $11;
  } else {
   ___unlockfile($3);
   $13 = $11;
  }
 } else {
  $9 = (___fwritex($0,$4,$3)|0);
  $13 = $9;
 }
 $12 = ($13|0)==($4|0);
 if ($12) {
  $15 = $$;
 } else {
  $14 = (($13>>>0) / ($1>>>0))&-1;
  $15 = $14;
 }
 return ($15|0);
}
function ___overflow($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $2 = sp;
 $3 = $1&255;
 HEAP8[$2>>0] = $3;
 $4 = ((($0)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = (___towrite($0)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$4>>2]|0;
   $12 = $$pre;
   label = 4;
  } else {
   $$0 = -1;
  }
 } else {
  $12 = $5;
  label = 4;
 }
 do {
  if ((label|0) == 4) {
   $9 = ((($0)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10>>>0)<($12>>>0);
   if ($11) {
    $13 = $1 & 255;
    $14 = ((($0)) + 75|0);
    $15 = HEAP8[$14>>0]|0;
    $16 = $15 << 24 >> 24;
    $17 = ($13|0)==($16|0);
    if (!($17)) {
     $18 = ((($10)) + 1|0);
     HEAP32[$9>>2] = $18;
     HEAP8[$10>>0] = $3;
     $$0 = $13;
     break;
    }
   }
   $19 = ((($0)) + 36|0);
   $20 = HEAP32[$19>>2]|0;
   $21 = (FUNCTION_TABLE_iiii[$20 & 7]($0,$2,1)|0);
   $22 = ($21|0)==(1);
   if ($22) {
    $23 = HEAP8[$2>>0]|0;
    $24 = $23&255;
    $$0 = $24;
   } else {
    $$0 = -1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___ofl_lock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___lock((11800|0));
 return (11808|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((11800|0));
 return;
}
function _fflush($0) {
 $0 = $0|0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $8 = HEAP32[1263]|0;
   $9 = ($8|0)==(0|0);
   if ($9) {
    $29 = 0;
   } else {
    $10 = HEAP32[1263]|0;
    $11 = (_fflush($10)|0);
    $29 = $11;
   }
   $12 = (___ofl_lock()|0);
   $$02325 = HEAP32[$12>>2]|0;
   $13 = ($$02325|0)==(0|0);
   if ($13) {
    $$024$lcssa = $29;
   } else {
    $$02327 = $$02325;$$02426 = $29;
    while(1) {
     $14 = ((($$02327)) + 76|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)>(-1);
     if ($16) {
      $17 = (___lockfile($$02327)|0);
      $26 = $17;
     } else {
      $26 = 0;
     }
     $18 = ((($$02327)) + 20|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ((($$02327)) + 28|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ($19>>>0)>($21>>>0);
     if ($22) {
      $23 = (___fflush_unlocked($$02327)|0);
      $24 = $23 | $$02426;
      $$1 = $24;
     } else {
      $$1 = $$02426;
     }
     $25 = ($26|0)==(0);
     if (!($25)) {
      ___unlockfile($$02327);
     }
     $27 = ((($$02327)) + 56|0);
     $$023 = HEAP32[$27>>2]|0;
     $28 = ($$023|0)==(0|0);
     if ($28) {
      $$024$lcssa = $$1;
      break;
     } else {
      $$02327 = $$023;$$02426 = $$1;
     }
    }
   }
   ___ofl_unlock();
   $$0 = $$024$lcssa;
  } else {
   $2 = ((($0)) + 76|0);
   $3 = HEAP32[$2>>2]|0;
   $4 = ($3|0)>(-1);
   if (!($4)) {
    $5 = (___fflush_unlocked($0)|0);
    $$0 = $5;
    break;
   }
   $6 = (___lockfile($0)|0);
   $phitmp = ($6|0)==(0);
   $7 = (___fflush_unlocked($0)|0);
   if ($phitmp) {
    $$0 = $7;
   } else {
    ___unlockfile($0);
    $$0 = $7;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 20|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)>($4>>>0);
 if ($5) {
  $6 = ((($0)) + 36|0);
  $7 = HEAP32[$6>>2]|0;
  (FUNCTION_TABLE_iiii[$7 & 7]($0,0,0)|0);
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)==(0|0);
  if ($9) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $10 = ((($0)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($11>>>0)<($13>>>0);
  if ($14) {
   $15 = $11;
   $16 = $13;
   $17 = (($15) - ($16))|0;
   $18 = ((($0)) + 40|0);
   $19 = HEAP32[$18>>2]|0;
   (FUNCTION_TABLE_iiii[$19 & 7]($0,$17,1)|0);
  }
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = 0;
  HEAP32[$3>>2] = 0;
  HEAP32[$1>>2] = 0;
  HEAP32[$12>>2] = 0;
  HEAP32[$10>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _fprintf($0,$1,$varargs) {
 $0 = $0|0;
 $1 = $1|0;
 $varargs = $varargs|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $2 = sp;
 HEAP32[$2>>2] = $varargs;
 $3 = (_vfprintf($0,$1,$2)|0);
 STACKTOP = sp;return ($3|0);
}
function _printf($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[1231]|0;
 $3 = (_vfprintf($2,$0,$1)|0);
 STACKTOP = sp;return ($3|0);
}
function _puts($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[1231]|0;
 $2 = ((($1)) + 76|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)>(-1);
 if ($4) {
  $5 = (___lockfile($1)|0);
  $21 = $5;
 } else {
  $21 = 0;
 }
 $6 = (_fputs($0,$1)|0);
 $7 = ($6|0)<(0);
 do {
  if ($7) {
   $19 = 1;
  } else {
   $8 = ((($1)) + 75|0);
   $9 = HEAP8[$8>>0]|0;
   $10 = ($9<<24>>24)==(10);
   if (!($10)) {
    $11 = ((($1)) + 20|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ((($1)) + 16|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ($12>>>0)<($14>>>0);
    if ($15) {
     $16 = ((($12)) + 1|0);
     HEAP32[$11>>2] = $16;
     HEAP8[$12>>0] = 10;
     $19 = 0;
     break;
    }
   }
   $17 = (___overflow($1,10)|0);
   $phitmp = ($17|0)<(0);
   $19 = $phitmp;
  }
 } while(0);
 $18 = $19 << 31 >> 31;
 $20 = ($21|0)==(0);
 if (!($20)) {
  ___unlockfile($1);
 }
 return ($18|0);
}
function __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _abort();
 // unreachable;
}
function __Znwj($0) {
 $0 = $0|0;
 var $$ = 0, $$lcssa = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0);
 $$ = $1 ? 1 : $0;
 while(1) {
  $2 = (_malloc($$)|0);
  $3 = ($2|0)==(0|0);
  if (!($3)) {
   $$lcssa = $2;
   break;
  }
  $4 = (__ZSt15get_new_handlerv()|0);
  $5 = ($4|0)==(0|0);
  if ($5) {
   $$lcssa = 0;
   break;
  }
  FUNCTION_TABLE_v[$4 & 0]();
 }
 return ($$lcssa|0);
}
function __Znaj($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (__Znwj($0)|0);
 return ($1|0);
}
function __ZdlPv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($0);
 return;
}
function __ZdaPv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNSt3__218__libcpp_refstringC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_strlen($1)|0);
 $3 = (($2) + 13)|0;
 $4 = (__Znwj($3)|0);
 HEAP32[$4>>2] = $2;
 $5 = ((($4)) + 4|0);
 HEAP32[$5>>2] = $2;
 $6 = ((($4)) + 8|0);
 HEAP32[$6>>2] = 0;
 $7 = (__ZNSt3__215__refstring_imp12_GLOBAL__N_113data_from_repEPNS1_9_Rep_baseE($4)|0);
 $8 = (($2) + 1)|0;
 _memcpy(($7|0),($1|0),($8|0))|0;
 HEAP32[$0>>2] = $7;
 return;
}
function __ZNSt3__215__refstring_imp12_GLOBAL__N_113data_from_repEPNS1_9_Rep_baseE($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 12|0);
 return ($1|0);
}
function __ZNSt11logic_errorC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (5144);
 $2 = ((($0)) + 4|0);
 __ZNSt3__218__libcpp_refstringC2EPKc($2,$1);
 return;
}
function __ZNKSt3__218__libcpp_refstring15__uses_refcountEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1;
}
function __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _abort();
 // unreachable;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC2ERKS5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $2 = sp;
 ;HEAP32[$0>>2]=0|0;HEAP32[$0+4>>2]=0|0;HEAP32[$0+8>>2]=0|0;
 $3 = ((($1)) + 11|0);
 $4 = HEAP8[$3>>0]|0;
 $5 = ($4<<24>>24)<(0);
 if ($5) {
  $6 = HEAP32[$1>>2]|0;
  $7 = ((($1)) + 4|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = ($8>>>0)>(4294967279);
  if ($9) {
   __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0);
   // unreachable;
  }
  $10 = ($8>>>0)<(11);
  if ($10) {
   $11 = $8&255;
   $12 = ((($0)) + 11|0);
   HEAP8[$12>>0] = $11;
   $$0$i = $0;
  } else {
   $13 = (($8) + 16)|0;
   $14 = $13 & -16;
   $15 = (__Znwj($14)|0);
   HEAP32[$0>>2] = $15;
   $16 = $14 | -2147483648;
   $17 = ((($0)) + 8|0);
   HEAP32[$17>>2] = $16;
   $18 = ((($0)) + 4|0);
   HEAP32[$18>>2] = $8;
   $$0$i = $15;
  }
  (__ZNSt3__211char_traitsIcE4copyEPcPKcj($$0$i,$6,$8)|0);
  $19 = (($$0$i) + ($8)|0);
  HEAP8[$2>>0] = 0;
  __ZNSt3__211char_traitsIcE6assignERcRKc($19,$2);
 } else {
  ;HEAP32[$0>>2]=HEAP32[$1>>2]|0;HEAP32[$0+4>>2]=HEAP32[$1+4>>2]|0;HEAP32[$0+8>>2]=HEAP32[$1+8>>2]|0;
 }
 STACKTOP = sp;return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 11|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = ($2<<24>>24)<(0);
 if ($3) {
  $4 = HEAP32[$0>>2]|0;
  __ZdlPv($4);
 }
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6assignEPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $phitmp$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $3 = sp;
 $4 = ((($0)) + 11|0);
 $5 = HEAP8[$4>>0]|0;
 $6 = ($5<<24>>24)<(0);
 if ($6) {
  $7 = ((($0)) + 8|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = $8 & 2147483647;
  $phitmp$i = (($9) + -1)|0;
  $11 = $phitmp$i;
 } else {
  $11 = 10;
 }
 $10 = ($11>>>0)<($2>>>0);
 do {
  if ($10) {
   if ($6) {
    $19 = ((($0)) + 4|0);
    $20 = HEAP32[$19>>2]|0;
    $23 = $20;
   } else {
    $21 = $5&255;
    $23 = $21;
   }
   $22 = (($2) - ($11))|0;
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE21__grow_by_and_replaceEjjjjjjPKc($0,$11,$22,$23,0,$23,$2,$1);
  } else {
   if ($6) {
    $12 = HEAP32[$0>>2]|0;
    $13 = $12;
   } else {
    $13 = $0;
   }
   (__ZNSt3__211char_traitsIcE4moveEPcPKcj($13,$1,$2)|0);
   $14 = (($13) + ($2)|0);
   HEAP8[$3>>0] = 0;
   __ZNSt3__211char_traitsIcE6assignERcRKc($14,$3);
   $15 = HEAP8[$4>>0]|0;
   $16 = ($15<<24>>24)<(0);
   if ($16) {
    $17 = ((($0)) + 4|0);
    HEAP32[$17>>2] = $2;
    break;
   } else {
    $18 = $2&255;
    HEAP8[$4>>0] = $18;
    break;
   }
  }
 } while(0);
 STACKTOP = sp;return ($0|0);
}
function __ZNSt3__211char_traitsIcE4moveEPcPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($2|0)==(0);
 if (!($3)) {
  _memmove(($0|0),($1|0),($2|0))|0;
 }
 return ($0|0);
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE21__grow_by_and_replaceEjjjjjjPKc($0,$1,$2,$3,$4,$5,$6,$7) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 var $$sroa$speculated = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $8 = sp;
 $9 = (-18 - ($1))|0;
 $10 = ($9>>>0)<($2>>>0);
 if ($10) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $11 = ((($0)) + 11|0);
 $12 = HEAP8[$11>>0]|0;
 $13 = ($12<<24>>24)<(0);
 if ($13) {
  $14 = HEAP32[$0>>2]|0;
  $25 = $14;
 } else {
  $25 = $0;
 }
 $15 = ($1>>>0)<(2147483623);
 if ($15) {
  $16 = (($2) + ($1))|0;
  $17 = $1 << 1;
  $18 = ($16>>>0)<($17>>>0);
  $$sroa$speculated = $18 ? $17 : $16;
  $19 = ($$sroa$speculated>>>0)<(11);
  $20 = (($$sroa$speculated) + 16)|0;
  $21 = $20 & -16;
  $phitmp = $19 ? 11 : $21;
  $22 = $phitmp;
 } else {
  $22 = -17;
 }
 $23 = (__Znwj($22)|0);
 $24 = ($4|0)==(0);
 if (!($24)) {
  (__ZNSt3__211char_traitsIcE4copyEPcPKcj($23,$25,$4)|0);
 }
 $26 = ($6|0)==(0);
 if (!($26)) {
  $27 = (($23) + ($4)|0);
  (__ZNSt3__211char_traitsIcE4copyEPcPKcj($27,$7,$6)|0);
 }
 $28 = (($3) - ($5))|0;
 $29 = (($28) - ($4))|0;
 $30 = ($29|0)==(0);
 if (!($30)) {
  $31 = (($23) + ($4)|0);
  $32 = (($31) + ($6)|0);
  $33 = (($25) + ($4)|0);
  $34 = (($33) + ($5)|0);
  (__ZNSt3__211char_traitsIcE4copyEPcPKcj($32,$34,$29)|0);
 }
 $35 = ($1|0)==(10);
 if (!($35)) {
  __ZdlPv($25);
 }
 HEAP32[$0>>2] = $23;
 $36 = $22 | -2147483648;
 $37 = ((($0)) + 8|0);
 HEAP32[$37>>2] = $36;
 $38 = (($28) + ($6))|0;
 $39 = ((($0)) + 4|0);
 HEAP32[$39>>2] = $38;
 $40 = (($23) + ($38)|0);
 HEAP8[$8>>0] = 0;
 __ZNSt3__211char_traitsIcE6assignERcRKc($40,$8);
 STACKTOP = sp;return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$2 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $3 = sp;
 $4 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,0)|0);
 if ($4) {
  $$2 = 1;
 } else {
  $5 = ($1|0)==(0|0);
  if ($5) {
   $$2 = 0;
  } else {
   $6 = (___dynamic_cast($1,32,16,0)|0);
   $7 = ($6|0)==(0|0);
   if ($7) {
    $$2 = 0;
   } else {
    $8 = ((($3)) + 4|0);
    dest=$8; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
    HEAP32[$3>>2] = $6;
    $9 = ((($3)) + 8|0);
    HEAP32[$9>>2] = $0;
    $10 = ((($3)) + 12|0);
    HEAP32[$10>>2] = -1;
    $11 = ((($3)) + 48|0);
    HEAP32[$11>>2] = 1;
    $12 = HEAP32[$6>>2]|0;
    $13 = ((($12)) + 28|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = HEAP32[$2>>2]|0;
    FUNCTION_TABLE_viiii[$14 & 3]($6,$3,$15,1);
    $16 = ((($3)) + 24|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = ($17|0)==(1);
    if ($18) {
     $19 = ((($3)) + 16|0);
     $20 = HEAP32[$19>>2]|0;
     HEAP32[$2>>2] = $20;
     $$0 = 1;
    } else {
     $$0 = 0;
    }
    $$2 = $$0;
   }
  }
 }
 STACKTOP = sp;return ($$2|0);
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   if ($9) {
    $10 = ((($1)) + 16|0);
    $11 = HEAP32[$10>>2]|0;
    $12 = ($11|0)==($2|0);
    $13 = ((($1)) + 32|0);
    if (!($12)) {
     $14 = ((($1)) + 20|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)==($2|0);
     if (!($16)) {
      HEAP32[$13>>2] = $3;
      HEAP32[$14>>2] = $2;
      $18 = ((($1)) + 40|0);
      $19 = HEAP32[$18>>2]|0;
      $20 = (($19) + 1)|0;
      HEAP32[$18>>2] = $20;
      $21 = ((($1)) + 36|0);
      $22 = HEAP32[$21>>2]|0;
      $23 = ($22|0)==(1);
      if ($23) {
       $24 = ((($1)) + 24|0);
       $25 = HEAP32[$24>>2]|0;
       $26 = ($25|0)==(2);
       if ($26) {
        $27 = ((($1)) + 54|0);
        HEAP8[$27>>0] = 1;
       }
      }
      $28 = ((($1)) + 44|0);
      HEAP32[$28>>2] = 4;
      break;
     }
    }
    $17 = ($3|0)==(1);
    if ($17) {
     HEAP32[$13>>2] = 1;
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 }
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==($1|0);
 return ($3|0);
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 $7 = ((($1)) + 36|0);
 $8 = ((($1)) + 24|0);
 do {
  if ($6) {
   HEAP32[$4>>2] = $2;
   HEAP32[$8>>2] = $3;
   HEAP32[$7>>2] = 1;
  } else {
   $9 = ($5|0)==($2|0);
   if (!($9)) {
    $12 = HEAP32[$7>>2]|0;
    $13 = (($12) + 1)|0;
    HEAP32[$7>>2] = $13;
    HEAP32[$8>>2] = 2;
    $14 = ((($1)) + 54|0);
    HEAP8[$14>>0] = 1;
    break;
   }
   $10 = HEAP32[$8>>2]|0;
   $11 = ($10|0)==(2);
   if ($11) {
    HEAP32[$8>>2] = $3;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==($2|0);
 if ($6) {
  $7 = ((($1)) + 28|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = ($8|0)==(1);
  if (!($9)) {
   HEAP32[$7>>2] = $3;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond22 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 53|0);
 HEAP8[$5>>0] = 1;
 $6 = ((($1)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==($3|0);
 do {
  if ($8) {
   $9 = ((($1)) + 52|0);
   HEAP8[$9>>0] = 1;
   $10 = ((($1)) + 16|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(0|0);
   $13 = ((($1)) + 54|0);
   $14 = ((($1)) + 48|0);
   $15 = ((($1)) + 24|0);
   $16 = ((($1)) + 36|0);
   if ($12) {
    HEAP32[$10>>2] = $2;
    HEAP32[$15>>2] = $4;
    HEAP32[$16>>2] = 1;
    $17 = HEAP32[$14>>2]|0;
    $18 = ($17|0)==(1);
    $19 = ($4|0)==(1);
    $or$cond = $18 & $19;
    if (!($or$cond)) {
     break;
    }
    HEAP8[$13>>0] = 1;
    break;
   }
   $20 = ($11|0)==($2|0);
   if (!($20)) {
    $27 = HEAP32[$16>>2]|0;
    $28 = (($27) + 1)|0;
    HEAP32[$16>>2] = $28;
    HEAP8[$13>>0] = 1;
    break;
   }
   $21 = HEAP32[$15>>2]|0;
   $22 = ($21|0)==(2);
   if ($22) {
    HEAP32[$15>>2] = $4;
    $26 = $4;
   } else {
    $26 = $21;
   }
   $23 = HEAP32[$14>>2]|0;
   $24 = ($23|0)==(1);
   $25 = ($26|0)==(1);
   $or$cond22 = $24 & $25;
   if ($or$cond22) {
    HEAP8[$13>>0] = 1;
   }
  }
 } while(0);
 return;
}
function ___dynamic_cast($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $$0 = 0, $$33 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond28 = 0, $or$cond30 = 0, $or$cond32 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $4 = sp;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + -8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (($0) + ($7)|0);
 $9 = ((($5)) + -4|0);
 $10 = HEAP32[$9>>2]|0;
 HEAP32[$4>>2] = $2;
 $11 = ((($4)) + 4|0);
 HEAP32[$11>>2] = $0;
 $12 = ((($4)) + 8|0);
 HEAP32[$12>>2] = $1;
 $13 = ((($4)) + 12|0);
 HEAP32[$13>>2] = $3;
 $14 = ((($4)) + 16|0);
 $15 = ((($4)) + 20|0);
 $16 = ((($4)) + 24|0);
 $17 = ((($4)) + 28|0);
 $18 = ((($4)) + 32|0);
 $19 = ((($4)) + 40|0);
 dest=$14; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$14+36>>1]=0|0;HEAP8[$14+38>>0]=0|0;
 $20 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10,$2,0)|0);
 L1: do {
  if ($20) {
   $21 = ((($4)) + 48|0);
   HEAP32[$21>>2] = 1;
   $22 = HEAP32[$10>>2]|0;
   $23 = ((($22)) + 20|0);
   $24 = HEAP32[$23>>2]|0;
   FUNCTION_TABLE_viiiiii[$24 & 3]($10,$4,$8,$8,1,0);
   $25 = HEAP32[$16>>2]|0;
   $26 = ($25|0)==(1);
   $$ = $26 ? $8 : 0;
   $$0 = $$;
  } else {
   $27 = ((($4)) + 36|0);
   $28 = HEAP32[$10>>2]|0;
   $29 = ((($28)) + 24|0);
   $30 = HEAP32[$29>>2]|0;
   FUNCTION_TABLE_viiiii[$30 & 3]($10,$4,$8,1,0);
   $31 = HEAP32[$27>>2]|0;
   switch ($31|0) {
   case 0:  {
    $32 = HEAP32[$19>>2]|0;
    $33 = ($32|0)==(1);
    $34 = HEAP32[$17>>2]|0;
    $35 = ($34|0)==(1);
    $or$cond = $33 & $35;
    $36 = HEAP32[$18>>2]|0;
    $37 = ($36|0)==(1);
    $or$cond28 = $or$cond & $37;
    $38 = HEAP32[$15>>2]|0;
    $$33 = $or$cond28 ? $38 : 0;
    $$0 = $$33;
    break L1;
    break;
   }
   case 1:  {
    break;
   }
   default: {
    $$0 = 0;
    break L1;
   }
   }
   $39 = HEAP32[$16>>2]|0;
   $40 = ($39|0)==(1);
   if (!($40)) {
    $41 = HEAP32[$19>>2]|0;
    $42 = ($41|0)==(0);
    $43 = HEAP32[$17>>2]|0;
    $44 = ($43|0)==(1);
    $or$cond30 = $42 & $44;
    $45 = HEAP32[$18>>2]|0;
    $46 = ($45|0)==(1);
    $or$cond32 = $or$cond30 & $46;
    if (!($or$cond32)) {
     $$0 = 0;
     break;
    }
   }
   $47 = HEAP32[$14>>2]|0;
   $$0 = $47;
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 } else {
  $9 = ((($0)) + 8|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($11)) + 20|0);
  $13 = HEAP32[$12>>2]|0;
  FUNCTION_TABLE_viiiiii[$13 & 3]($10,$1,$2,$3,$4,$5);
 }
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$037$off038 = 0, $$037$off039 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   $10 = ((($0)) + 8|0);
   if (!($9)) {
    $41 = HEAP32[$10>>2]|0;
    $42 = HEAP32[$41>>2]|0;
    $43 = ((($42)) + 24|0);
    $44 = HEAP32[$43>>2]|0;
    FUNCTION_TABLE_viiiii[$44 & 3]($41,$1,$2,$3,$4);
    break;
   }
   $11 = ((($1)) + 16|0);
   $12 = HEAP32[$11>>2]|0;
   $13 = ($12|0)==($2|0);
   $14 = ((($1)) + 32|0);
   if (!($13)) {
    $15 = ((($1)) + 20|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($16|0)==($2|0);
    if (!($17)) {
     HEAP32[$14>>2] = $3;
     $19 = ((($1)) + 44|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = ($20|0)==(4);
     if ($21) {
      break;
     }
     $22 = ((($1)) + 52|0);
     HEAP8[$22>>0] = 0;
     $23 = ((($1)) + 53|0);
     HEAP8[$23>>0] = 0;
     $24 = HEAP32[$10>>2]|0;
     $25 = HEAP32[$24>>2]|0;
     $26 = ((($25)) + 20|0);
     $27 = HEAP32[$26>>2]|0;
     FUNCTION_TABLE_viiiiii[$27 & 3]($24,$1,$2,$2,1,$4);
     $28 = HEAP8[$23>>0]|0;
     $29 = ($28<<24>>24)==(0);
     if ($29) {
      $$037$off038 = 4;
      label = 11;
     } else {
      $30 = HEAP8[$22>>0]|0;
      $not$ = ($30<<24>>24)==(0);
      if ($not$) {
       $$037$off038 = 3;
       label = 11;
      } else {
       $$037$off039 = 3;
      }
     }
     if ((label|0) == 11) {
      HEAP32[$15>>2] = $2;
      $31 = ((($1)) + 40|0);
      $32 = HEAP32[$31>>2]|0;
      $33 = (($32) + 1)|0;
      HEAP32[$31>>2] = $33;
      $34 = ((($1)) + 36|0);
      $35 = HEAP32[$34>>2]|0;
      $36 = ($35|0)==(1);
      if ($36) {
       $37 = ((($1)) + 24|0);
       $38 = HEAP32[$37>>2]|0;
       $39 = ($38|0)==(2);
       if ($39) {
        $40 = ((($1)) + 54|0);
        HEAP8[$40>>0] = 1;
        $$037$off039 = $$037$off038;
       } else {
        $$037$off039 = $$037$off038;
       }
      } else {
       $$037$off039 = $$037$off038;
      }
     }
     HEAP32[$19>>2] = $$037$off039;
     break;
    }
   }
   $18 = ($3|0)==(1);
   if ($18) {
    HEAP32[$14>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 } else {
  $7 = ((($0)) + 8|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = HEAP32[$8>>2]|0;
  $10 = ((($9)) + 28|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_viiii[$11 & 3]($8,$1,$2,$3);
 }
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt9exceptionD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt11logic_errorD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (5144);
 $1 = ((($0)) + 4|0);
 __ZNSt3__218__libcpp_refstringD2Ev($1);
 return;
}
function __ZNSt11logic_errorD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNKSt11logic_error4whatEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = (__ZNKSt3__218__libcpp_refstring5c_strEv($1)|0);
 return ($2|0);
}
function __ZNKSt3__218__libcpp_refstring5c_strEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 return ($1|0);
}
function __ZNSt3__218__libcpp_refstringD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (__ZNKSt3__218__libcpp_refstring15__uses_refcountEv($0)|0);
 if ($1) {
  $2 = HEAP32[$0>>2]|0;
  $3 = (__ZNSt3__215__refstring_imp12_GLOBAL__N_113rep_from_dataEPKc_382($2)|0);
  $4 = ((($3)) + 8|0);
  $5 = HEAP32[$4>>2]|0;HEAP32[$4>>2] = (($5+-1)|0);
  $6 = (($5) + -1)|0;
  $7 = ($6|0)<(0);
  if ($7) {
   __ZdlPv($3);
  }
 }
 return;
}
function __ZNSt3__215__refstring_imp12_GLOBAL__N_113rep_from_dataEPKc_382($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -12|0);
 return ($1|0);
}
function __ZNSt12length_errorD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[2953]|0;HEAP32[2953] = (($0+0)|0);
 $1 = $0;
 return ($1|0);
}
function ___cxa_can_catch($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $3 = sp;
 $4 = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $4;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + 16|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (FUNCTION_TABLE_iiii[$7 & 7]($0,$1,$3)|0);
 $9 = $8&1;
 if ($8) {
  $10 = HEAP32[$3>>2]|0;
  HEAP32[$2>>2] = $10;
 }
 STACKTOP = sp;return ($9|0);
}
function ___cxa_is_pointer_type($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $4 = 0;
 } else {
  $2 = (___dynamic_cast($0,32,120,0)|0);
  $phitmp = ($2|0)!=(0|0);
  $4 = $phitmp;
 }
 $3 = $4&1;
 return ($3|0);
}
function runPostSets() {
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      block_aligned_end = (aligned_end - 64)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___divdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0, $1$1 = 0, $2$0 = 0, $2$1 = 0, $4$0 = 0, $4$1 = 0, $6$0 = 0, $7$0 = 0, $7$1 = 0, $8$0 = 0, $10$0 = 0;
    $1$0 = $a$1 >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
    $1$1 = (($a$1 | 0) < 0 ? -1 : 0) >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
    $2$0 = $b$1 >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
    $2$1 = (($b$1 | 0) < 0 ? -1 : 0) >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
    $4$0 = _i64Subtract($1$0 ^ $a$0 | 0, $1$1 ^ $a$1 | 0, $1$0 | 0, $1$1 | 0) | 0;
    $4$1 = tempRet0;
    $6$0 = _i64Subtract($2$0 ^ $b$0 | 0, $2$1 ^ $b$1 | 0, $2$0 | 0, $2$1 | 0) | 0;
    $7$0 = $2$0 ^ $1$0;
    $7$1 = $2$1 ^ $1$1;
    $8$0 = ___udivmoddi4($4$0, $4$1, $6$0, tempRet0, 0) | 0;
    $10$0 = _i64Subtract($8$0 ^ $7$0 | 0, tempRet0 ^ $7$1 | 0, $7$0 | 0, $7$1 | 0) | 0;
    return $10$0 | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function ___muldsi3($a, $b) {
    $a = $a | 0;
    $b = $b | 0;
    var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
    $1 = $a & 65535;
    $2 = $b & 65535;
    $3 = Math_imul($2, $1) | 0;
    $6 = $a >>> 16;
    $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0;
    $11 = $b >>> 16;
    $12 = Math_imul($11, $1) | 0;
    return (tempRet0 = (($8 >>> 16) + (Math_imul($11, $6) | 0) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, 0 | ($8 + $12 << 16 | $3 & 65535)) | 0;
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0, $2 = 0;
    $x_sroa_0_0_extract_trunc = $a$0;
    $y_sroa_0_0_extract_trunc = $b$0;
    $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0;
    $1$1 = tempRet0;
    $2 = Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0;
    return (tempRet0 = ((Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $2 | 0) + $1$1 | $1$1 & 0, 0 | $1$0 & -1) | 0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        ___setErrNo(12);
        return -1;
      }
    }
    return oldDynamicTop|0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >=
      8192
    ) {
      return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _memmove(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if (((src|0) < (dest|0)) & ((dest|0) < ((src + num)|0))) {
      // Unlikely case: Copy backwards in a safe manner
      ret = dest;
      src = (src + num)|0;
      dest = (dest + num)|0;
      while ((num|0) > 0) {
        dest = (dest - 1)|0;
        src = (src - 1)|0;
        num = (num - 1)|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      }
      dest = ret;
    } else {
      _memcpy(dest, src, num) | 0;
    }
    return dest | 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}

  
function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&7](a1|0,a2|0,a3|0)|0;
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&3](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&15](a1|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&3](a1|0)|0;
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&0]();
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&3](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&3](a1|0,a2|0,a3|0,a4|0);
}

function b0(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; abort(0);return 0;
}
function b1(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; abort(1);
}
function b2(p0) {
 p0 = p0|0; abort(2);
}
function b3(p0) {
 p0 = p0|0; abort(3);return 0;
}
function b4() {
 ; abort(4);
}
function b5(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; abort(5);
}
function b6(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; abort(6);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,___stdio_write,___stdio_seek,___stdout_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0,b0,b0];
var FUNCTION_TABLE_viiiii = [b1,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1];
var FUNCTION_TABLE_vi = [b2,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZNSt11logic_errorD2Ev,__ZNSt11logic_errorD0Ev,__ZNSt12length_errorD0Ev,b2,b2,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_ii = [b3,___stdio_close,__ZNKSt11logic_error4whatEv,b3];
var FUNCTION_TABLE_v = [b4];
var FUNCTION_TABLE_viiiiii = [b5,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b5];
var FUNCTION_TABLE_viiii = [b6,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b6];

  return { _llvm_bswap_i32: _llvm_bswap_i32, stackSave: stackSave, _i64Subtract: _i64Subtract, ___udivdi3: ___udivdi3, setThrew: setThrew, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, dynCall_vi: dynCall_vi, _fflush: _fflush, ___cxa_is_pointer_type: ___cxa_is_pointer_type, _memset: _memset, _sbrk: _sbrk, _memcpy: _memcpy, stackAlloc: stackAlloc, ___muldi3: ___muldi3, ___uremdi3: ___uremdi3, ___divdi3: ___divdi3, getTempRet0: getTempRet0, setTempRet0: setTempRet0, _i64Add: _i64Add, _height: _height, _decode: _decode, dynCall_iiii: dynCall_iiii, _emscripten_get_global_libc: _emscripten_get_global_libc, dynCall_ii: dynCall_ii, dynCall_viiii: dynCall_viiii, ___errno_location: ___errno_location, dynCall_viiiii: dynCall_viiiii, ___cxa_can_catch: ___cxa_can_catch, _free: _free, runPostSets: runPostSets, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, _memmove: _memmove, _width: _width, stackRestore: stackRestore, _malloc: _malloc, dynCall_v: dynCall_v };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var stackSave = Module["stackSave"] = asm["stackSave"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___muldi3 = Module["___muldi3"] = asm["___muldi3"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var ___divdi3 = Module["___divdi3"] = asm["___divdi3"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _height = Module["_height"] = asm["_height"];
var _decode = Module["_decode"] = asm["_decode"];
var _emscripten_get_global_libc = Module["_emscripten_get_global_libc"] = asm["_emscripten_get_global_libc"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var _free = Module["_free"] = asm["_free"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _width = Module["_width"] = asm["_width"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
;
Runtime.stackAlloc = Module['stackAlloc'];
Runtime.stackSave = Module['stackSave'];
Runtime.stackRestore = Module['stackRestore'];
Runtime.establishStackSpace = Module['establishStackSpace'];
Runtime.setTempRet0 = Module['setTempRet0'];
Runtime.getTempRet0 = Module['getTempRet0'];


// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;






/**
 * @constructor
 * @extends {Error}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      Module.printErr('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    return;
  }


  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();


    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    return;
  }

  if (Module['noExitRuntime']) {
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '\nIf this abort() is unexpected, build with -s ASSERTIONS=1 which can give more information.';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = false;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



