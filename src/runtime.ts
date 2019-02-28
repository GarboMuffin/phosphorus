
/// <reference path="sb2.ts" />
/// <reference path="core.ts" />

// The phosphorus Scratch runtime
// Provides methods expected at runtime by scripts created by the compiler and an environment for Scratch scripts to run
namespace P.runtime {
  // The runtime is really weird and hard to understand.
  // The upside: it's fast as hell.

  // Global variables expected by scripts at runtime:
  // Current runtime
  var runtime: Runtime;
  // Current stage
  var self: P.core.Stage;
  // Current sprite or stage
  var S: P.core.Base;
  // Used for resuming state
  var R;
  // Stack of states (??)
  var STACK;
  // Current procedure call, if any. Contains arguments.
  var C;
  // If level of layers of "Run without screen refresh" we are in
  // Each subsequent procedure call will increment and decrement as they start and stop.
  var WARP;
  // ??
  var CALLS;
  // ??
  var BASE;
  // ??
  var THREAD;
  // The next function to run immediately after this one.
  var IMMEDIATE;
  // Has a "visual change" been made in this frame?
  var VISUAL: boolean;

  // Converts a value to its boolean equivalent
  var bool = function(v) {
    return +v !== 0 && v !== '' && v !== 'false' && v !== false;
  };

  var DIGIT = /\d/;
  // Compares two values. Returns -1 if x < y, 1 if x > y, 0 if x === y
  var compare = function(x, y) {
    if ((typeof x === 'number' || DIGIT.test(x)) && (typeof y === 'number' || DIGIT.test(y))) {
      var nx = +x;
      var ny = +y;
      if (nx === nx && ny === ny) {
        return nx < ny ? -1 : nx === ny ? 0 : 1;
      }
    }
    var xs = ('' + x).toLowerCase();
    var ys = ('' + y).toLowerCase();
    return xs < ys ? -1 : xs === ys ? 0 : 1;
  };
  // Determines if y is less than nx
  var numLess = function(nx, y) {
    if (typeof y === 'number' || DIGIT.test(y)) {
      var ny = +y;
      if (ny === ny) {
        return nx < ny;
      }
    }
    var ys = ('' + y).toLowerCase();
    return '' + nx < ys;
  };
  // Determines if y is greater than nx
  var numGreater = function(nx, y) {
    if (typeof y === 'number' || DIGIT.test(y)) {
      var ny = +y;
      if (ny === ny) {
        return nx > ny;
      }
    }
    var ys = ('' + y).toLowerCase();
    return '' + nx > ys;
  };
  // Determines if x is equal to y
  var equal = function(x, y) {
    if ((typeof x === 'number' || DIGIT.test(x)) && (typeof y === 'number' || DIGIT.test(y))) {
      var nx = +x;
      var ny = +y;
      if (nx === nx && ny === ny) {
        return nx === ny;
      }
    }
    var xs = ('' + x).toLowerCase();
    var ys = ('' + y).toLowerCase();
    return xs === ys;
  };
  // Determines if x (number) and y (number) are equal to each other
  var numEqual = function(nx, y) {
    if (typeof y === 'number' || DIGIT.test(y)) {
      var ny = +y;
      return ny === ny && nx === ny;
    }
    return false;
  };

  var mod = function(x, y) {
    var r = x % y;
    if (r / y < 0) {
      r += y;
    }
    return r;
  };

  var random = function(x, y) {
    x = +x || 0;
    y = +y || 0;
    if (x > y) {
      var tmp = y;
      y = x;
      x = tmp;
    }
    if (x % 1 === 0 && y % 1 === 0) {
      return Math.floor(Math.random() * (y - x + 1)) + x;
    }
    return Math.random() * (y - x) + x;
  };

  var rgb2hsl = function(rgb) {
    var r = (rgb >> 16 & 0xff) / 0xff;
    var g = (rgb >> 8 & 0xff) / 0xff;
    var b = (rgb & 0xff) / 0xff;

    var min = Math.min(r, g, b);
    var max = Math.max(r, g, b);

    if (min === max) {
      return [0, 0, r * 100];
    }

    var c = max - min;
    var l = (min + max) / 2;
    var s = c / (1 - Math.abs(2 * l - 1));

    var h;
    switch (max) {
      case r: h = ((g - b) / c + 6) % 6; break;
      case g: h = (b - r) / c + 2; break;
      case b: h = (r - g) / c + 4; break;
    }
    h *= 60;

    return [h, s * 100, l * 100];
  };

  var clone = function(name) {
    const parent = name === '_myself_' ? S : self.getObject(name);
    if (!parent) {
      throw new Error('No parent!');
    }
    if (!P.core.isSprite(parent)) {
      throw new Error('Cannot clone non-sprite object');
    }
    const c = parent.clone();
    self.children.splice(self.children.indexOf(parent), 0, c);
    runtime.triggerFor(c, 'whenCloned');
  };

  const epoch = Date.UTC(2000, 0, 1);

  var getVars = function(name) {
    return self.vars[name] !== undefined ? self.vars : S.vars;
  };

  var getLists = function(name) {
    if (self.lists[name] !== undefined) return self.lists;
    if (S.lists[name] === undefined) {
      S.lists[name] = [];
    }
    return S.lists;
  };

