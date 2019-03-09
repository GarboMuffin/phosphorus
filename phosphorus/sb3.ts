/// <reference path="phosphorus.ts" />
/// <reference path="core.ts" />
/// <reference path="JSZip.d.ts" />
/// <reference path="config.ts" />

// Scratch 3 project loader and runtime objects
namespace P.sb3 {
  // The path to remote assets.
  // Replace $path with the md5ext of the file
  export const ASSETS_API = 'https://assets.scratch.mit.edu/internalapi/asset/$path/get/';

  // Implements a Scratch 3 Stage.
  // Adds Scratch 3 specific things such as broadcastReferences
  export class Scratch3Stage extends P.core.Stage {
    // Scratch 3 uses unique IDs for broadcasts and the visual name for different things.
    private broadcastNames: ObjectMap<string> = {};
    public sb3data: any;

    addBroadcast(id: string, name: string) {
      this.broadcastNames[name] = id;
    }

    // Override getBroadcastId to use broadcast IDs
    getBroadcastId(name: string) {
      // Use the mapped ID or fall back to the name.
      // Usually the name is the unique ID, but occasionally it is not.
      return this.broadcastNames[name] || name;
    }

    createVariableWatcher(target: P.core.Base, variableName: string) {
      // TODO: implement
      return null;
    }
  }

  // Implements a Scratch 3 Sprite.
  export class Scratch3Sprite extends P.core.Sprite {
    public sb3data: any;

    _clone() {
      return new Scratch3Sprite(this.stage);
    }
  }

  export type Target = Scratch3Stage | Scratch3Sprite;

  interface VariableWatcherOptions {
    spriteName: string;
    visible: boolean;
    id: string;
    opcode: string;
    mode: string;
    params: any;
    x: number;
    y: number;
    min: number;
    max: number;
  }

  // Implements a Scratch 3 VariableWatcher.
  // Adds Scratch 3-like styling
  export class Scratch3VariableWatcher extends P.core.VariableWatcher {
    public id: string;
    public opcode: string;
    public mode: string;
    public params: any;
    public libraryEntry: P.sb3.compiler.WatchedValue;
    public sliderMin: number;
    public sliderMax: number;

    public containerEl: HTMLElement;
    public valueEl: HTMLElement;

    constructor(stage: Scratch3Stage, data: VariableWatcherOptions) {
      super(stage, data.spriteName || '');

      // Unique ID
      this.id = data.id;
      // Operation code, similar to other parts of Scratch 3
      this.opcode = data.opcode;
      this.mode = data.mode;
      // Watcher options, varies by opcode.
      this.params = data.params;
      // This opcode's watcherLibrary entry.
      this.libraryEntry = P.sb3.compiler.watcherLibrary[this.opcode];

      // From VariableWatcher
      this.x = data.x;
      this.y = data.y;
      this.visible = typeof data.visible === 'boolean' ? data.visible : true;

      this.sliderMin = data.min;
      this.sliderMax = data.max;

      // Mark ourselves as invalid if the opcode is not recognized.
      if (!this.libraryEntry) {
        console.warn('unknown watcher', this.opcode, this);
        this.valid = false;
      }
    }

    update() {
      if (this.visible) {
        // Value is only updated when the value has changed to reduce useless paints in some browsers.
        const value = this.getValue();
        if (this.valueEl.textContent !== value) {
          this.valueEl.textContent = this.getValue();
        }
      }
    }

    init() {
      super.init();

      // call init() if it exists
      if (this.libraryEntry.init) {
        this.libraryEntry.init(this);
      }

      this.updateLayout();
    }

    setVisible(visible: boolean) {
      super.setVisible(visible);
      this.updateLayout();
    }

    // Gets the label of the watcher.
    // Will include the sprite's name if any.
    // Example results are 'Sprite1: my variable' and 'timer'
    getLabel() {
      const label = this.libraryEntry.getLabel(this);
      if (!this.target.isStage) {
        return this.targetName + ': ' + label;
      }
      return label;
    }

    // Gets the value of the watcher as a string.
    getValue() {
      const value = this.libraryEntry.evaluate(this);
      // Round off numbers to the 6th decimal
      if (typeof value === 'number') {
        return '' + (Math.round(value * 1e6) / 1e6);
      }
      return '' + value;
    }

    // Attempts to set the value of the watcher.
    // Will silently fail if this watcher cannot be set.
    setValue(value: number) {
      // Not all opcodes have a set()
      if (this.libraryEntry.set) {
        this.libraryEntry.set(this, value);
      }
    }

    // Updates or creates the layout of the watcher.
    updateLayout() {
      // If the HTML element has already been created, them simply update the CSS display property.
      if (this.containerEl) {
        this.containerEl.style.display = this.visible ? 'flex' : 'none';
        return;
      }

      if (!this.visible) {
        return;
      }

      const container = document.createElement('div');
      container.classList.add('s3-watcher-container');
      container.dataset.opcode = this.opcode;
      container.style.top = (this.y / 10) + 'em';
      container.style.left = (this.x / 10) + 'em';

      const value = document.createElement('div');
      value.classList.add('s3-watcher-value');
      value.textContent = this.getValue();

      this.containerEl = container;
      this.valueEl = value;
      this.stage.ui.appendChild(container);

      const mode = this.mode;

      if (mode === 'large') {
        container.classList.add('s3-watcher-large');
        container.appendChild(value);
      } else {
        // mode is probably 'normal' or 'slider'
        // if it's not, then 'normal' would be a good fallback anyways.

        const row = document.createElement('div');
        row.classList.add('s3-watcher-row');
        row.classList.add('s3-watcher-row-normal');

        const label = document.createElement('div');
        label.classList.add('s3-watcher-label');
        label.textContent = this.getLabel();

        row.appendChild(label);
        row.appendChild(value);

        container.classList.add('s3-watcher-container-normal');
        container.appendChild(row);

        // 'slider' is a slight variation of 'normal', just with an extra slider row.
        if (mode === 'slider') {
          const slider = document.createElement('div');
          slider.classList.add('s3-watcher-row-slider');

          const input = document.createElement('input');
          input.type = 'range';
          input.min = '' + this.sliderMin;
          input.max = '' + this.sliderMax;
          input.value = this.getValue();
          input.addEventListener('input', this.sliderChanged.bind(this));

          slider.appendChild(input);
          container.appendChild(slider);
        }
      }
    }

    // Handles slider input events.
    sliderChanged(e: Event) {
      const value = +(e.target as HTMLInputElement).value;
      this.setValue(value);
    }
  }

  // Implements a Scratch 3 procedure.
  // Scratch 3 uses names as references for arguments (Scratch 2 uses indexes I believe)
  export class Scratch3Procedure extends P.core.Procedure {
    call(inputs: any[]) {
      const args = {};
      for (var i = 0; i < this.inputs.length; i++) {
        args[this.inputs[i]] = inputs[i];
      }
      return args;
    }
  }

  // An Array usable by the Scratch 3 compiler.
  // Implements Scratch list blocks and their behavior.
  export class Scratch3List extends Array {
    // Modified toString() that functions like Scratch.
    toString() {
     var i = this.length;
      while (i--) {
        if (('' + this[i]).length !== 1) {
          return this.join(' ');
        }
      }
      return this.join('');
    }

    // Determines the real index of a Scratch index.
    // Returns -1 if not found.
    scratchIndex(index: number): number {
      if (index < 1 || index > this.length) {
        return -1;
      }
      return index - 1;
    }

    // Deletes a line from the list.
    // index is a scratch index.
    deleteLine(index: number | 'all') {
      if (index === 'all') {
        this.length = 0;
        return;
      }

      index = this.scratchIndex(index);
      if (index === this.length - 1) {
        this.pop();
      } else if (index !== -1) {
        this.splice(index, 1);
      }
    }

    // Adds an item to the list.
    push(...items: any[]) {
      return super.push(...items);
    }

    // Inserts an item at a spot in the list.
    // Index is a Scratch index.
    insert(index: number, value: any) {
      index = this.scratchIndex(index);
      if (index === this.length) {
        this.push(value);
      } else if (index !== -1) {
        this.splice(index, 0, value);
      }
    }

    // Sets the index of something in the list.
    set(index: number, value: any) {
      index = this.scratchIndex(index);
      this[index] = value;
    }
  }

  // Implements base SB3 loading logic.
  // Needs to be extended to add file loading methods.
  export abstract class BaseSB3Loader {
    protected projectData: any;

    constructor() {
      // Implementations are expected to set projectData in load() before calling super.load()
      this.projectData = null;
    }

    protected abstract getAsText(path): Promise<string>;
    protected abstract getAsArrayBuffer(path): Promise<ArrayBuffer>;
    protected abstract getAsImage(path, format: string): Promise<HTMLImageElement>;

    // Loads and returns a costume from its sb3 JSON data
    getImage(path: string, format: string): Promise<HTMLImageElement> {
      if (format === 'svg') {
        return this.getAsText(path)
          .then((source) => {
            const image = new Image();
            return new Promise<HTMLImageElement>((resolve, reject) => {
              image.onload = () => resolve(image);
              image.onerror = (err) => reject('Failed to load SVG image: ' + image.src);
              image.src = 'data:image/svg+xml;,' + encodeURIComponent(source);
            });
          });
      } else {
        return this.getAsImage(path, format);
      }
    }

