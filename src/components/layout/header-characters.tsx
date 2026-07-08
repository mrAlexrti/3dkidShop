// Кавайные декоративные персонажи для розового Hero (см. ескиз.jpg).
// Чистый презентационный SVG, без клиентской логики. Позиционирование/размер — через className.

type CharProps = { className?: string; style?: React.CSSProperties };

/* Синий блоб с открытым ртом (верхний левый угол) */
export function BlueBlob({ className, style }: CharProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} style={style} aria-hidden fill="none">
      <path
        d="M60 8c26 0 52 18 50 50-2 30-20 54-50 54S8 92 10 60C12 30 34 8 60 8Z"
        fill="#5B8DEF"
      />
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
      <g>
        {rays.map((_, i) => (
          <rect
            key={i}
            x="57"
            y="4"
            width="6"
            height="20"
            rx="3"
            fill="#FFCF3C"
            transform={`rotate(${i * 30} 60 60)`}
          />
        ))}
      </g>
      <circle cx="60" cy="60" r="38" fill="#FFD84D" />
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
      <g>
        {petals.map((_, i) => (
          <ellipse
            key={i}
            cx="60"
            cy="24"
            rx="12"
            ry="18"
            fill="#FFC93C"
            transform={`rotate(${i * 45} 60 60)`}
          />
        ))}
      </g>
      <circle cx="60" cy="60" r="30" fill="#FFE08A" />
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
      <path
        d="M60 108C18 78 12 44 34 30c14-9 26 0 26 12 0-12 12-21 26-12 22 14 16 48-26 78Z"
        fill="#FF4D6D"
      />
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