  var listIndex = function(list, index, length) {
    var i = index | 0;
    if (i === index) return i > 0 && i <= length ? i - 1 : -1;
    if (index === 'random' || index === 'any') {
      return Math.random() * length | 0;
    }
    if (index === 'last') {
      return length - 1;
    }
    return i > 0 && i <= length ? i - 1 : -1;
  };

  var contentsOfList = function(list) {
    var isSingle = true;
    for (var i = list.length; i--;) {
      if (list[i].length !== 1) {
        isSingle = false;
        break;
      }
    }
    return list.join(isSingle ? '' : ' ');
  };

  var getLineOfList = function(list, index) {
    var i = listIndex(list, index, list.length);
    return i !== -1 ? list[i] : '';
  };

  var listContains = function(list, value) {
    for (var i = list.length; i--;) {
      if (equal(list[i], value)) return true;
    }
    return false;
  };

  var listIndexOf = function(list, value) {
    for (var i = list.length; i--;) {
      if (equal(list[i], value)) return i + 1;
    }
    return 0;
  };

  var appendToList = function(list, value) {
    list.push(value);
  };

  var deleteLineOfList = function(list, index) {
    if (index === 'all') {
      list.length = 0;
    } else {
      var i = listIndex(list, index, list.length);
      if (i === list.length - 1) {
        list.pop();
      } else if (i !== -1) {
        list.splice(i, 1);
      }
    }
  };

  var insertInList = function(list, index, value) {
    var i = listIndex(list, index, list.length + 1);
    if (i === list.length) {
      list.push(value);
    } else if (i !== -1) {
      list.splice(i, 0, value);
    }
  };

  var setLineOfList = function(list, index, value) {
    var i = listIndex(list, index, list.length);
    if (i !== -1) {
      list[i] = value;
    }
  };

  var mathFunc = function(f, x) {
    switch (f) {
      case 'abs':
        return Math.abs(x);
      case 'floor':
        return Math.floor(x);
      case 'sqrt':
        return Math.sqrt(x);
      case 'ceiling':
        return Math.ceil(x);
      case 'cos':
        return Math.cos(x * Math.PI / 180);
      case 'sin':
        return Math.sin(x * Math.PI / 180);
      case 'tan':
        return Math.tan(x * Math.PI / 180);
      case 'asin':
        return Math.asin(x) * 180 / Math.PI;
      case 'acos':
        return Math.acos(x) * 180 / Math.PI;
      case 'atan':
        return Math.atan(x) * 180 / Math.PI;
      case 'ln':
        return Math.log(x);
      case 'log':
        return Math.log(x) / Math.LN10;
      case 'e ^':
        return Math.exp(x);
      case '10 ^':
        return Math.exp(x * Math.LN10);
    }
    return 0;
  };

  var attribute = function(attr, objName) {
    var o = self.getObject(objName);
    if (!o) return 0;
    if (P.core.isSprite(o)) {
      switch (attr) {
        case 'x position': return o.scratchX;
        case 'y position': return o.scratchY;
        case 'direction': return o.direction;
        case 'costume #': return o.currentCostumeIndex + 1;
        case 'costume name': return o.costumes[o.currentCostumeIndex].name;
        case 'size': return o.scale * 100;
        case 'volume': return 0; // TODO
      }
    } else {
      switch (attr) {
        case 'background #':
        case 'backdrop #': return o.currentCostumeIndex + 1;
        case 'backdrop name': return o.costumes[o.currentCostumeIndex].name;
        case 'volume': return 0; // TODO
      }
    }
    var value = o.vars[attr];
    if (value !== undefined) {
      return value;
    }
    return 0;
  };

  // TODO: configurable volume
  var VOLUME = 0.3;

  var audioContext = P.audio.context;
  if (audioContext) {
    // TODO: move wavBuffers to IO
    var wavBuffers = P.sb2.wavBuffers;

    var volumeNode = audioContext.createGain();
    volumeNode.gain.value = VOLUME;
    volumeNode.connect(audioContext.destination);

    var playNote = function(id, duration) {
      var spans = INSTRUMENTS[S.instrument];
      for (var i = 0, l = spans.length; i < l; i++) {
        var span = spans[i];
        if (span.top >= id || span.top === 128) break;
      }
      playSpan(span, Math.max(0, Math.min(127, id)), duration);
    };

    var playSpan = function(span, id, duration) {
      if (!S.node) {
        S.node = audioContext.createGain();
        S.node.gain.value = S.volume;
        S.node.connect(volumeNode);
      }

      var source = audioContext.createBufferSource();
      var note = audioContext.createGain();
      var buffer = wavBuffers[span.name];
      if (!buffer) return;

      source.buffer = buffer;
      if (source.loop = span.loop) {
        source.loopStart = span.loopStart;
        source.loopEnd = span.loopEnd;
      }

      source.connect(note);
      note.connect(S.node);

      var time = audioContext.currentTime;
      source.playbackRate.value = Math.pow(2, (id - 69) / 12) / span.baseRatio;

      var gain = note.gain;
      gain.value = 0;
      gain.setValueAtTime(0, time);
      if (span.attackEnd < duration) {
        gain.linearRampToValueAtTime(1, time + span.attackEnd);
        if (span.decayTime > 0 && span.holdEnd < duration) {
          gain.linearRampToValueAtTime(1, time + span.holdEnd);
          if (span.decayEnd < duration) {
            gain.linearRampToValueAtTime(0, time + span.decayEnd);
          } else {
            gain.linearRampToValueAtTime(1 - (duration - span.holdEnd) / span.decayTime, time + duration);
          }
        } else {
          gain.linearRampToValueAtTime(1, time + duration);
        }
      } else {
        gain.linearRampToValueAtTime(1, time + duration);
      }
      gain.linearRampToValueAtTime(0, time + duration + 0.02267573696);

      source.start(time);
      source.stop(time + duration + 0.02267573696);
    };

    var playSound = function(sound) {
      if (!sound.buffer) return;
      if (!sound.node) {
        sound.node = audioContext.createGain();
        sound.node.gain.value = S.volume;
        sound.node.connect(volumeNode);
      }
      sound.target = S;
      sound.node.gain.setValueAtTime(S.volume, audioContext.currentTime);

      if (sound.source) {
        sound.source.disconnect();
      }
      sound.source = audioContext.createBufferSource();
      sound.source.buffer = sound.buffer;
      sound.source.connect(sound.node);

      sound.source.start(audioContext.currentTime);
    };
  }

