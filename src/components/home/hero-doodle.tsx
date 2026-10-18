const star = "M-5-22C-3-28 3-28 5-22L10-11C11-9 12-8 14-7L24-3C30-1 30 4 24 6L13 10C11 11 10 12 9 14L5 25C3 31-2 31-4 25L-9 14C-10 12-11 11-13 10L-24 6C-30 4-30-1-24-3L-14-7C-12-8-11-9-10-11Z";
export function HeroDoodle({ side }: { side: "left" | "right" }) {
  const id = `hero-gold-${side}`;
  const rays = side === "left" ? [[40,37,-24,40],[21,69,-65,26]] : [[38,40,27,38],[57,69,68,27]];
  const stars = side === "left" ? [[56,216,40],[23,165,26]] : [[36,210,45],[65,146,24]];
  return <svg className={`sf-hero-doodle sf-hero-doodle--${side}`} viewBox="0 0 80 260" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-face`} cx=".32" cy=".24" r=".88"><stop stopColor="#ffe58c" /><stop offset=".3" stopColor="#ffc64a" /><stop offset=".62" stopColor="#ffb52e" /><stop offset="1" stopColor="#ec8f14" /></radialGradient>
      <linearGradient id={`${id}-ray`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#ec8f14" /><stop offset=".2" stopColor="#ffc64a" /><stop offset=".4" stopColor="#ffe58c" /><stop offset=".65" stopColor="#ffb52e" /><stop offset="1" stopColor="#f29d1c" /></linearGradient>
      <filter id={`${id}-shadow`} x="-60%" y="-60%" width="220%" height="240%"><feDropShadow dx="1" dy="3" stdDeviation="2.2" floodColor="#b66a13" floodOpacity=".26" /></filter>
    </defs>
    {rays.map(([x,y,angle,length],index) => <g key={`ray-${index}`} transform={`translate(${x} ${y}) rotate(${angle})`} filter={`url(#${id}-shadow)`}><rect x="-4.5" y={-length/2+2} width="9" height={length} rx="4.5" fill="#d88317" /><rect x="-4.5" y={-length/2} width="9" height={length} rx="4.5" fill={`url(#${id}-ray)`} /><path d={`M-1 ${-length/2+5}V${length/2-7}`} stroke="#fff0b2" strokeWidth="1.4" strokeLinecap="round" opacity=".8" /></g>)}
    {stars.map(([x,y,size],index) => <g key={`star-${index}`} transform={`translate(${x} ${y}) scale(${size/56}) rotate(${side === "left" ? -12 : 12})`} filter={`url(#${id}-shadow)`}><path d={star} transform="translate(0 3)" fill="#d88317" /><path d={star} fill={`url(#${id}-face)`} stroke="#dc8b1b" strokeWidth=".8" /><path d="M-17-3C-11-5-7-10-4-18" stroke="#fff0b2" strokeWidth="3" strokeLinecap="round" opacity=".9" /><ellipse cx="5" cy="-8" rx="7" ry="3" transform="rotate(35 5 -8)" fill="#ffe49a" opacity=".45" /></g>)}
  </svg>;
}