    loadCostume(data, index) {
      /*
      data = {
        "assetId": "b61b1077b0ea1931abee9dbbfa7903ff",
        "name": "aaa",
        "bitmapResolution": 2,
        "md5ext": "b61b1077b0ea1931abee9dbbfa7903ff.png",
        "dataFormat": "png",
        "rotationCenterX": 480,
        "rotationCenterY": 360
      }
      */
      const path = data.assetId + '.' + data.dataFormat;
      return this.getImage(path, data.dataFormat)
        .then((image) => new P.core.Costume({
          index: index,
          bitmapResolution: data.bitmapResolution,
          name: data.name,
          rotationCenterX: data.rotationCenterX,
          rotationCenterY: data.rotationCenterY,
          layers: [image],
        }));
    }

    getAudioBuffer(path) {
      return this.getAsArrayBuffer(path)
        .then((buffer) => P.audio.decodeAudio(buffer))
        .catch((err) => {
          throw new Error(`Could not load audio: ${path} (${err})`);
        });
    }

    loadSound(data) {
      /*
      data = {
        "assetId": "83a9787d4cb6f3b7632b4ddfebf74367",
        "name": "pop",
        "dataFormat": "wav",
        "format": "",
        "rate": 48000,
        "sampleCount": 1124,
        "md5ext": "83a9787d4cb6f3b7632b4ddfebf74367.wav"
      }
      */
      return this.getAudioBuffer(data.md5ext)
        .then((buffer) => new P.core.Sound({
          name: data.name,
          buffer: buffer,
        }));
    }

    loadWatcher(data, stage: Scratch3Stage) {
      /*
      data = {
        "id": "`jEk@4|i[#Fk?(8x)AV.-my variable",
        "mode": "default",
        "opcode": "data_variable",
        "params": {
          "VARIABLE": "my variable"
        },
        "spriteName": null,
        "value": 4,
        "width": 0,
        "height": 0,
        "x": 5,
        "y": 5,
        "visible": true,
        "min": 0,
        "max": 100
      }
      */

      if (data.mode === 'list') {
        return null;
      }

      return new Scratch3VariableWatcher(stage, data);
    }

    loadTarget(data): Promise<Target> {
      const variables = {};
      for (const id of Object.keys(data.variables)) {
        const variable = data.variables[id];
        variables[id] = variable[1];
      }

      const lists = {};
      for (const id of Object.keys(data.lists)) {
        const list = data.lists[id];
        // Use Scratch3List instead of a normal array.
        lists[id] = new Scratch3List().concat(list[1]);
      }

      const broadcasts = {};
      for (const id of Object.keys(data.broadcasts)) {
        const name = data.broadcasts[id];
        broadcasts[name] = id;
      }

      const x = data.x;
      const y = data.y;
      const visible = data.visible;
      const direction = data.direction;
      const size = data.size;
      const draggable = data.draggable;

      var costumes;
      var sounds;

      const loadCostumes = Promise.all(data.costumes.map((c: any, i: any) => this.loadCostume(c, i)))
        .then((c) => costumes = c);

      const loadSounds = Promise.all(data.sounds.map((c) => this.loadSound(c)))
        .then((s) => sounds = s);

      return Promise.all<any>([loadCostumes, loadSounds])
        .then(() => {
          // TODO: dirty hack for null stage
          const target = new (data.isStage ? Scratch3Stage : Scratch3Sprite)(null as any);

          target.currentCostumeIndex = data.currentCostume;
          target.name = data.name;
          target.costumes = costumes;
          target.vars = variables;
          target.lists = lists;
          sounds.forEach((sound: P.core.Sound) => target.addSound(sound));

          if (target.isStage) {
            const stage = target as Scratch3Stage;
            for (const id of Object.keys(data.broadcasts)) {
              const name = data.broadcasts[id];
              stage.addBroadcast(id, name);
            }
          } else {
            const sprite = target as Scratch3Sprite;
            sprite.scratchX = x;
            sprite.scratchY = y;
            sprite.direction = direction;
            sprite.isDraggable = draggable;
            sprite.rotationStyle = P.utils.parseRotationStyle(data.rotationStyle);
            sprite.scale = size / 100;
            sprite.visible = visible;
          }

          target.sb3data = data;

          return target;
        });
    }

    load() {
      if (!this.projectData) {
        throw new Error('invalid project data');
      }
      if (!Array.isArray(this.projectData.targets)) {
        throw new Error('no targets');
      }

      const targets = this.projectData.targets;
      // sort targets by their layerOrder to match how they will display
      targets.sort((a, b) => a.layerOrder - b.layerOrder);

      return Promise.all(targets.map((data) => this.loadTarget(data)))
        .then((targets: any) => {
          const stage = targets.filter((i) => i.isStage)[0] as Scratch3Stage;
          if (!stage) {
            throw new Error('no stage object');
          }
          const sprites = targets.filter((i) => i.isSprite) as Scratch3Sprite[];
          const watchers = this.projectData.monitors
            .map((data) => this.loadWatcher(data, stage))
            .filter((i) => i && i.valid);

          sprites.forEach((sprite) => sprite.stage = stage);
          targets.forEach((base) => P.sb3.compiler.compileTarget(base, base.sb3data));
          stage.children = sprites;
          stage.allWatchers = watchers;
          watchers.forEach((watcher) => watcher.init());
          stage.updateBackdrop();

          return stage;
        });
    }
  }

  // Loads a .sb3 file
  export class SB3FileLoader extends BaseSB3Loader {
    private buffer: ArrayBuffer;
    private zip: JSZip.Zip;

    constructor(buffer: ArrayBuffer) {
      super();
      this.buffer = buffer;
    }

    getAsText(path: string) {
      P.IO.progressHooks.new();
      return this.zip.file(path).async('text')
        .then((response) => {
          P.IO.progressHooks.end();
          return response;
        });
    }

    getAsArrayBuffer(path: string) {
      P.IO.progressHooks.new();
      return this.zip.file(path).async('arrayBuffer')
        .then((response) => {
          P.IO.progressHooks.end();
          return response;
        });
    }

    getAsBase64(path: string) {
      P.IO.progressHooks.new();
      return this.zip.file(path).async('base64')
        .then((response) => {
          P.IO.progressHooks.end();
          return response;
        });
    }

    getAsImage(path: string, format: string) {
      P.IO.progressHooks.new();
      return this.getAsBase64(path)
        .then((imageData) => {
          return new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = function() {
              P.IO.progressHooks.end();
              resolve(image);
            };
            image.onerror = function(error) {
              P.IO.progressHooks.error(error);
              reject('Failed to load image: ' + path + '.' + format);
            };
            image.src = 'data:image/' + format + ';base64,' + imageData;
          });
        });
    }

    load() {
      return JSZip.loadAsync(this.buffer)
        .then((data) => {
          this.zip = data;
          return this.getAsText('project.json');
        })
        .then((project) => {
          this.projectData = JSON.parse(project);
        })
        .then(() => super.load());
    }
  }

  // Loads a Scratch 3 project from the scratch.mit.edu website
  // Uses either a loaded project.json or its ID
  export class Scratch3Loader extends BaseSB3Loader {
    private projectId: number | null;

    constructor(idOrData) {
      super();
      if (typeof idOrData === 'object') {
        this.projectData = idOrData;
        this.projectId = null;
      } else {
        this.projectId = idOrData;
      }
    }

    getAsText(path: string) {
      return P.IO.fetch(ASSETS_API.replace('$path', path))
        .then((request) => request.text());
    }

    getAsArrayBuffer(path: string) {
      return P.IO.fetch(ASSETS_API.replace('$path', path))
        .then((request) => request.arrayBuffer());
    }

    getAsImage(path: string) {
      P.IO.progressHooks.new();
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = function() {
          P.IO.progressHooks.end();
          resolve(image);
        };
        image.onerror = function(err) {
          P.IO.progressHooks.error(err);
          reject('Failed to load image: ' + image.src);
        };
        image.crossOrigin = 'anonymous';
        image.src = ASSETS_API.replace('$path', path);
      });
    }

    load() {
      if (this.projectId) {
        return P.IO.fetch(P.config.PROJECT_API.replace('$id', '' + this.projectId))
          .then((request) => request.json())
          .then((data) => {
            this.projectData = data;
          })
          .then(() => super.load());
      } else {
        return super.load();
      }
    }
  }
}

// Compiler for .sb3 projects
namespace P.sb3.compiler {
  // Source of the current script being compiled.
  let source: string;
  // The target being compiled.
  let currentTarget: P.sb3.Target;
  // The blocks of the target.
  let blocks: Block[];
  // Points to the position of functions within the source.
  let fns: number[];

  /*
  In Scratch 3 all blocks have a unique identifier.
  In the project.json, blocks do not contain other blocks in the way a .sb2 file does, but rather they point to the IDs of other blocks.

  This compiler differentiates between "statements", "expressions", "top levels", and "natives".
  Statements are things like `move [ ] steps`. They do something. Cannot be placed in other blocks.
  Expressions are things like `size`, `addition`, `and` etc. They return something. Cannot do anything on their own.
  Natives are things that are core parts of the runtime. This is stuff like strings, numbers, variable references, list references, colors.
  Top levels are top level blocks like `when green flag pressed`, they react to events.
  Each of these are separated and compiled differently and in different spots.
  */

  // A CompiledExpression is a type of expression made by an expression compiler with extra
  // data such as types for sake of optimization.
  class CompiledExpression {
    /**
     * The source code of this expression.
     */
    public source: string;