  var save = function() {
    STACK.push(R);
    R = {};
  };

  var restore = function() {
    R = STACK.pop();
  };

  var call = function(procedure: P.core.Procedure, id, values) {
    if (procedure) {
      STACK.push(R);
      CALLS.push(C);
      C = {
        base: procedure.fn,
        fn: S.fns[id],
        args: procedure.call(values),
        numargs: [],
        boolargs: [],
        stack: STACK = [],
        warp: procedure.warp,
      };
      R = {};
      if (C.warp || WARP) {
        WARP++;
        IMMEDIATE = procedure.fn;
      } else {
        for (var i = CALLS.length, j = 5; i-- && j--;) {
          if (CALLS[i].base === procedure.fn) {
            var recursive = true;
            break;
          }
        }
        if (recursive) {
          runtime.queue[THREAD] = {
            sprite: S,
            base: BASE,
            fn: procedure.fn,
            calls: CALLS
          };
        } else {
          IMMEDIATE = procedure.fn;
        }
      }
    } else {
      IMMEDIATE = S.fns[id];
    }
  };

  var endCall = function() {
    if (CALLS.length) {
      if (WARP) WARP--;
      IMMEDIATE = C.fn;
      C = CALLS.pop();
      STACK = C.stack;
      R = STACK.pop();
    }
  };

  var sceneChange = function() {
    return runtime.trigger('whenSceneStarts', self.costumes[self.currentCostumeIndex].name);
  };

  function backdropChange() {
    return runtime.trigger('whenBackdropChanges', self.costumes[self.currentCostumeIndex].name);
  }

  var broadcast = function(name) {
    return runtime.trigger('whenIReceive', self.getBroadcastId(name));
  };

  var running = function(bases) {
    for (var j = 0; j < runtime.queue.length; j++) {
      if (runtime.queue[j] && bases.indexOf(runtime.queue[j].base) !== -1) return true;
    }
    return false;
  };

  var queue = function(id) {
    if (WARP) {
      IMMEDIATE = S.fns[id];
    } else {
      forceQueue(id);
    }
  };

  var forceQueue = function(id) {
    runtime.queue[THREAD] = {
      sprite: S,
      base: BASE,
      fn: S.fns[id],
      calls: CALLS
    };
  };

  // Extend the stage with new methods related to running the project.

  class Thread {
    constructor(
      public sprite: P.core.Base,
      public base: any,
      public fn: any,
      public calls: any,
    ) {

    }
  }

  export class Runtime {
    public queue: (Thread | undefined)[] = [];
    public isRunning: boolean = false;
    public timerStart: number = 0;
    public baseTime: number = 0;
    public baseNow: number = 0;
    public now: number = 0;
    public interval: number;
    public isTurbo: boolean = false;

    constructor(public stage: P.core.Stage) {
      this.onError = this.onError.bind(this);
    }

    startThread(sprite, base) {
      const thread = new Thread(sprite, base, base, [{args: [], stack: [{}]}]);

      for (let i = 0; i < this.queue.length; i++) {
        const q = this.queue[i];
        if (q && q.sprite === sprite && q.base === base) {
          this.queue[i] = thread;
          return;
        }
      }

      this.queue.push(thread);
    }

    triggerFor(sprite: P.core.Base, event: string, arg?: any) {
      var threads;
      switch (event) {
        case 'whenClicked': threads = sprite.listeners.whenClicked; break;
        case 'whenCloned': threads = sprite.listeners.whenCloned; break;
        case 'whenGreenFlag': threads = sprite.listeners.whenGreenFlag; break;
        case 'whenKeyPressed': threads = sprite.listeners.whenKeyPressed[arg]; break;
        case 'whenSceneStarts': threads = sprite.listeners.whenSceneStarts[('' + arg).toLowerCase()]; break;
        case 'whenBackdropChanges': threads = sprite.listeners.whenBackdropChanges['' + arg]; break;
        case 'whenIReceive':
          arg = '' + arg;
          threads = sprite.listeners.whenIReceive[arg] || sprite.listeners.whenIReceive[arg.toLowerCase()];
          break;
        default: throw new Error('Unknown trigger event: ' + event);
      }
      if (threads) {
        for (let i = 0; i < threads.length; i++) {
          this.startThread(sprite, threads[i]);
        }
      }
      return threads || [];
    }

