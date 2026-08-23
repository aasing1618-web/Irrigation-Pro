import React from 'react';
import { cn } from '../../lib/cn';

export interface CardItem {
  id: string | number;
  url: string;
  title: string;
}

export interface DiagonalMarqueeCarouselProps {
  cards?: CardItem[];
  angle?: number;
  baseSpeed?: number;
  alternateDirections?: boolean;
  className?: string;
  cardClassName?: string;
  fadeClassName?: string;
}

const DEFAULT_CARDS: CardItem[] = [
  {
    id: '1',
    url: '/photos/fraisier-aspersion.jpg',
    title: 'Irrigation Aspersion Fraisiers',
  },
  {
    id: '2',
    url: '/photos/aspersion-moderne.jpg',
    title: 'Couverture Intégrale Moderne',
  },
  {
    id: '3',
    url: '/photos/champ-mais.jpg',
    title: 'Besoins FAO 56 Grandes Cultures',
  },
  {
    id: '4',
    url: '/photos/rizicoles-irrigation.jpg',
    title: 'Hydraulique Canaux & Riziculture',
  },
  {
    id: '5',
    url: '/photos/pompage-solaire.jpg',
    title: 'Station de Pompage Solaire',
  },
  {
    id: '6',
    url: '/photos/goutte-a-goutte.jpg',
    title: 'Réseau Goutte-à-Goutte Maraîcher',
  },
  {
    id: '7',
    url: '/photos/bassin-stockage.jpg',
    title: 'Bassin de Stockage & Géomembrane',
  },
  {
    id: '8',
    url: '/photos/outils-maraichage.jpg',
    title: 'Équipements Maraîchage Pro',
  },
  {
    id: '9',
    url: '/photos/jardin-autonome.jpg',
    title: 'Périmètres Irrigués Autonomes',
  },
  {
    id: '10',
    url: '/photos/nature-apaisante.jpg',
    title: "Gestion Écologique de l'Eau",
  },
];

const Card = ({ card, className }: { card: CardItem; className?: string }) => {
  return (
    <div
      className={cn(
        'group relative h-[220px] w-[320px] shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 shadow-2xl transition-transform duration-300 hover:scale-105',
        className,
      )}
    >
      <img
        src={card.url}
        alt={card.title}
        className="size-full object-cover transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-950/90 via-brand-950/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />
      <div className="absolute bottom-3 left-3 right-3">
        <span className="inline-block rounded bg-brand-900/80 px-2 py-1 text-2xs font-semibold text-white backdrop-blur-md border border-white/10">
          {card.title}
        </span>
      </div>
    </div>
  );
};

const MarqueeRow = ({
  cards,
  speed,
  direction,
  cardClassName,
}: {
  cards: CardItem[];
  speed: number;
  direction: 1 | -1;
  cardClassName?: string;
}) => {
  const animationClass =
    direction === -1 ? 'animate-marquee-left' : 'animate-marquee-right';

  return (
    <div className="flex w-full overflow-hidden">
      <div
        className={cn(
          'flex shrink-0 cursor-pointer hover:[animation-play-state:paused]',
          animationClass,
        )}
        style={{ '--speed': `${speed}s` } as React.CSSProperties}
      >
        <div className="flex shrink-0">
          {cards.map((card, idx) => (
            <div key={`${card.id}-${idx}`} className="shrink-0 pr-6">
              <Card card={card} className={cardClassName} />
            </div>
          ))}
        </div>
        <div className="flex shrink-0">
          {cards.map((card, idx) => (
            <div key={`${card.id}-${idx}-copy`} className="shrink-0 pr-6">
              <Card card={card} className={cardClassName} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function DiagonalMarqueeCarousel({
  cards = DEFAULT_CARDS,
  angle = -20,
  baseSpeed = 90,
  alternateDirections = true,
  className = '',
  cardClassName = '',
  fadeClassName = '',
}: DiagonalMarqueeCarouselProps) {
  const rotationStyle = {
    transform: `rotate(${angle}deg)`,
  };

  const rowCards = [...cards, ...cards];
  const rowCardsReverse = [...rowCards].reverse();

  return (
    <div
      className={cn(
        'relative flex h-screen w-full items-center justify-center overflow-hidden',
        className,
      )}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes marquee-left {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes marquee-right {
          0% { transform: translate3d(-50%, 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        .animate-marquee-left {
          animation: marquee-left var(--speed) linear infinite;
        }
        .animate-marquee-right {
          animation: marquee-right var(--speed) linear infinite;
        }
      `,
        }}
      />
      <div
        className="absolute z-0 flex w-[220vw] flex-col gap-6"
        style={rotationStyle}
      >
        <MarqueeRow
          cards={rowCards}
          speed={baseSpeed}
          direction={-1}
          cardClassName={cardClassName}
        />
        <MarqueeRow
          cards={rowCardsReverse}
          speed={baseSpeed - 15 > 20 ? baseSpeed - 15 : 30}
          direction={alternateDirections ? 1 : -1}
          cardClassName={cardClassName}
        />
        <MarqueeRow
          cards={rowCards}
          speed={baseSpeed + 15}
          direction={-1}
          cardClassName={cardClassName}
        />
        <MarqueeRow
          cards={rowCardsReverse}
          speed={baseSpeed - 6 > 20 ? baseSpeed - 6 : 35}
          direction={alternateDirections ? 1 : -1}
          cardClassName={cardClassName}
        />
      </div>

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-10 h-1/3 bg-gradient-to-b from-brand-950 via-brand-950/70 to-transparent',
          fadeClassName,
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/3 bg-gradient-to-t from-brand-950 via-brand-950/70 to-transparent',
          fadeClassName,
        )}
      />
    </div>
  );
}