    /**
     * The type of this expression. Guarantees that, when evaluated, this expression will **always**
     * return a value of a certain type to avoid type coercion overhead.
     */
    public type: ExpressionType;

    constructor(src: string, type: ExpressionType) {
      this.source = src;
      this.type = type;
    }
  }

  // Easier aliases for CompiledExpression
  const numberExpr = (src: string) => new CompiledExpression(src, 'number');
  const stringExpr = (src: string) => new CompiledExpression(src, 'string');
  const booleanExpr = (src: string) => new CompiledExpression(src, 'boolean');

  type ExpressionType = 'string' | 'boolean' | 'number';
  type Block = any;
  export type TopLevelCompiler = (block: Block, f: P.runtime.Fn) => void;
  export type ExpressionCompiler = (block: Block) => string | CompiledExpression;
  export type StatementCompiler = (block: Block) => void;
  export interface WatchedValue {
    /**
     * Initializes the watcher.
     */
    init?(watcher: P.sb3.Scratch3VariableWatcher): void;
    /**
     * Sets the value of the watcher to a new number.
     */
    set?(watcher: P.sb3.Scratch3VariableWatcher, value: number): void;
    /**
     * Evaluates the current value of the watcher. Called every visible frame.
     */
    evaluate(watcher: P.sb3.Scratch3VariableWatcher): any;
    /**
     * Determines the label to display in the watcher. Called once during initialization (after init)
     */
    getLabel(watcher: P.sb3.Scratch3VariableWatcher): string;
  }

  // IDs of primative types
  // https://github.com/LLK/scratch-vm/blob/36fe6378db930deb835e7cd342a39c23bb54dd72/src/serialization/sb3.js#L60-L79
  const enum PrimativeTypes {
    MATH_NUM = 4,
    POSITIVE_NUM = 5,
    WHOLE_NUM = 6,
    INTEGER_NUM = 7,
    ANGLE_NUM = 8,
    COLOR_PICKER = 9,
    TEXT = 10,
    BROADCAST = 11,
    VAR = 12,
    LIST = 13,
  }

  // Contains top level blocks.
  export const topLevelLibrary: ObjectMap<TopLevelCompiler> = {
    // Events
    event_whenflagclicked(block, f) {
      currentTarget.listeners.whenGreenFlag.push(f);
    },
    event_whenkeypressed(block, f) {
      const key = block.fields.KEY_OPTION[0];
      if (key === 'any') {
        for (var i = 128; i--;) {
          currentTarget.listeners.whenKeyPressed[i].push(f);
        }
      } else {
        currentTarget.listeners.whenKeyPressed[P.utils.getKeyCode(key)].push(f);
      }
    },
    event_whenthisspriteclicked(block, f) {
      currentTarget.listeners.whenClicked.push(f);
    },
    event_whenstageclicked(block, f) {
      // same as "when this sprite clicked"
      currentTarget.listeners.whenClicked.push(f);
    },
    event_whenbackdropswitchesto(block, f) {
      const backdrop = block.fields.BACKDROP[0];
      if (!currentTarget.listeners.whenBackdropChanges[backdrop]) {
        currentTarget.listeners.whenBackdropChanges[backdrop] = [];
      }
      currentTarget.listeners.whenBackdropChanges[backdrop].push(f);
    },
    event_whenbroadcastreceived(block, f) {
      const optionId = block.fields.BROADCAST_OPTION[1];
      if (!currentTarget.listeners.whenIReceive[optionId]) {
        currentTarget.listeners.whenIReceive[optionId] = [];
      }
      currentTarget.listeners.whenIReceive[optionId].push(f);
    },

    // Control
    control_start_as_clone(block, f) {
      currentTarget.listeners.whenCloned.push(f);
    },

    // Procedures
    procedures_definition(block, f) {
      const customBlockId = block.inputs.custom_block[1];
      const mutation = blocks[customBlockId].mutation;

      const name = mutation.proccode;
      // Warp is either a boolean or a string representation of that boolean.
      const warp = typeof mutation.warp === 'string' ? mutation.warp === 'true' : mutation.warp;
      // It's a stringified JSON array.
      const argumentNames = JSON.parse(mutation.argumentnames);

      const procedure = new P.sb3.Scratch3Procedure(f, warp, argumentNames);
      currentTarget.procedures[name] = procedure;
    },
  };

