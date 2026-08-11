/**
 * Une photographie vue à travers une surface d'eau en mouvement (WebGL).
 *
 * Adapté du composant `water-ripple-image` fourni par le propriétaire. Cinq
 * choses ont été changées, et chacune pour une raison :
 *
 * 1. **Il ne dépend plus de Next.js.** L'original important `next/image` ;
 *    ici c'est une balise `<img>` et un `<canvas>`, rien d'autre.
 * 2. **Le canevas ne couvre plus l'écran entier.** L'original se posait en
 *    `position: fixed` sur tout le viewport, ce qui passerait par-dessus le
 *    texte et la navigation. Il occupe désormais son conteneur, et lui seul.
 * 3. **Le sélecteur de fichier a disparu.** Un `<input type="file">` caché
 *    dans un site vitrine n'a aucun usage et alourdit la page.
 * 4. **Trois replis au lieu d'un plantage.** Pas de WebGL, mouvement réduit
 *    demandé, ou onglet en arrière-plan : la photo s'affiche normalement.
 * 5. **L'animation s'arrête quand on ne la voit pas.** L'original tournait en
 *    continu ; sur un portable, une boucle `requestAnimationFrame` qui ne sert
 *    à rien vide la batterie.
 *
 * ## Pourquoi cet effet ici, et nulle part ailleurs
 *
 * Irrigation Pro calcule des écoulements. Une photo de canal vue à travers une
 * surface d'eau, c'est le sujet du produit qui devient sa mise en scène — pas
 * une décoration plaquée. C'est la raison pour laquelle il reste **sur le site
 * vitrine uniquement** : dans le logiciel, un canevas WebGL qui tourne en
 * permanence derrière une saisie de calcul serait du bruit, et du bruit qui
 * consomme.
 */

import { useEffect, useRef, useState } from 'react';

import type { Photo } from '../photos';

/* -------------------------------------------------------------------------- */
/* Les nuanceurs                                                              */
/* -------------------------------------------------------------------------- */

const VERTEX = `
precision mediump float;
varying vec2 vUv;
attribute vec2 a_position;
void main() {
  vUv = .5 * (a_position + 1.);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision mediump float;

varying vec2 vUv;
uniform sampler2D u_image_texture;
uniform float u_time;
uniform float u_ratio;
uniform float u_img_ratio;
uniform float u_blueish;
uniform float u_scale;
uniform float u_illumination;
uniform float u_surface_distortion;
uniform float u_water_distortion;

vec3 mod289(vec3 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec2 mod289(vec2 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec3 permute(vec3 x) { return mod289(((x*34.)+1.)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1., 0.) : vec2(0., 1.);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0., i1.y, 1.)) + i.x + vec3(0., i1.x, 1.));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.);
  m = m*m; m = m*m;
  vec3 x = 2. * fract(p * C.www) - 1.;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130. * dot(m, g);
}

mat2 rotate2D(float r) { return mat2(cos(r), sin(r), -sin(r), cos(r)); }

float surface_noise(vec2 uv, float t, float scale) {
  vec2 n = vec2(.1);
  vec2 N = vec2(.1);
  mat2 m = rotate2D(.5);
  for (int j = 0; j < 10; j++) {
    uv *= m; n *= m;
    vec2 q = uv * scale + float(j) + n + (.5 + .5 * float(j)) * (mod(float(j), 2.) - 1.) * t;
    n += sin(q);
    N += cos(q) / scale;
    scale *= 1.2;
  }
  return (N.x + N.y + .1);
}

void main() {
  vec2 uv = vUv;
  uv.y = 1. - uv.y;
  uv.x *= u_ratio;

  float t = .002 * u_time;

  float outer_noise = snoise((.3 + .1 * sin(t)) * uv + vec2(0., .2 * t));
  vec2 surface_noise_uv = 2. * uv + (outer_noise * .2);

  float surf = surface_noise(surface_noise_uv, t, u_scale);
  surf *= pow(uv.y, .3);
  surf = pow(surf, 2.);

  vec2 img_uv = vUv;
  img_uv -= .5;
  if (u_ratio > u_img_ratio) {
    img_uv.y = img_uv.y * u_img_ratio / u_ratio;
  } else {
    img_uv.x = img_uv.x * u_ratio / u_img_ratio;
  }
  img_uv += .5;
  img_uv.y = 1. - img_uv.y;

  img_uv += (u_water_distortion * outer_noise);
  img_uv += (u_surface_distortion * surf);

  // Le recadrage « couvrir » peut viser hors de la texture : on borne plutôt
  // que d'étirer le dernier pixel sur toute la marge.
  vec2 clamped = clamp(img_uv, vec2(0.), vec2(1.));

  vec4 img = texture2D(u_image_texture, clamped);
  img *= (1. + u_illumination * surf);

  vec3 color = img.rgb;
  color += u_illumination * vec3(1. - u_blueish, 1., 1.) * surf;

  gl_FragColor = vec4(color, 1.);
}
`;

