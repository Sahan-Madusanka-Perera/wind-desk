import type { SVGProps } from 'react'

/** Authored icon set: 16px grid, 1.5px stroke, square caps, matching the terminal hairlines. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function ChevronLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </Icon>
  )
}

export function ChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </Icon>
  )
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 13.5h12" />
      <path d="m3 10.5 3.5-4 3 2.5L13.5 4" />
    </Icon>
  )
}

export function TableIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.25" y="3" width="11.5" height="10" />
      <path d="M2.25 6.5h11.5M2.25 10h11.5M6.5 3v10" />
    </Icon>
  )
}

export function ArrowUpRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 11 11 5M6 4.75h5.25V10" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.5 8.5 3 3 6-7" />
    </Icon>
  )
}

export function CrossIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
    </Icon>
  )
}

export function RetryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.5 8a4.5 4.5 0 1 1-1.32-3.18" />
      <path d="M12.75 2.75v2.5h-2.5" />
    </Icon>
  )
}

/** WindDesk mark: three wind strokes of falling length, amber block for the live cursor. */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="19" height="19" rx="2" fill="#11161b" stroke="#2c3540" />
      <path d="M4 6.5h9.5M4 10h7M4 13.5h4.5" stroke="#e6e9ed" strokeWidth="1.6" />
      <rect x="13.5" y="12" width="2.5" height="3" fill="#f0a63a" />
    </svg>
  )
}