  // Contains expressions.
  export const expressionLibrary: ObjectMap<ExpressionCompiler> = {
    // Motion
    motion_goto_menu(block) {
      const to = block.fields.TO[0];
      return sanitizedExpression(to);
    },
    motion_glideto_menu(block) {
      const to = block.fields.TO[0];
      return sanitizedExpression(to);
    },
    motion_pointtowards_menu(block) {
      const towards = block.fields.TOWARDS[0];
      return sanitizedExpression(towards);
    },
    motion_xposition(block) {
      return numberExpr('S.scratchX');
    },
    motion_yposition(block) {
      return numberExpr('S.scratchY');
    },
    motion_direction() {
      return numberExpr('S.direction');
    },

    // Looks
    looks_costume(block) {
      const costume = block.fields.COSTUME;
      return sanitizedExpression(costume[0]);
    },
    looks_backdrops(block) {
      const backdrop = block.fields.BACKDROP[0];
      return sanitizedExpression(backdrop);
    },
    looks_costumenumbername(block) {
      const name = block.fields.NUMBER_NAME[0];
      if (name === 'number') {
        return numberExpr('(S.currentCostumeIndex + 1)');
      } else if (name === 'name') {
        return stringExpr('S.costumes[S.currentCostumeIndex].name');
      } else {
        throw new Error('unknown NUMBER_NAME: ' + name);
      }
    },
    looks_backdropnumbername(block) {
      const name = block.fields.NUMBER_NAME[0];
      if (name === 'number') {
        return numberExpr('(self.currentCostumeIndex + 1)');
      } else if (name === 'name') {
        return stringExpr('self.costumes[self.currentCostumeIndex].name');
      } else {
        throw new Error('unknown NUMBER_NAME: ' + name);
      }
    },
    looks_size() {
      return numberExpr('(S.scale * 100)');
    },

    // Sounds
    sound_sounds_menu(block) {
      const sound = block.fields.SOUND_MENU[0];
      return sanitizedExpression(sound);
    },
    sound_volume() {
      return numberExpr('(S.volume * 100)');
    },

    // Control
    control_create_clone_of_menu(block) {
      const option = block.fields.CLONE_OPTION;
      return sanitizedExpression(option[0]);
    },

    // Sensing

    sensing_touchingobject(block) {
      const object = block.inputs.TOUCHINGOBJECTMENU;
      return booleanExpr('S.touching(' + compileExpression(object) + ')');
    },
    sensing_touchingobjectmenu(block) {
      const object = block.fields.TOUCHINGOBJECTMENU;
      return sanitizedExpression(object[0]);
    },
    sensing_touchingcolor(block) {
      const color = block.inputs.COLOR;
      return booleanExpr('S.touchingColor(' + compileExpression(color) + ')');
    },
    sensing_coloristouchingcolor(block) {
      const color = block.inputs.COLOR;
      const color2 = block.inputs.COLOR2;
      return booleanExpr('S.colorTouchingColor(' + compileExpression(color) + ', ' + compileExpression(color2) + ')');
    },
    sensing_distanceto(block) {
      const menu = block.inputs.DISTANCETOMENU;
      return numberExpr('S.distanceTo(' + compileExpression(menu) + ')');
    },
    sensing_distancetomenu(block) {
      return sanitizedExpression(block.fields.DISTANCETOMENU[0]);
    },
    sensing_answer(block) {
      return stringExpr('self.answer');
    },
    sensing_keypressed(block) {
      const key = block.inputs.KEY_OPTION;
      return booleanExpr('!!self.keys[P.utils.getKeyCode(' + compileExpression(key) + ')]');
    },
    sensing_keyoptions(block) {
      const key = block.fields.KEY_OPTION[0];
      return sanitizedExpression(key);
    },
    sensing_mousedown(block) {
      return booleanExpr('self.mousePressed');
    },
    sensing_mousex(block) {
      return numberExpr('self.mouseX');
    },
    sensing_mousey(block) {
      return numberExpr('self.mouseY');
    },
    sensing_loudness(block) {
      // We don't implement loudness, we always return -1 which indicates that there is no microphone available.
      return numberExpr('-1');
    },
    sensing_timer(block) {
      return numberExpr('((runtime.now - runtime.timerStart) / 1000)');
    },
    sensing_of(block) {
      const property = block.fields.PROPERTY[0];
      const object = block.inputs.OBJECT;
      return 'attribute(' + sanitizedString(property) + ', ' + compileExpression(object, 'string') + ')';
    },
    sensing_of_object_menu(block) {
      const object = block.fields.OBJECT[0];
      return sanitizedExpression(object);
    },
    sensing_current(block) {
      const current = block.fields.CURRENTMENU[0];

      switch (current) {
        case 'YEAR': return numberExpr('new Date().getFullYear()');
        case 'MONTH': return numberExpr('(new Date().getMonth() + 1)');
        case 'DATE': return numberExpr('new Date().getDate()');
        case 'DAYOFWEEK': return numberExpr('(new Date().getDay() + 1)');
        case 'HOUR': return numberExpr('new Date().getHours()');
        case 'MINUTE': return numberExpr('new Date().getMinutes()');
        case 'SECOND': return numberExpr('new Date().getSeconds()');
      }

      throw new Error('unknown CURRENTMENU: ' + current);
    },
    sensing_dayssince2000(block) {
      return numberExpr('((Date.now() - epoch) / 86400000)');
    },
    sensing_username(block) {
      return stringExpr('self.username');
    },

    // Operators
    operator_add(block) {
      const num1 = block.inputs.NUM1;
      const num2 = block.inputs.NUM2;
      return numberExpr('(' + compileExpression(num1, 'number') + ' + ' + compileExpression(num2, 'number') + ' || 0)');
    },
    operator_subtract(block) {
      const num1 = block.inputs.NUM1;
      const num2 = block.inputs.NUM2;
      return numberExpr('(' + compileExpression(num1, 'number') + ' - ' + compileExpression(num2, 'number') + ' || 0)');
    },
    operator_multiply(block) {
      const num1 = block.inputs.NUM1;
      const num2 = block.inputs.NUM2;
      return numberExpr('(' + compileExpression(num1, 'number') + ' * ' + compileExpression(num2, 'number') + ' || 0)');
    },
    operator_divide(block) {
      const num1 = block.inputs.NUM1;
      const num2 = block.inputs.NUM2;
      return numberExpr('(' + compileExpression(num1, 'number') + ' / ' + compileExpression(num2, 'number') + ' || 0)');
    },
    operator_random(block) {
      const from = block.inputs.FROM;
      const to = block.inputs.TO;
      return numberExpr('random(' + compileExpression(from, 'number') + ', ' + compileExpression(to, 'number') + ')');
    },
    operator_gt(block) {
      const operand1 = block.inputs.OPERAND1;
      const operand2 = block.inputs.OPERAND2;
      // TODO: use numGreater?
      return booleanExpr('(compare(' + compileExpression(operand1) + ', ' + compileExpression(operand2) + ') === 1)');
    },
    operator_lt(block) {
      const operand1 = block.inputs.OPERAND1;
      const operand2 = block.inputs.OPERAND2;
      // TODO: use numLess?
      return booleanExpr('(compare(' + compileExpression(operand1) + ', ' + compileExpression(operand2) + ') === -1)');
    },
    operator_equals(block) {
      const operand1 = block.inputs.OPERAND1;
      const operand2 = block.inputs.OPERAND2;
      return booleanExpr('equal(' + compileExpression(operand1) + ', ' + compileExpression(operand2) + ')');
    },
    operator_and(block) {
      const operand1 = block.inputs.OPERAND1;
      const operand2 = block.inputs.OPERAND2;
      return booleanExpr('(' + compileExpression(operand1) + ' && ' + compileExpression(operand2) + ')');
    },
    operator_or(block) {
      const operand1 = block.inputs.OPERAND1;
      const operand2 = block.inputs.OPERAND2;
      return booleanExpr('(' + compileExpression(operand1) + ' || ' + compileExpression(operand2) + ')');
    },
    operator_not(block) {
      const operand = block.inputs.OPERAND;
      return booleanExpr('!' + compileExpression(operand));
    },
    operator_join(block) {
      const string1 = block.inputs.STRING1;
      const string2 = block.inputs.STRING2;
      return stringExpr('(' + compileExpression(string1, 'string') + ' + ' + compileExpression(string2, 'string') + ')');
    },
    operator_letter_of(block) {
      const string = block.inputs.STRING;
      const letter = block.inputs.LETTER;
      return stringExpr('((' + compileExpression(string, 'string') + ')[(' + compileExpression(letter, 'number') + ' | 0) - 1] || "")');
    },
    operator_length(block) {
      const string = block.inputs.STRING;
      // TODO: parenthesis important?
      return numberExpr('(' + compileExpression(string, 'string') + ').length');
    },
    operator_contains(block) {
      const string1 = block.inputs.STRING1;
      const string2 = block.inputs.STRING2;
      return booleanExpr(compileExpression(string1, 'string') + '.includes(' + compileExpression(string2, 'string') + ')');
    },
    operator_mod(block) {
      const num1 = block.inputs.NUM1;
      const num2 = block.inputs.NUM2;
      return numberExpr('(' + compileExpression(num1) + ' % ' + compileExpression(num2) + ' || 0)');
    },
    operator_round(block) {
      const num = block.inputs.NUM;
      return numberExpr('Math.round(' + compileExpression(num, 'number') + ')');
    },
    operator_mathop(block) {
      const operator = block.fields.OPERATOR[0];
      const num = block.inputs.NUM;
      const compiledNum = compileExpression(num, 'number');

      switch (operator) {
        case 'abs':
          return numberExpr(`Math.abs(${compiledNum})`);
        case 'floor':
          return numberExpr(`Math.floor(${compiledNum})`);
        case 'sqrt':
          return numberExpr(`Math.sqrt(${compiledNum})`);
        case 'ceiling':
          return numberExpr(`Math.ceil(${compiledNum})`);
        case 'cos':
          return numberExpr(`Math.cos(${compiledNum} * Math.PI / 180)`);
        case 'sin':
          return numberExpr(`Math.sin(${compiledNum} * Math.PI / 180)`);
        case 'tan':
          return numberExpr(`Math.tan(${compiledNum} * Math.PI / 180)`);
        case 'asin':
          return numberExpr(`(Math.asin(${compiledNum}) * 180 / Math.PI)`)
        case 'acos':
          return numberExpr(`(Math.acos(${compiledNum}) * 180 / Math.PI)`)
        case 'atan':
          return numberExpr(`(Math.atan(${compiledNum}) * 180 / Math.PI)`)
        case 'ln':
          return numberExpr(`Math.log(${compiledNum})`);
        case 'log':
          return numberExpr(`(Math.log(${compiledNum}) / Math.LN10)`);
        case 'e ^':
          return numberExpr(`Math.exp(${compiledNum})`);
        case '10 ^':
          return numberExpr(`Math.exp(${compiledNum} * Math.LN10)`);
        default:
          // Unrecognized field or a non-constant field will fallback to the mathFunc runtime method
          return numberExpr(`mathFunc(${sanitizedString(operator)}, + ${compiledNum})`);
      }
    },

    // Data
    data_itemoflist(block) {
      const list = block.fields.LIST[1];
      const index = block.inputs.INDEX;
      return 'getLineOfList(' + listReference(list) + ', ' + compileExpression(index) + ')';
    },
    data_itemnumoflist(block) {
      const list = block.fields.LIST[1];
      const item = block.inputs.ITEM;
      return numberExpr('listIndexOf(' + listReference(list) + ', ' + compileExpression(item) + ')');
    },
    data_lengthoflist(block) {
      const list = block.fields.LIST[1];
      return numberExpr(listReference(list) + '.length');
    },
    data_listcontainsitem(block) {
      const list = block.fields.LIST[1];
      const item = block.inputs.ITEM;
      return booleanExpr('listContains(' + listReference(list) + ', ' + compileExpression(item) + ')');
    },

    // Procedures/arguments
    argument_reporter_string_number(block) {
      const name = block.fields.VALUE[0];
      return 'C.args[' + sanitizedString(name) + ']';
    },
    argument_reporter_boolean(block) {
      const name = block.fields.VALUE[0];
      // Forcibly convert to boolean
      return booleanExpr(asType('C.args[' + sanitizedString(name) + ']', 'boolean'));
    },

    // The matrix, a little known expression. Only used in some of the robot extensions.
    matrix(block) {
      const matrix = block.fields.MATRIX[0];
      // This is a string, not a number. It's not to be treated as binary digits to convert to base 10.
      return sanitizedExpression(matrix);
    },

    // Pen (extension)
    pen_menu_colorParam(block) {
      const colorParam = block.fields.colorParam[0];
      return sanitizedExpression(colorParam);
    },

    // Music (extension)
    music_getTempo(block) {
      return numberExpr('self.tempoBPM');
    },

    // Legacy no-ops
    // Here, returning an untyped undefined has the same effect as it does in Scratch 3.
    // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_sensing.js#L74
    sensing_userid() { return 'undefined'; },
    // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_motion.js#L42-L43
    motion_xscroll() { return 'undefined'; },
    motion_yscroll() { return 'undefined'; },
  };