/* -------------------------------------------------------------------------- */
/* Utilitaires WebGL                                                          */
/* -------------------------------------------------------------------------- */

function compiler(gl: WebGLRenderingContext, source: string, type: number): WebGLShader | null {
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

function créerProgramme(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compiler(gl, VERTEX, gl.VERTEX_SHADER);
  const fragment = compiler(gl, FRAGMENT, gl.FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;

  const programme = gl.createProgram();
  if (!programme) return null;

  gl.attachShader(programme, vertex);
  gl.attachShader(programme, fragment);
  gl.linkProgram(programme);

  // Les nuanceurs sont attachés au programme : on peut les libérer tout de suite.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(programme, gl.LINK_STATUS)) {
    gl.deleteProgram(programme);
    return null;
  }
  return programme;
}

/* -------------------------------------------------------------------------- */

export interface PhotoOndulanteProps {
  photo: Photo;
  /** Teinte de la surface : 0 = neutre, 1 = franchement bleutée. */
  blueish?: number;
  /** Finesse du grain de surface. Plus haut = vaguelettes plus serrées. */
  scale?: number;
  /** Force des reflets. Au-delà de 0.3, la photo se délave. */
  illumination?: number;
  /** Déformation fine, celle de la surface. */
  surfaceDistortion?: number;
  /** Déformation lente, celle de la masse d'eau. */
  waterDistortion?: number;
  className?: string;
}

export function PhotoOndulante({
  photo,
  blueish = 0.45,
  scale = 7,
  illumination = 0.12,
  surfaceDistortion = 0.02,
  waterDistortion = 0.015,
  className = '',
}: PhotoOndulanteProps) {
  const conteneur = useRef<HTMLDivElement | null>(null);
  const canevas = useRef<HTMLCanvasElement | null>(null);

  /**
   * Vrai seulement quand l'eau coule réellement.
   *
   * Tant que c'est faux, la photo reste affichée telle quelle : c'est le repli,
   * et il doit être indiscernable d'un choix.
   */
  const [anime, setAnime] = useState(false);

  useEffect(() => {
    const hôte = conteneur.current;
    const toile = canevas.current;
    if (!hôte || !toile) return;

    // Repli nº 1 — l'environnement ne fournit pas de quoi décider proprement.
    // Cela couvre le rendu hors navigateur et les navigateurs trop anciens :
    // sans ces trois interfaces, on ne saurait ni respecter une préférence de
    // mouvement, ni suivre la taille du cadre, ni arrêter la boucle quand la
    // section sort de l'écran. Plutôt que d'animer à l'aveugle, on s'abstient.
    if (
      typeof window.matchMedia !== 'function' ||
      typeof ResizeObserver === 'undefined' ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }

    // Repli nº 2 — quelqu'un a demandé moins de mouvement. On n'insiste pas.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const gl = toile.getContext('webgl', { alpha: false, antialias: true });
    // Repli nº 3 — pas de WebGL (machine ancienne, pilote désactivé).
    if (!gl) return;

    const programme = créerProgramme(gl);
    // Repli nº 4 — les nuanceurs n'ont pas compilé sur cette carte graphique.
    if (!programme) return;

    gl.useProgram(programme);

    const uniforme = (nom: string) => gl.getUniformLocation(programme, nom);
    const uTime = uniforme('u_time');
    const uRatio = uniforme('u_ratio');
    const uImgRatio = uniforme('u_img_ratio');

    gl.uniform1f(uniforme('u_blueish'), blueish);
    gl.uniform1f(uniforme('u_scale'), scale);
    gl.uniform1f(uniforme('u_illumination'), illumination);
    gl.uniform1f(uniforme('u_surface_distortion'), surfaceDistortion);
    gl.uniform1f(uniforme('u_water_distortion'), waterDistortion);

    const tampon = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(programme, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    let texture: WebGLTexture | null = null;
    let image: HTMLImageElement | null = null;
    let boucle = 0;
    let visible = false;
    let prêt = false;
    let détruit = false;

    /** Ajuste la taille du tampon de rendu à celle réellement affichée. */
    const redimensionner = () => {
      // Plafonné à 2 : au-delà, on quadruple le coût pour un gain invisible.
      const densité = Math.min(window.devicePixelRatio || 1, 2);
      const largeur = Math.max(1, Math.floor(hôte.clientWidth * densité));
      const hauteur = Math.max(1, Math.floor(hôte.clientHeight * densité));
      if (toile.width !== largeur || toile.height !== hauteur) {
        toile.width = largeur;
        toile.height = hauteur;
      }
      gl.viewport(0, 0, toile.width, toile.height);
      gl.uniform1f(uRatio, toile.width / toile.height);
    };

    const dessiner = () => {
      if (détruit) return;
      gl.uniform1f(uTime, performance.now());
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      boucle = requestAnimationFrame(dessiner);
    };

    /** Ne fait tourner la boucle que si la section est visible ET la photo chargée. */
    const arbitrer = () => {
      const doitTourner = visible && prêt && !détruit;
      if (doitTourner && boucle === 0) {
        boucle = requestAnimationFrame(dessiner);
      } else if (!doitTourner && boucle !== 0) {
        cancelAnimationFrame(boucle);
        boucle = 0;
      }
    };

    image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (détruit || !image) return;

      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform1i(uniforme('u_image_texture'), 0);
      gl.uniform1f(uImgRatio, image.naturalWidth / image.naturalHeight);

      redimensionner();
      prêt = true;
      setAnime(true);
      arbitrer();
    };
    // Un échec de chargement laisse simplement la photo de repli en place.
    image.src = photo.src;

    const observateurTaille = new ResizeObserver(redimensionner);
    observateurTaille.observe(hôte);

    // `window.addEventListener('scroll')` serait un contresens : on n'a pas
    // besoin de la position, seulement de savoir si la section est à l'écran.
    const observateurVue = new IntersectionObserver(
      ([entrée]) => {
        visible = entrée?.isIntersecting ?? false;
        arbitrer();
      },
      { rootMargin: '120px' },
    );
    observateurVue.observe(hôte);

    const surVisibilité = () => {
      // Onglet en arrière-plan : inutile de calculer des vagues que personne ne voit.
      if (document.hidden) {
        visible = false;
        arbitrer();
      }
    };
    document.addEventListener('visibilitychange', surVisibilité);

    return () => {
      détruit = true;
      if (boucle !== 0) cancelAnimationFrame(boucle);
      observateurTaille.disconnect();
      observateurVue.disconnect();
      document.removeEventListener('visibilitychange', surVisibilité);
      if (image) image.onload = null;
      if (texture) gl.deleteTexture(texture);
      if (tampon) gl.deleteBuffer(tampon);
      gl.deleteProgram(programme);
      setAnime(false);
    };
  }, [photo.src, blueish, scale, illumination, surfaceDistortion, waterDistortion]);

  return (
    <div ref={conteneur} className={`relative overflow-hidden ${className}`}>
      {/* La photo, toujours présente. C'est elle que voit un moteur de
          recherche, un lecteur d'écran, et toute machine sans WebGL. Elle
          s'efface seulement une fois l'eau réellement en train de couler. */}
      <img
        src={photo.src}
        alt={photo.alt}
        {...(photo.alt === '' ? { 'aria-hidden': 'true' as const } : {})}
        width={photo.width}
        height={photo.height}
        decoding="async"
        className={`size-full object-cover transition-opacity duration-700 ${
          anime ? 'opacity-0' : 'opacity-100'
        }`}
      />

      <canvas
        ref={canevas}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 size-full transition-opacity duration-700 ${
          anime ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