    trigger(event: string, arg?: any) {
      let threads = [];
      for (let i = this.stage.children.length; i--;) {
        threads = threads.concat(this.triggerFor(this.stage.children[i], event, arg));
      }
      return threads.concat(this.triggerFor(this.stage, event, arg));
    };

    triggerGreenFlag() {
      this.timerStart = this.rightNow();
      this.trigger('whenGreenFlag');
    };

    start() {
      this.isRunning = true;
      if (this.interval) return;
      window.addEventListener('error', this.onError);
      this.baseTime = Date.now();
      this.interval = setInterval(this.step.bind(this), 1000 / P.config.framerate);
      if (audioContext) audioContext.resume();
    };

    pause() {
      if (this.interval) {
        this.baseNow = this.rightNow();
        clearInterval(this.interval);
        delete this.interval;
        window.removeEventListener('error', this.onError);
        if (audioContext) audioContext.suspend();
      }
      this.isRunning = false;
    };

    stopAll() {
      this.stage.hidePrompt = false;
      this.stage.prompter.style.display = 'none';
      this.stage.promptId = this.stage.nextPromptId = 0;
      this.queue.length = 0;
      this.stage.resetFilters();
      this.stage.stopSounds();
      for (var i = 0; i < this.stage.children.length; i++) {
        var c = this.stage.children[i];
        if (c.isClone) {
          c.remove();
          this.stage.children.splice(i, 1);
          i -= 1;
        } else {
          c.resetFilters();
          if (c.saying && P.core.isSprite(c)) c.say('');
          c.stopSounds();
        }
      }
    };

    rightNow() {
      return this.baseNow + Date.now() - this.baseTime;
    };

    step() {
      // Reset runtime variables
      self = this.stage;
      runtime = this;
      VISUAL = false;

      const start = Date.now();
      do {
        var queue = this.queue;
        this.now = this.rightNow();
        for (THREAD = 0; THREAD < queue.length; THREAD++) {
          if (queue[THREAD]) {
            // Load thread data
            S = queue[THREAD].sprite;
            IMMEDIATE = queue[THREAD].fn;
            BASE = queue[THREAD].base;
            CALLS = queue[THREAD].calls;
            C = CALLS.pop();
            STACK = C.stack;
            R = STACK.pop();
            queue[THREAD] = undefined;
            WARP = 0;

            while (IMMEDIATE) {
              const fn = IMMEDIATE;
              IMMEDIATE = null;
              // if (P.config.debug) {
              //   console.log('running', S.name, fn);
              // }
              fn();
            }

            STACK.push(R);
            CALLS.push(C);
          }
        }

        // Remove empty threads in the queue
        for (let i = queue.length; i--;) {
          if (!queue[i]) queue.splice(i, 1);
        }
      } while ((this.isTurbo || !VISUAL) && Date.now() - start < 1000 / P.config.framerate && queue.length);

      this.stage.draw();
      S = null;
    };

    onError(e) {
      this.handleError(e.error);
      clearInterval(this.interval);
    };

    handleError(e) {
      console.error(e);
    };
  }