  // Contains statements.
  export const statementLibrary: ObjectMap<StatementCompiler> = {
    // Motion
    motion_movesteps(block) {
      const steps = block.inputs.STEPS;
      source += 'S.forward(' + compileExpression(steps, 'number') + ');\n';
      visualCheck('drawing');
    },
    motion_turnright(block) {
      const degrees = block.inputs.DEGREES;
      source += 'S.setDirection(S.direction + ' + compileExpression(degrees, 'number') + ');\n';
      visualCheck('visible');
    },
    motion_turnleft(block) {
      const degrees = block.inputs.DEGREES;
      source += 'S.setDirection(S.direction - ' + compileExpression(degrees, 'number') + ');\n';
      visualCheck('visible');
    },
    motion_goto(block) {
      const to = block.inputs.TO;
      source += 'S.gotoObject(' + compileExpression(to) + ');\n';
      visualCheck('drawing');
    },
    motion_gotoxy(block) {
      const x = block.inputs.X;
      const y = block.inputs.Y;
      source += 'S.moveTo(' + compileExpression(x, 'number') + ', ' + compileExpression(y, 'number') + ');\n';
      visualCheck('drawing');
    },
    motion_glideto(block) {
      const secs = block.inputs.SECS;
      const to = block.inputs.TO;

      visualCheck('drawing');
      source += 'save();\n';
      source += 'R.start = runtime.now;\n';
      source += 'R.duration = ' + compileExpression(secs) + ';\n';
      source += 'R.baseX = S.scratchX;\n';
      source += 'R.baseY = S.scratchY;\n';
      source += 'var to = self.getPosition(' + compileExpression(to) + ');\n';
      source += 'if (to) {';
      source += 'R.deltaX = to.x - S.scratchX;\n';
      source += 'R.deltaY = to.y - S.scratchY;\n';
      const id = label();
      source += 'var f = (runtime.now - R.start) / (R.duration * 1000);\n';
      source += 'if (f > 1) f = 1;\n';
      source += 'S.moveTo(R.baseX + f * R.deltaX, R.baseY + f * R.deltaY);\n';
      source += 'if (f < 1) {\n';
      forceQueue(id);
      source += '}\n';
      source += 'restore();\n';
      source += '}\n';
    },
    motion_glidesecstoxy(block) {
      const secs = block.inputs.SECS;
      const x = block.inputs.X;
      const y = block.inputs.Y;

      visualCheck('drawing');
      source += 'save();\n';
      source += 'R.start = runtime.now;\n';
      source += 'R.duration = ' + compileExpression(secs) + ';\n';
      source += 'R.baseX = S.scratchX;\n';
      source += 'R.baseY = S.scratchY;\n';
      source += 'R.deltaX = ' + compileExpression(x) + ' - S.scratchX;\n';
      source += 'R.deltaY = ' + compileExpression(y) + ' - S.scratchY;\n';
      const id = label();
      source += 'var f = (runtime.now - R.start) / (R.duration * 1000);\n';
      source += 'if (f > 1) f = 1;\n';
      source += 'S.moveTo(R.baseX + f * R.deltaX, R.baseY + f * R.deltaY);\n';
      source += 'if (f < 1) {\n';
      forceQueue(id);
      source += '}\n';
      source += 'restore();\n';
    },
    motion_pointindirection(block) {
      const direction = block.inputs.DIRECTION;
      visualCheck('visible');
      source += 'S.direction = ' + compileExpression(direction) + ';\n';
    },
    motion_pointtowards(block) {
      const towards = block.inputs.TOWARDS;
      source += 'S.pointTowards(' + compileExpression(towards) + ');\n';
      visualCheck('visible');
    },
    motion_changexby(block) {
      const dx = block.inputs.DX;
      source += 'S.moveTo(S.scratchX + ' + compileExpression(dx, 'number') + ', S.scratchY);\n';
      visualCheck('drawing');
    },
    motion_setx(block) {
      const x = block.inputs.X;
      source += 'S.moveTo(' + compileExpression(x, 'number') + ', S.scratchY);\n';
      visualCheck('drawing');
    },
    motion_changeyby(block) {
      const dy = block.inputs.DY;
      source += 'S.moveTo(S.scratchX, S.scratchY + ' + compileExpression(dy, 'number') + ');\n';
      visualCheck('drawing');
    },
    motion_sety(block) {
      const y = block.inputs.Y;
      source += 'S.moveTo(S.scratchX, ' + compileExpression(y, 'number') + ');\n';
      visualCheck('drawing');
    },
    motion_ifonedgebounce(block) {
      // TODO: set visual if bounced
      source += 'S.bounceOffEdge();\n';
    },
    motion_setrotationstyle(block) {
      const style = block.fields.STYLE[0];
      source += 'S.rotationStyle = ' + P.utils.parseRotationStyle(style) + ';\n';
      visualCheck('visible');
    },

    // Looks
    looks_sayforsecs(block) {
      const message = block.inputs.MESSAGE;
      const secs = block.inputs.SECS;
      source += 'save();\n';
      source += 'R.id = S.say(' + compileExpression(message) + ', false);\n';
      source += 'R.start = runtime.now;\n';
      source += 'R.duration = ' + compileExpression(secs, 'number') + ';\n';
      const id = label();
      source += 'if (runtime.now - R.start < R.duration * 1000) {\n';
      forceQueue(id);
      source += '}\n';
      source += 'if (S.sayId === R.id) {\n';
      source += '  S.say("");\n';
      source += '}\n';
      source += 'restore();\n';
      visualCheck('visible');
    },
    looks_say(block) {
      const message = block.inputs.MESSAGE;
      source += 'S.say(' + compileExpression(message) + ', false);\n';
      visualCheck('visible');
    },
    looks_thinkforsecs(block) {
      const message = block.inputs.MESSAGE;
      const secs = block.inputs.SECS;
      source += 'save();\n';
      source += 'R.id = S.say(' + compileExpression(message) + ', true);\n';
      source += 'R.start = runtime.now;\n';
      source += 'R.duration = ' + compileExpression(secs, 'number') + ';\n';
      const id = label();
      source += 'if (runtime.now - R.start < R.duration * 1000) {\n';
      forceQueue(id);
      source += '}\n';
      source += 'if (S.sayId === R.id) {\n';
      source += '  S.say("");\n';
      source += '}\n';
      source += 'restore();\n';
      visualCheck('visible');
    },
    looks_think(block) {
      const message = block.inputs.MESSAGE;
      source += 'S.say(' + compileExpression(message) + ', true);\n';
      visualCheck('visible');
    },
    looks_switchcostumeto(block) {
      const costume = block.inputs.COSTUME;
      source += 'S.setCostume(' + compileExpression(costume) + ');\n';
      visualCheck('visible');
    },
    looks_nextcostume(block) {
      source += 'S.showNextCostume();\n';
      visualCheck('visible');
    },
    looks_switchbackdropto(block) {
      const backdrop = block.inputs.BACKDROP;
      source += 'self.setCostume(' + compileExpression(backdrop) + ');\n';
      visualCheck('always');
      source += 'var threads = backdropChange();\n';
      source += 'if (threads.indexOf(BASE) !== -1) {return;}\n';
    },
    looks_nextbackdrop(block) {
      source += 'self.showNextCostume();\n';
      visualCheck('always');
      source += 'var threads = backdropChange();\n';
      source += 'if (threads.indexOf(BASE) !== -1) {return;}\n';
    },
    looks_changesizeby(block) {
      const change = block.inputs.CHANGE;
      source += 'var f = S.scale + ' + compileExpression(change) + ' / 100;\n';
      source += 'S.scale = f < 0 ? 0 : f;\n';
      visualCheck('visible');
    },
    looks_setsizeto(block) {
      const size = block.inputs.SIZE;
      source += 'var f = ' + compileExpression(size) + ' / 100;\n';
      source += 'S.scale = f < 0 ? 0 : f;\n';
      visualCheck('visible');
    },
    looks_changeeffectby(block) {
      const effect = block.fields.EFFECT[0];
      const change = block.inputs.CHANGE;
      source += 'S.changeFilter(' + sanitizedString(effect).toLowerCase() + ', ' + compileExpression(change, 'number') + ');\n';
      visualCheck('visible');
    },
    looks_seteffectto(block) {
      const effect = block.fields.EFFECT[0];
      const value = block.inputs.VALUE;
      // Lowercase conversion is necessary to remove capitals, which we do not want.
      source += 'S.setFilter(' + sanitizedString(effect).toLowerCase() + ', ' + compileExpression(value, 'number') + ');\n';
      visualCheck('visible');
    },
    looks_cleargraphiceffects(block) {
      source += 'S.resetFilters();\n';
      visualCheck('visible');
    },
    looks_show(block) {
      source += 'S.visible = true;\n';
      visualCheck('always');
      updateBubble();
    },
    looks_hide(block) {
      visualCheck('visible');
      source += 'S.visible = false;\n';
      updateBubble();
    },
    looks_gotofrontback(block) {
      const frontBack = block.fields.FRONT_BACK[0];
      source += 'var i = self.children.indexOf(S);\n';
      source += 'if (i !== -1) self.children.splice(i, 1);\n';
      if (frontBack === 'front') {
        source += 'self.children.push(S);\n';
      } else if (frontBack === 'back') {
        source += 'self.children.unshift(S);\n';
      }
    },
    looks_goforwardbackwardlayers(block) {
      const direction = block.fields.FORWARD_BACKWARD[0];
      const number = block.inputs.NUM;
      source += 'var i = self.children.indexOf(S);\n';
      source += 'if (i !== -1) {\n';
      source += '  self.children.splice(i, 1);\n';
      if (direction === 'backward') {
        source += '  self.children.splice(Math.max(0, i - ' + compileExpression(number) + '), 0, S);\n';
      } else if (direction === 'forward') {
        source += '  self.children.splice(Math.min(self.children.length - 1, i + ' + compileExpression(number) + '), 0, S);\n';
      } else {
        throw new Error('unknown direction: ' + direction);
      }
      source += '}\n';
    },

    // Sounds
    sound_playuntildone(block) {
      const sound = block.inputs.SOUND_MENU;
      source += 'var sound = S.getSound(' + compileExpression(sound) + ');\n';
      source += 'if (sound) {\n';
      source += '  playSound(sound);\n';
      wait('sound.duration');
      source += '}\n';
    },
    sound_play(block) {
      const sound = block.inputs.SOUND_MENU;
      source += 'var sound = S.getSound(' + compileExpression(sound) + ');\n';
      source += 'if (sound) {\n';
      source += '  playSound(sound);\n';
      source += '}\n';
    },
    sound_stopallsounds(block) {
      if (P.audio.context) {
        source += 'self.stopAllSounds();\n';
      }
    },
    sound_changevolumeby(block) {
      const volume = block.inputs.VOLUME;
      source += 'S.volume = Math.max(0, Math.min(1, S.volume + ' + compileExpression(volume, 'number') + ' / 100));\n';
      source += 'if (S.node) S.node.gain.setValueAtTime(S.volume, audioContext.currentTime);\n';
      source += 'for (var sounds = S.sounds, i = sounds.length; i--;) {\n';
      source += '  var sound = sounds[i];\n';
      source += '  if (sound.node && sound.target === S) {\n';
      source += '    sound.node.gain.setValueAtTime(S.volume, audioContext.currentTime);\n';
      source += '  }\n';
      source += '}\n';
    },
    sound_setvolumeto(block) {
      const volume = block.inputs.VOLUME;
      source += 'S.volume = Math.max(0, Math.min(1, ' + compileExpression(volume, 'number') + ' / 100));\n';
      source += 'if (S.node) S.node.gain.setValueAtTime(S.volume, audioContext.currentTime);\n';
      source += 'for (var sounds = S.sounds, i = sounds.length; i--;) {\n';
      source += '  var sound = sounds[i];\n';
      source += '  if (sound.node && sound.target === S) {\n';
      source += '    sound.node.gain.setValueAtTime(S.volume, audioContext.currentTime);\n';
      source += '  }\n';
      source += '}\n';
    },

    // Event
    event_broadcast(block) {
      const input = block.inputs.BROADCAST_INPUT;
      source += 'var threads = broadcast(' + compileExpression(input) + ');\n';
      source += 'if (threads.indexOf(BASE) !== -1) {return;}\n';
    },
    event_broadcastandwait(block) {
      const input = block.inputs.BROADCAST_INPUT;
      source += 'save();\n';
      source += 'R.threads = broadcast(' + compileExpression(input) + ');\n';
      source += 'if (R.threads.indexOf(BASE) !== -1) {return;}\n';
      const id = label();
      source += 'if (running(R.threads)) {\n';
      forceQueue(id);
      source += '}\n';
      source += 'restore();\n';
    },

    // Control
    control_wait(block) {
      const duration = block.inputs.DURATION;
      source += 'save();\n';
      source += 'R.start = runtime.now;\n';
      source += 'R.duration = ' + compileExpression(duration) + ';\n';
      source += 'var first = true;\n';
      const id = label();
      source += 'if (runtime.now - R.start < R.duration * 1000 || first) {\n';
      source += '  var first;\n';
      forceQueue(id);
      source += '}\n';
      source += 'restore();\n';
    },
    control_repeat(block) {
      const times = block.inputs.TIMES;
      const substack = block.inputs.SUBSTACK;
      source += 'save();\n';
      source += 'R.count = ' + compileExpression(times) + ';\n';
      const id = label();
      source += 'if (R.count >= 0.5) {\n';
      source += '  R.count -= 1;\n';
      compileSubstack(substack);
      queue(id);
      source += '} else {\n';
      source += '  restore();\n';
      source += '}\n';
    },
    control_forever(block) {
      const substack = block.inputs.SUBSTACK;
      const id = label();
      compileSubstack(substack);
      forceQueue(id);
    },
    control_if(block) {
      const condition = block.inputs.CONDITION;
      const substack = block.inputs.SUBSTACK;
      source += 'if (' + compileExpression(condition) + ') {\n';
      compileSubstack(substack);
      source += '}\n';
    },
    control_if_else(block) {
      const condition = block.inputs.CONDITION;
      const substack1 = block.inputs.SUBSTACK;
      const substack2 = block.inputs.SUBSTACK2;
      source += 'if (' + compileExpression(condition) + ') {\n';
      compileSubstack(substack1);
      source += '} else {\n';
      compileSubstack(substack2);
      source += '}\n';
    },
    control_wait_until(block) {
      const condition = block.inputs.CONDITION;
      const id = label();
      source += 'if (!' + compileExpression(condition) + ') {\n';
      queue(id);
      source += '}\n';
    },
    control_repeat_until(block) {
      const condition = block.inputs.CONDITION;
      const substack = block.inputs.SUBSTACK;
      const id = label();
      source += 'if (!' + compileExpression(condition) + ') {\n';
      compileSubstack(substack);
      queue(id);
      source += '}\n';
    },
    control_while(block) {
      // Hacked block
      const condition = block.inputs.CONDITION;
      const substack = block.inputs.SUBSTACK;
      const id = label();
      source += 'if (' + compileExpression(condition, 'boolean') + ') {\n';
      compileSubstack(substack);
      queue(id);
      source += '}\n';
    },
    control_all_at_once(block) {
      // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_control.js#L194-L199
      const substack = block.inputs.SUBSTACK;
      compileSubstack(substack);
    },
    control_stop(block) {
      const option = block.fields.STOP_OPTION[0];

      switch (option) {
        case 'all':
          source += 'runtime.stopAll();\n';
          source += 'return;\n';
          break;

        case 'this script':
          source += 'endCall();\n';
          source += 'return;\n';
          break;

        case 'other scripts in sprite':
        case 'other scripts in stage':
          source += 'for (var i = 0; i < runtime.queue.length; i++) {\n';
          source += '  if (i !== THREAD && runtime.queue[i] && runtime.queue[i].sprite === S) {\n';
          source += '    runtime.queue[i] = undefined;\n';
          source += '  }\n';
          source += '}\n';
          break;

        default:
          // If the field is not recognized or not a compile-time constant, then fallback to a large switch statement.
          source += 'switch (' + sanitizedString(option) + ') {\n';
          source += '  case "all":\n';
          source += '    runtime.stopAll();\n';
          source += '    return;\n';
          source += '  case "this script":\n';
          source += '    endCall();\n';
          source += '    return;\n';
          source += '  case "other scripts in sprite":\n';
          source += '  case "other scripts in stage":\n';
          source += '    for (var i = 0; i < runtime.queue.length; i++) {\n';
          source += '      if (i !== THREAD && runtime.queue[i] && runtime.queue[i].sprite === S) {\n';
          source += '        runtime.queue[i] = undefined;\n';
          source += '      }\n';
          source += '    }\n';
          source += '    break;\n';
          source += '}\n';
      }
    },
    control_create_clone_of(block) {
      const option = block.inputs.CLONE_OPTION;
      source += 'clone(' + compileExpression(option) + ');\n';
    },
    control_delete_this_clone(block) {
      source += 'if (S.isClone) {\n';
      source += '  S.remove();\n';
      source += '  var i = self.children.indexOf(S);\n';
      source += '  if (i !== -1) self.children.splice(i, 1);\n';
      source += '  for (var i = 0; i < runtime.queue.length; i++) {\n';
      source += '    if (runtime.queue[i] && runtime.queue[i].sprite === S) {\n';
      source += '      runtime.queue[i] = undefined;\n';
      source += '    }\n';
      source += '  }\n';
      source += '  return;\n';
      source += '}\n';
    },

    // Sensing
    sensing_askandwait(block) {
      const question = block.inputs.QUESTION;
      source += 'R.id = self.nextPromptId++;\n';
      // 1 - wait until we are next up for the asking
      const id1 = label();
      source += 'if (self.promptId < R.id) {\n';
      forceQueue(id1);
      source += '}\n';

      source += 'S.ask(' + compileExpression(question) + ');\n';
      // 2 - wait until the prompt has been answered
      const id2 = label();
      source += 'if (self.promptId === R.id) {\n';
      forceQueue(id2);
      source += '}\n';

      visualCheck('always');
    },
    sensing_setdragmode(block) {
      const dragMode = block.fields.DRAG_MODE[0];
      if (dragMode === 'draggable') {
        source += 'S.isDraggable = true;\n';
      } else {
        source += 'S.isDraggable = false;\n';
      }
    },
    sensing_resettimer(blocK) {
      source += 'runtime.timerStart = runtime.now;\n';
    },

    // Data
    data_setvariableto(block) {
      const variableId = block.fields.VARIABLE[1];
      const value = block.inputs.VALUE;
      source += variableReference(variableId) + ' = ' + compileExpression(value) + ';\n';
    },
    data_changevariableby(block) {
      const variableId = block.fields.VARIABLE[1];
      const value = block.inputs.VALUE;
      const ref = variableReference(variableId);
      source += ref + ' = (' + asType(ref, 'number') + ' + ' + compileExpression(value, 'number') + ');\n';
    },
    data_showvariable(block) {
      const variable = block.fields.VARIABLE[1];
      const scope = variableScope(variable);
      source += scope + '.showVariable(' + sanitizedString(variable) + ', true);\n';
    },
    data_hidevariable(block) {
      const variable = block.fields.VARIABLE[1];
      const scope = variableScope(variable);
      source += scope + '.showVariable(' + sanitizedString(variable) + ', false);\n';
    },
    data_addtolist(block) {
      const list = block.fields.LIST[1];
      const item = block.inputs.ITEM;
      source += listReference(list) + '.push(' + compileExpression(item, 'string')  + ');\n';
    },
    data_deleteoflist(block) {
      const list = block.fields.LIST[1];
      const index = block.inputs.INDEX;
      source += listReference(list) + '.deleteLine(' + compileExpression(index) + ');\n';
    },
    data_deletealloflist(block) {
      const list = block.fields.LIST[1];
      source += listReference(list) + '.deleteLine("all");\n';
    },
    data_insertatlist(block) {
      const list = block.fields.LIST[1];
      const item = block.inputs.ITEM;
      const index = block.inputs.INDEX;
      source += listReference(list) + '.insert(' + compileExpression(index, 'number') + ', ' + compileExpression(item, 'string') + ');\n';
    },
    data_replaceitemoflist(block) {
      const list = block.fields.LIST[1];
      const item = block.inputs.ITEM;
      const index = block.inputs.INDEX;
      source += listReference(list) + '.set(' + compileExpression(index, 'number') + ', ' + compileExpression(item, 'string') + ');\n';
    },

    // Procedures
    procedures_call(block) {
      const mutation = block.mutation;
      const name = mutation.proccode;

      if (P.config.debug && name === 'forkphorus:debugger;') {
        source += '/*procedures_call debugger*/debugger;\n';
        return;
      }

      const id = nextLabel();
      source += 'call(S.procedures[' + sanitizedString(name) + '], ' + id + ', [\n';

      // The mutation has a stringified JSON list of input IDs... it's weird.
      const inputIds = JSON.parse(mutation.argumentids);
      for (const id of inputIds) {
        const input = block.inputs[id];
        source += '  ' + compileExpression(input) + ',\n';
      }

      source += ']);\n';

      delay();
    },

    // Pen (extension)
    pen_clear(block) {
      source += 'self.clearPen();\n';
      visualCheck('always');
    },
    pen_stamp(block) {
      source += 'S.stamp();\n';
      visualCheck('always');
    },
    pen_penDown(block) {
      source += 'S.isPenDown = true;\n';
      source += 'S.dotPen();\n';
      visualCheck('always');
    },
    pen_penUp(block) {
      // TODO: determine visualCheck variant
      // definitely not 'always' or 'visible', might be a 'if (S.isPenDown)'
      source += 'S.isPenDown = false;\n';
    },
    pen_setPenColorToColor(block) {
      const color = block.inputs.COLOR;
      source += 'S.setPenColor(' + compileExpression(color, 'number') + ');\n';
    },
    pen_setPenHueToNumber(block) {
      const hue = block.inputs.HUE;
      source += 'S.setPenColorParam("color", ' + compileExpression(hue, 'number') + ');\n';
    },
    pen_changePenHueBy(block) {
      const hue = block.inputs.HUE;
      source += 'S.changePenColorParam("color", ' + compileExpression(hue, 'number') + ');\n';
    },
    pen_setPenShadeToNumber(block) {
      const shade = block.inputs.SHADE;
      source += 'S.setPenColorParam("brightness", ' + compileExpression(shade, 'number') + ');\n';
    },
    pen_changePenShadeBy(block) {
      const shade = block.inputs.SHADE;
      source += 'S.changePenColorParam("brightness", ' + compileExpression(shade, 'number') + ');\n';
    },
    pen_setPenColorParamTo(block) {
      const colorParam = block.inputs.COLOR_PARAM;
      const value = block.inputs.VALUE;
      source += 'S.setPenColorParam(' + compileExpression(colorParam, 'string') + ', ' + compileExpression(value, 'number') + ');\n';
    },
    pen_changePenColorParamBy(block) {
      const colorParam = block.inputs.COLOR_PARAM;
      const value = block.inputs.VALUE;
      source += 'S.changePenColorParam(' + compileExpression(colorParam, 'string') + ', ' + compileExpression(value, 'number') + ');\n';
    },
    pen_changePenSizeBy(block) {
      const size = block.inputs.SIZE;
      source += 'S.penSize = Math.max(1, S.penSize + ' + compileExpression(size, 'number') + ');\n';
    },
    pen_setPenSizeTo(block) {
      const size = block.inputs.SIZE;
      source += 'S.penSize = Math.max(1, ' + compileExpression(size, 'number') + ');\n';
    },

    // Music (extension)
    music_setTempo(block) {
      const tempo = block.inputs.TEMPO;
      source += 'self.tempoBPM = ' + compileExpression(tempo, 'number') + ';\n';
    },
    music_changeTempo(block) {
      const tempo = block.inputs.TEMPO;
      source += 'self.tempoBPM += ' + compileExpression(tempo, 'number') + ';\n';
    },

    // Legacy no-ops. We don't even bother to compile any of their inputs or fields because they don't do anything.
    // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_motion.js#L19
    motion_scroll_right() {},
    motion_scroll_up() {},
    motion_align_scene() {},
    // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_looks.js#L248
    looks_changestretchby() {},
    looks_setstretchto() {},
    looks_hideallsprites() {},
  };

