import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from '@studio-freight/lenis';

export interface ParallaxComponentProps {
  title?: string;
  subtitle?: string;
  className?: string;
}

export function ParallaxComponent({
  title = 'Irrigation Pro',
  subtitle = 'Plateforme de dimensionnement & ingénierie hydraulique',
  className = '',
}: ParallaxComponentProps) {
  const parallaxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const triggerElement = parallaxRef.current?.querySelector('[data-parallax-layers]');

    if (triggerElement) {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: triggerElement,
          start: '0% 0%',
          end: '100% 0%',
          scrub: 0,
        },
      });

      const layers = [
        { layer: '1', yPercent: 70 },
        { layer: '2', yPercent: 55 },
        { layer: '3', yPercent: 40 },
        { layer: '4', yPercent: 10 },
      ];

      layers.forEach((layerObj, idx) => {
        tl.to(
          triggerElement.querySelectorAll(`[data-parallax-layer="${layerObj.layer}"]`),
          {
            yPercent: layerObj.yPercent,
            ease: 'none',
          },
          idx === 0 ? undefined : '<',
        );
      });
    }

    const lenis = new Lenis();
    lenis.on('scroll', ScrollTrigger.update);
    const updateTicker = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    return () => {
      ScrollTrigger.getAll().forEach((st) => st.kill());
      if (triggerElement) {
        gsap.killTweensOf(triggerElement);
      }
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
    };
  }, []);

  return (
    <div className={`relative overflow-hidden bg-brand-950 text-white ${className}`} ref={parallaxRef}>
      <section className="relative h-[80vh] w-full overflow-hidden">
        <div className="relative size-full">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-brand-950 to-transparent" />
          <div data-parallax-layers className="relative size-full overflow-hidden">
            {/* Layer 1: Fond grand paysage d'irrigation */}
            <img
              src="/photos/fraisier-aspersion.jpg"
              loading="eager"
              data-parallax-layer="1"
              alt="Paysage irrigation"
              className="absolute inset-0 size-full object-cover opacity-40 filter brightness-90"
            />
            {/* Layer 2: Canaux & Périmètres agricoles */}
            <img
              src="/photos/rizicoles-irrigation.jpg"
              loading="eager"
              data-parallax-layer="2"
              alt="Hydraulique des canaux"
              className="absolute inset-0 size-full object-cover opacity-50 mix-blend-overlay filter contrast-125"
            />
            {/* Layer 3: Titre central d'ingénierie */}
            <div
              data-parallax-layer="3"
              className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 text-center"
            >
              <span className="rounded-full bg-brand-500/20 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-brand-300 backdrop-blur-md border border-brand-500/30">
                Haute Précision Hydraulique
              </span>
              <h2 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-6xl text-white drop-shadow-2xl">
                {title}
              </h2>
              <p className="mt-2 max-w-xl text-sm font-medium text-brand-200 sm:text-base drop-shadow">
                {subtitle}
              </p>
            </div>
            {/* Layer 4: Premier plan aspersion & matériel */}
            <img
              src="/photos/aspersion-moderne.jpg"
              loading="eager"
              data-parallax-layer="4"
              alt="Installation aspersion"
              className="absolute inset-x-0 bottom-0 h-1/2 w-full object-cover opacity-60 filter brightness-110"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-950/60 via-transparent to-brand-950" />
        </div>
      </section>
      <section className="relative z-20 flex items-center justify-center bg-brand-950 py-12 px-6">
        <div className="flex items-center gap-3 text-brand-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 160 160"
            fill="none"
            className="size-8 animate-pulse text-brand-400"
          >
            <path
              d="M94.8284 53.8578C92.3086 56.3776 88 54.593 88 51.0294V0H72V59.9999C72 66.6273 66.6274 71.9999 60 71.9999H0V87.9999H51.0294C54.5931 87.9999 56.3777 92.3085 53.8579 94.8283L18.3431 130.343L29.6569 141.657L65.1717 106.142C67.684 103.63 71.9745 105.396 72 108.939V160L88.0001 160L88 99.9999C88 93.3725 93.3726 87.9999 100 87.9999H160V71.9999H108.939C105.407 71.9745 103.64 67.7091 106.12 65.1938L106.142 65.1716L141.657 29.6568L130.343 18.3432L94.8284 53.8578Z"
              fill="currentColor"
            />
          </svg>
          <span className="text-xs font-semibold tracking-wider text-brand-300 uppercase">
            Irrigation Pro Engine • Certifié FAO 56 & Manning-Strickler
          </span>
        </div>
      </section>
    </div>
  );
}

export default ParallaxComponent;