  /*
    copy(JSON.stringify(instruments.map(function(g) {
      return g.map(function(r) {
        var attackTime = r[5] ? r[5][0] * 0.001 : 0;
        var holdTime = r[5] ? r[5][1] * 0.001 : 0;
        var decayTime = r[5] ? r[5][2] : 0;
        var baseRatio = Math.pow(2, (r[2] - 69) / 12);
        if (r[3] !== -1) {
          var length = r[4] - r[3];
          baseRatio = 22050 * Math.round(length * 440 * baseRatio / 22050) / length / 440;
        }
        return {
          top: r[0],
          name: r[1],
          baseRatio: baseRatio,
          loop: r[3] !== -1,
          loopStart: r[3] / 22050,
          loopEnd: r[4] / 22050,
          attackEnd: attackTime,
          holdEnd: attackTime + holdTime,
          decayEnd: attackTime + holdTime + decayTime
        }
      })
    }))
  */
  // TODO: generate these big arrays at runtime?
  var INSTRUMENTS = [
    [
      {top:38,name:'AcousticPiano_As3',baseRatio:0.5316313272700484,loop:true,loopStart:0.465578231292517,loopEnd:0.7733786848072562,attackEnd:0,holdEnd:0.1,decayEnd:22.1},
      {top:44,name:'AcousticPiano_C4',baseRatio:0.5905141892259927,loop:true,loopStart:0.6334693877551021,loopEnd:0.8605442176870748,attackEnd:0,holdEnd:0.1,decayEnd:20.1},
      {top:51,name:'AcousticPiano_G4',baseRatio:0.8843582887700535,loop:true,loopStart:0.5532879818594104,loopEnd:0.5609977324263039,attackEnd:0,holdEnd:0.08,decayEnd:18.08},
      {top:62,name:'AcousticPiano_C6',baseRatio:2.3557692307692304,loop:true,loopStart:0.5914739229024943,loopEnd:0.6020861678004535,attackEnd:0,holdEnd:0.08,decayEnd:16.08},
      {top:70,name:'AcousticPiano_F5',baseRatio:1.5776515151515151,loop:true,loopStart:0.5634920634920635,loopEnd:0.5879818594104308,attackEnd:0,holdEnd:0.04,decayEnd:14.04},
      {top:77,name:'AcousticPiano_Ds6',baseRatio:2.800762112139358,loop:true,loopStart:0.560907029478458,loopEnd:0.5836281179138322,attackEnd:0,holdEnd:0.02,decayEnd:10.02},
      {top:85,name:'AcousticPiano_Ds6',baseRatio:2.800762112139358,loop:true,loopStart:0.560907029478458,loopEnd:0.5836281179138322,attackEnd:0,holdEnd:0,decayEnd:8},
      {top:90,name:'AcousticPiano_Ds6',baseRatio:2.800762112139358,loop:true,loopStart:0.560907029478458,loopEnd:0.5836281179138322,attackEnd:0,holdEnd:0,decayEnd:6},
      {top:96,name:'AcousticPiano_D7',baseRatio:5.275119617224881,loop:true,loopStart:0.3380498866213152,loopEnd:0.34494331065759637,attackEnd:0,holdEnd:0,decayEnd:3},
      {top:128,name:'AcousticPiano_D7',baseRatio:5.275119617224881,loop:true,loopStart:0.3380498866213152,loopEnd:0.34494331065759637,attackEnd:0,holdEnd:0,decayEnd:2}
    ], [
      {top:48,name:'ElectricPiano_C2',baseRatio:0.14870515241435123,loop:true,loopStart:0.6956009070294784,loopEnd:0.7873015873015873,attackEnd:0,holdEnd:0.08,decayEnd:10.08},
      {top:74,name:'ElectricPiano_C4',baseRatio:0.5945685670261941,loop:true,loopStart:0.5181859410430839,loopEnd:0.5449433106575964,attackEnd:0,holdEnd:0.04,decayEnd:8.04},
      {top:128,name:'ElectricPiano_C4',baseRatio:0.5945685670261941,loop:true,loopStart:0.5181859410430839,loopEnd:0.5449433106575964,attackEnd:0,holdEnd:0,decayEnd:6}
    ], [
      {top:128,name:'Organ_G2',baseRatio:0.22283731584620914,loop:true,loopStart:0.05922902494331066,loopEnd:0.1510204081632653,attackEnd:0,holdEnd:0,decayEnd:0}
    ],[{top:40,name:'AcousticGuitar_F3',baseRatio:0.3977272727272727,loop:true,loopStart:1.6628117913832199,loopEnd:1.6685260770975057,attackEnd:0,holdEnd:0,decayEnd:15},
      {top:56,name:'AcousticGuitar_F3',baseRatio:0.3977272727272727,loop:true,loopStart:1.6628117913832199,loopEnd:1.6685260770975057,attackEnd:0,holdEnd:0,decayEnd:13.5},
      {top:60,name:'AcousticGuitar_F3',baseRatio:0.3977272727272727,loop:true,loopStart:1.6628117913832199,loopEnd:1.6685260770975057,attackEnd:0,holdEnd:0,decayEnd:12},
      {top:67,name:'AcousticGuitar_F3',baseRatio:0.3977272727272727,loop:true,loopStart:1.6628117913832199,loopEnd:1.6685260770975057,attackEnd:0,holdEnd:0,decayEnd:8.5},
      {top:72,name:'AcousticGuitar_F3',baseRatio:0.3977272727272727,loop:true,loopStart:1.6628117913832199,loopEnd:1.6685260770975057,attackEnd:0,holdEnd:0,decayEnd:7},
      {top:83,name:'AcousticGuitar_F3',baseRatio:0.3977272727272727,loop:true,loopStart:1.6628117913832199,loopEnd:1.6685260770975057,attackEnd:0,holdEnd:0,decayEnd:5.5},
      {top:128,name:'AcousticGuitar_F3',baseRatio:0.3977272727272727,loop:true,loopStart:1.6628117913832199,loopEnd:1.6685260770975057,attackEnd:0,holdEnd:0,decayEnd:4.5}
    ], [
      {top:40,name:'ElectricGuitar_F3',baseRatio:0.39615522817103843,loop:true,loopStart:1.5733333333333333,loopEnd:1.5848072562358,attackEnd:0,holdEnd:0,decayEnd:15},
      {top:56,name:'ElectricGuitar_F3',baseRatio:0.39615522817103843,loop:true,loopStart:1.5733333333333333,loopEnd:1.5848072562358277,attackEnd:0,holdEnd:0,decayEnd:13.5},
      {top:60,name:'ElectricGuitar_F3',baseRatio:0.39615522817103843,loop:true,loopStart:1.5733333333333333,loopEnd:1.5848072562358277,attackEnd:0,holdEnd:0,decayEnd:12},
      {top:67,name:'ElectricGuitar_F3',baseRatio:0.39615522817103843,loop:true,loopStart:1.5733333333333333,loopEnd:1.5848072562358277,attackEnd:0,holdEnd:0,decayEnd:8.5},
      {top:72,name:'ElectricGuitar_F3',baseRatio:0.39615522817103843,loop:true,loopStart:1.5733333333333333,loopEnd:1.5848072562358277,attackEnd:0,holdEnd:0,decayEnd:7},
      {top:83,name:'ElectricGuitar_F3',baseRatio:0.39615522817103843,loop:true,loopStart:1.5733333333333333,loopEnd:1.5848072562358277,attackEnd:0,holdEnd:0,decayEnd:5.5},
      {top:128,name:'ElectricGuitar_F3',baseRatio:0.39615522817103843,loop:true,loopStart:1.5733333333333333,loopEnd:1.5848072562358277,attackEnd:0,holdEnd:0,decayEnd:4.5}
    ], [
      {top:34,name:'ElectricBass_G1',baseRatio:0.11111671034065712,loop:true,loopStart:1.9007709750566892,loopEnd:1.9212244897959183,attackEnd:0,holdEnd:0,decayEnd:17},
      {top:48,name:'ElectricBass_G1',baseRatio:0.11111671034065712,loop:true,loopStart:1.9007709750566892,loopEnd:1.9212244897959183,attackEnd:0,holdEnd:0,decayEnd:14},
      {top:64,name:'ElectricBass_G1',baseRatio:0.11111671034065712,loop:true,loopStart:1.9007709750566892,loopEnd:1.9212244897959183,attackEnd:0,holdEnd:0,decayEnd:12},
      {top:128,name:'ElectricBass_G1',baseRatio:0.11111671034065712,loop:true,loopStart:1.9007709750566892,loopEnd:1.9212244897959183,attackEnd:0,holdEnd:0,decayEnd:10}
    ], [
      {top:38,name:'Pizz_G2',baseRatio:0.21979665071770335,loop:true,loopStart:0.3879365079365079,loopEnd:0.3982766439909297,attackEnd:0,holdEnd:0,decayEnd:5},
      {top:45,name:'Pizz_G2',baseRatio:0.21979665071770335,loop:true,loopStart:0.3879365079365079,loopEnd:0.3982766439909297,attackEnd:0,holdEnd:0.012,decayEnd:4.012},
      {top:56,name:'Pizz_A3',baseRatio:0.503654636820466,loop:true,loopStart:0.5197278911564626,loopEnd:0.5287528344671202,attackEnd:0,holdEnd:0,decayEnd:4},
      {top:64,name:'Pizz_A3',baseRatio:0.503654636820466,loop:true,loopStart:0.5197278911564626,loopEnd:0.5287528344671202,attackEnd:0,holdEnd:0,decayEnd:3.2},
      {top:72,name:'Pizz_E4',baseRatio:0.7479647218453188,loop:true,loopStart:0.7947845804988662,loopEnd:0.7978231292517007,attackEnd:0,holdEnd:0,decayEnd:2.8},
      {top:80,name:'Pizz_E4',baseRatio:0.7479647218453188,loop:true,loopStart:0.7947845804988662,loopEnd:0.7978231292517007,attackEnd:0,holdEnd:0,decayEnd:2.2},
      {top:128,name:'Pizz_E4',baseRatio:0.7479647218453188,loop:true,loopStart:0.7947845804988662,loopEnd:0.7978231292517007,attackEnd:0,holdEnd:0,decayEnd:1.5}
    ], [
      {top:41,name:'Cello_C2',baseRatio:0.14870515241435123,loop:true,loopStart:0.3876643990929705,loopEnd:0.40294784580498866,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:52,name:'Cello_As2',baseRatio:0.263755980861244,loop:true,loopStart:0.3385487528344671,loopEnd:0.35578231292517004,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:62,name:'Violin_D4',baseRatio:0.6664047388781432,loop:true,loopStart:0.48108843537414964,loopEnd:0.5151927437641723,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:75,name:'Violin_A4',baseRatio:0.987460815047022,loop:true,loopStart:0.14108843537414967,loopEnd:0.15029478458049886,attackEnd:0.07,holdEnd:0.07,decayEnd:0.07},
      {top:128,name:'Violin_E5',baseRatio:1.4885238523852387,loop:true,loopStart:0.10807256235827664,loopEnd:0.1126530612244898,attackEnd:0,holdEnd:0,decayEnd:0}
    ], [
      {top:30,name:'BassTrombone_A2_3',baseRatio:0.24981872564125807,loop:true,loopStart:0.061541950113378686,loopEnd:0.10702947845804989,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:40,name:'BassTrombone_A2_2',baseRatio:0.24981872564125807,loop:true,loopStart:0.08585034013605441,loopEnd:0.13133786848072562,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:55,name:'Trombone_B3',baseRatio:0.5608240680183126,loop:true,loopStart:0.12,loopEnd:0.17673469387755103,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:88,name:'Trombone_B3',baseRatio:0.5608240680183126,loop:true,loopStart:0.12,loopEnd:0.17673469387755103,attackEnd:0.05,holdEnd:0.05,decayEnd:0.05},
      {top:128,name:'Trumpet_E5',baseRatio:1.4959294436906376,loop:true,loopStart:0.1307936507936508,loopEnd:0.14294784580498865,attackEnd:0,holdEnd:0,decayEnd:0}
    ], [
      {top:128,name:'Clarinet_C4',baseRatio:0.5940193965517241,loop:true,loopStart:0.6594104308390023,loopEnd:0.7014965986394558,attackEnd:0,holdEnd:0,decayEnd:0}
    ], [
      {top:40,name:'TenorSax_C3',baseRatio:0.2971698113207547,loop:true,loopStart:0.4053968253968254,loopEnd:0.4895238095238095,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:50,name:'TenorSax_C3',baseRatio:0.2971698113207547,loop:true,loopStart:0.4053968253968254,loopEnd:0.4895238095238095,attackEnd:0.02,holdEnd:0.02,decayEnd:0.02},
      {top:59,name:'TenorSax_C3',baseRatio:0.2971698113207547,loop:true,loopStart:0.4053968253968254,loopEnd:0.4895238095238095,attackEnd:0.04,holdEnd:0.04,decayEnd:0.04},
      {top:67,name:'AltoSax_A3',baseRatio:0.49814747876378096,loop:true,loopStart:0.3875736961451247,loopEnd:0.4103854875283447,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:75,name:'AltoSax_A3',baseRatio:0.49814747876378096,loop:true,loopStart:0.3875736961451247,loopEnd:0.4103854875283447,attackEnd:0.02,holdEnd:0.02,decayEnd:0.02},
      {top:80,name:'AltoSax_A3',baseRatio:0.49814747876378096,loop:true,loopStart:0.3875736961451247,loopEnd:0.4103854875283447,attackEnd:0.02,holdEnd:0.02,decayEnd:0.02},
      {top:128,name:'AltoSax_C6',baseRatio:2.3782742681047764,loop:true,loopStart:0.05705215419501134,loopEnd:0.0838095238095238,attackEnd:0,holdEnd:0,decayEnd:0}
    ], [
      {top:61,name:'Flute_B5_2',baseRatio:2.255113636363636,loop:true,loopStart:0.08430839002267573,loopEnd:0.10244897959183673,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:128,name:'Flute_B5_1',baseRatio:2.255113636363636,loop:true,loopStart:0.10965986394557824,loopEnd:0.12780045351473923,attackEnd:0,holdEnd:0,decayEnd:0}
    ], [
      {top:128,name:'WoodenFlute_C5',baseRatio:1.1892952324548416,loop:true,loopStart:0.5181859410430839,loopEnd:0.7131065759637188,attackEnd:0,holdEnd:0,decayEnd:0}
    ], [
      {top:57,name:'Bassoon_C3',baseRatio:0.29700969827586204,loop:true,loopStart:0.11011337868480725,loopEnd:0.19428571428571428,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:67,name:'Bassoon_C3',baseRatio:0.29700969827586204,loop:true,loopStart:0.11011337868480725,loopEnd:0.19428571428571428,attackEnd:0.04,holdEnd:0.04,decayEnd:0.04},
      {top:76,name:'Bassoon_C3',baseRatio:0.29700969827586204,loop:true,loopStart:0.11011337868480725,loopEnd:0.19428571428571428,attackEnd:0.08,holdEnd:0.08,decayEnd:0.08},
      {top:84,name:'EnglishHorn_F3',baseRatio:0.39601293103448276,loop:true,loopStart:0.341859410430839,loopEnd:0.4049886621315193,attackEnd:0.04,holdEnd:0.04,decayEnd:0.04},
      {top:128,name:'EnglishHorn_D4',baseRatio:0.6699684005833739,loop:true,loopStart:0.22027210884353743,loopEnd:0.23723356009070296,attackEnd:0,holdEnd:0,decayEnd:0}
    ], [
      {top:39,name:'Choir_F3',baseRatio:0.3968814788643197,loop:true,loopStart:0.6352380952380953,loopEnd:1.8721541950113378,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:50,name:'Choir_F3',baseRatio:0.3968814788643197,loop:true,loopStart:0.6352380952380953,loopEnd:1.8721541950113378,attackEnd:0.04,holdEnd:0.04,decayEnd:0.04},
      {top:61,name:'Choir_F3',baseRatio:0.3968814788643197,loop:true,loopStart:0.6352380952380953,loopEnd:1.8721541950113378,attackEnd:0.06,holdEnd:0.06,decayEnd:0.06},
      {top:72,name:'Choir_F4',baseRatio:0.7928898424161845,loop:true,loopStart:0.7415419501133786,loopEnd:2.1059410430839,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:128,name:'Choir_F5',baseRatio:1.5879576065654504,loop:true,loopStart:0.836281179138322,loopEnd:2.0585487528344673,attackEnd:0,holdEnd:0,decayEnd:0}
    ], [
      {top:38,name:'Vibraphone_C3',baseRatio:0.29829545454545453,loop:true,loopStart:0.2812698412698413,loopEnd:0.28888888888888886,attackEnd:0,holdEnd:0.1,decayEnd:8.1},
      {top:48,name:'Vibraphone_C3',baseRatio:0.29829545454545453,loop:true,loopStart:0.2812698412698413,loopEnd:0.28888888888888886,attackEnd:0,holdEnd:0.1,decayEnd:7.6},
      {top:59,name:'Vibraphone_C3',baseRatio:0.29829545454545453,loop:true,loopStart:0.2812698412698413,loopEnd:0.28888888888888886,attackEnd:0,holdEnd:0.06,decayEnd:7.06},
      {top:70,name:'Vibraphone_C3',baseRatio:0.29829545454545453,loop:true,loopStart:0.2812698412698413,loopEnd:0.28888888888888886,attackEnd:0,holdEnd:0.04,decayEnd:6.04},
      {top:78,name:'Vibraphone_C3',baseRatio:0.29829545454545453,loop:true,loopStart:0.2812698412698413,loopEnd:0.28888888888888886,attackEnd:0,holdEnd:0.02,decayEnd:5.02},
      {top:86,name:'Vibraphone_C3',baseRatio:0.29829545454545453,loop:true,loopStart:0.2812698412698413,loopEnd:0.28888888888888886,attackEnd:0,holdEnd:0,decayEnd:4},
      {top:128,name:'Vibraphone_C3',baseRatio:0.29829545454545453,loop:true,loopStart:0.2812698412698413,loopEnd:0.28888888888888886,attackEnd:0,holdEnd:0,decayEnd:3}
    ], [
      {top:128,name:'MusicBox_C4',baseRatio:0.5937634640241276,loop:true,loopStart:0.6475283446712018,loopEnd:0.6666666666666666,attackEnd:0,holdEnd:0,decayEnd:2}
    ], [
      {top:128,name:'SteelDrum_D5',baseRatio:1.3660402567543959,loop:false,loopStart:-0.000045351473922902495,loopEnd:-0.000045351473922902495,attackEnd:0,holdEnd:0,decayEnd:2}
    ],[
      {top:128,name:'Marimba_C4',baseRatio:0.5946035575013605,loop:false,loopStart:-0.000045351473922902495,loopEnd:-0.000045351473922902495,attackEnd:0,holdEnd:0,decayEnd:0}
    ], [
      {top:80,name:'SynthLead_C4',baseRatio:0.5942328422565577,loop:true,loopStart:0.006122448979591836,loopEnd:0.06349206349206349,attackEnd:0,holdEnd:0,decayEnd:0},
      {top:128,name:'SynthLead_C6',baseRatio:2.3760775862068964,loop:true,loopStart:0.005623582766439909,loopEnd:0.01614512471655329,attackEnd:0,holdEnd:0,decayEnd:0}
    ], [
      {top:38,name:'SynthPad_A3',baseRatio:0.4999105065330231,loop:true,loopStart:0.1910204081632653,loopEnd:3.9917006802721087,attackEnd:0.05,holdEnd:0.05,decayEnd:0.05},
      {top:50,name:'SynthPad_A3',baseRatio:0.4999105065330231,loop:true,loopStart:0.1910204081632653,loopEnd:3.9917006802721087,attackEnd:0.08,holdEnd:0.08,decayEnd:0.08},
      {top:62,name:'SynthPad_A3',baseRatio:0.4999105065330231,loop:true,loopStart:0.1910204081632653,loopEnd:3.9917006802721087,attackEnd:0.11,holdEnd:0.11,decayEnd:0.11},
      {top:74,name:'SynthPad_A3',baseRatio:0.4999105065330231,loop:true,loopStart:0.1910204081632653,loopEnd:3.9917006802721087,attackEnd:0.15,holdEnd:0.15,decayEnd:0.15},
      {top:86,name:'SynthPad_A3',baseRatio:0.4999105065330231,loop:true,loopStart:0.1910204081632653,loopEnd:3.9917006802721087,attackEnd:0.2,holdEnd:0.2,decayEnd:0.2},
      {top:128,name:'SynthPad_C6',baseRatio:2.3820424708835755,loop:true,loopStart:0.11678004535147392,loopEnd:0.41732426303854875,attackEnd:0,holdEnd:0,decayEnd:0}
    ]
  ];