  // Contains data used for variable watchers.
  export const watcherLibrary: ObjectMap<WatchedValue> = {
    // Maps watcher opcode to the methods that define its behavior.

    // Motion
    motion_xposition: {
      evaluate(watcher) { return watcher.target.scratchX; },
      getLabel() { return 'x position'; },
    },
    motion_yposition: {
      evaluate(watcher) { return watcher.target.scratchY; },
      getLabel() { return 'y position'; },
    },
    motion_direction: {
      evaluate(watcher) { return P.core.isSprite(watcher.target) ? watcher.target.direction : 0; },
      getLabel() { return 'direction'; },
    },

    // Looks
    looks_costumenumbername: {
      evaluate(watcher) {
        const target = watcher.target;
        const param = watcher.params.NUMBER_NAME;
        if (param === 'number') {
          return target.currentCostumeIndex + 1;
        } else if (param === 'name') {
          return target.costumes[target.currentCostumeIndex].name;
        } else {
          throw new Error('unknown watcher NUMBER_NAME: ' + param);
        }
      },
      getLabel(watcher) {
        return 'costume ' + watcher.params.NUMBER_NAME;
      },
    },
    looks_backdropnumbername: {
      evaluate(watcher) {
        const target = watcher.stage;
        const param = watcher.params.NUMBER_NAME;
        if (param === 'number') {
          return target.currentCostumeIndex + 1;
        } else if (param === 'name') {
          return target.costumes[target.currentCostumeIndex].name;
        } else {
          throw new Error('unknown watcher NUMBER_NAME: ' + param);
        }
      },
      getLabel(watcher) {
        return 'backdrop ' + watcher.params.NUMBER_NAME;
      },
    },
    looks_size: {
      evaluate(watcher) { return P.core.isSprite(watcher.target) ? watcher.target.scale * 100 : 100; },
      getLabel() { return 'size'; },
    },

    // Sound
    sound_volume: {
      evaluate(watcher) { return watcher.target.volume * 100; },
      getLabel() { return 'volume'; },
    },

    // Sensing
    sensing_answer: {
      evaluate(watcher) { return watcher.stage.answer; },
      getLabel() { return 'answer'; },
    },
    sensing_loudness: {
      // We don't implement loudness.
      evaluate() { return -1; },
      getLabel() { return 'loudness'; },
    },
    sensing_timer: {
      evaluate(watcher) {
        return (watcher.stage.runtime.now - watcher.stage.runtime.timerStart) / 1000;
      },
      getLabel() { return 'timer'; },
    },
    sensing_current: {
      evaluate(watcher) {
        const param = watcher.params.CURRENTMENU;
        switch (param) {
          case 'YEAR': return new Date().getFullYear();
          case 'MONTH': return new Date().getMonth() + 1;
          case 'DATE': return new Date().getDate();
          case 'DAYOFWEEK': return new Date().getDay() + 1;
          case 'HOUR': return new Date().getHours();
          case 'MINUTE': return new Date().getMinutes();
          case 'SECOND': return new Date().getSeconds();
        }
        throw new Error('unknown watcher CURRENTMENU: ' + param);
      },
      getLabel(watcher) {
        const param = watcher.params.CURRENTMENU;
        switch (param) {
          case 'YEAR': return 'year';
          case 'MONTH': return 'month';
          case 'DATE': return 'date';
          case 'DAYOFWEEK': return 'day of week';
          case 'HOUR': return 'hour';
          case 'MINUTE': return 'minute';
          case 'SECOND': return 'second';
        }
        throw new Error('unknown watcher CURRENTMENU: ' + param);
      }
    },
    sensing_username: {
      evaluate(watcher) { return watcher.stage.username; },
      getLabel() { return 'username'; },
    },

    // Data
    data_variable: {
      init(watcher) {
        watcher.target.watchers[watcher.id] = watcher;
      },
      set(watcher, value) {
        watcher.target.vars[watcher.id] = value;
      },
      evaluate(watcher) {
        return watcher.target.vars[watcher.id];
      },
      getLabel(watcher) {
        return watcher.params.VARIABLE;
      },
    },

    // Music (extension)
    music_getTempo: {
      evaluate(watcher) { return watcher.stage.tempoBPM; },
      getLabel() { return 'Music: tempo'; },
    },
  };

