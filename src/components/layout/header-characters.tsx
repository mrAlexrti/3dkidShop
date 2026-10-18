// Кавайные декоративные персонажи для розового Hero (см. ескиз.jpg).
// Чистый презентационный SVG, без клиентской логики. Позиционирование/размер — через className.

type CharProps = { className?: string; style?: React.CSSProperties };

/* Синий блоб с открытым ртом (верхний левый угол) */
export function BlueBlob({ className, style }: CharProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} style={style} aria-hidden fill="none">
      <defs>
        <linearGradient id="blue-blob-fill" x1="24" y1="12" x2="92" y2="108" gradientUnits="userSpaceOnUse">
          <stop stopColor="#76A8FF" />
          <stop offset=".55" stopColor="#5B8DEF" />
          <stop offset="1" stopColor="#4977D8" />
        </linearGradient>
      </defs>
      <path
        d="M20 51C4 35 14 13 35 17 43-2 72 2 79 23c22-8 42 9 34 30 17 14 7 39-14 39-9 22-38 27-52 9-22 10-43-9-34-29-11-7-8-17 7-21Z"
        fill="url(#blue-blob-fill)"
      />
      <path d="M28 29c11-13 29-18 45-12" stroke="#A9CAFF" strokeWidth="7" strokeLinecap="round" opacity=".48" />
      {/* глаза */}
      <ellipse cx="44" cy="52" rx="9" ry="11" fill="#fff" />
      <ellipse cx="76" cy="52" rx="9" ry="11" fill="#fff" />
      <circle cx="45" cy="55" r="4.5" fill="#22203A" />
      <circle cx="75" cy="55" r="4.5" fill="#22203A" />
      {/* открытый рот */}
      <path d="M40 74c0 16 40 16 40 0 0-4-40-4-40 0Z" fill="#22203A" />
      <path d="M50 84c4 6 16 6 20 0-3-4-17-4-20 0Z" fill="#FF6B8A" />
    </svg>
  );
}

/* Солнышко с довольным лицом (верхний правый угол) */
export function SunChar({ className, style }: CharProps) {
  const rays = Array.from({ length: 12 });
  return (
    <svg viewBox="0 0 120 120" className={className} style={style} aria-hidden fill="none">
      <defs>
        <radialGradient id="sun-char-fill" cx="0" cy="0" r="1" gradientTransform="translate(43 38) rotate(49) scale(74)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE975" />
          <stop offset=".62" stopColor="#FFD84D" />
          <stop offset="1" stopColor="#FFBE2E" />
        </radialGradient>
      </defs>
      <g>
        {rays.map((_, i) => (
          <rect
            key={i}
            x="57"
            y="4"
            width="7"
            height="22"
            rx="3.5"
            fill="#FFCB35"
            transform={`rotate(${i * 30} 60 60)`}
          />
        ))}
      </g>
      <circle cx="60" cy="60" r="39" fill="url(#sun-char-fill)" />
      <path d="M37 36c8-8 18-11 27-10" stroke="#FFF0A1" strokeWidth="6" strokeLinecap="round" opacity=".55" />
      {/* довольные закрытые глаза */}
      <path d="M42 58c3-6 11-6 14 0" stroke="#7A5A12" strokeWidth="4" strokeLinecap="round" />
      <path d="M64 58c3-6 11-6 14 0" stroke="#7A5A12" strokeWidth="4" strokeLinecap="round" />
      {/* румянец */}
      <ellipse cx="40" cy="72" rx="6" ry="4" fill="#FF9DB6" opacity="0.7" />
      <ellipse cx="80" cy="72" rx="6" ry="4" fill="#FF9DB6" opacity="0.7" />
      {/* улыбка */}
      <path d="M50 70c4 8 16 8 20 0" stroke="#7A5A12" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/* Цветок-солнышко с подмигиванием (нижний левый угол) */
export function FlowerChar({ className, style }: CharProps) {
  const petals = Array.from({ length: 8 });
  return (
    <svg viewBox="0 0 120 120" className={className} style={style} aria-hidden fill="none">
      <defs>
        <linearGradient id="flower-petal-fill" x1="42" y1="18" x2="77" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE174" />
          <stop offset="1" stopColor="#FFBE31" />
        </linearGradient>
        <radialGradient id="flower-face-fill" cx="0" cy="0" r="1" gradientTransform="translate(48 47) rotate(48) scale(48)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF3BE" />
          <stop offset="1" stopColor="#FFD972" />
        </radialGradient>
      </defs>
      <g>
        {petals.map((_, i) => (
          <ellipse
            key={i}
            cx="60"
            cy="24"
            rx="12"
            ry="18"
            fill="url(#flower-petal-fill)"
            transform={`rotate(${i * 45} 60 60)`}
          />
        ))}
      </g>
      <circle cx="60" cy="60" r="31" fill="url(#flower-face-fill)" />
      <path d="M39 42c7-8 16-11 25-10" stroke="#FFF8D4" strokeWidth="5" strokeLinecap="round" opacity=".6" />
      {/* подмигивание: левый закрыт, правый открыт */}
      <path d="M44 58c3-5 10-5 13 0" stroke="#8A5A12" strokeWidth="4" strokeLinecap="round" />
      <circle cx="72" cy="57" r="5.5" fill="#8A5A12" />
      {/* улыбка */}
      <path d="M52 68c3 6 13 6 16 0" stroke="#8A5A12" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/* Красное сердце с большими глазами (нижний правый угол) */
export function HeartChar({ className, style }: CharProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} style={style} aria-hidden fill="none">
      <defs>
        <linearGradient id="heart-char-fill" x1="30" y1="26" x2="82" y2="105" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF6683" />
          <stop offset=".58" stopColor="#FF496D" />
          <stop offset="1" stopColor="#E9365D" />
        </linearGradient>
      </defs>
      <path
        d="M60 108C18 78 12 44 34 30c14-9 26 0 26 12 0-12 12-21 26-12 22 14 16 48-26 78Z"
        fill="url(#heart-char-fill)"
      />
      <path d="M29 42c5-11 14-15 22-10" stroke="#FF9AAD" strokeWidth="6" strokeLinecap="round" opacity=".55" />
      {/* большие глаза */}
      <ellipse cx="47" cy="54" rx="11" ry="13" fill="#fff" />
      <ellipse cx="73" cy="54" rx="11" ry="13" fill="#fff" />
      <circle cx="49" cy="57" r="6" fill="#22203A" />
      <circle cx="71" cy="57" r="6" fill="#22203A" />
      <circle cx="51" cy="54" r="2" fill="#fff" />
      <circle cx="73" cy="54" r="2" fill="#fff" />
      {/* румянец */}
      <ellipse cx="36" cy="66" rx="6" ry="4" fill="#C81E45" opacity="0.5" />
      <ellipse cx="84" cy="66" rx="6" ry="4" fill="#C81E45" opacity="0.5" />
    </svg>
  );
}