  /*
    copy(JSON.stringify(drums.map(function(d) {
      var decayTime = d[4] || 0;
      var baseRatio = Math.pow(2, (60 - d[1] - 69) / 12);
      if (d[2]) {
        var length = d[3] - d[2];
        baseRatio = 22050 * Math.round(length * 440 * baseRatio / 22050) / length / 440;
      }
      return {
        name: d[0],
        baseRatio: baseRatio,
        loop: !!d[2],
        loopStart: d[2] / 22050,
        loopEnd: d[3] / 22050,
        attackEnd: 0,
        holdEnd: 0,
        decayEnd: decayTime
      }
    }))
  */
  var DRUMS = [
    {name:'SnareDrum',baseRatio:0.5946035575013605,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'Tom',baseRatio:0.5946035575013605,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'SideStick',baseRatio:0.5946035575013605,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'Crash',baseRatio:0.8908987181403393,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'HiHatOpen',baseRatio:0.9438743126816935,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'HiHatClosed',baseRatio:0.5946035575013605,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'Tambourine',baseRatio:0.5946035575013605,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'Clap',baseRatio:0.5946035575013605,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'Claves',baseRatio:0.5946035575013605,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'WoodBlock',baseRatio:0.7491535384383408,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'Cowbell',baseRatio:0.5946035575013605,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'Triangle',baseRatio:0.8514452780229479,loop:true,loopStart:0.7638548752834468,loopEnd:0.7825396825396825,attackEnd:0,holdEnd:0,decayEnd:2},
    {name:'Bongo',baseRatio:0.5297315471796477,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'Conga',baseRatio:0.7954545454545454,loop:true,loopStart:0.1926077097505669,loopEnd:0.20403628117913833,attackEnd:0,holdEnd:0,decayEnd:2},
    {name:'Cabasa',baseRatio:0.5946035575013605,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'GuiroLong',baseRatio:0.5946035575013605,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'Vibraslap',baseRatio:0.8408964152537145,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0},
    {name:'Cuica',baseRatio:0.7937005259840998,loop:false,loopStart:null,loopEnd:null,attackEnd:0,holdEnd:0,decayEnd:0}
  ];

  // Evaluated JavaScript within the scope of the runtime.
  export function scopedEval(source) {
    return eval(source);
  }
}