  ///
  /// Helpers
  ///

  // Adds JS to update the speech bubble if necessary
  function updateBubble() {
    source += 'if (S.saying) S.updateBubble();\n';
  }

  // Adds JS to enable the VISUAL flag when necessary.
  // `variant` can be:
  // 'drawing' will enable it if the sprite is visible or the pen is down (if the sprite is drawing something)
  // 'visible' will enable it if the sprite is visible
  // 'always' will always enable it
  function visualCheck(variant: 'drawing' | 'visible' | 'always') {
    if (P.config.debug) {
      source += '/*visual:' + variant + '*/';
    }
    switch (variant) {
      case 'drawing': source += 'if (S.visible || S.isPenDown) VISUAL = true;\n'; break;
      case 'visible': source += 'if (S.visible) VISUAL = true;\n'; break;
      case 'always':  source += 'VISUAL = true;\n'; break;
    }
  }

  // Queues something to run with the forceQueue runtime method
  function forceQueue(id: number) {
    source += 'forceQueue(' + id + '); return;\n';
  }

  // Queues something to run with the queue runtime method
  function queue(id: number) {
    source += 'queue(' + id + '); return;\n';
  }

  // Adds a delay
  function delay() {
    source += 'return;\n';
    label();
  }

  // Gets the next label
  function nextLabel(): number {
    return fns.length + currentTarget.fns.length;
  }

