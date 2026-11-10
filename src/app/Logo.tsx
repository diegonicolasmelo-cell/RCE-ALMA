/** Ícono de Kapta: un visor de captura con la línea de pulso adentro. */
export function Logo({ tam = 40 }: { readonly tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 52 52" aria-hidden="true" style={{ flex: "none" }}>
      <rect width="52" height="52" rx="12" fill="#0f8c86" />
      <g fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" transform="translate(6.5 6.5) scale(.75)">
        <path d="M6 16V9a3 3 0 0 1 3-3h7M36 6h7a3 3 0 0 1 3 3v7M46 36v7a3 3 0 0 1-3 3h-7M16 46H9a3 3 0 0 1-3-3v-7" />
        <path d="M13 27h7l3-7 5 13 3-6h8" />
      </g>
    </svg>
  );
}
