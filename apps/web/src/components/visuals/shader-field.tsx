"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * GPU visuals for the portal's non-operational moments (boot, empty states,
 * auth). Written directly against WebGL rather than pulling in a scene graph:
 * the whole component is a few KB versus several hundred for three + fiber,
 * and operational surfaces stay deliberately flat and fast.
 *
 * `orb` raymarches a noise-displaced sphere; `aurora` renders a flowing 2D
 * field. Both composite over the page with premultiplied alpha.
 */
export type ShaderVariant = "orb" | "aurora";

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const NOISE = `
float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
`;

const ORB = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
${NOISE}

float map(vec3 p) {
  float d = length(p) - 1.0;
  d += 0.26 * (fbm(p * 1.5 + vec3(0.0, u_time * 0.22, u_time * 0.09)) - 0.5);
  return d;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0025, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);

  float a = u_time * 0.3;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));

  vec3 ro = vec3(0.0, 0.0, 3.1);
  vec3 rd = normalize(vec3(uv, -1.75));
  ro.xz = rot * ro.xz;
  rd.xz = rot * rd.xz;

  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 56; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.0025) { hit = 1.0; break; }
    if (t > 6.0) break;
    t += d * 0.82;
  }

  if (hit < 0.5) { gl_FragColor = vec4(0.0); return; }

  vec3 p = ro + rd * t;
  vec3 n = normalAt(p);
  vec3 light = normalize(vec3(0.7, 0.9, 0.6));

  float diff = clamp(dot(n, light), 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.4);
  float band = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);

  vec3 col = mix(u_c1, u_c2, band);
  col = mix(col, u_c3, fres);
  col *= 0.42 + 0.72 * diff;
  col += fres * 0.5;

  float alpha = clamp(0.82 + fres * 0.4, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const AURORA = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
${NOISE}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);

  float f1 = fbm(vec3(p * 1.1, u_time * 0.06));
  float f2 = fbm(vec3(p * 1.7 + 4.0, u_time * 0.09));

  vec3 col = mix(u_c1, u_c2, clamp(f1 * 1.5, 0.0, 1.0));
  col = mix(col, u_c3, clamp(f2 * 1.2, 0.0, 1.0));

  float veil = smoothstep(0.95, 0.1, length(p) * 0.7);
  float alpha = veil * (0.34 + 0.4 * f1);

  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const PALETTE: Record<ShaderVariant, [number[], number[], number[]]> = {
  orb: [
    [1.0, 0.42, 0.29],
    [0.94, 0.28, 0.45],
    [0.71, 0.36, 1.0],
  ],
  aurora: [
    [1.0, 0.42, 0.29],
    [0.71, 0.36, 1.0],
    [0.49, 0.36, 0.91],
  ],
};

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function ShaderField({
  variant = "orb",
  className,
  speed = 1,
}: {
  variant?: ShaderVariant;
  className?: string;
  speed?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, variant === "orb" ? ORB : AURORA);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const [c1, c2, c3] = PALETTE[variant];
    gl.uniform3fv(gl.getUniformLocation(program, "u_c1"), c1);
    gl.uniform3fv(gl.getUniformLocation(program, "u_c2"), c2);
    gl.uniform3fv(gl.getUniformLocation(program, "u_c3"), c3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };

    let frame = 0;
    const start = performance.now();

    const render = () => {
      resize();
      const elapsed = ((performance.now() - start) / 1000) * speed;
      gl.uniform1f(uTime, reduced ? 1.4 : elapsed);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced) frame = requestAnimationFrame(render);
    };

    render();
    const observer = new ResizeObserver(() => { if (reduced) render(); });
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteBuffer(buffer);
    };
  }, [variant, speed]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("block h-full w-full", className)}
    />
  );
}