  // Creates and returns a new label for the script's current state
  function label(): number {
    const id = nextLabel();
    fns.push(source.length);
    if (P.config.debug) {
      source += '/*label:' + id + '*/';
    }
    return id;
  }

  // Sanitizes a string to be used in a javascript string enclosed in double quotes.
  function sanitizedString(thing: string): string {
    if (typeof thing !== 'string') {
      thing = '' + thing;
    }
    return '"' + thing
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\\\'')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\{/g, '\\x7b')
      .replace(/\}/g, '\\x7d') + '"';
  }

  // Sanitizes a string using sanitizedString() as a compiled string expression.
  function sanitizedExpression(thing: string): CompiledExpression {
    return stringExpr(sanitizedString(thing));
  }

  // Adds JS to wait for a duration.
  // `duration` is a valid compiled JS expression.
  function wait(duration: string) {
    source += 'save();\n';
    source += 'R.start = runtime.now;\n';
    source += 'R.duration = ' + duration + ';\n';
    source += 'var first = true;\n';
    const id = label();
    source += 'if (runtime.now - R.start < R.duration * 1000 || first) {\n';
    source += '  var first;\n';
    forceQueue(id);
    source += '}\n';
    source += 'restore();\n';
  }

  // Returns the runtime object that contains a variable ID.
  function variableScope(id: string) {
    if (id in currentTarget.stage.vars) {
      return 'self';
    } else {
      return 'S';
    }
  }

  // Returns a reference to a variable with an ID
  function variableReference(id: string) {
    const scope = variableScope(id);
    return scope + '.vars[' + compileExpression(id) + ']';
  }

  // Returns a reference to a list with a ID
  function listReference(id: string) {
    if (id in currentTarget.stage.lists) {
      return 'self.lists[' + compileExpression(id) + ']';
    }
    return 'S.lists[' + compileExpression(id) + ']';
  }

  ///
  /// Compilers
  ///

  // Compiles a '#ABCDEF' color
  function compileColor(hexCode: string): CompiledExpression {
    // Remove the leading # and use it to create a hexadecimal number
    const hex = hexCode.substr(1);
    // Ensure that it is actually a hex number.
    if (/^[0-9a-f]{6}$/.test(hex)) {
      return numberExpr('0x' + hex);
    } else {
      console.warn('expected hex color code but got', hex);
      return numberExpr('0x0');
    }
  }

  // Compiles a native expression (number, string, data) to a JavaScript string
  function compileNative(constant): CompiledExpression | string {
    // Natives are arrays.
    // The first value is the type of the native, see PrimativeTypes
    // TODO: use another library instead?
    const type = constant[0];

    switch (type) {
      // These all function as numbers. I believe they are only differentiated so the editor can be more helpful.
      case PrimativeTypes.MATH_NUM:
      case PrimativeTypes.POSITIVE_NUM:
      case PrimativeTypes.WHOLE_NUM:
      case PrimativeTypes.INTEGER_NUM:
      case PrimativeTypes.ANGLE_NUM:
        // I think there's an easier way to handle this, but this seems to work.
        if (!isNaN(parseFloat(constant[1]))) {
          return numberExpr(constant[1]);
        } else {
          // Non-numbers will be sanitized 
          return sanitizedExpression(constant[1]);
        }

      case PrimativeTypes.TEXT:
        // Text is compiled directly into a string.
        return sanitizedExpression(constant[1]);

      case PrimativeTypes.VAR:
        // For variable natives the second item is the name of the variable
        // and the third is the ID of the variable. We only care about the ID.
        return variableReference(constant[2]);

      case PrimativeTypes.LIST:
        // Similar to variable references
        return listReference(constant[2]);

      case PrimativeTypes.BROADCAST:
        // Similar to variable references.
        return compileExpression(constant[2]);

      case PrimativeTypes.COLOR_PICKER:
        // Colors are stored as strings like "#123ABC", so we must do some conversions.
        return compileColor(constant[1]);

      default:
        console.warn('unknown constant', type, constant);
        return stringExpr('""');
    }
  }

  // Compiles a block and adds it to the source. (Does not return source)
  function compile(block) {
    if (typeof block === 'string') {
      block = blocks[block];
    }
    if (!block) {
      return;
    }

    while (block) {
      const opcode = block.opcode;
      const compiler = statementLibrary[opcode];
      if (!compiler) {
        console.warn('unknown statement', opcode, block);
      } else {
        if (P.config.debug) {
          source += '/*' + opcode + '*/';
        }
        compiler(block);
      }
      block = blocks[block.next];
    }
  }

  // Compiles a substack (script inside of another block)
  function compileSubstack(substack) {
    // Substacks are statements inside of statements.
    // Substacks are a type of input. The first item is type ID, the second is the ID of the child.

    // Substacks are not guaranteed to exist, so silently fail.
    if (!substack) {
      return;
    }

    // TODO: check type?
    // const type = substack[0];

    const id = substack[1];
    compile(id);
  }

  function asType(script: string | CompiledExpression, type?: ExpressionType): string {
    if (script instanceof CompiledExpression) {
      // If a compiled expression is already of the desired type, then simply return it.
      if (script.type === type) {
        return script.source;
      }
      script = script.source;
    }
    switch (type) {
      case 'string': return '("" + ' + script + ')';
      case 'number': return '+' + script;
      case 'boolean': return '!!' + script;
    }
    return script;
  }

  function fallbackValue(type?: ExpressionType): string {
    // TODO: types for fallbacks
    switch (type) {
      case 'string': return '""';
      case 'number': return '0';
      case 'boolean': return 'false';
    }
    return '""';
  }

  // Returns a compiled expression as a JavaScript string.
  function compileExpression(expression, type?: ExpressionType): string {
    // Expressions are also known as inputs.

    if (!expression) {
      return fallbackValue(type);
    }

    // TODO: use asType?
    if (typeof expression === 'string') {
      return sanitizedString(expression);
    }
    if (typeof expression === 'number') {
      // I have a slight feeling this block never runs.
      // TODO: remove?
      return '' + expression;
    }

    if (Array.isArray(expression[1])) {
      const native = expression[1];
      return asType(compileNative(native), type);
    }

    const id = expression[1];
    const block = blocks[id];
    if (!block) {
      return fallbackValue(type);
    }
    const opcode = block.opcode;

    const compiler = expressionLibrary[opcode];
    if (!compiler) {
      console.warn('unknown expression', opcode, block);
      return fallbackValue(type);
    }
    let result = compiler(block);

    if (result instanceof CompiledExpression) {
      if (P.config.debug) {
        result.source = '/*' + opcode + '*/' + result.source;
      }
      return asType(result, type);
    }

    if (P.config.debug) {
      result = '/*' + opcode + '*/' + result;
    }

    return asType(result, type);
  }

  function compileListener(topBlock): string {
    let block = blocks[topBlock.next];
    source = '';

    /*
    block = {
      "opcode": "category_block",
      "next": "id_or_null",
      "parent": "id_or_null",
      "inputs": {},
      "fields": {},
      "shadow": false,
      "topLevel": false
    }
    */

    const topLevelOpCode = topBlock.opcode;
    if (!(topLevelOpCode in topLevelLibrary)) {
      // Only log warnings if we wouldn't otherwise recognize the block.
      if (!(topLevelOpCode in expressionLibrary) && !(topLevelOpCode in statementLibrary)) {
        console.warn('unknown top level block', topLevelOpCode, topBlock);
      }
      return '';
    }

    compile(block);

    // Procedure definitions need special care to properly end calls.
    if (topLevelOpCode === 'procedures_definition') {
      source += 'endCall(); return\n';
    }

    return source;
  }

  export function compileTarget(target: P.sb3.Target, data) {
    currentTarget = target;
    blocks = data.blocks;
    const topLevelBlocks = Object.keys(data.blocks)
      .map((id) => data.blocks[id])
      .filter((block) => block.topLevel);

    for (const block of topLevelBlocks) {
      fns = [0];
      const source = compileListener(block);
      const topOpcode = block.opcode;

      if (!source) {
        continue;
      }

      const startFn = currentTarget.fns.length;
      for (var i = 0; i < fns.length; i++) {
        target.fns.push(P.utils.createContinuation(source.slice(fns[i])));
      }
      topLevelLibrary[topOpcode](block, target.fns[startFn]);

      if (P.config.debug) {
        console.log('compiled listener', block.opcode, source, target);
      }
    }
  }
}
