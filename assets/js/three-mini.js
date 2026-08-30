/*!
 * Minimal WebGL stand-in for the three.js API surface this page uses:
 * WebGLRenderer, Scene, OrthographicCamera, Vector3, ShaderMaterial, Mesh, PlaneGeometry.
 * The page draws two fullscreen shader quads and nothing else, so the full
 * three.js build (599 KB) is replaced by the ~4 KB below. Blend mode, context
 * attributes, plane vertex order and clear behaviour mirror three r150 so the
 * rendered output is byte-identical.
 */
(function () {
  'use strict';

  function Vector3(x, y, z) {
    this.x = x || 0; this.y = y || 0; this.z = z || 0;
  }
  Vector3.prototype.set = function (x, y, z) {
    this.x = x; this.y = y; this.z = z; return this;
  };

  // three's PlaneGeometry(w, h) at the default 1x1 segments: 4 vertices, rows
  // emitted top-to-bottom, indexed as two triangles.
  function PlaneGeometry(width, height) {
    var w = width === undefined ? 1 : width, h = height === undefined ? 1 : height;
    var hw = w / 2, hh = h / 2;
    this.position = new Float32Array([-hw, hh, 0, hw, hh, 0, -hw, -hh, 0, hw, -hh, 0]);
    this.uv = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
    this.index = new Uint16Array([0, 2, 1, 2, 3, 1]);
  }

  function ShaderMaterial(p) {
    p = p || {};
    this.uniforms = p.uniforms || {};
    this.vertexShader = p.vertexShader || '';
    this.fragmentShader = p.fragmentShader || '';
    this.transparent = !!p.transparent;
  }

  function Mesh(geometry, material) {
    this.geometry = geometry; this.material = material;
  }

  function Scene() { this.children = []; }
  Scene.prototype.add = function (o) { this.children.push(o); return this; };

  function OrthographicCamera() {}

  // three injects the attribute declarations; the page's vertex shader relies
  // on `position` and `uv` being predeclared.
  var VERT_PREFIX = 'precision highp float;\nattribute vec3 position;\nattribute vec2 uv;\n';

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Shader compile failed: ' + log);
    }
    return s;
  }

  function WebGLRenderer(params) {
    params = params || {};
    var canvas = params.canvas;
    if (!canvas) throw new Error('WebGLRenderer: canvas required');
    var attrs = {
      alpha: params.alpha !== undefined ? params.alpha : false,
      antialias: params.antialias !== undefined ? params.antialias : false,
      premultipliedAlpha: true, // three's context default
      depth: true,
      stencil: true,
      preserveDrawingBuffer: false
    };
    var gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('WebGLRenderer: WebGL unavailable');
    this._gl = gl;
    this._canvas = canvas;
    this._pr = 1;
    this._progs = new Map();
    this._bufs = new Map();
  }

  WebGLRenderer.prototype.setPixelRatio = function (r) {
    this._pr = r || 1;
  };

  WebGLRenderer.prototype.setSize = function (width, height, updateStyle) {
    var c = this._canvas, pr = this._pr;
    c.width = Math.floor(width * pr);
    c.height = Math.floor(height * pr);
    if (updateStyle !== false) {
      c.style.width = width + 'px';
      c.style.height = height + 'px';
    }
    this._gl.viewport(0, 0, c.width, c.height);
  };

  WebGLRenderer.prototype.render = function (scene) {
    var gl = this._gl;
    var mesh = scene && scene.children[0];
    if (!mesh) return;
    var mat = mesh.material, geo = mesh.geometry;

    var prog = this._progs.get(mat);
    if (!prog) {
      var vs = compile(gl, gl.VERTEX_SHADER, VERT_PREFIX + mat.vertexShader);
      var fs = compile(gl, gl.FRAGMENT_SHADER, mat.fragmentShader);
      var p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
      }
      prog = {
        p: p,
        loc: {},
        aPos: gl.getAttribLocation(p, 'position'),
        aUv: gl.getAttribLocation(p, 'uv')
      };
      for (var k in mat.uniforms) prog.loc[k] = gl.getUniformLocation(p, k);
      this._progs.set(mat, prog);
    }

    var bufs = this._bufs.get(geo);
    if (!bufs) {
      bufs = { pos: gl.createBuffer(), uv: gl.createBuffer(), idx: gl.createBuffer() };
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.pos);
      gl.bufferData(gl.ARRAY_BUFFER, geo.position, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.uv);
      gl.bufferData(gl.ARRAY_BUFFER, geo.uv, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.index, gl.STATIC_DRAW);
      this._bufs.set(geo, bufs);
    }

    gl.useProgram(prog.p);

    if (prog.aPos >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.pos);
      gl.enableVertexAttribArray(prog.aPos);
      gl.vertexAttribPointer(prog.aPos, 3, gl.FLOAT, false, 0, 0);
    }
    if (prog.aUv >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.uv);
      gl.enableVertexAttribArray(prog.aUv);
      gl.vertexAttribPointer(prog.aUv, 2, gl.FLOAT, false, 0, 0);
    }

    for (var u in mat.uniforms) {
      var loc = prog.loc[u];
      if (!loc) continue;
      var v = mat.uniforms[u].value;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v && typeof v.x === 'number') gl.uniform3f(loc, v.x, v.y, v.z);
    }

    // three's NormalBlending for a transparent material whose own
    // `premultipliedAlpha` flag is false (the default): straight-alpha RGB,
    // premultiplied alpha channel. Verified against r150 at runtime.
    if (mat.transparent) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.disable(gl.BLEND);
    }
    // A single quad at z=0 against a depth buffer cleared to 1.0 always passes,
    // so the test is skipped rather than replicated.
    gl.disable(gl.DEPTH_TEST);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.idx);
    gl.drawElements(gl.TRIANGLES, geo.index.length, gl.UNSIGNED_SHORT, 0);
  };

  WebGLRenderer.prototype.dispose = function () {
    var gl = this._gl;
    this._progs.forEach(function (x) { gl.deleteProgram(x.p); });
    this._bufs.forEach(function (b) {
      gl.deleteBuffer(b.pos); gl.deleteBuffer(b.uv); gl.deleteBuffer(b.idx);
    });
    this._progs.clear();
    this._bufs.clear();
    var ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  };

  window.THREE = {
    WebGLRenderer: WebGLRenderer,
    Scene: Scene,
    OrthographicCamera: OrthographicCamera,
    Vector3: Vector3,
    ShaderMaterial: ShaderMaterial,
    Mesh: Mesh,
    PlaneGeometry: PlaneGeometry
  };
})();
