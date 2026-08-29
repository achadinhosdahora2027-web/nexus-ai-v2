import React from 'react';

interface AdSlotProps {
  slot: 'header' | 'inline' | 'rectangle';
  title?: string;
  badge?: string;
  ctaText?: string;
  ctaUrl?: string;
}

export const AdSlot: React.FC<AdSlotProps> = ({
  slot,
  title = 'Oferta Verificada',
  badge = 'Destaque',
  ctaText = 'Conferir Desconto',
  ctaUrl = 'https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=nordvpn&slot=' + slot
}) => {
  return (
    <div
      className={`my-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm ${
        slot === 'header'
          ? 'bg-gradient-to-r from-blue-950/40 to-indigo-950/40 border-blue-800/40'
          : slot === 'rectangle'
          ? 'max-w-md mx-auto text-center'
          : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 bg-blue-950/80 px-2.5 py-0.5 rounded-full border border-blue-800/50">
          {badge}
        </span>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Publicidade</span>
      </div>
      <h4 className="text-base font-bold text-white mb-2">{title}</h4>
      <a
        href={ctaUrl}
        target="_blank"
        rel="sponsored noopener noreferrer nofollow"
        className="inline-block w-full text-center py-2.5 px-4 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition duration-150"
      >
        {ctaText}
      </a>
    </div>
  );
};
